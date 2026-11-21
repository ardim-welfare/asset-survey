/**
 * useAssetImport — 엑셀 가져오기 화면(기획서 F04~F07)의 상태와 동작
 *
 * 흐름: 파일 고르기 → 시트·머리글·열 연결 → 검사 → (다음) 위치→공간 대응·비교 → 확정
 * 계산은 lib/import의 순수 함수가 하고, 여기서는 상태를 이어 붙이고 저장만 부른다.
 */
import { useState, useMemo, useCallback } from 'react';
import { useAuth } from './useAuth';
import { useToast } from './useToast';
import { useConfirm } from './useConfirm';
import {
    getOrganization, getSpaces, createSpace, getAssets, getAccountingMap, commitImport,
    validateSpaceName, normalizeSpaceName,
} from '../lib/firestore';
import { readWorkbook, toImportTable, parseAssets, blockingReasons, type SheetTable } from '../lib/import/parseSheet';
import { autoMapColumns, type ColumnMap, type ImportField } from '../lib/import/columns';
import { diffAssets, countByLocation, type LocationSpaceMap } from '../lib/import/diff';
import { captureError } from '../lib/sentry';
import type { Space } from '../types/space';
import type { Asset, AssetAccounting } from '../types/asset';
import type { Organization } from '../types/organization';

export type ImportStep = 'pick' | 'map' | 'compare' | 'saving' | 'done';

/** 파일 크기 상한 — 대장 수천 건도 수 MB 안이다. 사진이 든 카드 파일을 잘못 고른 경우를 막는다 */
export const MAX_IMPORT_FILE_BYTES = 20 * 1024 * 1024;

/** 합계 줄 금액 — 소계가 여러 줄이면 가장 큰 값(총합계)을 대장 합계로 본다 */
export function reportedTotalOf(totalRows: Array<{ amount: number | null }>): number | null {
    const amounts = totalRows.map((r) => r.amount).filter((a): a is number => a != null);
    return amounts.length === 0 ? null : Math.max(...amounts);
}

/**
 * 위치 원문별 공간 자동 제안 — 지난번 연결(그 공간이 아직 보이면) → 이름이 같은 공간 → 미지정
 */
export function suggestLocationMap(locationKeys: string[], spaces: Space[], saved: Record<string, string> = {}): LocationSpaceMap {
    const active = spaces.filter((s) => !s.archived);
    const map: LocationSpaceMap = {};
    for (const key of locationKeys) {
        const prev = saved[key];
        if (prev && active.some((s) => s.id === prev)) {
            map[key] = prev;
            continue;
        }
        const byName = active.find((s) => normalizeSpaceName(s.name) === normalizeSpaceName(key));
        if (byName) map[key] = byName.id;
    }
    return map;
}

export default function useAssetImport() {
    const { userData } = useAuth();
    const { showToast } = useToast();
    const { confirm } = useConfirm();
    const orgId = userData?.organizationId ?? null;

    const [step, setStep] = useState<ImportStep>('pick');
    const [fileName, setFileName] = useState('');
    const [sheets, setSheets] = useState<SheetTable[]>([]);
    const [sheetIndex, setSheetIndex] = useState(0);
    const [headerRowIndex, setHeaderRowIndex] = useState<number | null>(null);
    const [columnMap, setColumnMap] = useState<ColumnMap>({});
    const [org, setOrg] = useState<Organization | null>(null);
    const [error, setError] = useState('');
    const [working, setWorking] = useState(false);

    const [spaces, setSpaces] = useState<Space[]>([]);
    const [existing, setExisting] = useState<Asset[]>([]);
    const [accounting, setAccounting] = useState<Map<string, AssetAccounting>>(new Map());
    const [locationMap, setLocationMap] = useState<LocationSpaceMap>({});
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const [importId, setImportId] = useState<string | null>(null);
    /** 확정한 결과 요약 — 비교(diff)는 비교 단계에서만 계산하므로 완료 화면용으로 따로 남긴다 */
    const [result, setResult] = useState<{ added: number; changed: number; missing: number; unchanged: number } | null>(null);

    const table = useMemo(() => {
        const sheet = sheets[sheetIndex];
        if (!sheet) return null;
        return headerRowIndex == null ? toImportTable(sheet) : toImportTable(sheet, headerRowIndex);
    }, [sheets, sheetIndex, headerRowIndex]);

    const parsed = useMemo(() => (table ? parseAssets(table, columnMap) : null), [table, columnMap]);
    const blockers = useMemo(() => (step === 'pick' ? [] : blockingReasons(columnMap, parsed)), [step, columnMap, parsed]);
    const reportedTotal = useMemo(() => (parsed ? reportedTotalOf(parsed.totalRows) : null), [parsed]);
    const locations = useMemo(() => (parsed ? countByLocation(parsed.assets) : []), [parsed]);
    const diff = useMemo(
        () => (step === 'compare' && parsed && orgId ? diffAssets(orgId, parsed.assets, locationMap, existing, accounting) : null),
        [step, parsed, orgId, locationMap, existing, accounting],
    );

    const reset = useCallback(() => {
        setStep('pick'); setFileName(''); setSheets([]); setSheetIndex(0); setHeaderRowIndex(null);
        setColumnMap({}); setError(''); setLocationMap({}); setProgress(null); setImportId(null); setResult(null);
    }, []);

    /** 시트를 바꾸면 머리글을 다시 찾고 열을 다시 맞춘다 */
    const applySheet = useCallback((list: SheetTable[], index: number, saved: ColumnMap) => {
        setSheetIndex(index);
        setHeaderRowIndex(null);
        const t = list[index] ? toImportTable(list[index]) : null;
        setColumnMap(t ? autoMapColumns(t.headers, saved) : {});
    }, []);

    const pickFile = useCallback(async (file: File) => {
        if (!orgId) return;
        setError('');
        if (file.size > MAX_IMPORT_FILE_BYTES) {
            setError('파일이 너무 큽니다(20MB 초과). 사진이 든 자산관리카드가 아니라 고정자산대장 엑셀을 골라 주세요.');
            return;
        }
        setWorking(true);
        try {
            const [list, organization] = await Promise.all([
                file.arrayBuffer().then((buf) => readWorkbook(buf)),
                getOrganization(orgId),
            ]);
            const orgData = (organization as Organization) ?? null;
            setOrg(orgData);
            // 머리글을 알아본 첫 시트를 고른다
            const first = Math.max(0, list.findIndex((s) => toImportTable(s) != null));
            setSheets(list);
            setFileName(file.name);
            applySheet(list, first, (orgData?.importColumnMap ?? {}) as ColumnMap);
            if (!list.some((s) => toImportTable(s) != null)) {
                setError('머리글(자산코드·품명 등) 줄을 찾지 못했습니다. 아래에서 머리글 줄 번호를 직접 골라 주세요.');
            }
            setStep('map');
        } catch (err) {
            captureError(err, { context: 'useAssetImport.pickFile' });
            setError('파일을 읽지 못했습니다. 엑셀(.xlsx·.xls) 파일인지 확인해 주세요.');
        } finally {
            setWorking(false);
        }
    }, [orgId, applySheet]);

    const selectSheet = useCallback((index: number) => {
        applySheet(sheets, index, (org?.importColumnMap ?? {}) as ColumnMap);
    }, [sheets, org, applySheet]);

    /** 머리글 줄을 직접 고른다(엑셀 줄 번호, 1부터) */
    const selectHeaderRow = useCallback((rowNumber: number) => {
        const sheet = sheets[sheetIndex];
        if (!sheet) return;
        const index = rowNumber - 1;
        setHeaderRowIndex(index);
        const t = toImportTable(sheet, index);
        setColumnMap(t ? autoMapColumns(t.headers, (org?.importColumnMap ?? {}) as ColumnMap) : {});
    }, [sheets, sheetIndex, org]);

    const setColumn = useCallback((field: ImportField, header: string) => {
        setColumnMap((prev) => {
            const next: ColumnMap = { ...prev };
            // 한 머리글은 한 필드에만 — 다른 필드에 쓰이던 것이면 거기서 뺀다
            for (const [f, h] of Object.entries(next) as Array<[ImportField, string | undefined]>) {
                if (h === header && f !== field) delete next[f];
            }
            if (header) next[field] = header;
            else delete next[field];
            return next;
        });
    }, []);

    /** 다음 단계 — 앱에 있는 재물·공간을 읽어 비교를 준비한다 */
    const goCompare = useCallback(async () => {
        if (!orgId || !parsed || blockers.length > 0) return;
        setWorking(true);
        setError('');
        try {
            const [spaceList, assetList, accMap] = await Promise.all([getSpaces(orgId), getAssets(orgId), getAccountingMap(orgId)]);
            setSpaces(spaceList);
            setExisting(assetList);
            setAccounting(accMap);
            setLocationMap(suggestLocationMap(locations.map((l) => l.key), spaceList, org?.locationSpaceMap ?? {}));
            setStep('compare');
        } catch {
            setError('앱에 있는 재물을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
        } finally {
            setWorking(false);
        }
    }, [orgId, parsed, blockers, locations, org]);

    const backToMap = useCallback(() => setStep('map'), []);

    const setLocationSpace = useCallback((key: string, spaceId: string) => {
        setLocationMap((prev) => {
            const next = { ...prev };
            if (spaceId) next[key] = spaceId;
            else delete next[key];
            return next;
        });
    }, []);

    /** 위치 이름 그대로 새 공간을 만들어 연결한다 */
    const createSpaceFor = useCallback(async (key: string, location: string | null) => {
        if (!orgId || !location) return;
        const problem = validateSpaceName(location, spaces);
        if (problem) {
            showToast(problem, 'warning');
            return;
        }
        setWorking(true);
        try {
            const active = spaces.filter((s) => !s.archived);
            const order = active.length === 0 ? 0 : Math.max(...active.map((s) => s.order)) + 1;
            const id = await createSpace(orgId, location, order);
            setSpaces((prev) => [...prev, { id, organizationId: orgId, name: normalizeSpaceName(location), order, managerUids: [], archived: false }]);
            setLocationMap((prev) => ({ ...prev, [key]: id }));
            showToast(`공간 '${normalizeSpaceName(location)}'을(를) 만들었습니다.`, 'success');
        } catch {
            showToast('공간을 만들지 못했습니다.', 'error');
        } finally {
            setWorking(false);
        }
    }, [orgId, spaces, showToast]);

    const confirmImport = useCallback(async () => {
        if (!orgId || !parsed || !diff || !table) return;
        const unmapped = locations.filter((l) => !locationMap[l.key]).reduce((n, l) => n + l.count, 0);
        const lines = [
            `새로 등록 ${diff.added.length}건 · 바뀜 ${diff.changed.length}건 · 그대로 ${diff.unchanged}건`,
            diff.missing.length > 0 ? `이번 파일에 없는 재물 ${diff.missing.length}건은 지우지 않고 '대장에 없음'으로 표시합니다.` : '',
            unmapped > 0 ? `공간을 정하지 않은 재물 ${unmapped}건은 공간 없이 저장됩니다(나중에 다시 가져와 정할 수 있습니다).` : '',
        ].filter(Boolean);
        const ok = await confirm({ title: '가져오기 확정', message: `${lines.join('\n')}\n\n이대로 저장할까요?`, confirmText: '저장' });
        if (!ok) return;

        setStep('saving');
        setProgress({ done: 0, total: 0 });
        try {
            const id = await commitImport({
                orgId, fileName, sheetName: table.sheetName, columnMap, locationMap, parsed, diff, reportedTotal,
                onProgress: (done, total) => setProgress({ done, total }),
            });
            setImportId(id);
            setResult({ added: diff.added.length, changed: diff.changed.length, missing: diff.missing.length, unchanged: diff.unchanged });
            setStep('done');
            showToast('가져오기를 마쳤습니다.', 'success');
        } catch {
            setStep('compare');
            setError('저장하다 멈췄습니다. 일부만 저장됐을 수 있습니다 — 같은 파일로 다시 확정하면 남은 것만 이어서 저장합니다.');
            // 다시 비교할 수 있게 앱 쪽 재물을 새로 읽는다
            try {
                const [assetList, accMap] = await Promise.all([getAssets(orgId), getAccountingMap(orgId)]);
                setExisting(assetList);
                setAccounting(accMap);
            } catch { /* 위 안내로 충분하다 */ }
        }
    }, [orgId, parsed, diff, table, locations, locationMap, confirm, fileName, columnMap, reportedTotal, showToast]);

    return {
        step, working, error, fileName,
        sheets, sheetIndex, table, columnMap, parsed, blockers, reportedTotal,
        spaces, locations, locationMap, diff, progress, importId, result,
        pickFile, selectSheet, selectHeaderRow, setColumn, goCompare, backToMap,
        setLocationSpace, createSpaceFor, confirmImport, reset,
    };
}

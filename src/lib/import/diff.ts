/**
 * 가져오기 비교 — 엑셀 내용과 앱에 있는 재물을 맞대어 신규·바뀜·사라짐·그대로를 가른다 (기획서 F07)
 *
 * 원칙:
 *  - **엑셀에 없는 재물을 지우지 않는다.** `missingFromSource`로 표시만 하고 사람이 확인한다.
 *  - 다시 나타난 재물은 표시를 거둔다(바뀜으로 센다).
 *  - 무엇이 바뀌었는지 필드 단위로 남긴다 — 이 목록이 미리보기와 변경 이력이 된다.
 */
import type { ParsedAsset } from './parseSheet';
import type { Asset, AssetAccounting, AssetFields, AccountingFields } from '../../types/asset';

/** 기관 ID + 자산코드 → 재물 문서 ID. '/'가 문서 경로를 깨지 않게 인코딩한다 */
export function assetDocId(orgId: string, code: string): string {
    return `${orgId}__${encodeURIComponent(code)}`;
}

/** 대장 위치 원문 → 공간 ID (없으면 공간 미지정) */
export type LocationSpaceMap = Record<string, string>;

/** 위치 원문의 키 — 빈 위치도 하나의 묶음으로 다룬다 */
export const NO_LOCATION_KEY = '(위치 없음)';
export const locationKey = (location: string | null): string => location ?? NO_LOCATION_KEY;

export const ASSET_COMPARE_FIELDS = [
    'name', 'category', 'spec', 'acquiredAt', 'acquiredQuantity', 'quantity', 'usefulLife',
    'status', 'statusRaw', 'locationRaw', 'spaceId', 'department', 'usage',
] as const satisfies ReadonlyArray<keyof AssetFields>;

export const ACCOUNTING_COMPARE_FIELDS = ['amount', 'depreciation', 'residual'] as const satisfies ReadonlyArray<keyof AccountingFields>;

export type CompareField = (typeof ASSET_COMPARE_FIELDS)[number] | (typeof ACCOUNTING_COMPARE_FIELDS)[number] | 'missingFromSource';

/** 비교·이력에 쓰는 필드 이름 (가져오기 비교 화면·재물 상세 이력이 함께 쓴다) */
export const COMPARE_FIELD_LABEL: Record<CompareField, string> = {
    name: '품명', category: '분류', spec: '규격', acquiredAt: '취득일자', acquiredQuantity: '취득수량',
    quantity: '현재수량', usefulLife: '내용연수(년)', status: '상태', statusRaw: '상태(원문)', locationRaw: '위치(원문)', spaceId: '공간',
    department: '부서', usage: '용도', amount: '자산금액', depreciation: '감가상각충당금', residual: '잔존가액',
    missingFromSource: '대장에 없음',
};

export interface FieldChange {
    before: unknown;
    after: unknown;
}

export interface AssetDraft {
    id: string;
    fields: AssetFields;
    accounting: AccountingFields;
    rowNumber: number;
}

export interface ChangedAsset {
    draft: AssetDraft;
    changes: Partial<Record<CompareField, FieldChange>>;
    /** 재물 문서 쪽이 바뀌었는지 / 금액 문서 쪽이 바뀌었는지 */
    assetChanged: boolean;
    accountingChanged: boolean;
}

export interface ImportDiff {
    added: AssetDraft[];
    changed: ChangedAsset[];
    /** 이번 파일에 없어 새로 '대장에 없음' 표시할 재물 */
    missing: Asset[];
    unchanged: number;
}

/** 엑셀 한 줄 → 저장할 값 */
export function toDraft(orgId: string, row: ParsedAsset, locationMap: LocationSpaceMap): AssetDraft {
    const spaceId = locationMap[locationKey(row.location)] || null;
    return {
        id: assetDocId(orgId, row.code),
        rowNumber: row.rowNumber,
        fields: {
            code: row.code, name: row.name, category: row.category, spec: row.spec,
            acquiredAt: row.acquiredAt, acquiredQuantity: row.acquiredQuantity, quantity: row.quantity,
            usefulLife: row.usefulLife,
            status: row.status, statusRaw: row.statusRaw, locationRaw: row.location, spaceId,
            department: row.department, usage: row.usage,
        },
        accounting: { amount: row.amount, depreciation: row.depreciation, residual: row.residual },
    };
}

const same = (a: unknown, b: unknown) => (a ?? null) === (b ?? null);

export function diffAssets(
    orgId: string,
    rows: ParsedAsset[],
    locationMap: LocationSpaceMap,
    existing: Asset[],
    accounting: Map<string, AssetAccounting>,
): ImportDiff {
    const byId = new Map(existing.map((a) => [a.id, a]));
    const seen = new Set<string>();
    const diff: ImportDiff = { added: [], changed: [], missing: [], unchanged: 0 };

    for (const row of rows) {
        const draft = toDraft(orgId, row, locationMap);
        seen.add(draft.id);
        const before = byId.get(draft.id);
        if (!before) {
            diff.added.push(draft);
            continue;
        }
        const changes: ChangedAsset['changes'] = {};
        let assetChanged = false;
        let accountingChanged = false;
        for (const f of ASSET_COMPARE_FIELDS) {
            if (!same(before[f], draft.fields[f])) {
                changes[f] = { before: before[f] ?? null, after: draft.fields[f] ?? null };
                assetChanged = true;
            }
        }
        if (before.missingFromSource) {
            changes.missingFromSource = { before: true, after: false };
            assetChanged = true;
        }
        const acc = accounting.get(draft.id);
        for (const f of ACCOUNTING_COMPARE_FIELDS) {
            if (!same(acc?.[f], draft.accounting[f])) {
                changes[f] = { before: acc?.[f] ?? null, after: draft.accounting[f] ?? null };
                accountingChanged = true;
            }
        }
        if (assetChanged || accountingChanged) diff.changed.push({ draft, changes, assetChanged, accountingChanged });
        else diff.unchanged++;
    }

    for (const asset of existing) {
        // 앱에서 직접 등록한 재물은 대장에 없는 게 당연하다 — '대장에 없음'으로 표시하지 않는다
        if (!seen.has(asset.id) && !asset.missingFromSource && !asset.manual) diff.missing.push(asset);
    }
    return diff;
}

/** 위치 원문별 재물 수 (위치 대응 화면용, 많은 순) */
export function countByLocation(rows: ParsedAsset[]): Array<{ key: string; location: string | null; count: number }> {
    const counts = new Map<string, { location: string | null; count: number }>();
    for (const row of rows) {
        const key = locationKey(row.location);
        const cur = counts.get(key) ?? { location: row.location, count: 0 };
        cur.count++;
        counts.set(key, cur);
    }
    return [...counts.entries()]
        .map(([key, v]) => ({ key, ...v }))
        .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, 'ko'));
}

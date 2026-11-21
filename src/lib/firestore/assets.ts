/**
 * Firestore — 재물(assets)·금액(assetAccounting)·가져오기 기록(imports)·변경 이력(history)
 *
 * 쓰기는 기관 관리자만 한다(firestore.rules). 모든 쓰기에 행위자 스탬프를 심는다.
 * 재물은 지우지 않는다 — 대장에서 빠지면 `missingFromSource`로 표시만 한다.
 */
import {
    collection, doc, query, where, getDocs, getCountFromServer, writeBatch,
    serverTimestamp, orderBy, limit,
    type DocumentReference,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
    createZodConverter, assetSchema, assetAccountingSchema, importRecordSchema,
} from '../../schemas';
import { captureError } from '../sentry';
import { actorStamp } from './actorStamp';
import type { Asset, AssetAccounting, ImportRecord, AssetStatus } from '../../types/asset';
import type { ImportDiff, LocationSpaceMap } from '../import/diff';
import type { ColumnMap } from '../import/columns';
import type { ParseResult } from '../import/parseSheet';

const assetConverter = createZodConverter(assetSchema);
const accountingConverter = createZodConverter(assetAccountingSchema);
const importConverter = createZodConverter(importRecordSchema);

/** 한 배치에 넣는 쓰기 수 — Firestore 상한(500)보다 여유를 둔다 */
const BATCH_SIZE = 400;

/** 기관의 재물 전부 (다시 가져오기 비교용) */
export const getAssets = async (orgId: string): Promise<Asset[]> => {
    try {
        const snap = await getDocs(query(
            collection(db, 'assets').withConverter(assetConverter),
            where('organizationId', '==', orgId),
        ));
        return snap.docs.map((d) => d.data() as Asset);
    } catch (error) {
        captureError(error, { context: 'getAssets', orgId });
        throw error;
    }
};

/** 기관의 금액 문서 전부 — 재물 문서 ID → 금액 (관리자만 읽을 수 있다) */
export const getAccountingMap = async (orgId: string): Promise<Map<string, AssetAccounting>> => {
    try {
        const snap = await getDocs(query(
            collection(db, 'assetAccounting').withConverter(accountingConverter),
            where('organizationId', '==', orgId),
        ));
        return new Map(snap.docs.map((d) => [d.id, d.data() as AssetAccounting]));
    } catch (error) {
        captureError(error, { context: 'getAccountingMap', orgId });
        throw error;
    }
};

/** 상태별 재물 수 — 집계 쿼리라 1,000건당 읽기 1회 */
export const getAssetCounts = async (orgId: string): Promise<Record<AssetStatus, number>> => {
    try {
        const statuses: AssetStatus[] = ['active', 'inactive', 'disposed'];
        const counts = await Promise.all(statuses.map(async (status) => {
            const snap = await getCountFromServer(query(
                collection(db, 'assets'),
                where('organizationId', '==', orgId),
                where('status', '==', status),
            ));
            return [status, snap.data().count] as const;
        }));
        return Object.fromEntries(counts) as Record<AssetStatus, number>;
    } catch (error) {
        captureError(error, { context: 'getAssetCounts', orgId });
        throw error;
    }
};

/** 최근 가져오기 기록 */
export const getRecentImports = async (orgId: string, max = 5): Promise<ImportRecord[]> => {
    try {
        const snap = await getDocs(query(
            collection(db, 'imports').withConverter(importConverter),
            where('organizationId', '==', orgId),
            orderBy('confirmedAt', 'desc'),
            limit(max),
        ));
        return snap.docs.map((d) => d.data() as ImportRecord);
    } catch (error) {
        captureError(error, { context: 'getRecentImports', orgId });
        throw error;
    }
};

export interface CommitImportInput {
    orgId: string;
    fileName: string;
    sheetName: string;
    columnMap: ColumnMap;
    locationMap: LocationSpaceMap;
    parsed: ParseResult;
    diff: ImportDiff;
    /** 대장 합계 줄 금액(있으면) */
    reportedTotal: number | null;
    onProgress?: (done: number, total: number) => void;
}

type Op = { ref: DocumentReference; kind: 'set' | 'update'; data: Record<string, unknown> };

/**
 * 가져오기 확정 — 신규·바뀜·사라짐을 저장하고 가져오기 기록을 남긴다.
 *
 * 400건씩 나눠 배치로 쓴다. 중간 배치가 실패해도 **다시 확정하면 이어진다** — 문서 ID가
 * 자산코드로 정해져 있어 이미 쓴 재물은 '그대로'로 비교되기 때문이다. 가져오기 기록과 열·위치
 * 연결은 마지막 배치에 넣어, 기록이 있으면 전부 저장됐다는 뜻이 되게 한다.
 *
 * @returns 가져오기 기록 ID
 */
export const commitImport = async (input: CommitImportInput): Promise<string> => {
    const { orgId, diff, parsed } = input;
    const stamp = actorStamp();
    const importRef = doc(collection(db, 'imports'));
    const now = serverTimestamp();
    const ops: Op[] = [];

    const assetRef = (id: string) => doc(db, 'assets', id);
    const accRef = (id: string) => doc(db, 'assetAccounting', id);
    const historyOp = (assetId: string, code: string, type: 'import-change' | 'import-missing', changes: Record<string, unknown>) =>
        ops.push({ ref: doc(collection(db, 'history')), kind: 'set', data: {
            organizationId: orgId, assetId, code, type, changes, importId: importRef.id, at: now, ...stamp,
        } });

    for (const d of diff.added) {
        ops.push({ ref: assetRef(d.id), kind: 'set', data: {
            organizationId: orgId, ...d.fields, missingFromSource: false, lastImportId: importRef.id,
            createdAt: now, updatedAt: now, ...stamp,
        } });
        if (d.accounting.amount != null || d.accounting.depreciation != null || d.accounting.residual != null) {
            ops.push({ ref: accRef(d.id), kind: 'set', data: { organizationId: orgId, ...d.accounting, updatedAt: now, ...stamp } });
        }
    }
    for (const c of diff.changed) {
        if (c.assetChanged) {
            ops.push({ ref: assetRef(c.draft.id), kind: 'update', data: {
                ...c.draft.fields, missingFromSource: false, lastImportId: importRef.id, updatedAt: now, ...stamp,
            } });
        }
        if (c.accountingChanged) {
            // 금액 문서가 아직 없을 수 있어 전체를 set으로 쓴다
            ops.push({ ref: accRef(c.draft.id), kind: 'set', data: { organizationId: orgId, ...c.draft.accounting, updatedAt: now, ...stamp } });
        }
        historyOp(c.draft.id, c.draft.fields.code, 'import-change', c.changes);
    }
    for (const a of diff.missing) {
        ops.push({ ref: assetRef(a.id), kind: 'update', data: { missingFromSource: true, lastImportId: importRef.id, updatedAt: now, ...stamp } });
        historyOp(a.id, a.code, 'import-missing', { missingFromSource: { before: false, after: true } });
    }

    const columnMap = Object.fromEntries(Object.entries(input.columnMap).filter(([, v]) => !!v)) as Record<string, string>;
    const finalOps: Op[] = [
        { ref: doc(db, 'organizations', orgId), kind: 'update', data: { importColumnMap: columnMap, locationSpaceMap: input.locationMap } },
        { ref: importRef, kind: 'set', data: {
            organizationId: orgId, fileName: input.fileName, sheetName: input.sheetName, columnMap,
            counts: parsed.counts,
            diff: { added: diff.added.length, changed: diff.changed.length, missing: diff.missing.length, unchanged: diff.unchanged },
            amountTotal: parsed.amountTotals.all,
            reportedTotal: input.reportedTotal,
            confirmedAt: now,
            lastEditedByUid: stamp.lastEditedByUid ?? '',
        } },
    ];

    const chunks: Op[][] = [];
    for (let i = 0; i < ops.length; i += BATCH_SIZE) chunks.push(ops.slice(i, i + BATCH_SIZE));
    // 마지막 배치에 기록을 붙인다 (자리가 없으면 따로 한 배치)
    if (chunks.length > 0 && chunks[chunks.length - 1].length + finalOps.length <= BATCH_SIZE) chunks[chunks.length - 1].push(...finalOps);
    else chunks.push(finalOps);

    const total = ops.length;
    let done = 0;
    try {
        for (const chunk of chunks) {
            const batch = writeBatch(db);
            for (const op of chunk) {
                if (op.kind === 'set') batch.set(op.ref, op.data);
                else batch.update(op.ref, op.data);
            }
            await batch.commit();
            done = Math.min(total, done + chunk.length);
            input.onProgress?.(done, total);
        }
        return importRef.id;
    } catch (error) {
        captureError(error, { context: 'commitImport', orgId, done, total });
        throw error;
    }
};

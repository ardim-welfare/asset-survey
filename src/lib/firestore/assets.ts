/**
 * Firestore — 재물(assets)·금액(assetAccounting)·가져오기 기록(imports)·변경 이력(history)
 *
 * 쓰기는 기관 관리자만 한다(firestore.rules). 모든 쓰기에 행위자 스탬프를 심는다.
 * 재물은 지우지 않는다 — 대장에서 빠지면 `missingFromSource`로 표시만 한다.
 */
import {
    collection, doc, query, where, getDoc, getDocs, getCountFromServer, writeBatch,
    serverTimestamp, orderBy, limit,
    type DocumentReference,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
    createZodConverter, assetSchema, assetAccountingSchema, importRecordSchema, historySchema,
} from '../../schemas';
import { captureError } from '../sentry';
import { actorStamp } from './actorStamp';
import type { Asset, AssetAccounting, ImportRecord, AssetStatus, HistoryEntry } from '../../types/asset';
import { newTagId } from '../labels/tag';
import { assetDocId, type ImportDiff, type LocationSpaceMap } from '../import/diff';
import type { ColumnMap } from '../import/columns';
import type { ParseResult } from '../import/parseSheet';

const assetConverter = createZodConverter(assetSchema);
const accountingConverter = createZodConverter(assetAccountingSchema);
const importConverter = createZodConverter(importRecordSchema);
const historyConverter = createZodConverter(historySchema);

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

/** 재물 한 건 — 없으면 null. 같은 기관 구성원만 읽힌다(Rules) */
export const getAsset = async (assetId: string): Promise<Asset | null> => {
    try {
        const snap = await getDoc(doc(db, 'assets', assetId).withConverter(assetConverter));
        return snap.exists() ? (snap.data() as Asset) : null;
    } catch (error) {
        captureError(error, { context: 'getAsset', assetId });
        throw error;
    }
};

/** 재물 한 건의 금액 — 관리자만 읽힌다. 금액 문서가 없으면 null */
export const getAssetAccounting = async (assetId: string): Promise<AssetAccounting | null> => {
    try {
        const snap = await getDoc(doc(db, 'assetAccounting', assetId).withConverter(accountingConverter));
        return snap.exists() ? (snap.data() as AssetAccounting) : null;
    } catch (error) {
        captureError(error, { context: 'getAssetAccounting', assetId });
        throw error;
    }
};

/** 재물 한 건의 변경 이력(최근 순) — 관리자만 읽힌다 */
export const getAssetHistory = async (orgId: string, assetId: string, max = 20): Promise<HistoryEntry[]> => {
    try {
        const snap = await getDocs(query(
            collection(db, 'history').withConverter(historyConverter),
            where('organizationId', '==', orgId),
            where('assetId', '==', assetId),
            orderBy('at', 'desc'),
            limit(max),
        ));
        return snap.docs.map((d) => d.data() as HistoryEntry);
    } catch (error) {
        captureError(error, { context: 'getAssetHistory', orgId, assetId });
        throw error;
    }
};

/** `in` 조건 한 번에 넣을 수 있는 값 수(Firestore 상한 30) */
const IN_LIMIT = 30;

/** 여러 공간의 재물 — 직원의 '내 공간 재물' 목록 */
export const getAssetsBySpaces = async (orgId: string, spaceIds: string[]): Promise<Asset[]> => {
    if (spaceIds.length === 0) return [];
    try {
        const chunks: string[][] = [];
        for (let i = 0; i < spaceIds.length; i += IN_LIMIT) chunks.push(spaceIds.slice(i, i + IN_LIMIT));
        const snaps = await Promise.all(chunks.map((ids) => getDocs(query(
            collection(db, 'assets').withConverter(assetConverter),
            where('organizationId', '==', orgId),
            where('spaceId', 'in', ids),
        ))));
        return snaps.flatMap((snap) => snap.docs.map((d) => d.data() as Asset));
    } catch (error) {
        captureError(error, { context: 'getAssetsBySpaces', orgId, spaces: spaceIds.length });
        throw error;
    }
};

/** 라벨 태그로 재물 찾기 — 내 기관 안에서만 찾는다(다른 기관 라벨이면 null) */
export const findAssetByTag = async (orgId: string, tagId: string): Promise<Asset | null> => {
    try {
        const snap = await getDocs(query(
            collection(db, 'assets').withConverter(assetConverter),
            where('organizationId', '==', orgId),
            where('tagId', '==', tagId),
            limit(1),
        ));
        return snap.empty ? null : (snap.docs[0].data() as Asset);
    } catch (error) {
        captureError(error, { context: 'findAssetByTag', orgId });
        throw error;
    }
};

/**
 * 자산코드로 재물 찾기 — 내 기관 안에서만. 코드는 엑셀에 적힌 그대로 저장돼 있어 그대로 먼저 찾고,
 * 없으면 띄어쓰기를 뺀 대문자로 한 번 더 찾는다(직접 입력·옛 QR).
 */
export const findAssetByCode = async (orgId: string, code: string): Promise<Asset | null> => {
    const tries = [...new Set([code.trim(), code.replace(/\s+/g, '').toUpperCase()])].filter(Boolean);
    try {
        for (const c of tries) {
            const snap = await getDocs(query(
                collection(db, 'assets').withConverter(assetConverter),
                where('organizationId', '==', orgId),
                where('code', '==', c),
                limit(1),
            ));
            if (!snap.empty) return snap.docs[0].data() as Asset;
        }
        return null;
    } catch (error) {
        captureError(error, { context: 'findAssetByCode', orgId });
        throw error;
    }
};

/**
 * 라벨 태그 발급 — 태그가 없는 재물에만 새로 만들어 저장한다(기획서 F09).
 * 이미 있는 태그는 그대로 둔다(붙인 라벨을 다시 뽑아도 같은 QR이 나오게). Rules가 바꾸기를 막는다.
 *
 * @returns 재물 문서 ID → 태그 ID (이미 있던 것 포함, 넘긴 재물 전부)
 */
export const issueTags = async (
    assets: Array<Pick<Asset, 'id' | 'tagId'>>,
    onProgress?: (done: number, total: number) => void,
): Promise<Map<string, string>> => {
    const result = new Map<string, string>();
    const missing: Array<{ id: string; tagId: string }> = [];
    for (const a of assets) {
        if (a.tagId) result.set(a.id, a.tagId);
        else missing.push({ id: a.id, tagId: newTagId() });
    }
    if (missing.length === 0) return result;

    const stamp = actorStamp();
    const now = serverTimestamp();
    let done = 0;
    try {
        for (let i = 0; i < missing.length; i += BATCH_SIZE) {
            const chunk = missing.slice(i, i + BATCH_SIZE);
            const batch = writeBatch(db);
            for (const m of chunk) batch.update(doc(db, 'assets', m.id), { tagId: m.tagId, updatedAt: now, ...stamp });
            await batch.commit();
            for (const m of chunk) result.set(m.id, m.tagId);
            done += chunk.length;
            onProgress?.(done, missing.length);
        }
        return result;
    } catch (error) {
        captureError(error, { context: 'issueTags', done, total: missing.length });
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
            // 직접 등록한 재물이 대장에 나타났으면 이제 대장이 관리한다(manual: false)
            ops.push({ ref: assetRef(c.draft.id), kind: 'update', data: {
                ...c.draft.fields, missingFromSource: false, manual: false, lastImportId: importRef.id, updatedAt: now, ...stamp,
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

// ── 직접 등록·수정 (2026-11-22) ──

/** 화면에서 직접 고치는 재물 값 — 자산코드는 등록 때만 정한다(문서 ID라 바꾸지 않는다) */
export type ManualAssetFields = Pick<Asset,
    'name' | 'category' | 'spec' | 'acquiredAt' | 'quantity' | 'usefulLife' | 'status' | 'spaceId' | 'department' | 'usage'>;

/** 비교·이력에 쓰는 직접 수정 필드 */
export const MANUAL_EDIT_FIELDS = [
    'name', 'category', 'spec', 'acquiredAt', 'quantity', 'usefulLife', 'status', 'spaceId', 'department', 'usage',
] as const satisfies ReadonlyArray<keyof ManualAssetFields>;

/**
 * 자동 자산코드 — "올해-순번"(2026-001). 이미 있는 같은 해 코드의 가장 큰 순번 다음을 준다.
 * 기관 관리번호 체계가 있으면 사람이 직접 적는 것이 우선이고, 이것은 번호가 없는 기관을 위한 기본값이다.
 */
export function nextAssetCode(existingCodes: string[], now = new Date()): string {
    const year = now.getFullYear();
    const re = new RegExp(`^${year}-(\\d+)$`);
    let max = 0;
    for (const c of existingCodes) {
        const m = re.exec(c.trim());
        if (m) max = Math.max(max, Number(m[1]));
    }
    return `${year}-${String(max + 1).padStart(3, '0')}`;
}

export class AssetCodeTakenError extends Error {
    constructor(code: string) {
        super(`이미 있는 자산코드: ${code}`);
        this.name = 'AssetCodeTakenError';
    }
}

/**
 * 재물 한 건 직접 등록 — 재물·금액(있으면)·이력을 한 배치로 쓴다.
 * 같은 자산코드가 이미 있으면 AssetCodeTakenError (Rules도 기존 문서를 create로 덮어쓰지 못한다).
 * @returns 재물 문서 ID
 */
export const createAssetManually = async (input: {
    orgId: string; code: string; fields: ManualAssetFields; amount: number | null;
}): Promise<string> => {
    const { orgId, fields } = input;
    const code = input.code.trim();
    const id = assetDocId(orgId, code);
    const stamp = actorStamp();
    const now = serverTimestamp();
    try {
        const existing = await getDoc(doc(db, 'assets', id));
        if (existing.exists()) throw new AssetCodeTakenError(code);
        const batch = writeBatch(db);
        batch.set(doc(db, 'assets', id), {
            organizationId: orgId, code, ...fields, acquiredQuantity: null, statusRaw: null, locationRaw: null,
            missingFromSource: false, manual: true, lastImportId: null, tagId: null,
            createdAt: now, updatedAt: now, ...stamp,
        });
        if (input.amount != null) {
            batch.set(doc(db, 'assetAccounting', id), {
                organizationId: orgId, amount: input.amount, depreciation: null, residual: null, updatedAt: now, ...stamp,
            });
        }
        batch.set(doc(collection(db, 'history')), {
            organizationId: orgId, assetId: id, code, type: 'manual-create', changes: {}, importId: null, at: now, ...stamp,
        });
        await batch.commit();
        return id;
    } catch (error) {
        if (!(error instanceof AssetCodeTakenError)) captureError(error, { context: 'createAssetManually', orgId });
        throw error;
    }
};

/**
 * 재물 직접 수정 — 바뀐 값만 쓰고 전·후 값을 이력에 남긴다. 바뀐 것이 없으면 아무것도 쓰지 않는다.
 * 금액은 자산금액만 고친다(감가상각·잔존가액은 대장 값 그대로 둔다).
 * @returns 바뀐 필드 수
 */
export const updateAssetManually = async (input: {
    asset: Asset; fields: ManualAssetFields; amount: number | null; accounting: AssetAccounting | null;
}): Promise<number> => {
    const { asset, fields } = input;
    const stamp = actorStamp();
    const now = serverTimestamp();
    const changes: Record<string, { before: unknown; after: unknown }> = {};
    const assetPatch: Record<string, unknown> = {};
    for (const f of MANUAL_EDIT_FIELDS) {
        const before = asset[f] ?? null;
        const after = fields[f] ?? null;
        if (before !== after) { changes[f] = { before, after }; assetPatch[f] = after; }
    }
    const amountBefore = input.accounting?.amount ?? null;
    const amountChanged = amountBefore !== input.amount;
    if (amountChanged) changes.amount = { before: amountBefore, after: input.amount };
    const count = Object.keys(changes).length;
    if (count === 0) return 0;
    try {
        const batch = writeBatch(db);
        if (Object.keys(assetPatch).length > 0) {
            batch.update(doc(db, 'assets', asset.id), { ...assetPatch, updatedAt: now, ...stamp });
        }
        if (amountChanged) {
            // 금액 문서가 아직 없을 수 있어 전체를 set으로 쓴다
            batch.set(doc(db, 'assetAccounting', asset.id), {
                organizationId: asset.organizationId, amount: input.amount,
                depreciation: input.accounting?.depreciation ?? null, residual: input.accounting?.residual ?? null,
                updatedAt: now, ...stamp,
            });
        }
        batch.set(doc(collection(db, 'history')), {
            organizationId: asset.organizationId, assetId: asset.id, code: asset.code, type: 'manual-edit',
            changes, importId: null, at: now, ...stamp,
        });
        await batch.commit();
        return count;
    } catch (error) {
        captureError(error, { context: 'updateAssetManually', assetId: asset.id });
        throw error;
    }
};

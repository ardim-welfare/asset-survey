import { z } from 'zod';
import { timestampSchema } from './common';

/** 재물 상태 — 운영(조사 대상) · 불용 · 폐기 */
export const assetStatusSchema = z.enum(['active', 'inactive', 'disposed']);

/**
 * 재물 (assets/{orgId}__{코드}) — 기획서 F04~F08
 *
 * 문서 ID를 `기관ID__자산코드(URI 인코딩)`로 정해 한 기관 안에서 코드가 곧 문서 하나가 되게 한다.
 * 다시 가져오기가 같은 코드를 같은 문서로 찾아가므로 중복 등록이 생기지 않는다.
 *
 * - 원본 값(`statusRaw`·`locationRaw`)은 엑셀에 적힌 그대로 보존하고, 앱이 해석한 값
 *   (`status`·`spaceId`)을 따로 둔다 — 해석이 틀려도 원문으로 되짚을 수 있게.
 * - 금액은 이 문서에 두지 않는다 → `assetAccounting`(관리자만 읽음). 직원도 이 문서는 읽는다(4단계 조사).
 * - `missingFromSource`: 마지막 가져오기 파일에 없던 재물. 지우지 않고 표시만 한다(기획서 F07).
 * - 지우지 않는다 — Rules가 delete를 막는다.
 *
 * 필드를 추가하면 firestore.rules의 `assetDataValid` hasOnly 목록도 함께 고친다.
 */
export const assetSchema = z.object({
    organizationId: z.string().catch(''),
    code: z.string().catch(''),
    name: z.string().nullable().catch(null),
    category: z.string().nullable().catch(null),
    spec: z.string().nullable().catch(null),
    acquiredAt: z.string().nullable().catch(null),
    acquiredQuantity: z.number().nullable().catch(null),
    quantity: z.number().nullable().catch(null),
    status: assetStatusSchema.catch('active'),
    statusRaw: z.string().nullable().catch(null),
    locationRaw: z.string().nullable().catch(null),
    spaceId: z.string().nullable().catch(null),
    department: z.string().nullable().catch(null),
    usage: z.string().nullable().catch(null),
    missingFromSource: z.boolean().catch(false),
    lastImportId: z.string().nullable().catch(null),
    /**
     * QR 라벨의 태그 ID(기획서 F09) — 라벨을 처음 인쇄할 때 발급한다. 없으면 null.
     * 기관·물건 정보를 담지 않은 무작위 글자다. 한 번 정하면 바꾸지 않는다(이미 붙인 라벨이 있으므로) — Rules가 막는다.
     */
    tagId: z.string().nullable().catch(null),
    lastEditedByUid: z.string().optional().catch(undefined),
    createdAt: timestampSchema.optional().catch(undefined),
    updatedAt: timestampSchema.optional().catch(undefined),
});

/**
 * 재물 금액 (assetAccounting/{재물 문서 ID}) — 기관 관리자만 읽고 쓴다(사용자 결정 2026-11-21).
 * 앱은 회계 값을 계산하지 않는다 — 희망이음 값을 보관·표시만 한다. 공란은 null, 0원은 0.
 */
export const assetAccountingSchema = z.object({
    organizationId: z.string().catch(''),
    amount: z.number().nullable().catch(null),
    depreciation: z.number().nullable().catch(null),
    residual: z.number().nullable().catch(null),
    lastEditedByUid: z.string().optional().catch(undefined),
    updatedAt: timestampSchema.optional().catch(undefined),
});

/** 가져오기 한 번의 기록 (imports/{id}) — 생성만 한다 */
export const importRecordSchema = z.object({
    organizationId: z.string().catch(''),
    fileName: z.string().catch(''),
    sheetName: z.string().catch(''),
    columnMap: z.record(z.string(), z.string()).catch({}),
    counts: z.object({
        total: z.number().catch(0),
        active: z.number().catch(0),
        inactive: z.number().catch(0),
        disposed: z.number().catch(0),
    }).catch({ total: 0, active: 0, inactive: 0, disposed: 0 }),
    diff: z.object({
        added: z.number().catch(0),
        changed: z.number().catch(0),
        missing: z.number().catch(0),
        unchanged: z.number().catch(0),
    }).catch({ added: 0, changed: 0, missing: 0, unchanged: 0 }),
    /** 자산금액 합(빈 칸 제외) */
    amountTotal: z.number().catch(0),
    /** 대장의 합계 줄이 적어 둔 금액 — 없으면 null */
    reportedTotal: z.number().nullable().catch(null),
    lastEditedByUid: z.string().catch(''),
    confirmedAt: timestampSchema.optional().catch(undefined),
});

/** 변경 이력 (history/{id}) — 생성만 한다. 값은 재물 정보뿐이라 개인정보를 담지 않는다 */
export const historyTypeSchema = z.enum(['import-change', 'import-missing']);
export const historySchema = z.object({
    organizationId: z.string().catch(''),
    assetId: z.string().catch(''),
    code: z.string().catch(''),
    type: historyTypeSchema.catch('import-change'),
    /** 바뀐 필드 → 전·후 값 */
    changes: z.record(z.string(), z.object({
        before: z.unknown().optional(),
        after: z.unknown().optional(),
    })).catch({}),
    importId: z.string().nullable().catch(null),
    lastEditedByUid: z.string().catch(''),
    at: timestampSchema.optional().catch(undefined),
});

export type AssetSchemaType = z.infer<typeof assetSchema>;

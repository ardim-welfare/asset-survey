import { z } from 'zod';
import { timestampSchema } from './common';
import { surveyModeSchema } from './organization';

/** 회차 이름 길이 상한 — firestore.rules와 같은 값 */
export const SURVEY_NAME_MAX = 60;
/** 스캔 메모 길이 상한 — firestore.rules와 같은 값 */
export const SCAN_MEMO_MAX = 200;
/** 공간이 정해지지 않은 재물 묶음의 키(조사 대상 문서 ID 끝). 관리자만 조사한다 */
export const NO_SPACE_KEY = '_none';

/**
 * 조사 회차 (surveys/{id}) — 기획서 F10
 *
 * 시작할 때 대상 목록을 `surveyTargets`에 고정한다(시작 뒤 다시 가져오기를 해도 이 회차의 대상은 그대로).
 * - `mode`: 시작 시점의 조사 방식. 회차 도중 설정을 바꿔도 이 회차는 시작한 방식대로 간다.
 *   '혼자 조사'면 관리자만 스캔한다(Rules).
 * - `spaceIds`: 대상 공간. 공간 미지정 재물을 넣었으면 `includesUnassigned`.
 * - 마감(`closed`)은 5단계에서 연다. 지금은 만들기만 된다.
 */
export const surveyStatusSchema = z.enum(['open', 'closed']);
export const surveySchema = z.object({
    organizationId: z.string().catch(''),
    name: z.string().catch(''),
    /** 기간 — 'YYYY-MM-DD' */
    startDate: z.string().catch(''),
    endDate: z.string().catch(''),
    spaceIds: z.array(z.string()).catch([]),
    includesUnassigned: z.boolean().catch(false),
    mode: surveyModeSchema.catch('delegated'),
    status: surveyStatusSchema.catch('open'),
    /** 시작할 때 고정한 대상 수 */
    targetCount: z.number().catch(0),
    lastEditedByUid: z.string().catch(''),
    createdAt: timestampSchema.optional().catch(undefined),
});

/** 조사 대상 한 건 — 시작 시점의 재물 값 */
export const surveyTargetItemSchema = z.object({
    id: z.string().catch(''),
    code: z.string().catch(''),
    name: z.string().nullable().catch(null),
    tagId: z.string().nullable().catch(null),
});

/**
 * 조사 대상 (surveyTargets/{surveyId}__{spaceId 또는 _none}) — 공간별 묶음 문서 (기획서 7장·10장)
 * 재물 1건당 문서 1개로 만들지 않아 1,000건 기관도 문서 수십 개로 끝난다. 만든 뒤 바꾸지 않는다.
 */
export const surveyTargetSchema = z.object({
    organizationId: z.string().catch(''),
    surveyId: z.string().catch(''),
    /** 공간 미지정 묶음이면 null */
    spaceId: z.string().nullable().catch(null),
    items: z.array(surveyTargetItemSchema).catch([]),
    lastEditedByUid: z.string().catch(''),
    createdAt: timestampSchema.optional().catch(undefined),
});

/**
 * 판정 (기획서 F11) — 저장하는 것은 4가지. '중복'은 저장하지 않고(수가 늘지 않게) 화면에만 알린다.
 * '직접 입력'은 판정과 따로 `method: 'manual'`로 남겨 재확인 대상이 된다.
 */
export const scanResultSchema = z.enum(['ok', 'otherSpace', 'unregistered', 'outOfScope']);
export const scanMethodSchema = z.enum(['qr', 'manual']);
/** 물건 상태 (기획서 F12) */
export const scanConditionSchema = z.enum(['normal', 'damaged', 'labelDamaged']);

/**
 * 스캔 (scans/{surveyId}__{재물 문서 ID} · 미등록은 {surveyId}__u__{코드}) — 기획서 F11·F12
 *
 * 문서 ID를 회차+재물로 정해 **같은 물건을 몇 번 찍어도 문서는 하나**다(중복 스캔이 수를 늘리지 않음).
 * 두 번째 저장은 Rules가 막는다(핵심 값 수정 금지). 물건 상태·메모만 나중에 고칠 수 있다.
 */
export const scanSchema = z.object({
    organizationId: z.string().catch(''),
    surveyId: z.string().catch(''),
    /** 등록 재물이면 재물 문서 ID, 미등록이면 null */
    assetId: z.string().nullable().catch(null),
    /** 찍힌 자산코드(미등록이면 읽힌 글자) */
    code: z.string().catch(''),
    name: z.string().nullable().catch(null),
    /** 찍은 곳 */
    spaceId: z.string().catch(''),
    /** 대상 목록상 있어야 할 곳 — 공간 미지정이면 null, 대상이 아니면(범위 밖·미등록) null */
    expectedSpaceId: z.string().nullable().catch(null),
    result: scanResultSchema.catch('ok'),
    method: scanMethodSchema.catch('qr'),
    condition: scanConditionSchema.catch('normal'),
    memo: z.string().catch(''),
    scannedByUid: z.string().catch(''),
    scannedAt: timestampSchema.optional().catch(undefined),
    lastEditedByUid: z.string().catch(''),
    updatedAt: timestampSchema.optional().catch(undefined),
});

export type SurveySchemaType = z.infer<typeof surveySchema>;

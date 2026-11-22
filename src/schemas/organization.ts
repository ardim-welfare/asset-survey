import { z } from 'zod';
import { timestampSchema } from './common';

export const orgStatusSchema = z.enum(['pending', 'approved', 'rejected', 'deleted']);
/**
 * 조사 방식 (기획서 F02) — 기관이 설정에서 고른다. 미설정은 'delegated'.
 * - delegated: 공간 담당자가 스캔 → 공간 제출 → 재물 담당자 승인·반려
 * - solo: 재물 담당자가 직접 스캔 → 바로 마감 (작은 기관)
 */
export const surveyModeSchema = z.enum(['delegated', 'solo']);
export const DEFAULT_SURVEY_MODE = 'delegated' as const;

/** 라벨 규격 (기획서 F09) — 검증된 3종 + 직접 치수 */
export const labelSizeSchema = z.enum(['small', 'medium', 'large', 'custom']);
/** 직접 치수(mm) — A4 한 장 안의 칸 배치 */
export const labelCustomSchema = z.object({
    w: z.number(), h: z.number(), cols: z.number(), rows: z.number(),
    top: z.number(), left: z.number(), hpitch: z.number(), vpitch: z.number(),
});

export const withdrawReasonSchema = z.enum(['no_longer_needed', 'too_difficult', 'missing_features', 'other']);

export const organizationSchema = z.object({
    name: z.string().catch(''),
    address: z.string().optional().catch(undefined),
    phone: z.string().optional().catch(undefined),
    representativeName: z.string().optional().catch(undefined),
    adminEmail: z.string().optional().catch(undefined),
    applicantUid: z.string().catch(''),
    applicantEmail: z.string().optional().catch(undefined),
    applicantName: z.string().optional().catch(undefined),
    applicantPhone: z.string().optional().catch(undefined),
    message: z.string().optional().catch(undefined),
    approvalLine: z.array(z.object({ title: z.string().catch('') })).optional().catch(undefined),
    hideApprovalLine: z.boolean().optional().catch(undefined),
    /** 조사 방식. firestore.rules가 허용 값을 다시 확인한다 */
    surveyMode: surveyModeSchema.optional().catch(undefined),
    /** 엑셀 가져오기에서 마지막으로 쓴 열 연결(필드 → 머리글 원문). 다음 가져오기 때 먼저 쓴다 */
    importColumnMap: z.record(z.string(), z.string()).optional().catch(undefined),
    /** 대장 위치 원문 → 공간 ID. 다시 가져오기 때 같은 위치를 같은 공간으로 맞춘다(기획서 F06) */
    locationSpaceMap: z.record(z.string(), z.string()).optional().catch(undefined),
    /** 라벨 인쇄 기본 규격 — 마지막에 인쇄한 규격을 기관 기본으로 기억한다 */
    labelSize: labelSizeSchema.optional().catch(undefined),
    labelCustom: labelCustomSchema.optional().catch(undefined),
    /** 기관 관리 책임자 정·부(2026-11-22) — 기록용 글자(예: '관장 홍길동'). 권한과 상관없고 라벨에 넣을 수 있다 */
    managerPrimary: z.string().optional().catch(undefined),
    managerSecondary: z.string().optional().catch(undefined),
    /** 라벨에 관리 책임자를 넣을지 — 라벨 인쇄 창의 마지막 선택을 기억한다 */
    labelShowManagers: z.boolean().optional().catch(undefined),
    status: orgStatusSchema.catch('pending'),
    inviteCode: z.string().optional().catch(undefined),
    uniqueNumber: z.string().optional().catch(undefined),
    /** @deprecated 레거시 — 토큰 포함 다운로드 URL. 신규 문서는 uniqueNumberImagePath 사용 (2026-07-18 P0-3) */
    uniqueNumberImageUrl: z.string().optional().catch(undefined),
    /** 증빙서류 Storage 경로. 표시용 URL은 getOrgDocumentUrl 콜러블로 온디맨드 발급 */
    uniqueNumberImagePath: z.string().optional().catch(undefined),
    aiVerified: z.boolean().optional().catch(undefined),
    aiVerifyDetail: z.object({
        documentType: z.string().optional().catch(undefined),
        uniqueNumber: z.string().optional().catch(undefined),
        extractedName: z.string().optional().catch(undefined),
        nameMatch: z.boolean().optional().catch(undefined),
        address: z.string().optional().catch(undefined),
        rejected: z.boolean().optional().catch(undefined),
        reason: z.string().optional().catch(undefined),
    }).optional().catch(undefined),
    /**
     * 접수 단계(submitOrgApplication)에서 판별한 증빙서류 결과.
     * 비영리 증빙으로 확인된 신청만 문서가 만들어지므로, 여기 남는 값은 통과한 판별 결과다.
     * autoVerifyDocument가 이 값을 재사용해 같은 서류를 두 번 OCR하지 않는다.
     */
    ocrPrescreen: z.object({
        documentType: z.string().optional().catch(undefined),
        uniqueNumber: z.string().nullable().optional().catch(undefined),
        extractedName: z.string().nullable().optional().catch(undefined),
        address: z.string().nullable().optional().catch(undefined),
        nameMatch: z.boolean().optional().catch(undefined),
        bizScore: z.number().optional().catch(undefined),
        screenedAt: timestampSchema.optional().catch(undefined),
    }).optional().catch(undefined),
    /**
     * 약관·처리방침 동의 기록 (위탁 계약 성립 근거 — 약관 제9조).
     * 여기서 빠지면 createZodConverter의 fromFirestore가 unknown key를 조용히 제거해
     * (Zod z.object 기본 동작) Firestore에 저장돼 있어도 앱에서는 항상 undefined가 된다.
     * 저장만 되고 조회가 불가능해지므로 입증 자료로 쓸 수 없다.
     */
    consent: z.object({
        terms: z.boolean().catch(false),
        privacy: z.boolean().catch(false),
        termsVersion: z.string().catch(''),
        privacyVersion: z.string().catch(''),
        agreedAt: timestampSchema.optional().catch(undefined),
        source: z.literal('reconsent').optional().catch(undefined),
        agreedByUid: z.string().optional().catch(undefined),
    }).optional().catch(undefined),
    createdAt: timestampSchema.optional().catch(undefined),
    approvedAt: timestampSchema.optional().catch(undefined),
    rejectedAt: timestampSchema.optional().catch(undefined),
    deletedAt: timestampSchema.nullable().optional().catch(null),
    /** 삭제(탈퇴) 주체 — 'admin'은 관리자 자발적 해지, 'superAdmin'은 운영자 정리 */
    deletedBy: z.enum(['admin', 'superAdmin']).optional().catch(undefined),
    /** 자발적 탈퇴 사유 */
    withdrawReason: withdrawReasonSchema.optional().catch(undefined),
    /** 사유가 'other'일 때 자유 입력 상세 */
    withdrawReasonDetail: z.string().optional().catch(undefined),
    firstEmployeeRegisteredAt: timestampSchema.optional().catch(undefined),
    timeToFirstEmployeeDays: z.number().optional().catch(undefined),
});

export type OrganizationSchemaType = z.infer<typeof organizationSchema>;

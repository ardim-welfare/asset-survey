import { z } from 'zod';
// 배럴(./index)에서 가져오면 순환 참조가 된다 — 정의 파일에서 직접 가져온다.
import { timestampSchema } from './common';

/**
 * 앱 오류 기록 스키마 (2026-11-23)
 *
 * `reportClientError`(Admin SDK)만 쓰고 슈퍼관리자만 읽는다. 같은 오류(이름·문구·기능·코드)를
 * 한 문서로 묶어 횟수를 세고, 30일 동안 다시 나지 않으면 TTL(expiresAt)로 지워진다.
 * 개인정보는 담지 않는다 — 사용자 uid·이름 없이 겪은 기관 ID와 역할만 남는다.
 */
export const clientErrorSchema = z.object({
    name: z.string().catch('Error'),
    message: z.string().catch(''),
    /** 오류가 난 기능(captureError의 context) — 처리하지 못한 오류는 window.error·unhandledrejection */
    where: z.string().catch(''),
    /** Firebase 오류 코드 등 */
    code: z.string().catch(''),
    stack: z.string().catch(''),
    count: z.number().catch(1),
    firstAt: timestampSchema.optional().catch(undefined),
    lastAt: timestampSchema.optional().catch(undefined),
    lastPath: z.string().catch(''),
    lastVersion: z.string().catch(''),
    lastBrowser: z.string().catch(''),
    /** 마지막으로 겪은 사람의 역할(admin·employee·superAdmin, 로그인 전이면 guest) */
    lastRole: z.string().catch(''),
    /** 이 오류를 겪은 기관 */
    orgIds: z.array(z.string()).catch([]),
    expiresAt: timestampSchema.optional().catch(undefined),
});

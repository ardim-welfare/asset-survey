/**
 * errorReport — Sentry 없이 보내는 최소 오류 기록 (2026-11-23)
 *
 * 고정하는 계약:
 *   - 오류 요약(이름·문구·기능·코드·스택 앞부분·경로)만 보내고, context의 나머지 값은 보내지 않는다
 *   - 화면 경로의 ID는 가린다
 *   - 환경 소음은 보내지 않는다
 */
import { describe, it, expect } from 'vitest';
import { buildPayload, maskPath } from '../../lib/errorReport';

describe('maskPath', () => {
    it('ID처럼 보이는 조각과 태그를 가린다', () => {
        expect(maskPath('/admin/assets/org1__2026-001')).toBe('/admin/assets/:id');
        expect(maskPath('/t/AB12CD34EF')).toBe('/t/:tag');
        expect(maskPath('/admin/surveys/xQ3kfj29dLkq0zP1')).toBe('/admin/surveys/:id');
        expect(maskPath('/admin/spaces')).toBe('/admin/spaces');
    });
});

describe('buildPayload', () => {
    it('오류 요약과 기능 이름만 담고, 넘긴 데이터는 담지 않는다', () => {
        const err = Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
        const p = buildPayload(err, { context: 'getAssets', orgId: 'org-A', data: { name: '홍길동' } })!;
        expect(p).toMatchObject({ name: 'Error', message: 'Missing or insufficient permissions.', where: 'getAssets', code: 'permission-denied' });
        expect(JSON.stringify(p)).not.toContain('홍길동');
        expect(JSON.stringify(p)).not.toContain('org-A');
        expect(p.stack.split('\n').length).toBeLessThanOrEqual(6);
    });

    it('문구가 없거나 환경 소음이면 보내지 않는다', () => {
        expect(buildPayload(undefined)).toBeNull();
        expect(buildPayload(new Error(''))).toBeNull();
        expect(buildPayload(new Error('ResizeObserver loop completed with undelivered notifications.'))).toBeNull();
        expect(buildPayload(new Error('AppCheck: Requests throttled due to 503 error.'))).toBeNull();
    });

    it('문자열로 던진 오류도 받는다', () => {
        expect(buildPayload('네트워크 끊김')).toMatchObject({ name: 'Error', message: '네트워크 끊김' });
    });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { getSaTestOrgId, SA_TEST_ROLE_KEY, SA_TEST_ORG_KEY } from '../../lib/saTestMode';

describe('getSaTestOrgId — 슈퍼관리자 테스트 모드에서 볼 기관', () => {
    beforeEach(() => sessionStorage.clear());

    it('역할과 기관을 모두 골랐으면 그 기관 ID를 준다', () => {
        sessionStorage.setItem(SA_TEST_ROLE_KEY, 'admin');
        sessionStorage.setItem(SA_TEST_ORG_KEY, 'org1');
        expect(getSaTestOrgId()).toBe('org1');
    });

    it('역할이 없으면(시스템 관리자 화면) 기관 값이 남아 있어도 null', () => {
        sessionStorage.setItem(SA_TEST_ORG_KEY, 'org1');
        expect(getSaTestOrgId()).toBeNull();
    });

    it('기관을 고르지 않았으면 null', () => {
        sessionStorage.setItem(SA_TEST_ROLE_KEY, 'employee');
        expect(getSaTestOrgId()).toBeNull();
    });
});

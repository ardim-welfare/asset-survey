/**
 * 슈퍼관리자 테스트 모드 — 기관 관리자·직원 화면을 시스템 관리자가 직접 열어 보는 기능
 *
 * 두 값을 sessionStorage에 둔다(탭마다 독립 — 관리자 화면과 직원 화면을 나란히 띄워 보는 용도).
 * - SA_TEST_ROLE_KEY: 볼 역할('admin' | 'employee')
 * - SA_TEST_ORG_KEY: 볼 기관 ID
 *
 * ## 기관을 함께 고르는 이유 (2026-11-22)
 * 차량운행일지에서는 슈퍼관리자 계정이 자기 기관에 소속돼 있어 역할만 바꾸면 됐다.
 * 이 서비스의 시스템 관리자 계정은 소속 기관이 없어(organizationId: null) 관리자 화면을 열면
 * 화면마다 기관 ID가 없어 읽기를 시작하지 못하고 로딩 표시만 돌았다.
 * 그래서 테스트 모드에서는 고른 기관 ID를 useAuth가 userData.organizationId 자리에 넣어 준다.
 * 슈퍼관리자는 Firestore 규칙상 모든 기관 문서를 읽고 쓸 수 있으므로 화면이 그대로 동작한다.
 */
export const SA_TEST_ROLE_KEY = 'sa-test-role' as const;
export const SA_TEST_ORG_KEY = 'sa-test-org' as const;

export type SaTestRole = 'admin' | 'employee';

/** 테스트 모드에서 볼 기관 ID — 역할을 고르지 않았으면(시스템 관리자 화면) null */
export function getSaTestOrgId(): string | null {
    try {
        if (!sessionStorage.getItem(SA_TEST_ROLE_KEY)) return null;
        return sessionStorage.getItem(SA_TEST_ORG_KEY) || null;
    } catch {
        return null;
    }
}

/** 테스트 모드로 들어간다 — 화면 전체를 다시 불러 가드·구독이 새 값으로 시작하게 한다 */
export function enterSaTestMode(role: SaTestRole, orgId: string): void {
    sessionStorage.setItem(SA_TEST_ROLE_KEY, role);
    sessionStorage.setItem(SA_TEST_ORG_KEY, orgId);
    window.location.href = role === 'admin' ? '/admin' : '/employee';
}

/** 테스트 모드를 끝내고 시스템 관리자 화면으로 돌아간다 */
export function exitSaTestMode(): void {
    sessionStorage.removeItem(SA_TEST_ROLE_KEY);
    sessionStorage.removeItem(SA_TEST_ORG_KEY);
    window.location.href = '/super-admin';
}

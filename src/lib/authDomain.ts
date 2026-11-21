/**
 * Firebase Auth `authDomain` 결정.
 *
 * signInWithRedirect는 authDomain이 앱을 연 도메인과 같아야 한다.
 * 다르면 브라우저의 서드파티 저장소 분리(Safari ITP, Chrome 저장소 파티셔닝) 때문에
 * 리다이렉트 복귀 시 인증 상태가 유실된다.
 *
 * 앱은 Firebase Hosting 기본 도메인(<프로젝트 ID>.web.app·firebaseapp.com)과, 정해지면
 * 전용 도메인(VITE_APP_DOMAIN)에서 함께 서빙되고, Firebase Hosting은 모든 연결 도메인에서
 * `/__/auth/handler`를 제공한다. 그래서 알려진 Hosting 도메인으로 접속했다면 그 도메인을
 * 그대로 authDomain으로 쓴다 (IndexedDB 오프라인 큐·FCM 토큰은 출처(origin)별로 저장된다).
 *
 * 차량운행일지에서는 도메인이 코드에 박혀 있었다. 이 앱은 Firebase 프로젝트와 도메인이
 * 아직 정해지지 않았으므로 환경변수에서 만든다.
 *
 * ⚠️ 전용 도메인을 정하면 Google Cloud Console → OAuth 클라이언트(Web client)의
 * 승인된 리디렉션 URI에 `https://<도메인>/__/auth/handler`도 등록해야 한다.
 */
export function hostingAuthDomains(env: { projectId?: string; appDomain?: string }): string[] {
    const domains: string[] = [];
    const appDomain = env.appDomain?.trim();
    if (appDomain) domains.push(appDomain);
    const projectId = env.projectId?.trim();
    if (projectId) domains.push(`${projectId}.web.app`, `${projectId}.firebaseapp.com`);
    return domains;
}

export const HOSTING_AUTH_DOMAINS: readonly string[] = hostingAuthDomains({
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appDomain: import.meta.env.VITE_APP_DOMAIN,
});

/**
 * 현재 접속 호스트가 알려진 Hosting 도메인이면 그 호스트를, 아니면 fallback(환경변수)을 반환한다.
 * localhost·PR 미리보기 채널 등은 기존대로 fallback을 쓴다.
 */
export function resolveAuthDomain(fallback: string | undefined, hostname?: string): string | undefined {
    const host = hostname ?? (typeof location !== 'undefined' ? location.hostname : undefined);
    if (host && HOSTING_AUTH_DOMAINS.includes(host)) {
        return host;
    }
    return fallback;
}

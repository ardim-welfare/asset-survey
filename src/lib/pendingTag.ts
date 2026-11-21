/**
 * pendingTag — 로그인 전에 라벨 QR(`/t/태그ID`)을 연 사람을 로그인 뒤 그 재물로 데려간다
 *
 * 로그인하지 않은 사람은 경량 화면(LightApp)으로 시작하고, 거기에는 `/t/` 경로가 없어 첫 화면으로
 * 돌려보낸다. 그래서 부팅 첫 지점(main.tsx)에서 태그를 보관해 두고, 로그인 뒤 전체 앱이
 * 손님 화면(/, /login)에 닿으면 `/t/태그ID`로 다시 보낸다(AuthGuard).
 *
 * localStorage인 이유는 초대 코드(inviteCodeCapture.ts)와 같다 — Google 로그인 리다이렉트가
 * 도메인을 오가는 동안 sessionStorage는 사라진다. 30분이 지난 값은 버린다(나중에 엉뚱하게 끌려가지 않게).
 *
 * main.tsx가 가볍게 읽도록 다른 모듈을 import하지 않는다(태그 형식은 lib/labels/tag.ts와 같다).
 */
export const PENDING_TAG_KEY = 'pendingTag';
const MAX_AGE_MS = 30 * 60 * 1000;
const TAG_PATH_RE = /^\/t\/([0-9A-Za-z]{10})\/?$/;

/** 지금 주소가 `/t/태그ID`면 보관한다 */
export function capturePendingTag(pathname: string = window.location.pathname): void {
    const m = TAG_PATH_RE.exec(pathname);
    if (!m) return;
    try {
        localStorage.setItem(PENDING_TAG_KEY, JSON.stringify({ tag: m[1].toUpperCase(), at: Date.now() }));
    } catch {
        // 저장소가 막힌 환경 — 로그인 뒤 QR을 한 번 더 찍으면 된다
    }
}

/**
 * 보관한 태그를 읽는다(지우지 않는다 — 렌더 중에 불러도 안전). 없거나 오래됐거나 형식이 틀리면 null.
 * 다 쓰면 `clearPendingTag()`로 지운다(TagRedirect가 재물을 찾은 뒤).
 */
export function peekPendingTag(now: number = Date.now()): string | null {
    try {
        const raw = localStorage.getItem(PENDING_TAG_KEY);
        if (!raw) return null;
        const { tag, at } = JSON.parse(raw) as { tag?: unknown; at?: unknown };
        if (typeof tag !== 'string' || typeof at !== 'number' || now - at > MAX_AGE_MS) return null;
        return TAG_PATH_RE.test(`/t/${tag}`) ? tag : null;
    } catch {
        return null;
    }
}

export function clearPendingTag(): void {
    try {
        localStorage.removeItem(PENDING_TAG_KEY);
    } catch {
        // 저장소가 막힌 환경 — 30분 뒤 저절로 무시된다
    }
}

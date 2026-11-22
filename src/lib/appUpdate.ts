/**
 * 새 버전 안내 (2026-11-22)
 *
 * 앱 파일을 못 받는 일은 **대부분 새 버전 배포 직후**에 생긴다 — 열어 둔 화면이나 서비스 워커가 기억한 옛 화면이
 * 이미 지워진 옛 파일을 찾기 때문이다. 이걸 "앱을 불러오지 못했습니다"라고 보여 주면 고장처럼 보여서
 * (사용자 의견), 인터넷이 끊긴 경우가 아니면 "새 버전이 나왔어요 → 지금 업데이트"로 안내한다.
 * 업데이트 버튼은 서비스 워커에 새 버전을 확인시킨 뒤 새로고침한다.
 */

/** 옛 앱 파일을 못 받은 오류인가 — 브라우저마다 문구가 달라 여러 형태를 본다 */
export function isChunkLoadError(err: unknown): boolean {
    const e = err as { name?: string; message?: string } | null;
    const text = `${e?.name ?? ''} ${e?.message ?? ''}`;
    return /ChunkLoadError|dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(text);
}

/** 인터넷이 끊겼는가 — 모르면(지원 안 하는 브라우저) 연결된 것으로 본다 */
export const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/**
 * 새 버전으로 바꾼다 — 서비스 워커가 있으면 새 버전을 확인시키고(최대 3초) 새로고침한다.
 * 확인이 실패하거나 오래 걸려도 새로고침은 한다(새로고침만으로도 대개 풀린다).
 */
export async function updateAndReload(): Promise<void> {
    try {
        const reg = await navigator.serviceWorker?.getRegistration();
        if (reg) await Promise.race([reg.update(), new Promise((r) => setTimeout(r, 3000))]);
    } catch { /* 확인 실패 — 그대로 새로고침 */ }
    window.location.reload();
}

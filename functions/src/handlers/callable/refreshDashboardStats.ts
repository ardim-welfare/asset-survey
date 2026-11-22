/**
 * refreshDashboardStats — 시스템 관리자가 운영 현황 통계를 바로 다시 집계한다.
 *
 * 평소에는 밤 배치(dailyNightlyBatch, 02:20 KST)가 매일 갱신한다. 수동 갱신은 기관 승인·
 * 대량 작업 직후처럼 오늘 숫자를 바로 봐야 할 때 쓴다.
 *
 * 재집계는 전 기관을 훑으므로(기관마다 count 3번 + 최근 한 달 스캔) 연타·여러 관리자의 동시
 * 클릭이 곧 읽기 비용이다. 마지막 갱신 뒤 REFRESH_COOLDOWN_SEC 안의 요청은 재집계를 건너뛰고
 * 기존 문서를 쓰게 한다 — system/dashboardStats 1건 읽기로 판정한다(차량운행일지와 같은 방어선,
 * 기관 수가 적은 지금은 30분 대신 10분).
 */
import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { requireSuperAdmin } from "../../utils/helpers";
import { computeAllDashboardStats } from "../../services/statistics/computeDashboardStats";

export const REFRESH_COOLDOWN_SEC = 10 * 60;

export const refreshDashboardStats = onCall(
    { region: "asia-northeast3", timeoutSeconds: 300, memory: "512MiB", enforceAppCheck: true },
    async (request) => {
        requireSuperAdmin(request);

        const snap = await getFirestore().doc("system/dashboardStats").get();
        const lastUpdatedAt = snap.get("lastUpdatedAt") as string | undefined;
        if (lastUpdatedAt) {
            const elapsedMs = Date.now() - new Date(lastUpdatedAt).getTime();
            const retryAfterSec = Math.ceil((REFRESH_COOLDOWN_SEC * 1000 - elapsedMs) / 1000);
            // 값이 깨졌거나(NaN) 시계가 어긋나 미래 시각이면 조건이 거짓 → 재집계 쪽으로 연다
            if (elapsedMs >= 0 && retryAfterSec > 0) {
                return { skipped: true, lastUpdatedAt, retryAfterSec };
            }
        }

        const stats = await computeAllDashboardStats();
        return { skipped: false, lastUpdatedAt: stats.lastUpdatedAt };
    }
);

/**
 * useServiceDashboard — 시스템 관리자 운영 현황 대시보드 데이터
 *
 * 화면은 서버가 미리 만들어 둔 집계 문서(system/dashboardStats) 1건만 읽는다.
 * 갱신 버튼은 서버 재집계를 부른 뒤 문서를 다시 읽는다.
 */
import { useCallback, useEffect, useState } from 'react';
import { getDashboardStats, refreshDashboardStats, type RefreshDashboardResult } from '../lib/firestore/statistics';
import type { DashboardStats } from '../schemas/dashboard';

export default function useServiceDashboard() {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError(false);
        try {
            setStats(await getDashboardStats());
        } catch {
            setLoadError(true);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    /** 서버 재집계 → 다시 읽기. 결과(건너뜀·남은 시간)는 화면이 안내한다 */
    const refresh = useCallback(async (): Promise<RefreshDashboardResult> => {
        setRefreshing(true);
        try {
            const result = await refreshDashboardStats();
            setStats(await getDashboardStats());
            setLoadError(false);
            return result;
        } finally {
            setRefreshing(false);
        }
    }, []);

    return { stats, loading, loadError, refreshing, load, refresh };
}

/**
 * AdminDashboard — 기관 관리자(재물 담당자) 첫 화면
 *
 * 지금은 기관 정보와 재물·공간·직원 수만 보여 준다.
 * 조사 진행률·공간별 현황은 기획서 F14 현황판에서 채운다.
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { auth } from '../../lib/firebase';
import { refreshTokenSilently } from '../../lib/tokenRefresh';
import { getOrganizationMembers, getOrganization, getSpaces, getAssetCounts } from '../../lib/firestore';
import ReleaseNotesBanner from '../common/ReleaseNotesBanner';
import type { Organization } from '../../types/organization';

export default function AdminDashboard() {
    const { userData } = useAuth();
    const navigate = useNavigate();
    const [employeeCount, setEmployeeCount] = useState(0);
    const [spaceCount, setSpaceCount] = useState(0);
    const [assetCounts, setAssetCounts] = useState({ active: 0, inactive: 0, disposed: 0 });
    const [org, setOrg] = useState<Organization | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // 기관이 없으면 읽을 것이 없다 — 로딩 표시만 끝없이 돌지 않게 끝낸다
        if (!userData?.organizationId) { setLoading(false); return; }
        const orgId = userData.organizationId;

        const load = async (retryCount = 0): Promise<void> => {
            try {
                const [members, organization, spaces, counts] = await Promise.all([
                    getOrganizationMembers(orgId),
                    getOrganization(orgId),
                    getSpaces(orgId),
                    getAssetCounts(orgId),
                ]);
                setAssetCounts(counts);
                setSpaceCount(spaces.filter(s => !s.archived).length);
                setEmployeeCount(members.filter(m => m.role !== 'superAdmin').length);
                setOrg((organization as Organization) ?? null);
            } catch (err) {
                // Custom Claims 토큰이 아직 갱신되지 않은 경우 재시도 (최대 2회)
                const firebaseErr = err as { code?: string; message?: string };
                const isPermError = firebaseErr.code === 'permission-denied'
                    || firebaseErr.message?.includes('Missing or insufficient permissions');
                if (isPermError && retryCount < 2) {
                    const delayMs = 1500 * Math.pow(2, retryCount);
                    try { if (auth.currentUser) await refreshTokenSilently(auth.currentUser); } catch { /* noop */ }
                    await new Promise(r => setTimeout(r, delayMs));
                    return load(retryCount + 1);
                }
                console.error('대시보드 로드 실패:', err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [userData?.organizationId]);

    return (
        <div className="max-w-4xl mx-auto animate-fade-in">
            <ReleaseNotesBanner />
            <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100 mb-6">대시보드</h1>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
                <div className="glass-card p-4">
                    <p className="text-xs text-surface-500 dark:text-surface-400 mb-1">기관</p>
                    <p className="text-xl font-bold text-surface-900 dark:text-surface-100">
                        {loading ? <span className="w-5 h-5 spinner inline-block" /> : (org?.name || '-')}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => navigate('/admin/import')}
                    className="glass-card p-4 text-left hover:ring-2 hover:ring-primary-200 dark:hover:ring-primary-800 transition"
                >
                    <p className="text-xs text-surface-500 dark:text-surface-400 mb-1">운영 재물</p>
                    <p className="text-xl font-bold text-surface-900 dark:text-surface-100">
                        {loading ? <span className="w-5 h-5 spinner inline-block" /> : `${assetCounts.active.toLocaleString('ko-KR')}건`}
                    </p>
                    {!loading && (assetCounts.inactive > 0 || assetCounts.disposed > 0) && (
                        <p className="text-[11px] text-surface-500 dark:text-surface-400 mt-0.5">불용 {assetCounts.inactive} · 폐기 {assetCounts.disposed}</p>
                    )}
                </button>
                <button
                    type="button"
                    onClick={() => navigate('/admin/spaces')}
                    className="glass-card p-4 text-left hover:ring-2 hover:ring-primary-200 dark:hover:ring-primary-800 transition"
                >
                    <p className="text-xs text-surface-500 dark:text-surface-400 mb-1">공간</p>
                    <p className="text-xl font-bold text-surface-900 dark:text-surface-100">
                        {loading ? <span className="w-5 h-5 spinner inline-block" /> : `${spaceCount}곳`}
                    </p>
                </button>
                <button
                    type="button"
                    onClick={() => navigate('/admin/employees')}
                    className="glass-card p-4 text-left hover:ring-2 hover:ring-primary-200 dark:hover:ring-primary-800 transition"
                >
                    <p className="text-xs text-surface-500 dark:text-surface-400 mb-1">등록 직원</p>
                    <p className="text-xl font-bold text-surface-900 dark:text-surface-100">
                        {loading ? <span className="w-5 h-5 spinner inline-block" /> : `${employeeCount}명`}
                    </p>
                </button>
            </div>

            <div className="glass-card p-8 text-center">
                <div className="text-4xl mb-3" aria-hidden="true">📦</div>
                <p className="text-surface-700 dark:text-surface-300 font-medium">재물조사 기능을 차례로 준비하고 있습니다</p>
                <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
                    지금은 공간 등록과 엑셀 가져오기를 쓸 수 있습니다. QR 라벨과 공간별 조사가 이어서 들어옵니다.
                </p>
            </div>
        </div>
    );
}

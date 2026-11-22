/**
 * MyAssets — 직원의 '내 공간 재물' 목록 (기획서 F08, 사용자 결정 2026-11-21: 직원도 내 공간 목록)
 *
 * 내가 담당하는 공간의 재물만 보여 준다. 금액은 보이지 않는다(금액은 관리자만 읽는 별도 문서).
 * 기본은 운영 재물만 — 불용·폐기는 조사 대상이 아니라서 켜야 보인다.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { getMySpaces, getAssetsBySpaces } from '../../lib/firestore';
import { sortAssets, filterAssets, DEFAULT_FILTERS } from '../../hooks/useAssetList';
import { StatusBadge, MissingBadge } from '../common/AssetBadges';
import type { Asset } from '../../types/asset';
import type { Space } from '../../types/space';

const sub = 'text-xs text-surface-500 dark:text-surface-400';

export default function MyAssets() {
    const { user, userData } = useAuth();
    const orgId = userData?.organizationId ?? null;
    const uid = user?.uid ?? null;
    const teamId = userData?.teamId ?? null;
    const [params, setParams] = useSearchParams();
    const [spaces, setSpaces] = useState<Space[]>([]);
    const [assets, setAssets] = useState<Asset[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [search, setSearch] = useState('');
    const [withInactive, setWithInactive] = useState(false);

    useEffect(() => {
        if (!orgId || !uid) return;
        let cancelled = false;
        setLoading(true);
        setError(false);
        (async () => {
            const mine = await getMySpaces(orgId, uid, teamId);
            const list = await getAssetsBySpaces(orgId, mine.map((s) => s.id));
            if (cancelled) return;
            setSpaces(mine);
            setAssets(sortAssets(list));
        })()
            .catch(() => { if (!cancelled) setError(true); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [orgId, uid, teamId]);

    const spaceParam = params.get('space');
    const current = spaces.some((s) => s.id === spaceParam) ? spaceParam : 'all';
    const shown = useMemo(() => filterAssets(assets, {
        ...DEFAULT_FILTERS, search, space: current ?? 'all', status: withInactive ? 'all' : 'active',
    }), [assets, search, current, withInactive]);
    const countIn = (id: string) => assets.filter((a) => a.spaceId === id && (withInactive || a.status === 'active')).length;

    if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 spinner" /></div>;
    if (error) {
        return (
            <div className="max-w-lg mx-auto glass-card p-6 text-center text-sm text-red-600 dark:text-red-400">
                재물 목록을 불러오지 못했습니다. 잠시 후 다시 열어 주세요.
            </div>
        );
    }

    return (
        <div className="max-w-lg mx-auto animate-fade-in space-y-3">
            <h1 className="text-xl font-bold text-surface-900 dark:text-surface-100">내 공간 재물</h1>

            {spaces.length === 0 ? (
                <div className="glass-card p-6 text-center text-sm text-surface-500 dark:text-surface-400">
                    아직 담당 공간이 없습니다. 재물 담당자가 공간을 지정하면 그 공간의 재물이 여기에 나옵니다.
                </div>
            ) : (
                <>
                    <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="공간 고르기">
                        {[{ id: 'all', name: '전체' }, ...spaces].map((s) => {
                            const active = current === s.id;
                            return (
                                <button
                                    key={s.id} type="button" aria-pressed={active}
                                    onClick={() => setParams(s.id === 'all' ? {} : { space: s.id }, { replace: true })}
                                    className={`flex-shrink-0 px-3 min-h-[44px] rounded-xl text-sm font-medium ${active
                                        ? 'bg-primary-600 text-white dark:bg-primary-500'
                                        : 'bg-white dark:bg-surface-800 text-surface-700 dark:text-surface-300 border border-surface-200 dark:border-surface-700'}`}
                                >
                                    {s.name}{s.id !== 'all' && <span className="opacity-75"> {countIn(s.id)}</span>}
                                </button>
                            );
                        })}
                    </div>

                    <label className="block">
                        <span className="sr-only">검색</span>
                        <input type="search" className="input min-h-[48px]" placeholder="자산코드·품명으로 찾기" value={search} onChange={(e) => setSearch(e.target.value)} />
                    </label>
                    <label className="flex items-center gap-2 min-h-[44px] text-sm text-surface-700 dark:text-surface-300">
                        <input type="checkbox" className="w-4 h-4" checked={withInactive} onChange={(e) => setWithInactive(e.target.checked)} />
                        불용·폐기도 보기
                    </label>

                    <p className={sub} aria-live="polite">{shown.length.toLocaleString('ko-KR')}건</p>
                    {shown.length === 0 ? (
                        <div className="glass-card p-6 text-center text-sm text-surface-500 dark:text-surface-400">해당하는 재물이 없습니다.</div>
                    ) : (
                        <ul className="space-y-2">
                            {shown.map((a) => (
                                <li key={a.id}>
                                    <Link to={`/employee/assets/${encodeURIComponent(a.id)}`} className="glass-card p-3 block">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-mono text-sm font-semibold text-surface-900 dark:text-surface-100">{a.code}</span>
                                            {a.status !== 'active' && <StatusBadge status={a.status} />}
                                            {a.missingFromSource && <MissingBadge />}
                                        </div>
                                        <p className="text-sm text-surface-800 dark:text-surface-200 truncate">{a.name ?? '-'}</p>
                                        {current === 'all' && <p className={sub}>{spaces.find((s) => s.id === a.spaceId)?.name ?? ''}</p>}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </>
            )}
        </div>
    );
}

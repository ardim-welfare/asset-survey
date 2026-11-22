/**
 * AssetList — 관리자 재물 목록 (기획서 F08) · 라벨 인쇄할 재물 고르기 (F09)
 *
 * 넓은 화면은 표, 휴대폰은 카드. 검색·공간·상태·라벨·대장에 없음으로 거르고, 고른 재물을 한꺼번에
 * 라벨 인쇄한다(공간별 인쇄는 공간으로 거른 뒤 '모두 고르기'). 건물·층 단위로도 거를 수 있다(2026-11-22).
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import useAssetList, { buildingFilter, floorFilter, checkedAtOf, type AssetFilters } from '../../hooks/useAssetList';
import { toLocalDateStr } from '../../lib/dateUtils';
import { groupSpacesByLocation } from '../../lib/spaceGroups';
import { StatusBadge, MissingBadge } from '../common/AssetBadges';
import LabelPrintDialog from './LabelPrintDialog';
import type { Asset } from '../../types/asset';
import type { Space } from '../../types/space';
import type { Building } from '../../types/building';

const sub = 'text-xs text-surface-500 dark:text-surface-400';
const detailPath = (a: Asset) => `/admin/assets/${encodeURIComponent(a.id)}`;

export default function AssetList() {
    const al = useAssetList();
    const [printing, setPrinting] = useState(false);
    const { filters, setFilter } = al;

    const where = (a: Asset) => (a.spaceId ? al.spaceName.get(a.spaceId) ?? '(지운 공간)' : null);
    /** 마지막 확인 날짜 — 한 번도 확인하지 않았으면 null */
    const checked = (a: Asset) => { const at = checkedAtOf(al.checks, a.id); return at ? toLocalDateStr(at) : null; };
    const allVisibleSelected = al.visible.length > 0 && al.visible.every((a) => al.selected.has(a.id));
    const filteredSelected = al.filtered.filter((a) => al.selected.has(a.id)).length;

    if (al.loading) {
        return <div className="flex justify-center py-20"><div className="w-8 h-8 spinner" /></div>;
    }
    if (al.error) {
        return (
            <div className="max-w-3xl mx-auto glass-card p-6 text-center">
                <p className="text-red-600 dark:text-red-400 mb-3">재물 목록을 불러오지 못했습니다.</p>
                <button type="button" className="btn-secondary min-h-[48px] px-4" onClick={() => void al.reload()}>다시 불러오기</button>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto animate-fade-in">
            <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
                <div>
                    <h1 className="text-2xl font-bold text-surface-900 dark:text-surface-100">재물 목록</h1>
                    <p className="text-sm text-surface-500 dark:text-surface-400">
                        전체 {al.assets.length.toLocaleString('ko-KR')}건 · 걸러진 {al.filtered.length.toLocaleString('ko-KR')}건
                    </p>
                </div>
                <div className="flex gap-2">
                    <Link to="/admin/assets/new" className="btn-secondary min-h-[48px] px-4">재물 등록</Link>
                    <Link to="/admin/import" className="btn-secondary min-h-[48px] px-4">재물 가져오기</Link>
                </div>
            </div>

            {al.assets.length === 0 ? (
                <div className="glass-card p-8 text-center">
                    <p className="text-surface-700 dark:text-surface-300 font-medium mb-1">아직 재물이 없습니다</p>
                    <p className={`${sub} mb-4`}>희망이음 고정자산대장이나 기관 재물 대장 엑셀을 가져오거나, 한 건씩 등록하세요.</p>
                    <div className="flex flex-col sm:flex-row justify-center gap-2">
                        <Link to="/admin/import" className="btn-primary min-h-[48px] px-5">재물 가져오기</Link>
                        <Link to="/admin/assets/new" className="btn-secondary min-h-[48px] px-5">한 건씩 등록</Link>
                    </div>
                </div>
            ) : (
                <>
                    <Filters filters={filters} setFilter={setFilter} spaces={al.spaces} buildings={al.buildings} onReset={al.resetFilters} />

                    <div className="glass-card p-3 mb-3 flex flex-wrap items-center gap-2 sticky top-[calc(3.5rem+env(safe-area-inset-top,0px))] z-10">
                        <span className="text-sm font-medium text-surface-800 dark:text-surface-200 mr-auto" aria-live="polite">
                            {al.selected.size > 0 ? `${al.selected.size.toLocaleString('ko-KR')}건 고름` : '라벨을 뽑을 재물을 고르세요'}
                        </span>
                        <button type="button" className="btn-secondary btn-sm min-h-[44px] px-3" onClick={al.selectFiltered}
                            disabled={al.filtered.length === 0 || filteredSelected === al.filtered.length}>
                            걸러진 {al.filtered.length.toLocaleString('ko-KR')}건 모두 고르기
                        </button>
                        {al.selected.size > 0 && (
                            <button type="button" className="btn-secondary btn-sm min-h-[44px] px-3" onClick={al.clearSelection}>고르기 해제</button>
                        )}
                        <button type="button" className="btn-primary btn-sm min-h-[44px] px-4" onClick={() => setPrinting(true)} disabled={al.selected.size === 0}>
                            라벨 인쇄
                        </button>
                    </div>

                    {al.filtered.length === 0 ? (
                        <div className="glass-card p-6 text-center text-sm text-surface-500 dark:text-surface-400">
                            조건에 맞는 재물이 없습니다.{' '}
                            <button type="button" className="underline underline-offset-2 text-primary-600 dark:text-primary-400 min-h-[44px]" onClick={al.resetFilters}>조건 초기화</button>
                        </div>
                    ) : (
                        <>
                            {/* 넓은 화면: 표 */}
                            <div className="hidden md:block glass-card overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="text-left text-surface-500 dark:text-surface-400 border-b border-surface-100 dark:border-surface-700">
                                        <tr>
                                            <th className="p-3 w-10">
                                                <input type="checkbox" className="w-4 h-4" aria-label="이 화면의 재물 모두 고르기" checked={allVisibleSelected}
                                                    onChange={() => al.setMany(al.visible.map((a) => a.id), !allVisibleSelected)} />
                                            </th>
                                            <th className="p-3 font-medium">자산코드</th>
                                            <th className="p-3 font-medium">품명</th>
                                            <th className="p-3 font-medium">분류</th>
                                            <th className="p-3 font-medium">공간</th>
                                            <th className="p-3 font-medium">상태</th>
                                            <th className="p-3 font-medium">라벨</th>
                                            <th className="p-3 font-medium">마지막 확인</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-surface-100 dark:divide-surface-700">
                                        {al.visible.map((a) => (
                                            <tr key={a.id} className="hover:bg-surface-50 dark:hover:bg-surface-800/60">
                                                <td className="p-3">
                                                    <input type="checkbox" className="w-4 h-4" aria-label={`${a.code} 고르기`} checked={al.selected.has(a.id)} onChange={() => al.toggle(a.id)} />
                                                </td>
                                                <td className="p-3 font-mono whitespace-nowrap">
                                                    <Link to={detailPath(a)} className="text-primary-600 dark:text-primary-400 underline-offset-2 hover:underline">{a.code}</Link>
                                                </td>
                                                <td className="p-3 text-surface-900 dark:text-surface-100">
                                                    {a.name ?? '-'} {a.missingFromSource && <MissingBadge />}
                                                </td>
                                                <td className="p-3 text-surface-600 dark:text-surface-300">{a.category ?? '-'}</td>
                                                <td className="p-3 text-surface-700 dark:text-surface-300">
                                                    {where(a) ?? <span className={sub}>미지정{a.locationRaw ? ` · ${a.locationRaw}` : ''}</span>}
                                                </td>
                                                <td className="p-3"><StatusBadge status={a.status} /></td>
                                                <td className="p-3">{a.tagId ? <span className="text-surface-700 dark:text-surface-300">발급</span> : <span className={sub}>없음</span>}</td>
                                                <td className="p-3 whitespace-nowrap">{checked(a) ?? <span className={sub}>없음</span>}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* 휴대폰: 카드 */}
                            <ul className="md:hidden space-y-2">
                                {al.visible.map((a) => (
                                    <li key={a.id} className="glass-card p-3 flex items-start gap-3">
                                        <input type="checkbox" className="w-5 h-5 mt-1 flex-shrink-0" aria-label={`${a.code} 고르기`} checked={al.selected.has(a.id)} onChange={() => al.toggle(a.id)} />
                                        <Link to={detailPath(a)} className="min-w-0 flex-1 block">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-mono text-sm font-semibold text-surface-900 dark:text-surface-100">{a.code}</span>
                                                <StatusBadge status={a.status} />
                                                {a.missingFromSource && <MissingBadge />}
                                            </div>
                                            <p className="text-sm text-surface-800 dark:text-surface-200 truncate">{a.name ?? '-'}</p>
                                            <p className={sub}>
                                                {where(a) ?? `미지정${a.locationRaw ? ` · ${a.locationRaw}` : ''}`} · 라벨 {a.tagId ? '발급' : '없음'} · 확인 {checked(a) ?? '없음'}
                                            </p>
                                        </Link>
                                    </li>
                                ))}
                            </ul>

                            {al.hasMore && (
                                <div className="text-center mt-4">
                                    <button type="button" className="btn-secondary min-h-[48px] px-5" onClick={al.showMore}>
                                        더 보기 ({al.visible.length.toLocaleString('ko-KR')} / {al.filtered.length.toLocaleString('ko-KR')})
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </>
            )}

            {printing && (
                <LabelPrintDialog
                    assets={al.selectedAssets}
                    orgId={al.orgId}
                    onClose={() => setPrinting(false)}
                    onTags={al.applyTags}
                    onReloadNeeded={() => void al.reload()}
                />
            )}
        </div>
    );
}

interface FiltersProps {
    filters: AssetFilters;
    setFilter: <K extends keyof AssetFilters>(key: K, value: AssetFilters[K]) => void;
    spaces: Space[];
    buildings: Building[];
    onReset: () => void;
}

/** 공간 거르기 목록 — 건물을 등록했으면 건물 → 층 → 공간으로 묶고, 건물·층 전체도 고를 수 있다 */
function SpaceOptions({ spaces, buildings }: { spaces: Space[]; buildings: Building[] }) {
    const archived = spaces.filter((s) => s.archived);
    const archivedOptions = archived.map((s) => <option key={s.id} value={s.id}>{s.name} (숨김)</option>);
    if (!buildings.some((b) => !b.archived)) {
        return <>{spaces.filter((s) => !s.archived).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}{archivedOptions}</>;
    }
    return (
        <>
            {groupSpacesByLocation(spaces.filter((s) => !s.archived), buildings).map((g) => (
                <optgroup key={g.buildingId ?? 'none'} label={g.label}>
                    {g.buildingId && <option value={buildingFilter(g.buildingId)}>{g.label} 전체</option>}
                    {g.floors.map((f) => [
                        g.buildingId && f.floor
                            ? <option key={`f-${f.floor}`} value={floorFilter(g.buildingId, f.floor)}>{g.label} {f.label} 전체</option>
                            : null,
                        ...f.spaces.map((s) => (
                            <option key={s.id} value={s.id}>{g.buildingId ? `· ${f.floor ? `${f.label} ` : ''}${s.name}` : s.name}</option>
                        )),
                    ])}
                </optgroup>
            ))}
            {archived.length > 0 && <optgroup label="숨긴 공간">{archivedOptions}</optgroup>}
        </>
    );
}

function Filters({ filters, setFilter, spaces, buildings, onReset }: FiltersProps) {
    const label = 'text-xs text-surface-600 dark:text-surface-300';
    return (
        <div className="glass-card p-4 mb-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <label className={`${label} sm:col-span-2 lg:col-span-1`}>
                    검색
                    <input type="search" className="input min-h-[48px] mt-1" placeholder="자산코드·품명·위치"
                        value={filters.search} onChange={(e) => setFilter('search', e.target.value)} />
                </label>
                <label className={label}>
                    공간
                    <select className="input min-h-[48px] mt-1" value={filters.space} onChange={(e) => setFilter('space', e.target.value)}>
                        <option value="all">전체 공간</option>
                        <option value="none">공간 미지정</option>
                        <SpaceOptions spaces={spaces} buildings={buildings} />
                    </select>
                </label>
                <label className={label}>
                    상태
                    <select className="input min-h-[48px] mt-1" value={filters.status} onChange={(e) => setFilter('status', e.target.value as AssetFilters['status'])}>
                        <option value="active">운영</option>
                        <option value="inactive">불용</option>
                        <option value="disposed">폐기</option>
                        <option value="all">전체 상태</option>
                    </select>
                </label>
                <label className={label}>
                    라벨
                    <select className="input min-h-[48px] mt-1" value={filters.label} onChange={(e) => setFilter('label', e.target.value as AssetFilters['label'])}>
                        <option value="all">전체</option>
                        <option value="untagged">아직 안 뽑음</option>
                        <option value="tagged">뽑음</option>
                    </select>
                </label>
                <label className={label}>
                    마지막 확인
                    <select className="input min-h-[48px] mt-1" value={filters.checked} onChange={(e) => setFilter('checked', e.target.value as AssetFilters['checked'])}>
                        <option value="all">전체</option>
                        <option value="over6m">6개월 넘게 못 봄</option>
                        <option value="over1y">1년 넘게 못 봄</option>
                        <option value="never">한 번도 확인 안 됨</option>
                    </select>
                </label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                <label className="flex items-center gap-2 min-h-[44px] text-sm text-surface-700 dark:text-surface-300">
                    <input type="checkbox" className="w-4 h-4" checked={filters.onlyMissing} onChange={(e) => setFilter('onlyMissing', e.target.checked)} />
                    대장에 없음만
                </label>
                <button type="button" className="text-sm text-primary-600 dark:text-primary-400 min-h-[44px]" onClick={onReset}>조건 초기화</button>
            </div>
        </div>
    );
}

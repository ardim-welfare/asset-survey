/**
 * useAssetList — 관리자 재물 목록 (기획서 F08) + 라벨 인쇄할 재물 고르기(F09)
 *
 * 기관의 재물을 한 번 읽어 와 화면에서 거른다(검색·공간·상태·대장에 없음·라벨). 500~2,000건 기관을
 * 기준으로, 거를 때마다 서버를 다시 읽지 않는 쪽이 읽기 비용이 적다. 그리는 것은 100건씩 늘린다.
 *
 * 공간 거르기는 건물·층 단위로도 된다(2026-11-22) — 건물 하나를 거른 뒤 '모두 고르기'로 그 건물 라벨을 한 번에 뽑는다.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from './useAuth';
import { getAssets, getSpaces, getBuildings } from '../lib/firestore';
import { spaceLocationMap } from '../lib/spaceGroups';
import type { Asset, AssetStatus } from '../types/asset';
import type { Space } from '../types/space';
import type { Building } from '../types/building';

export const LIST_PAGE = 100;

/**
 * 공간 거르기 — 전체 / 공간 미지정 / 특정 공간 ID / 건물(`b:건물ID`) / 층(`f:건물ID|층`)
 * 건물·층은 공간 ID가 아니라 접두사로 구분한다(공간 문서 ID에는 ':'가 들어가지 않는다).
 */
export type SpaceFilter = 'all' | 'none' | string;

export const buildingFilter = (buildingId: string): SpaceFilter => `b:${buildingId}`;
export const floorFilter = (buildingId: string, floor: string): SpaceFilter => `f:${buildingId}|${floor}`;

/** 공간 ID → 건물·층 (건물·층 거르기에 쓴다) */
export type SpacePlaceIndex = Map<string, { buildingId: string | null; floor: string | null }>;

export const spacePlaceIndex = (spaces: Space[]): SpacePlaceIndex =>
    new Map(spaces.map((s) => [s.id, { buildingId: s.buildingId ?? null, floor: s.floor ?? null }]));

/** 재물이 공간 거르기 조건에 맞는가 */
function matchesSpace(a: Asset, filter: SpaceFilter, places?: SpacePlaceIndex): boolean {
    if (filter === 'all') return true;
    if (filter === 'none') return a.spaceId == null;
    if (filter.startsWith('b:') || filter.startsWith('f:')) {
        const place = a.spaceId ? places?.get(a.spaceId) : undefined;
        if (!place?.buildingId) return false;
        if (filter.startsWith('b:')) return place.buildingId === filter.slice(2);
        const [bid, floor] = filter.slice(2).split('|');
        return place.buildingId === bid && (place.floor ?? '') === floor;
    }
    return a.spaceId === filter;
}
export type StatusFilter = AssetStatus | 'all';
export type LabelFilter = 'all' | 'untagged' | 'tagged';

export interface AssetFilters {
    search: string;
    space: SpaceFilter;
    status: StatusFilter;
    onlyMissing: boolean;
    label: LabelFilter;
}

export const DEFAULT_FILTERS: AssetFilters = { search: '', space: 'all', status: 'active', onlyMissing: false, label: 'all' };

const collator = new Intl.Collator('ko', { numeric: true });

/** 자산코드 순(숫자는 숫자 크기로 — 1-2 < 1-10) */
export const sortAssets = (list: Asset[]): Asset[] => [...list].sort((a, b) => collator.compare(a.code, b.code));

/** 거르기 — 검색은 자산코드·품명·원본 위치에서 띄어쓰기·대소문자 무시하고 찾는다 */
export function filterAssets(list: Asset[], f: AssetFilters, places?: SpacePlaceIndex): Asset[] {
    const q = f.search.replace(/\s+/g, '').toLowerCase();
    return list.filter((a) => {
        if (f.status !== 'all' && a.status !== f.status) return false;
        if (!matchesSpace(a, f.space, places)) return false;
        if (f.onlyMissing && !a.missingFromSource) return false;
        if (f.label === 'untagged' && a.tagId) return false;
        if (f.label === 'tagged' && !a.tagId) return false;
        if (q) {
            const hay = `${a.code} ${a.name ?? ''} ${a.locationRaw ?? ''}`.replace(/\s+/g, '').toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });
}

export default function useAssetList() {
    const { userData } = useAuth();
    const orgId = userData?.organizationId ?? null;
    const [assets, setAssets] = useState<Asset[]>([]);
    const [spaces, setSpaces] = useState<Space[]>([]);
    const [buildings, setBuildings] = useState<Building[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [filters, setFilters] = useState<AssetFilters>(DEFAULT_FILTERS);
    const [shown, setShown] = useState(LIST_PAGE);
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const load = useCallback(async () => {
        if (!orgId) return;
        setLoading(true);
        setError(false);
        try {
            const [a, s, b] = await Promise.all([getAssets(orgId), getSpaces(orgId), getBuildings(orgId)]);
            setAssets(sortAssets(a));
            setSpaces(s);
            setBuildings(b);
        } catch {
            setError(true);
        } finally {
            setLoading(false);
        }
    }, [orgId]);

    useEffect(() => { void load(); }, [load]);

    const places = useMemo(() => spacePlaceIndex(spaces), [spaces]);
    const filtered = useMemo(() => filterAssets(assets, filters, places), [assets, filters, places]);
    /** 공간 표시 이름 — 건물을 등록했으면 "본관 2층 상담실" */
    const spaceName = useMemo(() => {
        const loc = spaceLocationMap(spaces, buildings);
        return new Map(spaces.map((s) => [s.id, loc[s.id] ? `${loc[s.id]} ${s.name}` : s.name]));
    }, [spaces, buildings]);

    const setFilter = useCallback(<K extends keyof AssetFilters>(key: K, value: AssetFilters[K]) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
        setShown(LIST_PAGE);
    }, []);
    const resetFilters = useCallback(() => { setFilters(DEFAULT_FILTERS); setShown(LIST_PAGE); }, []);

    const toggle = useCallback((id: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }, []);
    /** 여러 건을 한꺼번에 고르거나 뺀다(표 머리의 체크 칸) */
    const setMany = useCallback((ids: string[], on: boolean) => {
        setSelected((prev) => {
            const next = new Set(prev);
            for (const id of ids) { if (on) next.add(id); else next.delete(id); }
            return next;
        });
    }, []);
    /** 지금 걸러진 결과 전부를 고른다(화면에 아직 안 그린 것 포함) */
    const selectFiltered = useCallback(() => {
        setSelected((prev) => new Set([...prev, ...filtered.map((a) => a.id)]));
    }, [filtered]);
    const clearSelection = useCallback(() => setSelected(new Set()), []);

    /** 고른 재물 — 목록 순서대로(라벨도 이 순서로 인쇄된다) */
    const selectedAssets = useMemo(() => assets.filter((a) => selected.has(a.id)), [assets, selected]);

    /** 라벨 인쇄에서 발급한 태그를 목록에 반영한다(다시 읽지 않고) */
    const applyTags = useCallback((tags: Map<string, string>) => {
        setAssets((prev) => prev.map((a) => (!a.tagId && tags.has(a.id) ? { ...a, tagId: tags.get(a.id) ?? null } : a)));
    }, []);

    return {
        orgId, assets, spaces, buildings, spaceName, loading, error, reload: load,
        filters, setFilter, resetFilters, filtered,
        visible: filtered.slice(0, shown), hasMore: filtered.length > shown, showMore: () => setShown((n) => n + LIST_PAGE),
        selected, toggle, setMany, selectFiltered, clearSelection, selectedAssets, applyTags,
    };
}

/**
 * useAssetDetail — 재물 한 건 (기획서 F08)
 *
 * 관리자·직원이 함께 쓴다. 금액과 변경 이력은 관리자만 읽는다(Rules도 막는다) — 직원 화면에서는
 * 아예 부르지 않는다.
 */
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { getAsset, getAssetAccounting, getAssetHistory, getSpaces } from '../lib/firestore';
import type { Asset, AssetAccounting, HistoryEntry } from '../types/asset';
import type { Space } from '../types/space';

export default function useAssetDetail(assetId: string | undefined, { admin }: { admin: boolean }) {
    const { userData } = useAuth();
    const orgId = userData?.organizationId ?? null;
    const [asset, setAsset] = useState<Asset | null>(null);
    const [space, setSpace] = useState<Space | null>(null);
    const [accounting, setAccounting] = useState<AssetAccounting | null>(null);
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [spaces, setSpaces] = useState<Space[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [notFound, setNotFound] = useState(false);

    const load = useCallback(async () => {
        if (!orgId || !assetId) return;
        setLoading(true);
        setError(false);
        setNotFound(false);
        try {
            const found = await getAsset(assetId);
            // 다른 기관 문서는 Rules가 막지만, 슈퍼관리자 등 예외 경로에서도 내 기관 것만 보여 준다
            if (!found || found.organizationId !== orgId) {
                setAsset(null);
                setNotFound(true);
                return;
            }
            setAsset(found);
            const [list, acc, hist] = await Promise.all([
                getSpaces(orgId),
                admin ? getAssetAccounting(assetId) : Promise.resolve(null),
                admin ? getAssetHistory(orgId, assetId) : Promise.resolve([] as HistoryEntry[]),
            ]);
            setSpaces(list);
            setSpace(list.find((s) => s.id === found.spaceId) ?? null);
            setAccounting(acc);
            setHistory(hist);
        } catch {
            setError(true);
        } finally {
            setLoading(false);
        }
    }, [orgId, assetId, admin]);

    useEffect(() => { void load(); }, [load]);

    /** 라벨 인쇄로 태그가 생기면 화면에 바로 반영한다 */
    const applyTags = useCallback((tags: Map<string, string>) => {
        setAsset((prev) => (prev && !prev.tagId && tags.has(prev.id) ? { ...prev, tagId: tags.get(prev.id) ?? null } : prev));
    }, []);

    return { orgId, asset, space, spaces, accounting, history, loading, error, notFound, reload: load, applyTags };
}

/**
 * useScanner — 현장 스캔 (기획서 F11·F12)
 *
 * 흐름: 찍힌 글자 → 대상 목록에서 찾기(인터넷 없이) → 없으면 서버에서 재물 찾기 → 판정 → 이미 찍었는지
 * 확인 → 저장(기다리지 않음). 같은 물건은 다시 저장하지 않아 수가 늘지 않는다.
 *
 * 찍을 수 있는 공간: 관리자는 회차의 모든 공간, 직원은 '나눠서 조사' 회차에서 자기가 담당하는 공간만
 * (Rules도 같은 경계로 막는다). '혼자 조사' 회차는 관리자만 찍는다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './useAuth';
import { useToast } from './useToast';
import {
    getOpenSurvey, getSurveyTargets, getSpaces, findAssetByTag, findAssetByCode, peekScan, saveScan,
    updateScanCondition, deleteScan, subscribeSpaceScans,
} from '../lib/firestore';
import {
    buildTargetIndex, findInTargets, judge, resolveInput, targetKey,
    type FoundAsset, type IndexedTarget, type Judgement, type ScanDraft,
} from '../lib/survey/judge';
import type { Survey, SurveyTarget, Scan, ScanCondition, ScanMethod } from '../types/survey';
import type { Space } from '../types/space';

export type LastScan =
    | { kind: 'saved'; draft: ScanDraft; method: ScanMethod; at: number }
    | { kind: 'duplicate'; judgement: Extract<Judgement, { kind: 'duplicate' }>; at: number };

function vibrate(pattern: number | number[]) {
    try { navigator.vibrate?.(pattern); } catch { /* 진동 없는 기기 */ }
}

export default function useScanner(initialSpaceId: string | null) {
    const { user, userData } = useAuth();
    const { showToast } = useToast();
    const orgId = userData?.organizationId ?? null;
    const uid = user?.uid ?? null;
    const isAdmin = userData?.role === 'admin';

    const [survey, setSurvey] = useState<Survey | null>(null);
    const [targets, setTargets] = useState<SurveyTarget[]>([]);
    const [spaces, setSpaces] = useState<Space[]>([]);
    const [spaceId, setSpaceId] = useState<string | null>(initialSpaceId);
    const [scans, setScans] = useState<Scan[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [last, setLast] = useState<LastScan | null>(null);
    const busy = useRef(false);
    const [checking, setChecking] = useState(false);

    useEffect(() => {
        if (!orgId) return;
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(false);
            try {
                const open = await getOpenSurvey(orgId);
                if (cancelled) return;
                setSurvey(open);
                if (!open) return;
                const [t, sp] = await Promise.all([getSurveyTargets(orgId, open.id), getSpaces(orgId)]);
                if (cancelled) return;
                setTargets(t);
                setSpaces(sp);
            } catch {
                if (!cancelled) setError(true);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [orgId]);

    /** 내가 찍을 수 있는 공간 — 회차 대상 공간 중에서, 공간 순서대로 */
    const mySpaces = useMemo(() => {
        if (!survey || !uid) return [];
        const inSurvey = spaces.filter((s) => survey.spaceIds.includes(s.id)).sort((a, b) => a.order - b.order);
        if (isAdmin) return inSurvey;
        if (survey.mode !== 'delegated') return [];
        return inSurvey.filter((s) => s.managerUids.includes(uid));
    }, [survey, spaces, uid, isAdmin]);

    // 고른 공간이 내 공간이 아니면(주소로 들어온 경우 등) 첫 공간으로
    useEffect(() => {
        if (mySpaces.length === 0) return;
        if (!spaceId || !mySpaces.some((s) => s.id === spaceId)) setSpaceId(mySpaces.length === 1 ? mySpaces[0].id : null);
    }, [mySpaces, spaceId]);

    // 이 공간에 관한 스캔 실시간
    useEffect(() => {
        if (!orgId || !survey || !spaceId) { setScans([]); return; }
        return subscribeSpaceScans(orgId, survey.id, spaceId, setScans, () => setError(true));
    }, [orgId, survey, spaceId]);

    const index = useMemo(() => buildTargetIndex(targets), [targets]);
    const scanMap = useMemo(() => new Map(scans.map((s) => [s.id, s])), [scans]);
    const spaceName = useMemo(() => new Map(spaces.map((s) => [s.id, s.name])), [spaces]);

    /** 찍힌 글자 처리 — 처리 중이면 false(카메라가 다음 프레임에 다시 넘긴다) */
    const handle = useCallback((text: string, method: ScanMethod): boolean => {
        if (busy.current || !orgId || !survey || !spaceId) return false;
        const lookup = resolveInput(text, method);
        if (!lookup) return true;
        busy.current = true;
        setChecking(true);
        void (async () => {
            try {
                let target: IndexedTarget | null = findInTargets(index, lookup);
                let found: FoundAsset | null = null;
                if (!target) {
                    try {
                        const asset = lookup.kind === 'tag' ? await findAssetByTag(orgId, lookup.tag) : await findAssetByCode(orgId, lookup.code);
                        // 회차 시작 뒤에 라벨을 뽑은 대상은 태그가 대상 목록에 없다 → 문서 ID로 다시 맞춘다
                        if (asset) target = index.byId.get(asset.id) ?? null;
                        if (asset && !target) found = { id: asset.id, code: asset.code, name: asset.name, status: asset.status };
                    } catch {
                        // 오프라인 — 대상 목록에 없으면 미등록으로 남기고 관리자가 확인한다
                    }
                }
                let j = judge({ surveyId: survey.id, spaceId, lookup, target, found, existing: (id) => scanMap.get(id) ?? null });
                if (j.kind === 'save') {
                    // 다른 공간에서 이미 찍혔을 수 있다 — 서버에 한 번 물어본다(오프라인이면 건너뜀)
                    const prev = await peekScan(j.draft.scanId);
                    if (prev) j = { kind: 'duplicate', scanId: j.draft.scanId, existing: prev, code: j.draft.code, name: j.draft.name };
                }
                if (j.kind === 'duplicate') {
                    vibrate([60, 60, 60]);
                    setLast({ kind: 'duplicate', judgement: j, at: Date.now() });
                    return;
                }
                const draft = j.draft;
                vibrate(draft.result === 'ok' ? 80 : [80, 60, 80]);
                saveScan({
                    orgId, surveyId: survey.id, spaceId, method, draft,
                    onRejected: () => showToast(`${draft.code} 스캔이 저장되지 않았습니다. 이미 다른 곳에서 찍혔거나 조사가 끝났을 수 있습니다.`, 'error'),
                });
                setLast({ kind: 'saved', draft, method, at: Date.now() });
            } finally {
                busy.current = false;
                setChecking(false);
            }
        })();
        return true;
    }, [orgId, survey, spaceId, index, scanMap, showToast]);

    const setCondition = useCallback((scanId: string, condition: ScanCondition, memo: string) => {
        updateScanCondition(scanId, condition, memo, () => showToast('물건 상태를 저장하지 못했습니다.', 'error'));
    }, [showToast]);

    const undo = useCallback(async (scanId: string) => {
        try {
            await deleteScan(scanId);
            setLast((prev) => (prev?.kind === 'saved' && prev.draft.scanId === scanId ? null : prev));
            showToast('스캔을 지웠습니다.', 'success');
        } catch {
            showToast('지우지 못했습니다. 인터넷 연결을 확인해 주세요.', 'error');
        }
    }, [showToast]);

    /** 이 공간의 진행 — 대상 중 찾은 것(어디서 찍혔든), 남은 것, 이 공간에서 찍은 최근 순 */
    const view = useMemo(() => {
        const bucket = targets.find((t) => targetKey(t.spaceId) === spaceId);
        const foundIds = new Set(scans
            .filter((s) => s.assetId && s.expectedSpaceId === spaceId && (s.result === 'ok' || s.result === 'otherSpace'))
            .map((s) => s.assetId as string));
        const remaining = (bucket?.items ?? []).filter((i) => !foundIds.has(i.id));
        const time = (s: Scan) => {
            const ts = s.scannedAt as { toMillis?: () => number } | undefined;
            return typeof ts?.toMillis === 'function' ? ts.toMillis() : Number.MAX_SAFE_INTEGER; // 아직 전송 전이면 맨 위
        };
        const here = scans.filter((s) => s.spaceId === spaceId).sort((a, b) => time(b) - time(a));
        return { target: bucket?.items.length ?? 0, found: foundIds.size, remaining, here };
    }, [targets, scans, spaceId]);

    return {
        loading, error, survey, isAdmin, mySpaces, spaceId, setSpaceId, spaceName,
        handle, checking, last, clearLast: () => setLast(null), scanMap, setCondition, undo, ...view,
    };
}

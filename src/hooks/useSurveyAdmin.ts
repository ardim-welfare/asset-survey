/**
 * useSurveyAdmin — 관리자 조사 회차 (기획서 F10)
 *
 * 회차 목록, 새 회차 시작(이름·기간·대상 공간), 진행 중 회차의 공간별 진행.
 * 진행 숫자는 이 화면을 열 때·[새로고침]할 때 한 번 읽는다(실시간 현황판은 5단계 F14).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from './useAuth';
import { useConfirm } from './useConfirm';
import { useToast } from './useToast';
import {
    getSurveys, getSurveyTargets, getScans, getSpaces, getAssets, getOrganization, startSurvey, groupTargets,
} from '../lib/firestore';
import { progressBySpace, type SpaceProgress } from '../lib/survey/judge';
import { DEFAULT_SURVEY_MODE, SURVEY_NAME_MAX, NO_SPACE_KEY } from '../schemas';
import { toLocalDateStr } from '../lib/dateUtils';
import type { Survey, SurveyTarget, Scan } from '../types/survey';
import type { Asset } from '../types/asset';
import type { Space } from '../types/space';
import type { SurveyMode } from '../types';

export interface StartForm {
    name: string;
    startDate: string;
    endDate: string;
    spaceIds: string[];
    includesUnassigned: boolean;
}

const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export function defaultStartForm(spaces: Space[], today = new Date()): StartForm {
    return {
        name: `${today.getFullYear()}년 정기 재물조사`,
        startDate: toLocalDateStr(today),
        endDate: toLocalDateStr(addDays(today, 14)),
        spaceIds: spaces.filter((s) => !s.archived).map((s) => s.id),
        includesUnassigned: true,
    };
}

export function validateStartForm(f: StartForm): string | null {
    const name = f.name.trim();
    if (!name) return '회차 이름을 넣어 주세요.';
    if (name.length > SURVEY_NAME_MAX) return `회차 이름은 ${SURVEY_NAME_MAX}자까지입니다.`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(f.endDate)) return '기간을 골라 주세요.';
    if (f.endDate < f.startDate) return '끝나는 날이 시작하는 날보다 빠릅니다.';
    if (f.spaceIds.length === 0 && !f.includesUnassigned) return '조사할 공간을 하나 이상 골라 주세요.';
    return null;
}

export default function useSurveyAdmin() {
    const { userData } = useAuth();
    const { confirm } = useConfirm();
    const { showToast } = useToast();
    const orgId = userData?.organizationId ?? null;
    const [surveys, setSurveys] = useState<Survey[]>([]);
    const [spaces, setSpaces] = useState<Space[]>([]);
    const [assets, setAssets] = useState<Asset[]>([]);
    const [mode, setMode] = useState<SurveyMode>(DEFAULT_SURVEY_MODE);
    const [targets, setTargets] = useState<SurveyTarget[]>([]);
    const [scans, setScans] = useState<Scan[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [form, setForm] = useState<StartForm | null>(null);
    const [starting, setStarting] = useState(false);

    const open = surveys.find((s) => s.status === 'open') ?? null;

    const loadProgress = useCallback(async (survey: Survey | null) => {
        if (!orgId || !survey) { setTargets([]); setScans([]); return; }
        const [t, s] = await Promise.all([getSurveyTargets(orgId, survey.id), getScans(orgId, survey.id)]);
        setTargets(t);
        setScans(s);
    }, [orgId]);

    const load = useCallback(async () => {
        if (!orgId) return;
        setLoading(true);
        setError(false);
        try {
            const [list, sp, org] = await Promise.all([getSurveys(orgId), getSpaces(orgId), getOrganization(orgId)]);
            setSurveys(list);
            setSpaces(sp);
            setMode(org?.surveyMode ?? DEFAULT_SURVEY_MODE);
            await loadProgress(list.find((s) => s.status === 'open') ?? null);
        } catch {
            setError(true);
        } finally {
            setLoading(false);
        }
    }, [orgId, loadProgress]);

    useEffect(() => { void load(); }, [load]);

    /** 새 회차 양식 열기 — 대상 수를 보여 주려고 재물을 이때 읽는다 */
    const openForm = useCallback(async () => {
        if (!orgId) return;
        try {
            const list = await getAssets(orgId);
            setAssets(list);
            setForm(defaultStartForm(spaces));
        } catch {
            showToast('재물 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', 'error');
        }
    }, [orgId, spaces, showToast]);

    /** 양식 기준 공간별 대상 수 */
    const preview = useMemo(() => {
        if (!form) return null;
        const groups = groupTargets(assets, spaces.map((s) => s.id), true);
        const count = (key: string) => groups.get(key)?.length ?? 0;
        const total = form.spaceIds.reduce((n, id) => n + count(id), 0) + (form.includesUnassigned ? count(NO_SPACE_KEY) : 0);
        return { count, total, unassigned: count(NO_SPACE_KEY) };
    }, [form, assets, spaces]);

    const formError = form ? validateStartForm(form) : null;

    const start = useCallback(async () => {
        if (!orgId || !form || formError || starting || !preview) return;
        if (open) { showToast('이미 진행 중인 조사가 있습니다.', 'error'); return; }
        const ok = await confirm({
            title: '조사를 시작할까요?',
            message: `대상 ${preview.total.toLocaleString('ko-KR')}건을 지금 기준으로 고정합니다. 시작한 뒤 재물을 다시 가져와도 이번 조사 대상은 바뀌지 않습니다.`,
            confirmText: '조사 시작',
        });
        if (!ok) return;
        setStarting(true);
        try {
            await startSurvey({ orgId, ...form, name: form.name.trim(), mode, assets });
            showToast('조사를 시작했습니다. 공간 담당자 화면에 스캔이 열립니다.', 'success');
            setForm(null);
            await load();
        } catch {
            showToast('조사를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.', 'error');
        } finally {
            setStarting(false);
        }
    }, [orgId, form, formError, starting, preview, open, confirm, mode, assets, showToast, load]);

    const progress = useMemo(() => progressBySpace(targets, scans), [targets, scans]);
    const totals = useMemo(() => {
        let target = 0; let found = 0;
        for (const p of progress.values()) { target += p.target; found += p.found; }
        return { target, found, unregistered: scans.filter((s) => s.result === 'unregistered').length };
    }, [progress, scans]);

    return {
        orgId, surveys, spaces, mode, open, loading, error, reload: load,
        refreshProgress: () => loadProgress(open),
        form, setForm, openForm, closeForm: () => setForm(null), preview, formError, start, starting,
        progress, totals, scans,
    };
}

export type { SpaceProgress };

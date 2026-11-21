/**
 * useSurveyAdmin — 관리자 재물조사 (기획서 F10·F13·F14·F15)
 *
 * - 새 회차 시작(이름·기간·대상 공간 → 대상 고정)
 * - 진행 중 회차의 현황판: 스캔·제출 상태를 실시간으로 받아 화면에서 계산한다(사용자 결정 2026-11-21 —
 *   현황판을 연 동안만 스캔 수만큼 읽는다. 기관이 늘면 서버 집계로 바꾼다).
 * - 공간 제출 승인·반려, 제출 없는 공간 대신 승인(사유 필수)
 * - 마감: '나눠서 조사'는 대상 공간이 모두 승인돼야 한다(사용자 결정 2026-11-21). 마감하면 희망이음 반영
 *   목록을 만들고 공간 이름·요약을 회차에 남긴다.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from './useAuth';
import { useConfirm } from './useConfirm';
import { useToast } from './useToast';
import {
    getSurveys, getSurveyTargets, getSpaces, getAssets, getOrganization, startSurvey, groupTargets,
    subscribeSurveyScans, subscribeSubmissions, reviewSpace, closeSurvey, getOrganizationMembers,
} from '../lib/firestore';
import { progressBySpace, type SpaceProgress } from '../lib/survey/judge';
import { buildReport, buildSyncTasks, closeBlockers } from '../lib/survey/report';
import { DEFAULT_SURVEY_MODE, SURVEY_NAME_MAX, NO_SPACE_KEY } from '../schemas';
import { toLocalDateStr } from '../lib/dateUtils';
import type { Survey, SurveyTarget, Scan, SurveySubmission } from '../types/survey';
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

/** 공간 이름 표 — 마감 때 회차에 남긴다(보고서가 나중에도 마감 시점 이름으로 나오게) */
export function spaceNamesFor(survey: Pick<Survey, 'spaceIds' | 'includesUnassigned'>, spaces: Space[]): Record<string, string> {
    const names: Record<string, string> = {};
    for (const id of survey.spaceIds) names[id] = spaces.find((s) => s.id === id)?.name ?? '(지운 공간)';
    if (survey.includesUnassigned) names[NO_SPACE_KEY] = '공간 미지정';
    return names;
}

/** 검토 요청 — 승인·반려·대신 승인 */
export interface ReviewRequest {
    spaceId: string;
    decision: 'approved' | 'rejected';
    reason: string;
}

export default function useSurveyAdmin() {
    const { user, userData } = useAuth();
    const { confirm } = useConfirm();
    const { showToast } = useToast();
    const orgId = userData?.organizationId ?? null;
    const uid = user?.uid ?? null;
    const [surveys, setSurveys] = useState<Survey[]>([]);
    const [spaces, setSpaces] = useState<Space[]>([]);
    const [assets, setAssets] = useState<Asset[]>([]);
    const [mode, setMode] = useState<SurveyMode>(DEFAULT_SURVEY_MODE);
    const [targets, setTargets] = useState<SurveyTarget[]>([]);
    const [scans, setScans] = useState<Scan[]>([]);
    const [submissions, setSubmissions] = useState<SurveySubmission[]>([]);
    const [names, setNames] = useState<Map<string, string>>(new Map());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [form, setForm] = useState<StartForm | null>(null);
    const [starting, setStarting] = useState(false);
    const [closing, setClosing] = useState(false);

    const open = surveys.find((s) => s.status === 'open') ?? null;

    const load = useCallback(async () => {
        if (!orgId) return;
        setLoading(true);
        setError(false);
        try {
            const [list, sp, org] = await Promise.all([getSurveys(orgId), getSpaces(orgId), getOrganization(orgId)]);
            setSurveys(list);
            setSpaces(sp);
            setMode(org?.surveyMode ?? DEFAULT_SURVEY_MODE);
            const current = list.find((s) => s.status === 'open');
            setTargets(current ? await getSurveyTargets(orgId, current.id) : []);
            // 이름은 제출·승인한 사람 표시용 — 못 읽어도 화면은 그린다
            getOrganizationMembers(orgId)
                .then((members) => setNames(new Map(members.map((m) => [m.id, m.name || m.email || '(이름 없음)']))))
                .catch(() => { });
        } catch {
            setError(true);
        } finally {
            setLoading(false);
        }
    }, [orgId]);

    useEffect(() => { void load(); }, [load]);

    // 현황판 — 진행 중 회차의 스캔·제출을 실시간으로
    const openId = open?.id ?? null;
    useEffect(() => {
        if (!orgId || !openId) { setScans([]); setSubmissions([]); return; }
        const a = subscribeSurveyScans(orgId, openId, setScans, () => setError(true));
        const b = subscribeSubmissions(orgId, openId, setSubmissions, () => setError(true));
        return () => { a(); b(); };
    }, [orgId, openId]);

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

    const progress = useMemo<Map<string, SpaceProgress>>(() => progressBySpace(targets, scans), [targets, scans]);
    const totals = useMemo(() => {
        let target = 0; let found = 0;
        for (const p of progress.values()) { target += p.target; found += p.found; }
        return { target, found, unregistered: scans.filter((s) => s.result === 'unregistered').length };
    }, [progress, scans]);
    const submissionOf = useMemo(() => new Map(submissions.map((s) => [s.spaceId, s])), [submissions]);

    /** 최근 스캔(현황판) — 아직 전송 전 기록은 맨 위 */
    const recent = useMemo(() => {
        const time = (s: Scan) => {
            const ts = s.scannedAt as { toMillis?: () => number } | undefined;
            return typeof ts?.toMillis === 'function' ? ts.toMillis() : Number.MAX_SAFE_INTEGER;
        };
        return [...scans].sort((a, b) => time(b) - time(a)).slice(0, 8);
    }, [scans]);

    /** 승인·반려·대신 승인. 사유가 필요한 경우(반려·본인 승인·대신 승인)는 화면이 받아 넘긴다 */
    const review = useCallback(async ({ spaceId, decision, reason }: ReviewRequest): Promise<boolean> => {
        if (!orgId || !open) return false;
        const current = submissionOf.get(spaceId) ?? null;
        const needsReason = decision === 'rejected' || !current || current.submittedByUid === uid;
        if (needsReason && !reason.trim()) { showToast('사유를 적어 주세요.', 'error'); return false; }
        try {
            await reviewSpace({ orgId, surveyId: open.id, spaceId, decision, reason, current });
            showToast(decision === 'approved' ? '승인했습니다.' : '반려했습니다. 공간 담당자 화면에 사유가 보입니다.', 'success');
            return true;
        } catch {
            showToast('처리하지 못했습니다. 화면을 새로 열어 상태를 확인해 주세요.', 'error');
            return false;
        }
    }, [orgId, open, submissionOf, uid, showToast]);

    const blockers = useMemo(() => (open ? closeBlockers(open.mode, open.spaceIds, submissions) : []), [open, submissions]);

    /** 마감 — 보고서·반영 목록을 만들고 회차를 닫는다. @returns 마감한 회차 ID */
    const close = useCallback(async (): Promise<string | null> => {
        if (!orgId || !open || closing) return null;
        if (blockers.length > 0) { showToast('승인되지 않은 공간이 있어 마감할 수 없습니다.', 'error'); return null; }
        const spaceNames = spaceNamesFor(open, spaces);
        const report = buildReport(targets, scans, submissions, Object.keys(spaceNames));
        const tasks = buildSyncTasks(open.id, report);
        const ok = await confirm({
            title: '조사를 마감할까요?',
            message: `확인 ${report.summary.found}/${report.summary.target}건, 미발견 ${report.summary.missing}건. 마감하면 더는 찍거나 고칠 수 없고, 희망이음 반영 목록 ${tasks.length}건이 만들어집니다.`,
            confirmText: '마감',
            confirmColor: 'danger',
        });
        if (!ok) return null;
        setClosing(true);
        try {
            await closeSurvey({ orgId, surveyId: open.id, tasks, spaceNames, summary: report.summary });
            showToast('마감했습니다. 결과 보고서를 확인하세요.', 'success');
            const id = open.id;
            await load();
            return id;
        } catch {
            showToast('마감하지 못했습니다. 다시 마감하면 이어서 처리됩니다.', 'error');
            return null;
        } finally {
            setClosing(false);
        }
    }, [orgId, open, closing, blockers, spaces, targets, scans, submissions, confirm, showToast, load]);

    return {
        orgId, uid, surveys, spaces, mode, open, loading, error, reload: load,
        form, setForm, openForm, closeForm: () => setForm(null), preview, formError, start, starting,
        progress, totals, scans, recent, submissions, submissionOf, names, review, blockers, close, closing,
    };
}

export type { SpaceProgress };

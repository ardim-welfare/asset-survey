/**
 * 조사 결과 계산 (기획서 F15·F16) — 화면·저장과 떨어진 순수 계산이라 단위 테스트로 고정한다.
 *
 * 마감한 회차의 대상(surveyTargets)과 스캔(scans)은 더 바뀌지 않으므로(Rules), 보고서는 언제 다시
 * 계산해도 마감 시점 그대로다. 공간 이름만 나중에 바뀔 수 있어 마감 때 회차 문서에 남긴다(spaceNames).
 */
import { NO_SPACE_KEY } from '../../schemas/survey';
import { targetKey } from './judge';
import type {
    Scan, SurveyTarget, SurveyTargetItem, SurveySubmission, SurveySummary, SyncTaskKind,
} from '../../types/survey';

export interface ReportSpace {
    /** 공간 ID 또는 미지정(_none) */
    key: string;
    target: number;
    found: number;
    missing: number;
    /** 대상 중 다른 공간에서 찾음 */
    elsewhere: number;
    /** 직접 입력으로 확인(재확인 대상) */
    manual: number;
    /** 대상 중 물건 상태 이상 */
    issues: number;
    submission: SurveySubmission | null;
}

export interface MissingItem extends SurveyTargetItem {
    spaceKey: string;
}

export interface SurveyReport {
    summary: SurveySummary;
    spaces: ReportSpace[];
    /** 대상 중 끝내 찾지 못한 것 */
    missing: MissingItem[];
    /** 목록과 다른 공간에서 찾은 것 */
    otherSpace: Scan[];
    /** 파손·불용 필요 */
    damaged: Scan[];
    /** 라벨 훼손 */
    labelDamaged: Scan[];
    unregistered: Scan[];
    outOfScope: Scan[];
    /** 직접 입력으로 확인 — 재확인 대상 */
    manual: Scan[];
    /** 현장 사진이 붙은 스캔(2026-11-22) */
    photos: Scan[];
}

const byCode = <T extends { code: string }>(a: T, b: T) => a.code.localeCompare(b.code, 'ko', { numeric: true });

/**
 * @param spaceOrder 공간 표시 순서(공간 키 목록). 미지정 묶음은 맨 끝에 붙인다.
 */
export function buildReport(targets: SurveyTarget[], scans: Scan[], submissions: SurveySubmission[], spaceOrder: string[]): SurveyReport {
    const ownerOf = new Map<string, string>();
    const itemOf = new Map<string, SurveyTargetItem>();
    for (const t of targets) for (const i of t.items) { ownerOf.set(i.id, targetKey(t.spaceId)); itemOf.set(i.id, i); }

    // 대상 재물마다 찾은 스캔(정상·다른 공간) — 문서 ID가 회차+재물이라 재물당 하나뿐이다
    const foundScan = new Map<string, Scan>();
    for (const s of scans) {
        if (s.assetId && ownerOf.has(s.assetId) && (s.result === 'ok' || s.result === 'otherSpace')) foundScan.set(s.assetId, s);
    }

    const subOf = new Map(submissions.map((x) => [x.spaceId, x]));
    const keys = [...spaceOrder.filter((k) => k !== NO_SPACE_KEY)];
    for (const t of targets) { const k = targetKey(t.spaceId); if (!keys.includes(k) && k !== NO_SPACE_KEY) keys.push(k); }
    if (targets.some((t) => t.spaceId === null)) keys.push(NO_SPACE_KEY);

    const spaces: ReportSpace[] = keys.map((key) => {
        const items = targets.find((t) => targetKey(t.spaceId) === key)?.items ?? [];
        const found = items.map((i) => foundScan.get(i.id)).filter((s): s is Scan => !!s);
        return {
            key,
            target: items.length,
            found: found.length,
            missing: items.length - found.length,
            elsewhere: found.filter((s) => s.result === 'otherSpace').length,
            manual: found.filter((s) => s.method === 'manual').length,
            issues: found.filter((s) => s.condition !== 'normal').length,
            submission: subOf.get(key) ?? null,
        };
    });

    const missing: MissingItem[] = [];
    for (const t of targets) for (const i of t.items) if (!foundScan.has(i.id)) missing.push({ ...i, spaceKey: targetKey(t.spaceId) });

    const sorted = [...scans].sort(byCode);
    const report: SurveyReport = {
        spaces,
        missing: missing.sort(byCode),
        otherSpace: sorted.filter((s) => s.result === 'otherSpace'),
        damaged: sorted.filter((s) => s.condition === 'damaged'),
        labelDamaged: sorted.filter((s) => s.condition === 'labelDamaged'),
        unregistered: sorted.filter((s) => s.result === 'unregistered'),
        outOfScope: sorted.filter((s) => s.result === 'outOfScope'),
        manual: sorted.filter((s) => s.method === 'manual'),
        photos: sorted.filter((s) => !!s.photoUrl),
        summary: { target: 0, found: 0, missing: 0, otherSpace: 0, unregistered: 0, outOfScope: 0, damaged: 0, labelDamaged: 0, manual: 0 },
    };
    report.summary = {
        target: itemOf.size,
        found: foundScan.size,
        missing: missing.length,
        otherSpace: report.otherSpace.length,
        unregistered: report.unregistered.length,
        outOfScope: report.outOfScope.length,
        damaged: report.damaged.length,
        labelDamaged: report.labelDamaged.length,
        manual: report.manual.length,
    };
    return report;
}

export interface SyncTaskDraft {
    id: string;
    kind: SyncTaskKind;
    assetId: string | null;
    code: string;
    name: string | null;
    fromSpaceId: string | null;
    toSpaceId: string | null;
    memo: string;
}

export const SYNC_KIND_LABEL: Record<SyncTaskKind, string> = {
    move: '위치 변경',
    dispose: '불용 검토',
    missing: '미발견 확인',
    register: '재물 등록',
    relabel: '라벨 다시 붙이기',
};

/** 공간 키 → 공간 ID(미지정은 null) */
const spaceIdOf = (key: string | null) => (key === null || key === NO_SPACE_KEY ? null : key);

/**
 * 희망이음 반영 목록 (기획서 F16) — "희망이음에 옮겨 적을 일"과 라벨 다시 붙이기.
 * 문서 ID를 회차·종류·재물로 정해 마감을 다시 시도해도 같은 항목이 하나만 생긴다.
 */
export function buildSyncTasks(surveyId: string, report: SurveyReport): SyncTaskDraft[] {
    const tasks: SyncTaskDraft[] = [];
    const id = (kind: SyncTaskKind, key: string) => `${surveyId}__${kind}__${encodeURIComponent(key)}`;
    for (const s of report.otherSpace) {
        tasks.push({ id: id('move', s.assetId ?? s.code), kind: 'move', assetId: s.assetId, code: s.code, name: s.name,
            fromSpaceId: spaceIdOf(s.expectedSpaceId), toSpaceId: s.spaceId, memo: '' });
    }
    for (const s of report.damaged) {
        tasks.push({ id: id('dispose', s.assetId ?? s.code), kind: 'dispose', assetId: s.assetId, code: s.code, name: s.name,
            fromSpaceId: null, toSpaceId: s.spaceId, memo: s.memo });
    }
    for (const m of report.missing) {
        tasks.push({ id: id('missing', m.id), kind: 'missing', assetId: m.id, code: m.code, name: m.name,
            fromSpaceId: spaceIdOf(m.spaceKey), toSpaceId: null, memo: '' });
    }
    for (const s of report.unregistered) {
        tasks.push({ id: id('register', s.code), kind: 'register', assetId: null, code: s.code, name: s.name,
            fromSpaceId: null, toSpaceId: s.spaceId, memo: s.memo });
    }
    for (const s of report.labelDamaged) {
        tasks.push({ id: id('relabel', s.assetId ?? s.code), kind: 'relabel', assetId: s.assetId, code: s.code, name: s.name,
            fromSpaceId: null, toSpaceId: s.spaceId, memo: s.memo });
    }
    return tasks;
}

/** 마감 가능 여부 — '나눠서 조사'는 대상 공간이 모두 승인돼야 한다(사용자 결정 2026-11-21) */
export function closeBlockers(mode: 'delegated' | 'solo', spaceIds: string[], submissions: SurveySubmission[]): string[] {
    if (mode !== 'delegated') return [];
    const approved = new Set(submissions.filter((s) => s.state === 'approved').map((s) => s.spaceId));
    return spaceIds.filter((id) => !approved.has(id));
}

/** 남은 날 — 끝나는 날까지(오늘이면 0, 지났으면 음수) */
export function daysLeft(endDate: string, today: Date = new Date()): number {
    const [y, m, d] = endDate.split('-').map(Number);
    const end = Date.UTC(y, m - 1, d);
    const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    return Math.round((end - now) / 86400000);
}

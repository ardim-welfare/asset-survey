/**
 * useTeams — 기관의 팀 목록과 추가·이름 바꾸기·숨기기 (2026-11-22)
 *
 * 직원 관리(팀 등록·직원 팀 지정)와 공간 관리(담당 팀 지정)가 함께 쓴다.
 * 팀원 수는 직원 문서의 teamId로 세므로, 숨기기 막기는 부르는 쪽이 넘긴 인원으로 판단한다.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from './useToast';
import { useConfirm } from './useConfirm';
import { getTeams, createTeam, updateTeam, sortTeams, validateTeamName, normalizeTeamName } from '../lib/firestore';
import type { Team } from '../types/team';

export default function useTeams(orgId: string | null | undefined) {
    const { showToast } = useToast();
    const { confirm } = useConfirm();
    const [teams, setTeams] = useState<Team[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        if (!orgId) { setLoading(false); return; }
        setLoading(true);
        try {
            setTeams(await getTeams(orgId));
        } catch {
            // 팀을 못 읽어도 직원·공간 화면은 그린다 — 팀 칸만 빈다
            setTeams([]);
        } finally {
            setLoading(false);
        }
    }, [orgId]);

    useEffect(() => { void load(); }, [load]);

    const activeTeams = useMemo(() => teams.filter((t) => !t.archived), [teams]);
    const archivedTeams = useMemo(() => teams.filter((t) => t.archived), [teams]);
    const teamName = useCallback((id: string | null | undefined) => teams.find((t) => t.id === id)?.name ?? null, [teams]);

    /** 팀 추가 — 성공하면 새 팀 ID, 실패하면 null */
    const addTeam = useCallback(async (raw: string): Promise<string | null> => {
        if (!orgId) return null;
        const problem = validateTeamName(raw, teams);
        if (problem) { showToast(problem, 'warning'); return null; }
        const order = activeTeams.length === 0 ? 0 : Math.max(...activeTeams.map((t) => t.order)) + 1;
        setBusy(true);
        try {
            const id = await createTeam(orgId, raw, order);
            setTeams((prev) => sortTeams([...prev, { id, organizationId: orgId, name: normalizeTeamName(raw), order, archived: false }]));
            showToast('팀을 추가했습니다.', 'success');
            return id;
        } catch {
            showToast('팀을 추가하지 못했습니다. 인터넷 연결을 확인하고 다시 눌러 주세요.', 'error');
            return null;
        } finally {
            setBusy(false);
        }
    }, [orgId, teams, activeTeams, showToast]);

    /** 저장 실패 시 되돌린다 */
    const save = useCallback(async (next: Team[], write: () => Promise<void>, fail: string) => {
        const prev = teams;
        setTeams(next);
        setBusy(true);
        try { await write(); } catch { setTeams(prev); showToast(fail, 'error'); } finally { setBusy(false); }
    }, [teams, showToast]);

    const renameTeam = useCallback(async (team: Team) => {
        const input = await confirm({ type: 'input', title: '팀 이름 바꾸기', message: '새 팀 이름을 입력하세요.', inputLabel: '팀 이름', inputDefault: team.name, confirmText: '바꾸기' });
        if (typeof input !== 'string' || normalizeTeamName(input) === team.name) return;
        const problem = validateTeamName(input, teams, team.id);
        if (problem) { showToast(problem, 'warning'); return; }
        const name = normalizeTeamName(input);
        await save(teams.map((t) => (t.id === team.id ? { ...t, name } : t)), () => updateTeam(team.id, { name }), '팀 이름을 바꾸지 못했습니다.');
    }, [confirm, teams, showToast, save]);

    /** 삭제(실제로는 숨김) — 팀원이 남아 있으면 막는다(먼저 다른 팀으로 옮기게).
     *  공간 담당·사전 등록·지난 기록이 팀을 가리키므로 문서는 지우지 않고 archived로 둔다 */
    const archiveTeam = useCallback(async (team: Team, memberCount: number) => {
        if (memberCount > 0) {
            showToast(`'${team.name}'에 직원 ${memberCount}명이 있습니다. 먼저 다른 팀으로 옮기세요.`, 'warning');
            return;
        }
        const ok = await confirm({
            title: `'${team.name}' 팀을 삭제할까요?`,
            message: '팀 고르는 목록에서 빠집니다. 잘못 지웠으면 [팀 고치기]의 \'삭제한 팀\'에서 되살릴 수 있습니다.',
            confirmText: '삭제', confirmColor: 'danger',
        });
        if (!ok) return;
        await save(teams.map((t) => (t.id === team.id ? { ...t, archived: true } : t)), () => updateTeam(team.id, { archived: true }), '팀을 삭제하지 못했습니다. 인터넷 연결을 확인하고 다시 눌러 주세요.');
    }, [confirm, teams, showToast, save]);

    const restoreTeam = useCallback(async (team: Team) => {
        await save(teams.map((t) => (t.id === team.id ? { ...t, archived: false } : t)), () => updateTeam(team.id, { archived: false }), '팀을 되살리지 못했습니다. 인터넷 연결을 확인하고 다시 눌러 주세요.');
    }, [teams, save]);

    return { teams, activeTeams, archivedTeams, teamName, loading, busy, reload: load, addTeam, renameTeam, archiveTeam, restoreTeam };
}

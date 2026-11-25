/**
 * useSpaceManager — 공간 관리 화면(기획서 F03)의 상태와 동작
 *
 * 화면(SpaceManager)은 표시만 하고, 불러오기·검사·저장·실패 시 되돌리기는 여기서 한다.
 * 저장은 낙관적으로 화면에 먼저 반영하고, 실패하면 직전 목록으로 되돌린다 — 저장이 안 됐는데
 * 화면만 바뀐 채 두면 새로고침에서 되살아나 사용자를 속인다.
 *
 * 건물(건물 → 층 → 공간)도 여기서 함께 다룬다(2026-11-22). 건물의 층을 빼거나 건물을 숨길 때
 * 그 층·건물을 쓰는 공간이 있는지 공간 목록으로 확인해야 해서 두 목록을 한 훅이 가진다.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './useAuth';
import { useToast } from './useToast';
import { useConfirm } from './useConfirm';
import {
    getSpaces, createSpace, updateSpace, updateSpacesBatch, createSpacesBatch, reorderSpaces, getOrganizationMembers,
    validateSpaceName, normalizeSpaceName, sortSpaces,
    getBuildings, createBuilding, updateBuilding, reorderBuildings, sortBuildings,
    validateBuildingName, validateBuildingAddress, validateFloors, normalizeBuildingText, floorLabel,
    type SpaceLocation, type BuildingInput,
} from '../lib/firestore';
import { sameLocation } from '../lib/spaceGroups';
import { SPACE_MANAGERS_MAX, SPACE_TEAMS_MAX } from '../schemas/space';
import type { Space } from '../types/space';
import type { Building } from '../types/building';

/** 담당자로 고를 수 있는 사람 */
export interface SpaceMemberOption {
    uid: string;
    name: string;
    role: string;
}

export default function useSpaceManager() {
    const { userData } = useAuth();
    const { showToast } = useToast();
    const { confirm } = useConfirm();
    const orgId = userData?.organizationId ?? null;

    const [spaces, setSpaces] = useState<Space[]>([]);
    const [buildings, setBuildings] = useState<Building[]>([]);
    const [members, setMembers] = useState<SpaceMemberOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        // 기관이 없으면 읽을 것이 없다 — 로딩 표시만 끝없이 돌지 않게 끝낸다
        if (!orgId) { setLoading(false); return; }
        setLoading(true);
        setLoadError('');
        try {
            const [list, people, buildingList] = await Promise.all([
                getSpaces(orgId), getOrganizationMembers(orgId), getBuildings(orgId),
            ]);
            setSpaces(list);
            setBuildings(buildingList);
            setMembers(
                people
                    // 운영자(superAdmin)·비활성 계정은 담당자로 고르지 않는다
                    .filter((m) => m.role !== 'superAdmin' && m.status !== 'disabled')
                    .map((m) => ({ uid: m.uid || m.id, name: m.name || m.email || '이름 없음', role: m.role }))
                    .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
            );
        } catch {
            // captureError는 도메인 함수가 이미 보고했다
            setLoadError('공간 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
        } finally {
            setLoading(false);
        }
    }, [orgId]);

    useEffect(() => { load(); }, [load]);

    const activeSpaces = useMemo(() => spaces.filter((s) => !s.archived), [spaces]);
    const archivedSpaces = useMemo(() => spaces.filter((s) => s.archived), [spaces]);
    const activeBuildings = useMemo(() => buildings.filter((b) => !b.archived), [buildings]);
    const archivedBuildings = useMemo(() => buildings.filter((b) => b.archived), [buildings]);
    const activeBuildingIds = useMemo(() => new Set(activeBuildings.map((b) => b.id)), [activeBuildings]);
    const nextSpaceOrder = useMemo(
        () => (activeSpaces.length === 0 ? 0 : Math.max(...activeSpaces.map((s) => s.order)) + 1),
        [activeSpaces],
    );

    const nameOf = useCallback((uid: string) => {
        const m = members.find((x) => x.uid === uid);
        return m ? m.name : `퇴사·이동한 직원(${uid.slice(0, 6)})`;
    }, [members]);

    /** 저장 실패 시 되돌릴 수 있게 감싼다 */
    const withRollback = useCallback(async (next: Space[], save: () => Promise<void>, failMessage: string) => {
        const prev = spaces;
        setSpaces(next);
        setBusy(true);
        try {
            await save();
            return true;
        } catch {
            setSpaces(prev);
            showToast(failMessage, 'error');
            return false;
        } finally {
            setBusy(false);
        }
    }, [spaces, showToast]);

    /** 공간 추가 — 성공하면 true (화면이 입력칸을 비운다). 건물·층은 고르지 않아도 된다 */
    const addSpace = useCallback(async (
        rawName: string,
        location: SpaceLocation = { buildingId: null, floor: null },
    ): Promise<boolean> => {
        if (!orgId) return false;
        const loc: SpaceLocation = { buildingId: location.buildingId, floor: location.buildingId ? location.floor : null };
        const problem = validateSpaceName(rawName, spaces, undefined, loc);
        if (problem) {
            showToast(problem, 'warning');
            return false;
        }
        const order = nextSpaceOrder;
        setBusy(true);
        try {
            const id = await createSpace(orgId, rawName, order, loc);
            setSpaces((prev) => sortSpaces([...prev, {
                id, organizationId: orgId, name: normalizeSpaceName(rawName), order, managerUids: [], teamIds: [], archived: false,
                buildingId: loc.buildingId, floor: loc.floor,
            }]));
            showToast('공간을 추가했습니다.', 'success');
            return true;
        } catch {
            showToast('공간을 추가하지 못했습니다.', 'error');
            return false;
        } finally {
            setBusy(false);
        }
    }, [orgId, spaces, nextSpaceOrder, showToast]);

    /**
     * [공간 고치기] 창의 저장 — 이름과 위치(건물·층)를 한 번에 저장한다.
     * 따로 두 번 저장하면 두 번째 저장이 첫 번째 결과를 모르는 옛 목록으로 화면을 되돌린다.
     * 바뀐 것이 없으면 true, 이름이 막히면 안내 후 false. 위치를 옮기면 옮긴 곳의 맨 아래에 붙인다.
     */
    const saveSpaceDetails = useCallback(async (space: Space, input: string, location?: SpaceLocation): Promise<boolean> => {
        const patch: Parameters<typeof updateSpace>[1] = {};
        const nameChanged = normalizeSpaceName(input) !== space.name;
        const target: SpaceLocation = location
            ? { buildingId: location.buildingId, floor: location.buildingId ? location.floor : null }
            : { buildingId: space.buildingId ?? null, floor: space.floor ?? null };
        const moved = !!location && ((space.buildingId ?? null) !== target.buildingId || (space.floor ?? null) !== target.floor);
        // 이름을 바꾸거나 다른 층으로 옮길 때 — 옮겨 갈 자리에 같은 이름이 있는지 본다(2026-11-25)
        if (nameChanged || moved) {
            const problem = validateSpaceName(input, spaces, space.id, target);
            if (problem) {
                showToast(problem, 'warning');
                return false;
            }
        }
        if (nameChanged) patch.name = normalizeSpaceName(input);
        if (moved) Object.assign(patch, { buildingId: target.buildingId, floor: target.floor, order: nextSpaceOrder });
        if (Object.keys(patch).length === 0) return true;
        return withRollback(
            sortSpaces(spaces.map((s) => (s.id === space.id ? { ...s, ...patch } : s))),
            () => updateSpace(space.id, patch),
            patch.name ? '공간 이름을 바꾸지 못했습니다.' : '공간 위치를 바꾸지 못했습니다.',
        );
    }, [spaces, nextSpaceOrder, showToast, withRollback]);

    const renameSpace = useCallback(async (space: Space) => {
        const input = await confirm({
            type: 'input',
            title: '공간 이름 바꾸기',
            message: '새 이름을 입력하세요. 엑셀 대장의 위치 이름과 같게 쓰면 가져오기 때 자동으로 맞춰집니다.',
            inputLabel: '공간 이름',
            inputDefault: space.name,
            confirmText: '바꾸기',
        });
        if (typeof input !== 'string') return;
        await saveSpaceDetails(space, input);
    }, [confirm, saveSpaceDetails]);

    /**
     * 한 칸 위(-1)·아래(+1)로 옮긴다. 숨기지 않은 공간끼리, **같은 건물·층 안에서만** 순서를 바꾼다
     * (화면이 건물·층으로 묶어 보여 주므로 바로 위·아래 칸이 그 묶음 안의 이웃이다).
     */
    const moveSpace = useCallback(async (space: Space, direction: -1 | 1) => {
        const list = [...activeSpaces];
        const from = list.findIndex((s) => s.id === space.id);
        if (from < 0) return;
        let to = from + direction;
        while (to >= 0 && to < list.length && !sameLocation(list[to], space, activeBuildingIds)) to += direction;
        if (to < 0 || to >= list.length) return;
        [list[from], list[to]] = [list[to], list[from]];
        const renumbered = list.map((s, i) => ({ ...s, order: i }));
        await withRollback(
            [...renumbered, ...archivedSpaces],
            () => reorderSpaces(list),
            '순서를 바꾸지 못했습니다.',
        );
    }, [activeSpaces, archivedSpaces, activeBuildingIds, withRollback]);

    /** 공간을 다른 건물·층으로 옮긴다 — 옮긴 곳의 맨 아래에 붙인다 */
    const setSpaceLocation = useCallback(async (space: Space, location: SpaceLocation) => {
        const buildingId = location.buildingId;
        const floor = buildingId ? location.floor : null;
        if ((space.buildingId ?? null) === buildingId && (space.floor ?? null) === floor) return;
        // 옮겨 갈 건물·층에 같은 이름이 있으면 막는다(2026-11-25 — 층마다 같은 이름 허용)
        const problem = validateSpaceName(space.name, spaces, space.id, { buildingId, floor });
        if (problem) { showToast(problem, 'warning'); return; }
        const order = nextSpaceOrder;
        await withRollback(
            sortSpaces(spaces.map((s) => (s.id === space.id ? { ...s, buildingId, floor, order } : s))),
            () => updateSpace(space.id, { buildingId, floor, order }),
            '공간 위치를 바꾸지 못했습니다.',
        );
    }, [spaces, nextSpaceOrder, withRollback, showToast]);

    const addManager = useCallback(async (space: Space, uid: string) => {
        if (!uid || space.managerUids.includes(uid)) return;
        if (space.managerUids.length >= SPACE_MANAGERS_MAX) {
            showToast(`담당자는 공간당 ${SPACE_MANAGERS_MAX}명까지 지정할 수 있습니다.`, 'warning');
            return;
        }
        const managerUids = [...space.managerUids, uid];
        await withRollback(
            spaces.map((s) => (s.id === space.id ? { ...s, managerUids } : s)),
            () => updateSpace(space.id, { managerUids }),
            '담당자를 지정하지 못했습니다.',
        );
    }, [spaces, showToast, withRollback]);

    /** 담당 팀 지정(2026-11-22) — 그 팀 직원은 모두 이 공간을 조사·제출할 수 있다 */
    const addTeam = useCallback(async (space: Space, teamId: string) => {
        const current = space.teamIds ?? [];
        if (!teamId || current.includes(teamId)) return;
        if (current.length >= SPACE_TEAMS_MAX) {
            showToast(`담당 팀은 공간당 ${SPACE_TEAMS_MAX}개까지 지정할 수 있습니다.`, 'warning');
            return;
        }
        const teamIds = [...current, teamId];
        await withRollback(
            spaces.map((s) => (s.id === space.id ? { ...s, teamIds } : s)),
            () => updateSpace(space.id, { teamIds }),
            '담당 팀을 지정하지 못했습니다.',
        );
    }, [spaces, showToast, withRollback]);

    const removeTeam = useCallback(async (space: Space, teamId: string) => {
        const teamIds = (space.teamIds ?? []).filter((t) => t !== teamId);
        await withRollback(
            spaces.map((s) => (s.id === space.id ? { ...s, teamIds } : s)),
            () => updateSpace(space.id, { teamIds }),
            '담당 팀을 빼지 못했습니다.',
        );
    }, [spaces, withRollback]);

    const removeManager = useCallback(async (space: Space, uid: string) => {
        const managerUids = space.managerUids.filter((u) => u !== uid);
        await withRollback(
            spaces.map((s) => (s.id === space.id ? { ...s, managerUids } : s)),
            () => updateSpace(space.id, { managerUids }),
            '담당자를 빼지 못했습니다.',
        );
    }, [spaces, withRollback]);

    // ── 여러 곳 한꺼번에(2026-11-22) — 공간이 수십 곳인 기관에서 한 곳씩 고르기가 너무 길었다 ──

    /**
     * 고른 공간들에 담당을 한꺼번에 지정한다. value는 `t:팀ID` 또는 `u:직원uid`.
     * 이미 그 담당이 있거나 공간당 최대 수에 닿은 곳은 건너뛰고 알린다.
     */
    const bulkAssign = useCallback(async (spaceIds: string[], value: string): Promise<boolean> => {
        const isTeam = value.startsWith('t:');
        const target = value.slice(2);
        if (!target || (!isTeam && !value.startsWith('u:'))) return false;
        const picked = spaces.filter((s) => spaceIds.includes(s.id));
        const patches: Array<{ id: string; patch: Partial<Pick<Space, 'teamIds' | 'managerUids'>> }> = [];
        let already = 0;
        let full = 0;
        for (const s of picked) {
            const list = isTeam ? (s.teamIds ?? []) : s.managerUids;
            if (list.includes(target)) { already++; continue; }
            if (list.length >= (isTeam ? SPACE_TEAMS_MAX : SPACE_MANAGERS_MAX)) { full++; continue; }
            patches.push({ id: s.id, patch: isTeam ? { teamIds: [...list, target] } : { managerUids: [...list, target] } });
        }
        const skipped = [already > 0 ? `이미 지정 ${already}곳` : '', full > 0 ? `더 넣을 수 없음 ${full}곳` : ''].filter(Boolean).join(', ');
        if (patches.length === 0) {
            showToast(skipped ? `지정할 공간이 없습니다(${skipped}).` : '지정할 공간이 없습니다.', 'info');
            return false;
        }
        const byId = new Map(patches.map((x) => [x.id, x.patch]));
        const ok = await withRollback(
            spaces.map((s) => (byId.has(s.id) ? { ...s, ...byId.get(s.id) } : s)),
            () => updateSpacesBatch(patches),
            '담당을 지정하지 못했습니다. 인터넷 연결을 확인하고 다시 눌러 주세요.',
        );
        if (ok) showToast(`${patches.length}곳에 담당을 지정했습니다.${skipped ? ` (${skipped}은 건너뜀)` : ''}`, 'success');
        return ok;
    }, [spaces, showToast, withRollback]);

    /** 고른 공간들을 같은 건물·층으로 옮긴다 — 옮긴 곳의 맨 아래에 고른 순서대로 붙인다 */
    const bulkSetLocation = useCallback(async (spaceIds: string[], location: SpaceLocation): Promise<boolean> => {
        const buildingId = location.buildingId;
        const floor = buildingId ? location.floor : null;
        const moving = activeSpaces.filter((s) => spaceIds.includes(s.id)
            && ((s.buildingId ?? null) !== buildingId || (s.floor ?? null) !== floor));
        if (moving.length === 0) {
            showToast('이미 그 건물·층에 있습니다.', 'info');
            return true;
        }
        const patches = moving.map((s, i) => ({ id: s.id, patch: { buildingId, floor, order: nextSpaceOrder + i } }));
        const byId = new Map(patches.map((x) => [x.id, x.patch]));
        // 옮긴 뒤 같은 건물·층에 같은 이름이 둘이 되면 막는다 — 고른 공간끼리 겹치는 것도 잡는다(2026-11-25)
        const after = spaces.map((s) => (byId.has(s.id) ? { ...s, ...byId.get(s.id) } : s));
        const clashing = moving.filter((s) => validateSpaceName(s.name, after, s.id, { buildingId, floor }));
        if (clashing.length > 0) {
            const names = [...new Set(clashing.map((s) => s.name))];
            showToast(`옮길 곳에 같은 이름의 공간이 있어 옮기지 않았습니다: ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` 외 ${names.length - 3}곳` : ''}`, 'warning');
            return false;
        }
        const ok = await withRollback(
            sortSpaces(spaces.map((s) => (byId.has(s.id) ? { ...s, ...byId.get(s.id) } : s))),
            () => updateSpacesBatch(patches),
            '공간을 옮기지 못했습니다. 인터넷 연결을 확인하고 다시 눌러 주세요.',
        );
        if (ok) showToast(`${patches.length}곳을 옮겼습니다.`, 'success');
        return ok;
    }, [activeSpaces, spaces, nextSpaceOrder, showToast, withRollback]);

    /** 고른 공간들을 한꺼번에 삭제(숨김) — 확인을 받는다 */
    const bulkArchive = useCallback(async (spaceIds: string[]): Promise<boolean> => {
        const picked = activeSpaces.filter((s) => spaceIds.includes(s.id));
        if (picked.length === 0) return false;
        const ok = await confirm({
            title: `공간 ${picked.length}곳을 삭제할까요?`,
            message: `${picked.slice(0, 5).map((s) => s.name).join(', ')}${picked.length > 5 ? ` 외 ${picked.length - 5}곳` : ''}\n공간 목록과 조사 대상에서 빠집니다. 이 공간들의 재물은 지워지지 않고, '삭제한 공간'에서 되살릴 수 있습니다.`,
            confirmText: '삭제',
            confirmColor: 'danger',
        });
        if (!ok) return false;
        const ids = new Set(picked.map((s) => s.id));
        const done = await withRollback(
            spaces.map((s) => (ids.has(s.id) ? { ...s, archived: true } : s)),
            () => updateSpacesBatch(picked.map((s) => ({ id: s.id, patch: { archived: true } }))),
            '공간을 삭제하지 못했습니다. 인터넷 연결을 확인하고 다시 눌러 주세요.',
        );
        if (done) showToast(`${picked.length}곳을 삭제했습니다.`, 'success');
        return done;
    }, [activeSpaces, spaces, confirm, showToast, withRollback]);

    /**
     * 여러 공간 한꺼번에 추가 — 한 줄에 하나씩(엑셀 칸을 복사하면 탭으로 나뉘어 와 첫 칸만 쓴다).
     * 빈 줄·같은 이름은 건너뛰고, 문제가 있는 이름은 무엇인지 알린다.
     * @returns 추가한 수(하나도 못 넣으면 0)
     */
    const addSpaces = useCallback(async (text: string, location: SpaceLocation = { buildingId: null, floor: null }): Promise<number> => {
        if (!orgId) return 0;
        const lines = text.split(/\r?\n/).map((l) => l.split('\t')[0].trim()).filter(Boolean);
        const loc: SpaceLocation = { buildingId: location.buildingId, floor: location.buildingId ? location.floor : null };
        const accepted: string[] = [];
        const problems: string[] = [];
        const seen = [...spaces];
        for (const line of lines) {
            const problem = validateSpaceName(line, seen, undefined, loc);
            if (problem) { problems.push(`${line}: ${problem}`); continue; }
            const name = normalizeSpaceName(line);
            accepted.push(name);
            // 같은 목록 안의 겹친 이름도 잡히게 검사 대상에 더한다(모두 같은 건물·층에 들어간다)
            seen.push({ id: `new-${accepted.length}`, organizationId: orgId, name, order: 0, managerUids: [], teamIds: [], archived: false, buildingId: loc.buildingId, floor: loc.floor });
        }
        if (accepted.length === 0) {
            showToast(problems.length > 0 ? `추가할 공간이 없습니다. ${problems.slice(0, 2).join(' / ')}` : '공간 이름을 한 줄에 하나씩 적어 주세요.', 'warning');
            return 0;
        }
        const start = nextSpaceOrder;
        setBusy(true);
        try {
            const ids = await createSpacesBatch(orgId, accepted, start, loc);
            setSpaces((prev) => sortSpaces([...prev, ...ids.map((id, i) => ({
                id, organizationId: orgId, name: accepted[i], order: start + i, managerUids: [], teamIds: [], archived: false,
                buildingId: loc.buildingId, floor: loc.floor,
            }))]));
            showToast(`공간 ${ids.length}곳을 추가했습니다.${problems.length > 0 ? ` ${problems.length}줄은 건너뜀(${problems.slice(0, 2).join(' / ')}${problems.length > 2 ? ' …' : ''})` : ''}`,
                problems.length > 0 ? 'warning' : 'success');
            return ids.length;
        } catch {
            showToast('공간을 추가하지 못했습니다. 인터넷 연결을 확인하고 다시 눌러 주세요.', 'error');
            return 0;
        } finally {
            setBusy(false);
        }
    }, [orgId, spaces, nextSpaceOrder, showToast]);

    const archiveSpace = useCallback(async (space: Space) => {
        // '삭제'라고 부르지만 문서는 지우지 않는다 — 재물·지난 조사 기록이 이 공간을 가리킨다
        const ok = await confirm({
            title: `'${space.name}' 공간을 삭제할까요?`,
            message: '공간 목록과 조사 대상에서 빠집니다. 이 공간의 재물은 지워지지 않습니다.\n잘못 지웠으면 아래 \'삭제한 공간\'에서 되살릴 수 있습니다.',
            confirmText: '삭제',
            confirmColor: 'danger',
        });
        if (!ok) return false;
        return withRollback(
            spaces.map((s) => (s.id === space.id ? { ...s, archived: true } : s)),
            () => updateSpace(space.id, { archived: true }),
            '공간을 삭제하지 못했습니다. 인터넷 연결을 확인하고 다시 눌러 주세요.',
        );
    }, [confirm, spaces, withRollback]);

    /** 숨김 해제 — 맨 아래로 붙인다 */
    const restoreSpace = useCallback(async (space: Space) => {
        const order = nextSpaceOrder;
        await withRollback(
            sortSpaces(spaces.map((s) => (s.id === space.id ? { ...s, archived: false, order } : s))),
            () => updateSpace(space.id, { archived: false, order }),
            '공간을 되살리지 못했습니다. 인터넷 연결을 확인하고 다시 눌러 주세요.',
        );
    }, [nextSpaceOrder, spaces, withRollback]);

    // ── 건물 ──

    /** 건물 저장이 실패하면 직전 목록으로 되돌린다 */
    const withBuildingRollback = useCallback(async (next: Building[], save: () => Promise<void>, failMessage: string) => {
        const prev = buildings;
        setBuildings(next);
        setBusy(true);
        try {
            await save();
            return true;
        } catch {
            setBuildings(prev);
            showToast(failMessage, 'error');
            return false;
        } finally {
            setBusy(false);
        }
    }, [buildings, showToast]);

    /** 입력 검사 — 문제가 있으면 안내하고 false */
    const checkBuildingInput = useCallback((input: BuildingInput, selfId?: string): boolean => {
        const problem = validateBuildingName(input.name, buildings, selfId)
            ?? validateBuildingAddress(input.address)
            ?? validateFloors(input.floors);
        if (problem) showToast(problem, 'warning');
        return !problem;
    }, [buildings, showToast]);

    /** 건물 추가 — 성공하면 true (화면이 입력칸을 비운다) */
    const addBuilding = useCallback(async (input: BuildingInput): Promise<boolean> => {
        if (!orgId || !checkBuildingInput(input)) return false;
        const order = activeBuildings.length === 0 ? 0 : Math.max(...activeBuildings.map((b) => b.order)) + 1;
        setBusy(true);
        try {
            const id = await createBuilding(orgId, input, order);
            setBuildings((prev) => sortBuildings([...prev, {
                id, organizationId: orgId, name: normalizeBuildingText(input.name),
                address: normalizeBuildingText(input.address), floors: input.floors, order, archived: false,
            }]));
            showToast('건물을 추가했습니다.', 'success');
            return true;
        } catch {
            showToast('건물을 추가하지 못했습니다.', 'error');
            return false;
        } finally {
            setBusy(false);
        }
    }, [orgId, checkBuildingInput, activeBuildings, showToast]);

    /** 숨기지 않은 공간 중 이 건물(과 층)에 있는 공간 */
    const spacesIn = useCallback((buildingId: string, floor?: string) => activeSpaces.filter(
        (s) => s.buildingId === buildingId && (floor === undefined || s.floor === floor),
    ), [activeSpaces]);

    /**
     * 건물 고치기(이름·주소·층) — 성공하면 true.
     * 공간이 쓰는 층을 빼면 그 공간이 '목록에 없는 층'에 남으므로 막고, 먼저 공간을 옮기게 한다.
     */
    const editBuilding = useCallback(async (building: Building, input: BuildingInput): Promise<boolean> => {
        if (!checkBuildingInput(input, building.id)) return false;
        const removed = building.floors.filter((f) => !input.floors.includes(f));
        const inUse = removed.map((f) => ({ floor: f, count: spacesIn(building.id, f).length })).filter((x) => x.count > 0);
        if (inUse.length > 0) {
            const list = inUse.map((x) => `${floorLabel(x.floor)}(공간 ${x.count}개)`).join(', ');
            showToast(`${list}에 공간이 있어 층을 뺄 수 없습니다. 먼저 공간의 위치를 바꾸세요.`, 'warning');
            return false;
        }
        const patch = { name: normalizeBuildingText(input.name), address: normalizeBuildingText(input.address), floors: input.floors };
        return withBuildingRollback(
            buildings.map((b) => (b.id === building.id ? { ...b, ...patch } : b)),
            () => updateBuilding(building.id, patch),
            '건물 정보를 바꾸지 못했습니다.',
        );
    }, [checkBuildingInput, spacesIn, buildings, showToast, withBuildingRollback]);

    /** 건물 순서 한 칸 위(-1)·아래(+1) */
    const moveBuilding = useCallback(async (building: Building, direction: -1 | 1) => {
        const list = [...activeBuildings];
        const from = list.findIndex((b) => b.id === building.id);
        const to = from + direction;
        if (from < 0 || to < 0 || to >= list.length) return;
        [list[from], list[to]] = [list[to], list[from]];
        const renumbered = list.map((b, i) => ({ ...b, order: i }));
        await withBuildingRollback(
            [...renumbered, ...archivedBuildings],
            () => reorderBuildings(list),
            '건물 순서를 바꾸지 못했습니다.',
        );
    }, [activeBuildings, archivedBuildings, withBuildingRollback]);

    /** 건물 삭제(실제로는 숨김) — 공간이 남아 있으면 막는다(숨긴 건물의 공간은 '건물 미지정'으로 흩어져 헷갈린다) */
    const archiveBuilding = useCallback(async (building: Building) => {
        const count = spacesIn(building.id).length;
        if (count > 0) {
            showToast(`'${building.name}'에 공간 ${count}개가 있습니다. 먼저 [공간] 탭에서 그 공간들을 다른 건물로 옮기거나 삭제하세요.`, 'warning');
            return false;
        }
        const ok = await confirm({
            title: `'${building.name}' 건물을 삭제할까요?`,
            message: '건물 목록과 공간의 건물 고르기에서 빠집니다.\n잘못 지웠으면 아래 \'삭제한 건물\'에서 되살릴 수 있습니다.',
            confirmText: '삭제',
            confirmColor: 'danger',
        });
        if (!ok) return false;
        return withBuildingRollback(
            buildings.map((b) => (b.id === building.id ? { ...b, archived: true } : b)),
            () => updateBuilding(building.id, { archived: true }),
            '건물을 삭제하지 못했습니다. 인터넷 연결을 확인하고 다시 눌러 주세요.',
        );
    }, [spacesIn, showToast, confirm, buildings, withBuildingRollback]);

    /** 건물 숨김 해제 — 맨 아래로 붙인다 */
    const restoreBuilding = useCallback(async (building: Building) => {
        const order = activeBuildings.length === 0 ? 0 : Math.max(...activeBuildings.map((b) => b.order)) + 1;
        await withBuildingRollback(
            sortBuildings(buildings.map((b) => (b.id === building.id ? { ...b, archived: false, order } : b))),
            () => updateBuilding(building.id, { archived: false, order }),
            '건물을 되살리지 못했습니다. 인터넷 연결을 확인하고 다시 눌러 주세요.',
        );
    }, [activeBuildings, buildings, withBuildingRollback]);

    return {
        loading, loadError, busy, reload: load,
        activeSpaces, archivedSpaces, members, nameOf,
        addSpace, renameSpace, saveSpaceDetails, moveSpace, setSpaceLocation, addManager, removeManager, addTeam, removeTeam, archiveSpace, restoreSpace,
        bulkAssign, bulkSetLocation, bulkArchive, addSpaces,
        buildings, activeBuildings, archivedBuildings, spacesIn,
        addBuilding, editBuilding, moveBuilding, archiveBuilding, restoreBuilding,
    };
}

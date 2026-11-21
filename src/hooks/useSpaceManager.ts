/**
 * useSpaceManager — 공간 관리 화면(기획서 F03)의 상태와 동작
 *
 * 화면(SpaceManager)은 표시만 하고, 불러오기·검사·저장·실패 시 되돌리기는 여기서 한다.
 * 저장은 낙관적으로 화면에 먼저 반영하고, 실패하면 직전 목록으로 되돌린다 — 저장이 안 됐는데
 * 화면만 바뀐 채 두면 새로고침에서 되살아나 사용자를 속인다.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from './useAuth';
import { useToast } from './useToast';
import { useConfirm } from './useConfirm';
import {
    getSpaces, createSpace, updateSpace, reorderSpaces, getOrganizationMembers,
    validateSpaceName, normalizeSpaceName, sortSpaces,
} from '../lib/firestore';
import { SPACE_MANAGERS_MAX } from '../schemas/space';
import type { Space } from '../types/space';

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
    const [members, setMembers] = useState<SpaceMemberOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        if (!orgId) return;
        setLoading(true);
        setLoadError('');
        try {
            const [list, people] = await Promise.all([getSpaces(orgId), getOrganizationMembers(orgId)]);
            setSpaces(list);
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

    /** 공간 추가 — 성공하면 true (화면이 입력칸을 비운다) */
    const addSpace = useCallback(async (rawName: string): Promise<boolean> => {
        if (!orgId) return false;
        const problem = validateSpaceName(rawName, spaces);
        if (problem) {
            showToast(problem, 'warning');
            return false;
        }
        const order = activeSpaces.length === 0 ? 0 : Math.max(...activeSpaces.map((s) => s.order)) + 1;
        setBusy(true);
        try {
            const id = await createSpace(orgId, rawName, order);
            setSpaces((prev) => sortSpaces([...prev, {
                id, organizationId: orgId, name: normalizeSpaceName(rawName), order, managerUids: [], archived: false,
            }]));
            showToast('공간을 추가했습니다.', 'success');
            return true;
        } catch {
            showToast('공간을 추가하지 못했습니다.', 'error');
            return false;
        } finally {
            setBusy(false);
        }
    }, [orgId, spaces, activeSpaces, showToast]);

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
        if (normalizeSpaceName(input) === space.name) return;
        const problem = validateSpaceName(input, spaces, space.id);
        if (problem) {
            showToast(problem, 'warning');
            return;
        }
        const name = normalizeSpaceName(input);
        await withRollback(
            spaces.map((s) => (s.id === space.id ? { ...s, name } : s)),
            () => updateSpace(space.id, { name }),
            '공간 이름을 바꾸지 못했습니다.',
        );
    }, [confirm, spaces, showToast, withRollback]);

    /** 한 칸 위(-1)·아래(+1)로 옮긴다. 숨기지 않은 공간끼리만 순서를 바꾼다 */
    const moveSpace = useCallback(async (space: Space, direction: -1 | 1) => {
        const list = [...activeSpaces];
        const from = list.findIndex((s) => s.id === space.id);
        const to = from + direction;
        if (from < 0 || to < 0 || to >= list.length) return;
        [list[from], list[to]] = [list[to], list[from]];
        const renumbered = list.map((s, i) => ({ ...s, order: i }));
        await withRollback(
            [...renumbered, ...archivedSpaces],
            () => reorderSpaces(list),
            '순서를 바꾸지 못했습니다.',
        );
    }, [activeSpaces, archivedSpaces, withRollback]);

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

    const removeManager = useCallback(async (space: Space, uid: string) => {
        const managerUids = space.managerUids.filter((u) => u !== uid);
        await withRollback(
            spaces.map((s) => (s.id === space.id ? { ...s, managerUids } : s)),
            () => updateSpace(space.id, { managerUids }),
            '담당자를 빼지 못했습니다.',
        );
    }, [spaces, withRollback]);

    const archiveSpace = useCallback(async (space: Space) => {
        const ok = await confirm({
            title: '공간 숨기기',
            message: `'${space.name}' 공간을 숨길까요?\n숨긴 공간은 목록과 조사 대상에서 빠지지만 지워지지 않습니다. 언제든 다시 꺼낼 수 있습니다.`,
            confirmText: '숨기기',
            confirmColor: 'warning',
        });
        if (!ok) return;
        await withRollback(
            spaces.map((s) => (s.id === space.id ? { ...s, archived: true } : s)),
            () => updateSpace(space.id, { archived: true }),
            '공간을 숨기지 못했습니다.',
        );
    }, [confirm, spaces, withRollback]);

    /** 숨김 해제 — 맨 아래로 붙인다 */
    const restoreSpace = useCallback(async (space: Space) => {
        const order = activeSpaces.length === 0 ? 0 : Math.max(...activeSpaces.map((s) => s.order)) + 1;
        await withRollback(
            sortSpaces(spaces.map((s) => (s.id === space.id ? { ...s, archived: false, order } : s))),
            () => updateSpace(space.id, { archived: false, order }),
            '공간을 다시 꺼내지 못했습니다.',
        );
    }, [activeSpaces, spaces, withRollback]);

    return {
        loading, loadError, busy, reload: load,
        activeSpaces, archivedSpaces, members, nameOf,
        addSpace, renameSpace, moveSpace, addManager, removeManager, archiveSpace, restoreSpace,
    };
}

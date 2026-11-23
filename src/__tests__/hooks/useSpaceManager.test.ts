/**
 * useSpaceManager — 공간 관리 화면 로직 (기획서 F03)
 *
 * 고정하는 계약:
 *   - 담당자 후보에서 운영자(superAdmin)·비활성 계정을 뺀다
 *   - 이름 검사에 걸리면 저장하지 않고 안내한다
 *   - 저장 실패 시 화면을 직전 상태로 되돌린다
 *   - 순서 바꾸기는 숨기지 않은 공간끼리만, 끝에서는 아무것도 하지 않는다
 *   - 숨기기는 확인을 받고, 숨김 해제는 맨 아래로 붙인다
 *   - 건물·층(2026-11-22): 순서 바꾸기는 같은 건물·층 안에서만, 공간이 쓰는 층은 뺄 수 없고
 *     공간이 남은 건물은 숨길 수 없다
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Space } from '../../types/space';
import type { Building } from '../../types/building';

const mockShowToast = vi.fn();
const mockConfirm = vi.fn();

vi.mock('../../hooks/useAuth', () => ({
    useAuth: () => ({ userData: { organizationId: 'org-A' } }),
}));
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ showToast: mockShowToast }) }));
vi.mock('../../hooks/useConfirm', () => ({ useConfirm: () => ({ confirm: mockConfirm }) }));

const space = (over: Partial<Space>): Space => ({
    id: 's1', organizationId: 'org-A', name: '공간', order: 0, managerUids: [], teamIds: [], archived: false, buildingId: null, floor: null, ...over,
});

const building = (over: Partial<Building>): Building => ({
    id: 'b1', organizationId: 'org-A', name: '본관', address: '', floors: ['B1', '1', '2'], order: 0, archived: false, ...over,
});

vi.mock('../../lib/firestore', async () => {
    const actual = await vi.importActual<typeof import('../../lib/firestore/spaces')>('../../lib/firestore/spaces');
    const floors = await vi.importActual<typeof import('../../lib/buildingFloors')>('../../lib/buildingFloors');
    return {
        ...floors,
        getBuildings: vi.fn(),
        createBuilding: vi.fn(),
        updateBuilding: vi.fn(),
        reorderBuildings: vi.fn(),
        getSpaces: vi.fn(),
        getOrganizationMembers: vi.fn(),
        createSpace: vi.fn(),
        updateSpace: vi.fn(),
        updateSpacesBatch: vi.fn(),
        createSpacesBatch: vi.fn(),
        reorderSpaces: vi.fn(),
        validateSpaceName: actual.validateSpaceName,
        normalizeSpaceName: actual.normalizeSpaceName,
        sortSpaces: actual.sortSpaces,
    };
});

import * as firestore from '../../lib/firestore';
import useSpaceManager from '../../hooks/useSpaceManager';

const SPACES = [
    space({ id: 'a', name: '1층 상담실', order: 0, managerUids: ['u1'] }),
    space({ id: 'b', name: '2층 사무실', order: 1 }),
    space({ id: 'z', name: '옛 창고', order: 0, archived: true }),
];

async function setup() {
    const hook = renderHook(() => useSpaceManager());
    await waitFor(() => expect(hook.result.current.loading).toBe(false));
    return hook;
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(firestore.getSpaces).mockResolvedValue(SPACES.map((s) => ({ ...s })));
    vi.mocked(firestore.getOrganizationMembers).mockResolvedValue([
        { id: 'u1', uid: 'u1', name: '김직원', role: 'employee', status: 'active' },
        { id: 'u2', uid: 'u2', name: '이관리', role: 'admin', status: 'active' },
        { id: 'u3', uid: 'u3', name: '박퇴사', role: 'employee', status: 'disabled' },
        { id: 'sa', uid: 'sa', name: '운영자', role: 'superAdmin', status: 'active' },
    ] as never);
    vi.mocked(firestore.updateSpace).mockResolvedValue(undefined);
    vi.mocked(firestore.updateSpacesBatch).mockResolvedValue(undefined);
    vi.mocked(firestore.reorderSpaces).mockResolvedValue(undefined);
    vi.mocked(firestore.getBuildings).mockResolvedValue([]);
    vi.mocked(firestore.updateBuilding).mockResolvedValue(undefined);
});

describe('useSpaceManager', () => {
    it('숨긴 공간을 나눠 보이고, 담당자 후보에서 운영자·비활성 계정을 뺀다', async () => {
        const { result } = await setup();
        expect(result.current.activeSpaces.map((s) => s.id)).toEqual(['a', 'b']);
        expect(result.current.archivedSpaces.map((s) => s.id)).toEqual(['z']);
        expect(result.current.members.map((m) => m.uid)).toEqual(['u1', 'u2']);
        expect(result.current.nameOf('u1')).toBe('김직원');
        expect(result.current.nameOf('gone-uid-123')).toMatch(/퇴사·이동한 직원/);
    });

    it('불러오기 실패는 안내 문구로 보여 준다', async () => {
        vi.mocked(firestore.getSpaces).mockRejectedValueOnce(new Error('denied'));
        const { result } = await setup();
        expect(result.current.loadError).toMatch(/불러오지 못했습니다/);
    });

    it('공간 추가는 맨 뒤 순서로 저장하고, 같은 이름이면 저장하지 않는다', async () => {
        vi.mocked(firestore.createSpace).mockResolvedValue('c');
        const { result } = await setup();

        let ok = false;
        await act(async () => { ok = await result.current.addSpace('3층 교육장'); });
        expect(ok).toBe(true);
        expect(firestore.createSpace).toHaveBeenCalledWith('org-A', '3층 교육장', 2, { buildingId: null, floor: null });
        expect(result.current.activeSpaces.map((s) => s.name)).toEqual(['1층 상담실', '2층 사무실', '3층 교육장']);

        await act(async () => { ok = await result.current.addSpace('2층 사무실'); });
        expect(ok).toBe(false);
        expect(firestore.createSpace).toHaveBeenCalledTimes(1);
        expect(mockShowToast).toHaveBeenCalledWith(expect.stringMatching(/이미 있습니다/), 'warning');
    });

    it('담당자 지정 저장이 실패하면 화면을 되돌린다', async () => {
        vi.mocked(firestore.updateSpace).mockRejectedValueOnce(new Error('denied'));
        const { result } = await setup();

        await act(async () => { await result.current.addManager(result.current.activeSpaces[1], 'u2'); });

        expect(firestore.updateSpace).toHaveBeenCalledWith('b', { managerUids: ['u2'] });
        expect(result.current.activeSpaces[1].managerUids).toEqual([]);
        expect(mockShowToast).toHaveBeenCalledWith('담당자를 지정하지 못했습니다.', 'error');
    });

    it('담당자 빼기는 그 사람만 뺀 목록을 저장한다', async () => {
        const { result } = await setup();
        await act(async () => { await result.current.removeManager(result.current.activeSpaces[0], 'u1'); });
        expect(firestore.updateSpace).toHaveBeenCalledWith('a', { managerUids: [] });
        expect(result.current.activeSpaces[0].managerUids).toEqual([]);
    });

    it('아래로 옮기면 두 공간의 순서를 바꿔 저장하고, 맨 끝에서는 아무것도 하지 않는다', async () => {
        const { result } = await setup();

        await act(async () => { await result.current.moveSpace(result.current.activeSpaces[0], 1); });
        expect(vi.mocked(firestore.reorderSpaces).mock.calls[0][0].map((s) => s.id)).toEqual(['b', 'a']);
        expect(result.current.activeSpaces.map((s) => s.id)).toEqual(['b', 'a']);

        vi.mocked(firestore.reorderSpaces).mockClear();
        await act(async () => { await result.current.moveSpace(result.current.activeSpaces[1], 1); });
        expect(firestore.reorderSpaces).not.toHaveBeenCalled();
    });

    it('이름 바꾸기는 입력창 값으로 저장하고, 취소하면 아무것도 하지 않는다', async () => {
        const { result } = await setup();

        mockConfirm.mockResolvedValueOnce(null);
        await act(async () => { await result.current.renameSpace(result.current.activeSpaces[0]); });
        expect(firestore.updateSpace).not.toHaveBeenCalled();

        mockConfirm.mockResolvedValueOnce('  1층 큰 상담실 ');
        await act(async () => { await result.current.renameSpace(result.current.activeSpaces[0]); });
        expect(firestore.updateSpace).toHaveBeenCalledWith('a', { name: '1층 큰 상담실' });
    });

    it('숨기기는 확인을 받아야 저장하고, 숨김 해제는 맨 아래 순서로 붙인다', async () => {
        const { result } = await setup();

        mockConfirm.mockResolvedValueOnce(false);
        await act(async () => { await result.current.archiveSpace(result.current.activeSpaces[1]); });
        expect(firestore.updateSpace).not.toHaveBeenCalled();

        mockConfirm.mockResolvedValueOnce(true);
        await act(async () => { await result.current.archiveSpace(result.current.activeSpaces[1]); });
        expect(firestore.updateSpace).toHaveBeenCalledWith('b', { archived: true });
        expect(result.current.archivedSpaces.map((s) => s.id).sort()).toEqual(['b', 'z']);

        await act(async () => { await result.current.restoreSpace(result.current.archivedSpaces.find((s) => s.id === 'z')!); });
        expect(firestore.updateSpace).toHaveBeenLastCalledWith('z', { archived: false, order: 1 });
    });

    it('건물·층: 순서 바꾸기는 같은 건물·층 안에서만 한다 (다른 층 공간은 건너뛴다)', async () => {
        vi.mocked(firestore.getBuildings).mockResolvedValue([building({})]);
        vi.mocked(firestore.getSpaces).mockResolvedValue([
            space({ id: 'a', name: '상담실', order: 0, buildingId: 'b1', floor: '1' }),
            space({ id: 'b', name: '사무실', order: 1, buildingId: 'b1', floor: '2' }),
            space({ id: 'c', name: '교육장', order: 2, buildingId: 'b1', floor: '1' }),
        ]);
        const { result } = await setup();

        await act(async () => { await result.current.moveSpace(result.current.activeSpaces[0], 1); });
        // a의 같은 층 이웃은 c다 — 2층 b는 건너뛴다
        expect(vi.mocked(firestore.reorderSpaces).mock.calls[0][0].map((x) => x.id)).toEqual(['c', 'b', 'a']);

        vi.mocked(firestore.reorderSpaces).mockClear();
        const b = result.current.activeSpaces.find((x) => x.id === 'b')!;
        await act(async () => { await result.current.moveSpace(b, 1); });
        expect(firestore.reorderSpaces).not.toHaveBeenCalled(); // 2층에는 b 하나뿐
    });

    it('고치기 창 저장은 이름과 위치를 한 번에 저장하고, 바뀐 게 없으면 저장하지 않는다', async () => {
        vi.mocked(firestore.getBuildings).mockResolvedValue([building({})]);
        const { result } = await setup();
        const a = result.current.activeSpaces[0];

        let ok = false;
        await act(async () => { ok = await result.current.saveSpaceDetails(a, a.name, { buildingId: a.buildingId ?? null, floor: a.floor ?? null }); });
        expect(ok).toBe(true);
        expect(firestore.updateSpace).not.toHaveBeenCalled();

        await act(async () => { ok = await result.current.saveSpaceDetails(a, ' 큰 상담실 ', { buildingId: 'b1', floor: '2' }); });
        expect(ok).toBe(true);
        // 두 번 나눠 쓰면 두 번째 저장이 옛 목록으로 이름을 되돌린다 — 한 번에 쓴다
        expect(firestore.updateSpace).toHaveBeenCalledTimes(1);
        expect(firestore.updateSpace).toHaveBeenCalledWith('a', { name: '큰 상담실', buildingId: 'b1', floor: '2', order: 2 });
        expect(result.current.activeSpaces.find((s) => s.id === 'a')).toMatchObject({ name: '큰 상담실', buildingId: 'b1', floor: '2' });
    });

    it('건물·층: 위치 바꾸기는 건물·층과 맨 뒤 순서를 저장하고, 건물을 비우면 층도 비운다', async () => {
        vi.mocked(firestore.getBuildings).mockResolvedValue([building({})]);
        const { result } = await setup();

        await act(async () => { await result.current.setSpaceLocation(result.current.activeSpaces[0], { buildingId: 'b1', floor: '2' }); });
        expect(firestore.updateSpace).toHaveBeenLastCalledWith('a', { buildingId: 'b1', floor: '2', order: 2 });

        const moved = result.current.activeSpaces.find((x) => x.id === 'a')!;
        await act(async () => { await result.current.setSpaceLocation(moved, { buildingId: null, floor: '2' }); });
        expect(firestore.updateSpace).toHaveBeenLastCalledWith('a', { buildingId: null, floor: null, order: 3 });
    });

    it('건물·층: 공간이 있는 층은 뺄 수 없고, 공간이 남은 건물은 숨길 수 없다', async () => {
        vi.mocked(firestore.getBuildings).mockResolvedValue([building({})]);
        vi.mocked(firestore.getSpaces).mockResolvedValue([
            space({ id: 'a', name: '상담실', order: 0, buildingId: 'b1', floor: '1' }),
        ]);
        const { result } = await setup();
        const b1 = result.current.activeBuildings[0];

        let ok = true;
        await act(async () => { ok = await result.current.editBuilding(b1, { name: '본관', address: '', floors: ['B1', '2'] }); });
        expect(ok).toBe(false);
        expect(firestore.updateBuilding).not.toHaveBeenCalled();
        expect(mockShowToast).toHaveBeenCalledWith(expect.stringMatching(/1층\(공간 1개\)/), 'warning');

        // 쓰지 않는 층(B1)은 뺄 수 있다
        await act(async () => { ok = await result.current.editBuilding(b1, { name: '본관', address: '', floors: ['1', '2'] }); });
        expect(ok).toBe(true);
        expect(firestore.updateBuilding).toHaveBeenCalledWith('b1', { name: '본관', address: '', floors: ['1', '2'] });

        await act(async () => { await result.current.archiveBuilding(result.current.activeBuildings[0]); });
        expect(mockConfirm).not.toHaveBeenCalled();
        expect(mockShowToast).toHaveBeenLastCalledWith(expect.stringMatching(/공간 1개가 있습니다/), 'warning');
    });

    it('건물 추가는 이름이 겹치면 저장하지 않는다', async () => {
        vi.mocked(firestore.getBuildings).mockResolvedValue([building({})]);
        vi.mocked(firestore.createBuilding).mockResolvedValue('b2');
        const { result } = await setup();

        let ok = true;
        await act(async () => { ok = await result.current.addBuilding({ name: ' 본관 ', address: '', floors: [] }); });
        expect(ok).toBe(false);
        expect(firestore.createBuilding).not.toHaveBeenCalled();

        await act(async () => { ok = await result.current.addBuilding({ name: '별관', address: '', floors: ['1'] }); });
        expect(ok).toBe(true);
        expect(firestore.createBuilding).toHaveBeenCalledWith('org-A', { name: '별관', address: '', floors: ['1'] }, 1);
        expect(result.current.activeBuildings.map((x) => x.name)).toEqual(['본관', '별관']);
    });

    it('여러 곳 담당 지정(2026-11-22) — 이미 지정된 곳은 건너뛰고 나머지를 한 번에 저장한다', async () => {
        const { result } = await setup();
        await act(async () => { await result.current.bulkAssign(['a', 'b'], 'u:u1'); });
        // a에는 이미 u1이 있다 → b만
        expect(firestore.updateSpacesBatch).toHaveBeenCalledWith([{ id: 'b', patch: { managerUids: ['u1'] } }]);
        expect(result.current.activeSpaces.find((s) => s.id === 'b')?.managerUids).toEqual(['u1']);
        expect(mockShowToast).toHaveBeenLastCalledWith(expect.stringMatching(/1곳에 담당.*이미 지정 1곳/), 'success');

        await act(async () => { await result.current.bulkAssign(['a', 'b'], 't:t1'); });
        expect(firestore.updateSpacesBatch).toHaveBeenLastCalledWith([
            { id: 'a', patch: { teamIds: ['t1'] } }, { id: 'b', patch: { teamIds: ['t1'] } },
        ]);
    });

    it('여러 곳 담당 지정이 실패하면 화면을 되돌린다', async () => {
        const { result } = await setup();
        vi.mocked(firestore.updateSpacesBatch).mockRejectedValueOnce(new Error('denied'));
        await act(async () => { await result.current.bulkAssign(['b'], 'u:u2'); });
        expect(result.current.activeSpaces.find((s) => s.id === 'b')?.managerUids).toEqual([]);
        expect(mockShowToast).toHaveBeenLastCalledWith(expect.stringMatching(/지정하지 못했습니다/), 'error');
    });

    it('여러 곳 옮기기·삭제 — 옮긴 곳 맨 아래 순서, 삭제는 확인을 받는다', async () => {
        vi.mocked(firestore.getBuildings).mockResolvedValue([building({})]);
        const { result } = await setup();
        await act(async () => { await result.current.bulkSetLocation(['a', 'b'], { buildingId: 'b1', floor: '2' }); });
        expect(firestore.updateSpacesBatch).toHaveBeenCalledWith([
            { id: 'a', patch: { buildingId: 'b1', floor: '2', order: 2 } },
            { id: 'b', patch: { buildingId: 'b1', floor: '2', order: 3 } },
        ]);

        vi.mocked(firestore.updateSpacesBatch).mockClear();
        mockConfirm.mockResolvedValueOnce(false);
        await act(async () => { await result.current.bulkArchive(['a', 'b']); });
        expect(firestore.updateSpacesBatch).not.toHaveBeenCalled();
        mockConfirm.mockResolvedValueOnce(true);
        await act(async () => { await result.current.bulkArchive(['a', 'b']); });
        expect(firestore.updateSpacesBatch).toHaveBeenCalledWith([{ id: 'a', patch: { archived: true } }, { id: 'b', patch: { archived: true } }]);
        expect(result.current.activeSpaces).toHaveLength(0);
    });

    it('여러 공간 한꺼번에 추가 — 빈 줄·겹친 이름·이미 있는 이름은 건너뛰고, 엑셀은 첫 칸만 쓴다', async () => {
        const { result } = await setup();
        vi.mocked(firestore.createSpacesBatch).mockResolvedValue(['n1', 'n2']);
        let added = 0;
        await act(async () => { added = await result.current.addSpaces('교육장\t비고\n\n 상담실2 \n교육장\n1층 상담실\n'); });
        expect(added).toBe(2);
        expect(firestore.createSpacesBatch).toHaveBeenCalledWith('org-A', ['교육장', '상담실2'], 2, { buildingId: null, floor: null });
        expect(result.current.activeSpaces.map((s) => s.name)).toEqual(expect.arrayContaining(['교육장', '상담실2']));
        expect(mockShowToast).toHaveBeenLastCalledWith(expect.stringMatching(/2곳을 추가.*2줄은 건너뜀/), 'warning');
    });

});

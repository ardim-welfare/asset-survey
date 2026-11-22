/**
 * 공간 관련 화면 — 공간 관리(관리자)·직원 홈의 내 담당 공간 (기획서 F03)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Space } from '../../types/space';
import type { Building } from '../../types/building';

const hookState: { value: Record<string, unknown> } = { value: {} };
vi.mock('../../hooks/useSpaceManager', () => ({ default: () => hookState.value }));
vi.mock('../../hooks/useAuth', () => ({
    useAuth: () => ({ user: { uid: 'u1' }, userData: { organizationId: 'org-A', name: '김직원' } }),
}));
vi.mock('../../lib/firestore', () => ({ getMySpaces: vi.fn(), getOpenSurvey: vi.fn(async () => null) }));

import * as firestore from '../../lib/firestore';
import SpaceManager from '../../components/admin/SpaceManager';
import EmployeeHome from '../../components/employee/EmployeeHome';

const space = (over: Partial<Space>): Space => ({
    id: 's1', organizationId: 'org-A', name: '공간', order: 0, managerUids: [], archived: false, buildingId: null, floor: null, ...over,
});

const baseHook = () => ({
    loading: false, loadError: '', busy: false, reload: vi.fn(),
    activeSpaces: [] as Space[], archivedSpaces: [] as Space[],
    members: [{ uid: 'u1', name: '김직원', role: 'employee' }, { uid: 'u2', name: '이관리', role: 'admin' }],
    nameOf: (uid: string) => (uid === 'u1' ? '김직원' : uid),
    addSpace: vi.fn().mockResolvedValue(true), renameSpace: vi.fn(), moveSpace: vi.fn(),
    addManager: vi.fn(), removeManager: vi.fn(), archiveSpace: vi.fn(), restoreSpace: vi.fn(),
    setSpaceLocation: vi.fn(),
    buildings: [] as Building[], activeBuildings: [] as Building[], archivedBuildings: [] as Building[],
    spacesIn: () => [],
    addBuilding: vi.fn().mockResolvedValue(true), editBuilding: vi.fn(), moveBuilding: vi.fn(),
    archiveBuilding: vi.fn(), restoreBuilding: vi.fn(),
});

describe('SpaceManager', () => {
    beforeEach(() => { hookState.value = baseHook(); });

    it('공간이 없으면 안내를 보이고, 이름을 적어 추가하면 입력칸을 비운다', async () => {
        render(<MemoryRouter><SpaceManager /></MemoryRouter>);
        expect(screen.getByText('아직 등록한 공간이 없습니다')).toBeInTheDocument();

        const input = screen.getByLabelText('새 공간 이름');
        fireEvent.change(input, { target: { value: '2층 사무실' } });
        fireEvent.click(screen.getByRole('button', { name: '공간 추가' }));

        await waitFor(() => expect(input).toHaveValue(''));
        expect(hookState.value.addSpace).toHaveBeenCalledWith('2층 사무실', { buildingId: null, floor: null });
    });

    it('공간마다 담당자를 보이고, 이미 담당인 사람은 후보에서 뺀다', () => {
        hookState.value = { ...baseHook(), activeSpaces: [space({ id: 'a', name: '1층 상담실', managerUids: ['u1'] })] };
        render(<MemoryRouter><SpaceManager /></MemoryRouter>);

        expect(screen.getByRole('heading', { name: '1층 상담실' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '김직원 담당자에서 빼기' })).toBeInTheDocument();

        const select = screen.getByLabelText('1층 상담실 담당자 지정');
        const options = Array.from(select.querySelectorAll('option')).map((o) => o.textContent);
        expect(options).toEqual(['+ 담당자 지정', '이관리 (관리자)']);

        fireEvent.change(select, { target: { value: 'u2' } });
        expect(hookState.value.addManager).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), 'u2');
    });

    it('맨 위 공간은 위로, 맨 아래 공간은 아래로 옮길 수 없다', () => {
        hookState.value = { ...baseHook(), activeSpaces: [space({ id: 'a', name: '가' }), space({ id: 'b', name: '나', order: 1 })] };
        render(<MemoryRouter><SpaceManager /></MemoryRouter>);
        expect(screen.getByRole('button', { name: '가 위로' })).toBeDisabled();
        expect(screen.getByRole('button', { name: '나 아래로' })).toBeDisabled();
        expect(screen.getByRole('button', { name: '가 아래로' })).toBeEnabled();
    });

    it('숨긴 공간은 펼쳐야 보이고 다시 꺼낼 수 있다', () => {
        hookState.value = { ...baseHook(), archivedSpaces: [space({ id: 'z', name: '옛 창고', archived: true })] };
        render(<MemoryRouter><SpaceManager /></MemoryRouter>);
        expect(screen.queryByText('옛 창고')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /숨긴 공간 1개/ }));
        fireEvent.click(screen.getByRole('button', { name: '다시 꺼내기' }));
        expect(hookState.value.restoreSpace).toHaveBeenCalledWith(expect.objectContaining({ id: 'z' }));
    });
});

describe('EmployeeHome — 내 담당 공간', () => {
    it('담당 공간 이름을 보이고, 누르면 그 공간의 재물 목록으로 간다', async () => {
        vi.mocked(firestore.getMySpaces).mockResolvedValueOnce([space({ id: 'a', name: '1층 상담실' })]);
        render(<MemoryRouter><EmployeeHome /></MemoryRouter>);
        expect(await screen.findByText('1층 상담실')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: '1층 상담실' })).toHaveAttribute('href', '/employee/assets?space=a');
        expect(firestore.getMySpaces).toHaveBeenCalledWith('org-A', 'u1');
    });

    it('진행 중인 조사가 있으면 스캔으로 가는 카드를 보인다', async () => {
        vi.mocked(firestore.getMySpaces).mockResolvedValueOnce([]);
        vi.mocked(firestore.getOpenSurvey).mockResolvedValueOnce({ id: 'sv1', name: '2026년 정기 재물조사', startDate: '2026-11-21', endDate: '2026-12-05' } as never);
        render(<MemoryRouter><EmployeeHome /></MemoryRouter>);
        expect(await screen.findByText('2026년 정기 재물조사')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /스캔하러 가기/ })).toHaveAttribute('href', '/employee/scan');
    });

    it('담당 공간이 없으면 안내를 보인다', async () => {
        vi.mocked(firestore.getMySpaces).mockResolvedValueOnce([]);
        render(<MemoryRouter><EmployeeHome /></MemoryRouter>);
        expect(await screen.findByText(/아직 담당 공간이 없습니다/)).toBeInTheDocument();
    });

    it('불러오기에 실패하면 알린다', async () => {
        vi.mocked(firestore.getMySpaces).mockRejectedValueOnce(new Error('denied'));
        render(<MemoryRouter><EmployeeHome /></MemoryRouter>);
        expect(await screen.findByText(/불러오지 못했습니다/)).toBeInTheDocument();
    });
});

describe('SpaceManager — 건물·층으로 묶어 보기 (2026-11-22)', () => {
    const bld = (over: Partial<Building>): Building => ({
        id: 'b1', organizationId: 'org-A', name: '본관', address: '', floors: ['1', '2'], order: 0, archived: false, ...over,
    });

    it('건물이 있으면 건물 → 층으로 묶고, 위·아래 버튼은 같은 층 안에서만 판단한다', () => {
        hookState.value = {
            ...baseHook(),
            activeBuildings: [bld({})],
            activeSpaces: [
                space({ id: 'a', name: '상담실', order: 0, buildingId: 'b1', floor: '1' }),
                space({ id: 'b', name: '사무실', order: 1, buildingId: 'b1', floor: '2' }),
                space({ id: 'c', name: '창고', order: 2 }),
            ],
        };
        render(<MemoryRouter><SpaceManager /></MemoryRouter>);
        expect(screen.getByRole('heading', { name: /본관/ })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: '1층' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: '2층' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /건물 미지정/ })).toBeInTheDocument();
        // 1층에 공간이 하나뿐이라 둘 다 막힌다
        expect(screen.getByRole('button', { name: '상담실 위로' })).toBeDisabled();
        expect(screen.getByRole('button', { name: '상담실 아래로' })).toBeDisabled();
        // 공간 추가 칸에 건물·층 고르기가 붙는다
        expect(screen.getByLabelText('건물')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '상담실 위치 바꾸기' })).toBeInTheDocument();
    });

    it('건물이 없으면 예전처럼 한 줄 목록이고 위치 버튼도 없다', () => {
        hookState.value = { ...baseHook(), activeSpaces: [space({ id: 'a', name: '상담실' })] };
        render(<MemoryRouter><SpaceManager /></MemoryRouter>);
        expect(screen.queryByLabelText('건물')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: '상담실 위치 바꾸기' })).not.toBeInTheDocument();
    });

    it('[건물·층] 탭에서 지하·지상 층수로 층을 채워 건물을 추가한다', async () => {
        render(<MemoryRouter><SpaceManager /></MemoryRouter>);
        fireEvent.click(screen.getByRole('tab', { name: /건물·층/ }));
        fireEvent.change(screen.getByLabelText(/건물 이름/), { target: { value: '별관' } });
        fireEvent.change(screen.getByLabelText('지하 층수'), { target: { value: '1' } });
        fireEvent.change(screen.getByLabelText('지상 층수'), { target: { value: '3' } });
        fireEvent.click(screen.getByRole('button', { name: '채우기' }));
        fireEvent.click(screen.getByRole('button', { name: '건물 추가' }));
        await waitFor(() => expect(hookState.value.addBuilding).toHaveBeenCalledWith({
            name: '별관', address: '', floors: ['B1', '1', '2', '3'],
        }));
    });
});

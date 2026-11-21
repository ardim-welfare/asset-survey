/**
 * 공간 관련 화면 — 공간 관리(관리자)·직원 홈의 내 담당 공간 (기획서 F03)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Space } from '../../types/space';

const hookState: { value: Record<string, unknown> } = { value: {} };
vi.mock('../../hooks/useSpaceManager', () => ({ default: () => hookState.value }));
vi.mock('../../hooks/useAuth', () => ({
    useAuth: () => ({ user: { uid: 'u1' }, userData: { organizationId: 'org-A', name: '김직원' } }),
}));
vi.mock('../../lib/firestore', () => ({ getMySpaces: vi.fn() }));

import * as firestore from '../../lib/firestore';
import SpaceManager from '../../components/admin/SpaceManager';
import EmployeeHome from '../../components/employee/EmployeeHome';

const space = (over: Partial<Space>): Space => ({
    id: 's1', organizationId: 'org-A', name: '공간', order: 0, managerUids: [], archived: false, ...over,
});

const baseHook = () => ({
    loading: false, loadError: '', busy: false, reload: vi.fn(),
    activeSpaces: [] as Space[], archivedSpaces: [] as Space[],
    members: [{ uid: 'u1', name: '김직원', role: 'employee' }, { uid: 'u2', name: '이관리', role: 'admin' }],
    nameOf: (uid: string) => (uid === 'u1' ? '김직원' : uid),
    addSpace: vi.fn().mockResolvedValue(true), renameSpace: vi.fn(), moveSpace: vi.fn(),
    addManager: vi.fn(), removeManager: vi.fn(), archiveSpace: vi.fn(), restoreSpace: vi.fn(),
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
        expect(hookState.value.addSpace).toHaveBeenCalledWith('2층 사무실');
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
    it('담당 공간 이름을 보인다', async () => {
        vi.mocked(firestore.getMySpaces).mockResolvedValueOnce([space({ id: 'a', name: '1층 상담실' })]);
        render(<EmployeeHome />);
        expect(await screen.findByText('1층 상담실')).toBeInTheDocument();
        expect(firestore.getMySpaces).toHaveBeenCalledWith('org-A', 'u1');
    });

    it('담당 공간이 없으면 안내를 보인다', async () => {
        vi.mocked(firestore.getMySpaces).mockResolvedValueOnce([]);
        render(<EmployeeHome />);
        expect(await screen.findByText(/아직 담당 공간이 없습니다/)).toBeInTheDocument();
    });

    it('불러오기에 실패하면 알린다', async () => {
        vi.mocked(firestore.getMySpaces).mockRejectedValueOnce(new Error('denied'));
        render(<EmployeeHome />);
        expect(await screen.findByText(/불러오지 못했습니다/)).toBeInTheDocument();
    });
});

/**
 * EmployeeListItem — 휴대폰에서도 쓰기 쉬운 직원 한 줄 (2026-11-22)
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EmployeeListItem from '../../components/admin/EmployeeListItem';
import type { UnifiedMember, User } from '../../types';

const teams = [{ id: 't1', organizationId: 'o', name: '행정팀', order: 0, archived: false }];
const base = {
    editingId: null, editForm: { name: '', email: '' }, setEditForm: vi.fn(), onEdit: vi.fn(), onSaveEdit: vi.fn(), onCancelEdit: vi.fn(),
    onDelete: vi.fn(), onChangeRole: vi.fn(), onChangeTeam: vi.fn(), onChangePendingTeam: vi.fn(),
    onDeletePreRegistered: vi.fn(), onRestore: vi.fn(), onDeletePermanently: vi.fn(), teams,
};
const member = (over: Partial<UnifiedMember>): UnifiedMember => ({
    id: 'u2', name: '김직원', email: 'k@x.org', role: 'employee', memberStatus: 'active', original: { id: 'u2', teamId: null } as unknown as User, ...over,
});

describe('EmployeeListItem', () => {
    it('팀·역할은 이름표가 붙은 고르기 칸, 할 일은 글자 버튼이다', () => {
        render(<EmployeeListItem {...base} member={member({})} selfUid="u1" />);
        expect(screen.getByLabelText('팀')).toBeInTheDocument();
        expect(screen.getByLabelText('역할')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '이름 고치기' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '비활성화' })).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('팀'), { target: { value: 't1' } });
        expect(base.onChangeTeam).toHaveBeenCalledWith(expect.objectContaining({ id: 'u2' }), 't1');
    });

    it('내 계정 줄에는 역할·비활성화가 없고 이유를 적는다', () => {
        render(<EmployeeListItem {...base} member={member({ id: 'u1' })} selfUid="u1" />);
        expect(screen.queryByLabelText('역할')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: '비활성화' })).not.toBeInTheDocument();
        expect(screen.getByText(/다른 관리자가 바꿀 수 있어요/)).toBeInTheDocument();
    });

    it('가입 대기 직원도 팀을 바꿀 수 있고, 등록 취소 버튼에 누구인지 이름이 있다', () => {
        render(<EmployeeListItem {...base} member={member({ memberStatus: 'pending', id: 'p1' })} selfUid="u1" />);
        fireEvent.change(screen.getByLabelText('팀'), { target: { value: 't1' } });
        expect(base.onChangePendingTeam).toHaveBeenCalledWith('p1', 't1');
        expect(screen.getByRole('button', { name: '김직원 사전 등록 취소' })).toBeInTheDocument();
    });

    it('비활성 직원은 다시 활성화·영구 삭제를 글자로 구별한다', () => {
        render(<EmployeeListItem {...base} member={member({ memberStatus: 'disabled' })} selfUid="u1" />);
        expect(screen.getByRole('button', { name: '다시 활성화' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /영구 삭제/ })).toBeInTheDocument();
    });
});

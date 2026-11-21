import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('../../hooks/useAuth', () => ({
    useAuth: () => ({
        userData: { organizationId: 'org-1', role: 'admin', name: 'Admin' },
    }),
}));

const mockShowToast = vi.fn();
vi.mock('../../hooks/useToast', () => ({
    useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('../../hooks/useConfirm', () => ({
    useConfirm: () => ({ confirm: vi.fn().mockResolvedValue(true) }),
}));

vi.mock('../../lib/firestore', () => ({
    getOrganization: vi.fn().mockResolvedValue({
        name: '테스트 기관',
        adminEmail: 'admin@test.com',
        address: '서울',
        phone: '010-0000-0000',
        approvalLine: [{ title: '담당' }, { title: '팀장' }],
        inviteCode: 'ABC123',
    }),
    updateOrganization: vi.fn().mockResolvedValue(undefined),
    regenerateInviteCode: vi.fn().mockResolvedValue('NEW_CODE'),
}));

vi.mock('../../lib/dateUtils', () => ({
    formatDateKr: vi.fn((d: string) => d),
}));

vi.mock('../../hooks/useOrgApplication', () => ({
    formatPhoneNumber: vi.fn((v: string) => v),
}));

import useSettings from '../../hooks/useSettings';
import { updateOrganization } from '../../lib/firestore';

describe('useSettings', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('초기 로딩 후 데이터를 로드한다', async () => {
        const { result } = renderHook(() => useSettings());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.form.name).toBe('테스트 기관');
        expect(result.current.form.adminEmail).toBe('admin@test.com');
    });

    it('orgId가 존재한다', async () => {
        const { result } = renderHook(() => useSettings());

        expect(result.current.orgId).toBe('org-1');

        // 마운트 시 비동기 기관 로드가 act 밖에서 반영되지 않도록 정착 대기
        await waitFor(() => expect(result.current.loading).toBe(false));
    });

    it('핸들러가 함수로 존재한다', async () => {
        const { result } = renderHook(() => useSettings());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(typeof result.current.handleSave).toBe('function');
        expect(typeof result.current.handleRegenCode).toBe('function');
        expect(typeof result.current.handlePhoneChange).toBe('function');
        expect(typeof result.current.handleWithdraw).toBe('function');
    });

    it('formatDate 함수가 존재한다', async () => {
        const { result } = renderHook(() => useSettings());

        expect(typeof result.current.formatDate).toBe('function');

        await waitFor(() => expect(result.current.loading).toBe(false));
    });

    it('부분 저장(patch)은 바뀐 필드만 보내고 로컬 상태에 합친다', async () => {
        const { result } = renderHook(() => useSettings());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        await act(async () => {
            await result.current.handleSave(null, { hideApprovalLine: true });
        });

        expect(vi.mocked(updateOrganization)).toHaveBeenCalledWith('org-1', { hideApprovalLine: true });
        expect(result.current.form.hideApprovalLine).toBe(true);
    });

    it('토글 저장이 실패하면 낙관적 반영을 이전 값으로 되돌린다', async () => {
        vi.mocked(updateOrganization).mockRejectedValueOnce(new Error('network'));
        const { result } = renderHook(() => useSettings());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.form.hideApprovalLine).toBe(false);

        await act(async () => {
            await result.current.handleSave(null, { hideApprovalLine: true });
        });

        // 저장 실패 → 이전 값(false)으로 롤백 + 에러 토스트
        expect(result.current.form.hideApprovalLine).toBe(false);
        expect(mockShowToast).toHaveBeenCalledWith('저장에 실패했습니다.', 'error');
    });
});


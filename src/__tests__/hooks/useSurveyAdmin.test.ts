/**
 * useSurveyAdmin — 관리자 조사 회차 시작 (기획서 F10)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ userData: { organizationId: 'org-A', role: 'admin' } }) }));
const confirm = vi.fn();
const showToast = vi.fn();
vi.mock('../../hooks/useConfirm', () => ({ useConfirm: () => ({ confirm }) }));
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ showToast }) }));
vi.mock('../../lib/firestore', async () => {
    const real = await vi.importActual<typeof import('../../lib/firestore/surveys')>('../../lib/firestore/surveys');
    return {
        getSurveys: vi.fn(), getSurveyTargets: vi.fn(), getScans: vi.fn(), getSpaces: vi.fn(), getAssets: vi.fn(),
        getOrganization: vi.fn(), startSurvey: vi.fn(), groupTargets: real.groupTargets,
    };
});
vi.mock('../../lib/firebase', () => ({ db: {}, auth: { currentUser: null } }));

import * as fs from '../../lib/firestore';
import useSurveyAdmin, { defaultStartForm, validateStartForm } from '../../hooks/useSurveyAdmin';

const space = (id: string, archived = false) => ({ id, organizationId: 'org-A', name: id, order: 0, managerUids: [], archived });
const asset = (id: string, spaceId: string | null, status = 'active') => ({ id, code: id, name: null, tagId: null, spaceId, status });

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.getSurveys).mockResolvedValue([]);
    vi.mocked(fs.getSpaces).mockResolvedValue([space('sp-1'), space('sp-2'), space('old', true)] as never);
    vi.mocked(fs.getOrganization).mockResolvedValue({ id: 'org-A', surveyMode: 'solo' } as never);
    vi.mocked(fs.getAssets).mockResolvedValue([asset('a', 'sp-1'), asset('b', 'sp-2'), asset('c', null), asset('d', 'sp-1', 'disposed')] as never);
    vi.mocked(fs.startSurvey).mockResolvedValue('sv1');
});

describe('양식', () => {
    it('기본값 — 올해 정기 재물조사, 2주, 숨기지 않은 공간 전부, 미지정 포함', () => {
        const f = defaultStartForm([space('sp-1'), space('old', true)] as never, new Date(2026, 10, 21));
        expect(f).toEqual({ name: '2026년 정기 재물조사', startDate: '2026-11-21', endDate: '2026-12-05', spaceIds: ['sp-1'], includesUnassigned: true });
    });
    it('검사', () => {
        const ok = defaultStartForm([space('sp-1')] as never, new Date(2026, 10, 21));
        expect(validateStartForm(ok)).toBeNull();
        expect(validateStartForm({ ...ok, name: ' ' })).toMatch(/이름/);
        expect(validateStartForm({ ...ok, endDate: '2026-11-01' })).toMatch(/빠릅니다/);
        expect(validateStartForm({ ...ok, spaceIds: [], includesUnassigned: false })).toMatch(/공간/);
    });
});

describe('useSurveyAdmin', () => {
    it('대상 수를 미리 보여 주고, 확인하면 기관 조사 방식으로 시작한다', async () => {
        const { result } = renderHook(() => useSurveyAdmin());
        await waitFor(() => expect(result.current.loading).toBe(false));
        await act(async () => { await result.current.openForm(); });
        expect(result.current.preview).toMatchObject({ total: 3, unassigned: 1 });

        confirm.mockResolvedValueOnce(true);
        await act(async () => { await result.current.start(); });
        expect(fs.startSurvey).toHaveBeenCalledWith(expect.objectContaining({
            orgId: 'org-A', spaceIds: ['sp-1', 'sp-2'], includesUnassigned: true, mode: 'solo',
        }));
        expect(result.current.form).toBeNull();
    });

    it('진행 중 회차가 있으면 새로 시작하지 않는다', async () => {
        vi.mocked(fs.getSurveys).mockResolvedValue([{ id: 'sv0', status: 'open', organizationId: 'org-A' }] as never);
        vi.mocked(fs.getSurveyTargets).mockResolvedValue([]);
        vi.mocked(fs.getScans).mockResolvedValue([]);
        const { result } = renderHook(() => useSurveyAdmin());
        await waitFor(() => expect(result.current.loading).toBe(false));
        await act(async () => { await result.current.openForm(); });
        await act(async () => { await result.current.start(); });
        expect(fs.startSurvey).not.toHaveBeenCalled();
        expect(showToast).toHaveBeenCalledWith('이미 진행 중인 조사가 있습니다.', 'error');
    });
});

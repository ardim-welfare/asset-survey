/**
 * useLabelPrint — QR 라벨 인쇄 흐름 (기획서 F09)
 *
 * 고정하는 계약:
 *   - [인쇄]는 태그 발급 → QR(서비스주소/t/태그) → 인쇄 항목 순서로 간다
 *   - 고른 규격은 기관 기본으로 기억하고, 같으면 다시 쓰지 않는다
 *   - 태그 발급이 실패하면 인쇄하지 않고 목록을 새로 읽게 한다
 *   - 직접 치수가 틀리면 인쇄를 막는다
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Asset } from '../../types/asset';

vi.mock('../../lib/firestore', () => ({
    getOrganization: vi.fn(), updateOrganization: vi.fn(), issueTags: vi.fn(),
}));
const toString = vi.fn(async (text: string) => `<svg>${text}</svg>`);
vi.mock('qrcode', () => ({ default: { toString: (text: string) => toString(text) } }));
vi.mock('../../lib/constants', () => ({ APP_URL: 'https://app.example' }));

import * as firestore from '../../lib/firestore';
import useLabelPrint from '../../hooks/useLabelPrint';

const asset = (code: string, tagId: string | null = null) => ({ id: `org-A__${code}`, code, name: `품명${code}`, tagId }) as Asset;

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(firestore.getOrganization).mockResolvedValue({ id: 'org-A', name: '행복복지관' } as never);
    vi.mocked(firestore.updateOrganization).mockResolvedValue(undefined);
    vi.mocked(firestore.issueTags).mockImplementation(async (list) =>
        new Map(list.map((a, i) => [a.id, a.tagId ?? `NEWTAG000${i}`])));
});

describe('useLabelPrint', () => {
    it('태그를 발급하고 서비스 주소 QR로 인쇄 항목을 만든 뒤 규격을 기관 기본으로 기억한다', async () => {
        const onTags = vi.fn();
        const assets = [asset('1', 'ABCDEFGH23'), asset('2')];
        const { result } = renderHook(() => useLabelPrint(assets, { orgId: 'org-A', onTags }));
        await waitFor(() => expect(result.current.orgName).toBe('행복복지관'));

        act(() => result.current.setSize('small'));
        await act(async () => { await result.current.prepare(); });

        expect(firestore.issueTags).toHaveBeenCalledWith(assets, expect.any(Function));
        expect(onTags).toHaveBeenCalled();
        expect(toString).toHaveBeenCalledWith('https://app.example/t/ABCDEFGH23');
        expect(toString).toHaveBeenCalledWith('https://app.example/t/NEWTAG0001');
        expect(result.current.items?.map((i) => i.code)).toEqual(['1', '2']);
        expect(result.current.items?.[0].qr).toMatch(/^data:image\/svg\+xml/);
        expect(result.current.pages).toHaveLength(1);
        expect(firestore.updateOrganization).toHaveBeenCalledWith('org-A', { labelSize: 'small' });

        act(() => result.current.finish());
        expect(result.current.items).toBeNull();
    });

    it('기관에 저장된 규격으로 열리고, 같은 규격이면 다시 저장하지 않는다', async () => {
        vi.mocked(firestore.getOrganization).mockResolvedValue({ id: 'org-A', name: '기관', labelSize: 'large' } as never);
        const { result } = renderHook(() => useLabelPrint([asset('1')], { orgId: 'org-A' }));
        await waitFor(() => expect(result.current.size).toBe('large'));
        await act(async () => { await result.current.prepare(); });
        expect(firestore.updateOrganization).not.toHaveBeenCalled();
    });

    it('태그 발급이 실패하면 인쇄하지 않고 목록을 새로 읽게 한다', async () => {
        vi.mocked(firestore.issueTags).mockRejectedValueOnce(new Error('denied'));
        const onReloadNeeded = vi.fn();
        const { result } = renderHook(() => useLabelPrint([asset('1')], { orgId: 'org-A', onReloadNeeded }));
        await act(async () => { await result.current.prepare(); });
        expect(result.current.items).toBeNull();
        expect(result.current.error).toMatch(/다시 인쇄/);
        expect(onReloadNeeded).toHaveBeenCalled();
    });

    it('직접 치수가 틀리면 인쇄를 막는다', async () => {
        const { result } = renderHook(() => useLabelPrint([asset('1')], { orgId: 'org-A' }));
        act(() => {
            result.current.setSize('custom');
            result.current.setCustom({ ...result.current.custom, cols: 9 });
        });
        expect(result.current.customError).toMatch(/A4 가로/);
        await act(async () => { await result.current.prepare(); });
        expect(firestore.issueTags).not.toHaveBeenCalled();
    });

    it('재단선 표시는 이 기기에 기억한다', () => {
        const { result } = renderHook(() => useLabelPrint([], { orgId: null }));
        expect(result.current.cutLines).toBe(true);
        act(() => result.current.setCutLines(false));
        expect(localStorage.getItem('labelCutLines')).toBe('off');
    });
});

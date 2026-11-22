/**
 * TagRedirect — 라벨 QR로 열면 재물 화면으로 잇고, '마지막 확인'을 남긴다 (상시 확인 기록, 2026-11-22)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ userData: { organizationId: 'org-A', role: 'employee' } }) }));
vi.mock('../../lib/firestore', () => ({ findAssetByTag: vi.fn(), recordAssetCheck: vi.fn() }));
vi.mock('../../lib/pendingTag', () => ({ clearPendingTag: vi.fn() }));

import * as firestore from '../../lib/firestore';
import TagRedirect from '../../components/common/TagRedirect';

function Detail() {
    const state = useLocation().state as { justChecked?: boolean } | null;
    return <p>DETAIL {state?.justChecked ? 'checked' : ''}</p>;
}

const renderAt = (tag: string) => render(
    <MemoryRouter initialEntries={[`/t/${tag}`]}>
        <Routes>
            <Route path="/t/:tagId" element={<TagRedirect />} />
            <Route path="/employee/assets/:id" element={<Detail />} />
        </Routes>
    </MemoryRouter>,
);

describe('TagRedirect', () => {
    beforeEach(() => vi.clearAllMocks());

    it('찾은 재물은 QR 확인을 남기고 상세로 보낸다(방금 확인 표시)', async () => {
        vi.mocked(firestore.findAssetByTag).mockResolvedValue({ id: 'org-A__1' } as never);
        renderAt('ABCDEFGH23');
        expect(await screen.findByText('DETAIL checked')).toBeInTheDocument();
        expect(firestore.recordAssetCheck).toHaveBeenCalledWith({ orgId: 'org-A', assetId: 'org-A__1', via: 'qr' });
    });

    it('없는 라벨은 확인을 남기지 않는다', async () => {
        vi.mocked(firestore.findAssetByTag).mockResolvedValue(null);
        renderAt('ABCDEFGH23');
        expect(await screen.findByText('이 기관에 없는 라벨입니다')).toBeInTheDocument();
        expect(firestore.recordAssetCheck).not.toHaveBeenCalled();
    });
});

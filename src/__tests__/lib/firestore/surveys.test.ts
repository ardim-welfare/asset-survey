/**
 * firestore/surveys — 회차 시작(대상 고정)·스캔 저장 (기획서 F10~F12)
 *
 * 고정하는 계약:
 *   - 대상은 운영 재물만, 고른 공간(+미지정)만 공간별 묶음으로 회차와 한 배치에 쓴다
 *   - 스캔은 회차+재물 문서 ID로, 기다리지 않고 저장하며 거절되면 알린다
 *   - 조회·구독은 organizationId로 거른다
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const ops: Array<{ kind: string; path: string; data: Record<string, unknown> }> = [];
vi.mock('firebase/firestore', () => ({
    collection: vi.fn((_db: unknown, path: string) => ({ path, withConverter() { return this; } })),
    doc: vi.fn((first: { path?: string }, path?: string, id?: string) => {
        if (path === undefined) return { path: `${first.path}/auto`, id: 'auto' };
        return { path: `${path}/${id}`, id, withConverter() { return this; } };
    }),
    query: vi.fn((...a: unknown[]) => a),
    where: vi.fn((f: string, op: string, v: unknown) => ({ f, op, v })),
    orderBy: vi.fn(), limit: vi.fn(),
    getDoc: vi.fn(), getDocs: vi.fn(),
    onSnapshot: vi.fn(() => () => { }),
    writeBatch: vi.fn(() => ({
        set: (ref: { path: string }, data: Record<string, unknown>) => ops.push({ kind: 'set', path: ref.path, data }),
        commit: vi.fn().mockResolvedValue(undefined),
    })),
    setDoc: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(),
    serverTimestamp: vi.fn(() => '__ts__'),
}));
vi.mock('../../../lib/firebase', () => ({ db: {}, auth: { currentUser: { uid: 'u1' } } }));
vi.mock('../../../lib/sentry', () => ({ captureError: vi.fn() }));

import * as fs from 'firebase/firestore';
import { groupTargets, startSurvey, saveScan, peekScan, subscribeSpaceScans } from '../../../lib/firestore/surveys';
import type { Asset } from '../../../types/asset';

const asset = (id: string, over: Partial<Asset> = {}): Asset => ({
    id, organizationId: 'org-A', code: id, name: 'TV', category: null, spec: null, acquiredAt: null, acquiredQuantity: null,
    quantity: 1, status: 'active', statusRaw: null, locationRaw: null, spaceId: 'sp-1', department: null, usage: null,
    missingFromSource: false, lastImportId: null, tagId: null, ...over,
});
const ASSETS = [
    asset('a1'), asset('a2', { spaceId: 'sp-2' }), asset('a3', { spaceId: null, tagId: 'AAAAAAAAA3' }),
    asset('a4', { status: 'disposed' }), asset('a5', { spaceId: 'sp-hidden' }),
];

beforeEach(() => { vi.clearAllMocks(); ops.length = 0; });

describe('groupTargets', () => {
    it('운영 재물만, 고른 공간만, 미지정은 넣을 때만', () => {
        const g = groupTargets(ASSETS, ['sp-1', 'sp-2'], true);
        expect([...g.entries()].map(([k, v]) => [k, v.map((i) => i.id)])).toEqual([['sp-1', ['a1']], ['sp-2', ['a2']], ['_none', ['a3']]]);
        expect(g.get('_none')?.[0]).toEqual({ id: 'a3', code: 'a3', name: 'TV', tagId: 'AAAAAAAAA3' });
        expect(groupTargets(ASSETS, ['sp-1'], false).has('_none')).toBe(false);
    });
});

describe('startSurvey', () => {
    it('회차와 공간별 대상 묶음을 한 배치로 쓴다', async () => {
        const id = await startSurvey({
            orgId: 'org-A', name: ' 2026 조사 ', startDate: '2026-11-21', endDate: '2026-12-05',
            spaceIds: ['sp-1', 'sp-2'], includesUnassigned: false, mode: 'delegated', assets: ASSETS,
        });
        expect(id).toBe('auto');
        expect(ops.map((o) => o.path)).toEqual(['surveys/auto', 'surveyTargets/auto__sp-1', 'surveyTargets/auto__sp-2']);
        expect(ops[0].data).toMatchObject({ name: '2026 조사', status: 'open', targetCount: 2, mode: 'delegated', lastEditedByUid: 'u1' });
        expect(ops[1].data).toMatchObject({ surveyId: 'auto', spaceId: 'sp-1', organizationId: 'org-A' });
    });
});

describe('saveScan', () => {
    it('회차+재물 ID로 쓰고 기다리지 않으며, 거절되면 알린다', async () => {
        let reject!: (e: unknown) => void;
        vi.mocked(fs.setDoc).mockReturnValue(new Promise((_, r) => { reject = r; }));
        const onRejected = vi.fn();
        saveScan({
            orgId: 'org-A', surveyId: 'sv1', spaceId: 'sp-1', method: 'manual', onRejected,
            draft: { scanId: 'sv1__a1', assetId: 'a1', code: 'a1', name: 'TV', expectedSpaceId: 'sp-1', result: 'ok' },
        });
        const [ref, data] = vi.mocked(fs.setDoc).mock.calls[0] as unknown as [{ path: string }, Record<string, unknown>];
        expect(ref.path).toBe('scans/sv1__a1');
        expect(data).toMatchObject({
            organizationId: 'org-A', surveyId: 'sv1', spaceId: 'sp-1', method: 'manual', result: 'ok', condition: 'normal', memo: '',
            scannedByUid: 'u1', lastEditedByUid: 'u1', scannedAt: '__ts__', updatedAt: '__ts__',
        });
        reject(new Error('permission-denied'));
        await new Promise((r) => setTimeout(r, 0));
        expect(onRejected).toHaveBeenCalled();
    });
});

describe('조회', () => {
    it('peekScan — 있으면 문서, 없으면 null, 확인 못 하면 undefined', async () => {
        vi.mocked(fs.getDoc).mockResolvedValueOnce({ exists: () => false } as never);
        expect(await peekScan('x')).toBeNull();
        vi.mocked(fs.getDoc).mockRejectedValueOnce(new Error('offline'));
        expect(await peekScan('x')).toBeUndefined();
    });
    it('subscribeSpaceScans — 이 공간에서 찍은 것과 이 공간 대상 두 갈래를 기관으로 걸러 구독', () => {
        const stop = subscribeSpaceScans('org-A', 'sv1', 'sp-1', vi.fn());
        expect(fs.onSnapshot).toHaveBeenCalledTimes(2);
        expect(vi.mocked(fs.where).mock.calls.filter((c) => c[0] === 'organizationId')).toHaveLength(2);
        expect(fs.where).toHaveBeenCalledWith('spaceId', '==', 'sp-1');
        expect(fs.where).toHaveBeenCalledWith('expectedSpaceId', '==', 'sp-1');
        stop();
    });
});

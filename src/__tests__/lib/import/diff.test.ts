/**
 * 가져오기 비교 (기획서 F07) — 신규·바뀜·사라짐·그대로
 */
import { describe, it, expect } from 'vitest';
import { assetDocId, diffAssets, toDraft, countByLocation, NO_LOCATION_KEY } from '../../../lib/import/diff';
import type { ParsedAsset } from '../../../lib/import/parseSheet';
import type { Asset, AssetAccounting } from '../../../types/asset';

const row = (over: Partial<ParsedAsset>): ParsedAsset => ({
    rowNumber: 4, code: '1-1-1', name: 'TV', category: '비품', spec: null, acquiredAt: '2021-03-13',
    acquiredQuantity: 1, quantity: 1, status: 'active', statusRaw: '운영', location: '101호',
    department: '지원팀', usage: null, amount: 450000, depreciation: 449000, residual: 1000, ...over,
});

const ORG = 'org-A';
const MAP = { '101호': 'sp1' };

function existingFrom(r: ParsedAsset, over: Partial<Asset> = {}): Asset {
    const d = toDraft(ORG, r, MAP);
    return { id: d.id, organizationId: ORG, ...d.fields, missingFromSource: false, lastImportId: 'old', tagId: null, ...over } as Asset;
}
function accFrom(r: ParsedAsset): [string, AssetAccounting] {
    const id = assetDocId(ORG, r.code);
    return [id, { id, organizationId: ORG, amount: r.amount, depreciation: r.depreciation, residual: r.residual }];
}

describe('assetDocId', () => {
    it('기관ID__코드 꼴이고, 경로를 깨는 글자는 인코딩한다', () => {
        expect(assetDocId(ORG, '1-1-1')).toBe('org-A__1-1-1');
        expect(assetDocId(ORG, 'A/1 2')).toBe('org-A__A%2F1%202');
    });
});

describe('diffAssets', () => {
    it('처음 가져오면 전부 신규, 위치는 연결한 공간으로', () => {
        const d = diffAssets(ORG, [row({}), row({ code: '2', location: null })], MAP, [], new Map());
        expect(d.added.map((a) => [a.id, a.fields.spaceId])).toEqual([['org-A__1-1-1', 'sp1'], ['org-A__2', null]]);
        expect(d.changed).toEqual([]);
        expect(d.unchanged).toBe(0);
    });

    it('같은 내용은 그대로, 바뀐 필드만 전·후 값으로 남긴다', () => {
        const same = row({});
        const before = row({ code: '2', name: '책상' });
        const after = row({ code: '2', name: '큰 책상', status: 'inactive', statusRaw: '불용' });
        const d = diffAssets(ORG, [same, after], MAP, [existingFrom(same), existingFrom(before)],
            new Map([accFrom(same), accFrom(before)]));

        expect(d.unchanged).toBe(1);
        expect(d.changed).toHaveLength(1);
        expect(d.changed[0].changes).toEqual({
            name: { before: '책상', after: '큰 책상' },
            status: { before: 'active', after: 'inactive' },
            statusRaw: { before: '운영', after: '불용' },
        });
        expect(d.changed[0].assetChanged).toBe(true);
        expect(d.changed[0].accountingChanged).toBe(false);
    });

    it('금액만 바뀌면 금액 문서만 바뀐 것으로 본다', () => {
        const r = row({});
        const d = diffAssets(ORG, [row({ amount: 500000 })], MAP, [existingFrom(r)], new Map([accFrom(r)]));
        expect(d.changed[0].changes).toEqual({ amount: { before: 450000, after: 500000 } });
        expect(d.changed[0].assetChanged).toBe(false);
        expect(d.changed[0].accountingChanged).toBe(true);
    });

    it('금액 문서가 없던 재물은 빈 칸끼리 같다고 본다', () => {
        const r = row({ amount: null, depreciation: null, residual: null });
        const d = diffAssets(ORG, [r], MAP, [existingFrom(r)], new Map());
        expect(d.unchanged).toBe(1);
    });

    it('위치 연결을 바꾸면 공간이 바뀐 것으로 본다', () => {
        const r = row({});
        const d = diffAssets(ORG, [r], { '101호': 'sp2' }, [existingFrom(r)], new Map([accFrom(r)]));
        expect(d.changed[0].changes).toEqual({ spaceId: { before: 'sp1', after: 'sp2' } });
    });

    it('파일에 없는 재물은 지우지 않고 사라짐 목록에, 이미 표시된 것은 다시 넣지 않는다', () => {
        const kept = row({});
        const gone = row({ code: 'gone' });
        const alreadyGone = row({ code: 'old-gone' });
        const d = diffAssets(ORG, [kept], MAP,
            [existingFrom(kept), existingFrom(gone), existingFrom(alreadyGone, { missingFromSource: true })],
            new Map([accFrom(kept)]));
        expect(d.missing.map((a) => a.code)).toEqual(['gone']);

        // 앱에서 직접 등록한 재물은 대장에 없어도 '대장에 없음'이 아니다 (2026-11-22)
        const manual = diffAssets(ORG, [kept], MAP, [existingFrom(kept), existingFrom(gone, { manual: true })], new Map([accFrom(kept)]));
        expect(manual.missing).toEqual([]);
    });

    it('다시 나타난 재물은 표시를 거둔다(바뀜)', () => {
        const r = row({});
        const d = diffAssets(ORG, [r], MAP, [existingFrom(r, { missingFromSource: true })], new Map([accFrom(r)]));
        expect(d.changed[0].changes).toEqual({ missingFromSource: { before: true, after: false } });
    });
});

describe('countByLocation', () => {
    it('위치별 건수를 많은 순으로, 빈 위치도 한 묶음으로', () => {
        expect(countByLocation([row({}), row({ code: '2' }), row({ code: '3', location: null })])).toEqual([
            { key: '101호', location: '101호', count: 2 },
            { key: NO_LOCATION_KEY, location: null, count: 1 },
        ]);
    });
});

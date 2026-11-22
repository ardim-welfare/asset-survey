import { describe, it, expect } from 'vitest';
import { floorVariants, spaceAliases, matchSpaceByLocation, parseLocation } from '../../lib/import/locationMatch';
import type { Building } from '../../types/building';
import type { Space } from '../../types/space';

const bld = (over: Partial<Building>): Building => ({
    id: 'b1', organizationId: 'o', name: '본관', address: '', floors: ['B1', '1', '2', '3'], order: 0, archived: false, ...over,
});
const sp = (over: Partial<Space>): Space => ({
    id: 's', organizationId: 'o', name: '상담실', order: 0, managerUids: [], teamIds: [], archived: false, buildingId: 'b1', floor: '2', ...over,
});
const BUILDINGS = [bld({}), bld({ id: 'b2', name: '별관', floors: ['1', '2'] })];

describe('floorVariants', () => {
    it('숫자 층과 지하 층의 여러 표기를 만든다', () => {
        expect(floorVariants('2')).toEqual(expect.arrayContaining(['2', '2층', '2f']));
        expect(floorVariants('B1')).toEqual(expect.arrayContaining(['b1', 'b1층', '지하1층', '지하1']));
        expect(floorVariants('옥상')).toEqual(['옥상']);
    });
});

describe('공간 자동 맞추기', () => {
    it('건물·층을 붙여 부른 위치를 그 공간으로 맞춘다(띄어쓰기·대소문자 무시)', () => {
        const s = sp({});
        expect(spaceAliases(s, BUILDINGS)).toEqual(expect.arrayContaining(['상담실', '본관상담실', '본관2층상담실', '본관2f상담실', '2층상담실']));
        expect(matchSpaceByLocation('본관 2층 상담실', [s], BUILDINGS)?.id).toBe('s');
        expect(matchSpaceByLocation('본관2F 상담실', [s], BUILDINGS)?.id).toBe('s');
        expect(matchSpaceByLocation('별관 2층 상담실', [s], BUILDINGS)).toBeNull();
    });

    it('두 공간 이상에 맞으면 고르지 않는다(사람이 고르게)', () => {
        const a = sp({ id: 'a', name: '상담실', buildingId: 'b1', floor: '2' });
        const b = sp({ id: 'b', name: '2층상담실', buildingId: null, floor: null });
        expect(matchSpaceByLocation('2층 상담실', [a, b], BUILDINGS)).toBeNull();
    });
});

describe('parseLocation', () => {
    it('건물·층을 떼고 남은 이름을 돌려준다', () => {
        expect(parseLocation('본관 2층 상담실', BUILDINGS)).toEqual({ buildingId: 'b1', floor: '2', name: '상담실' });
        expect(parseLocation('본관 지하1층 창고', BUILDINGS)).toEqual({ buildingId: 'b1', floor: 'B1', name: '창고' });
        expect(parseLocation('별관3층 교육장', BUILDINGS)).toEqual({ buildingId: 'b2', floor: null, name: '3층 교육장' });
    });

    it('건물이 없으면 층도 정하지 않고, 층 뒤에 숫자가 이어지면 층으로 보지 않는다', () => {
        expect(parseLocation('2층 사무실', BUILDINGS)).toEqual({ buildingId: null, floor: null, name: '2층 사무실' });
        expect(parseLocation('본관 101호', BUILDINGS)).toEqual({ buildingId: 'b1', floor: null, name: '101호' });
        expect(parseLocation('본관', BUILDINGS)).toEqual({ buildingId: 'b1', floor: null, name: '본관' });
    });
});

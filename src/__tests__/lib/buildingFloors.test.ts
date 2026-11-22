import { describe, it, expect } from 'vitest';
import { parseFloors, floorsFromRange, floorLabel, validateFloors, validateBuildingName } from '../../lib/buildingFloors';
import { groupSpacesByLocation } from '../../lib/spaceGroups';
import type { Building } from '../../types/building';
import type { Space } from '../../types/space';

const bld = (over: Partial<Building>): Building => ({
    id: 'b1', organizationId: 'o', name: '본관', address: '', floors: ['B1', '1', '2'], order: 0, archived: false, ...over,
});
const sp = (over: Partial<Space>): Space => ({
    id: 's', organizationId: 'o', name: '공간', order: 0, managerUids: [], archived: false, buildingId: null, floor: null, ...over,
});

describe('층 목록 다루기', () => {
    it('쉼표·공백·줄바꿈을 모두 받고 중복을 지우며 적은 순서를 지킨다', () => {
        expect(parseFloors('B1, 1,2\n3  3 , PH,,')).toEqual(['B1', '1', '2', '3', 'PH']);
        expect(parseFloors('   ')).toEqual([]);
    });

    it('지하·지상 층수로 낮은 층부터 만든다', () => {
        expect(floorsFromRange(2, 3)).toEqual(['B2', 'B1', '1', '2', '3']);
        expect(floorsFromRange(0, 1)).toEqual(['1']);
        expect(floorsFromRange(-1, 0)).toEqual([]);
    });

    it('숫자만 적은 층은 "N층"으로, 나머지는 그대로 보인다', () => {
        expect(floorLabel('2')).toBe('2층');
        expect(floorLabel('B1')).toBe('B1');
        expect(floorLabel('옥상')).toBe('옥상');
    });

    it('층 이름이 길거나 너무 많으면 막는다', () => {
        expect(validateFloors(['1', '가'.repeat(11)])).toMatch(/10자/);
        expect(validateFloors(Array.from({ length: 51 }, (_, i) => String(i)))).toMatch(/50개/);
        expect(validateFloors(['B1', '1'])).toBeNull();
    });

    it('건물 이름은 숨긴 건물과도 겹치면 안 된다', () => {
        expect(validateBuildingName('본관', [bld({ archived: true })])).toMatch(/숨긴 건물/);
        expect(validateBuildingName('본관', [bld({})], 'b1')).toBeNull();
    });
});

describe('groupSpacesByLocation', () => {
    it('건물 순서 → 층 순서(낮은 층부터) → 공간 순서로 묶고, 목록에 없는 층·층 미지정은 뒤에 둔다', () => {
        const groups = groupSpacesByLocation([
            sp({ id: 'x', name: '옥탑', floor: '옥상', buildingId: 'b1', order: 0 }),
            sp({ id: 'a', name: '2층방', floor: '2', buildingId: 'b1', order: 1 }),
            sp({ id: 'b', name: '지하방', floor: 'B1', buildingId: 'b1', order: 2 }),
            sp({ id: 'n', name: '층없음', buildingId: 'b1', order: 3 }),
        ], [bld({})]);
        expect(groups).toHaveLength(1);
        expect(groups[0].floors.map((f) => f.label)).toEqual(['B1', '2층', '옥상', '층 미지정']);
    });

    it('건물이 없거나 숨긴 건물을 가리키는 공간은 맨 끝 "건물 미지정"으로 모은다', () => {
        const groups = groupSpacesByLocation([
            sp({ id: 'a', buildingId: 'b1', floor: '1' }),
            sp({ id: 'b', buildingId: 'gone' }),
            sp({ id: 'c' }),
        ], [bld({}), bld({ id: 'b2', name: '별관', order: 1 })]);
        expect(groups.map((g) => g.label)).toEqual(['본관', '별관', '건물 미지정']);
        expect(groups[1].count).toBe(0); // 막 등록한 빈 건물도 보인다
        expect(groups[2].floors[0].spaces.map((s) => s.id)).toEqual(['b', 'c']);
    });
});

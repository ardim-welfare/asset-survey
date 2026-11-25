import { describe, it, expect } from 'vitest';
import { spaceDisplayNames } from '../../lib/spaceGroups';

const sp = (id: string, name: string, buildingId: string | null, floor: string | null) => ({ id, name, buildingId, floor });

describe('spaceDisplayNames — 이름이 겹치는 공간만 층을 붙인다 (2026-11-25)', () => {
    it('겹치지 않으면 이름 그대로, 겹치면 층을 앞에', () => {
        const m = spaceDisplayNames([sp('a', '상담실', 'b1', '2'), sp('p2', '부모휴게실', 'b1', '2'), sp('p3', '부모휴게실', 'b1', '3')]);
        expect(m.get('a')).toBe('상담실');
        expect(m.get('p2')).toBe('2층 부모휴게실');
        expect(m.get('p3')).toBe('3층 부모휴게실');
    });

    it('층까지 같으면(다른 건물) 건물 이름을 넣는다', () => {
        const buildings = [{ id: 'b1', name: '본관' }, { id: 'b2', name: '별관' }] as never;
        const m = spaceDisplayNames([sp('x', '창고', 'b1', 'B1'), sp('y', '창고', 'b2', 'B1')], buildings);
        expect(m.get('x')).toBe('본관 B1 창고');
        expect(m.get('y')).toBe('별관 B1 창고');
    });
});

/**
 * 공간을 건물 → 층으로 묶는다 (공간 관리 화면, 2026-11-22)
 *
 * 순수 함수라 화면·테스트가 같은 규칙을 쓴다.
 * - 건물은 건물 순서대로, 층은 그 건물의 floors 순서대로(낮은 층부터), 공간은 order 순서대로.
 * - 건물 목록에서 빠진 층(층을 지운 뒤에도 남은 공간)은 그 건물의 맨 뒤에 붙인다 — 공간을 잃어버리지 않게.
 * - 건물을 고르지 않았거나, 숨긴·없는 건물을 가리키는 공간은 맨 끝 '건물 미지정'으로 모은다.
 */
import { floorLabel } from './buildingFloors';
import type { Building } from '../types/building';
import type { Space } from '../types/space';

export interface FloorGroup {
    /** 층 이름(없으면 null = 층 미지정) */
    floor: string | null;
    label: string;
    spaces: Space[];
}

export interface BuildingGroup {
    /** 건물 ID(없으면 null = 건물 미지정) */
    buildingId: string | null;
    label: string;
    floors: FloorGroup[];
    /** 이 묶음의 공간 수 */
    count: number;
}

const byOrder = (a: Space, b: Space) => (a.order - b.order) || a.name.localeCompare(b.name, 'ko');

function floorGroups(spaces: Space[], floorOrder: string[]): FloorGroup[] {
    const map = new Map<string | null, Space[]>();
    for (const s of spaces) {
        const key = s.floor || null;
        map.set(key, [...(map.get(key) ?? []), s]);
    }
    const keys: (string | null)[] = [
        ...floorOrder.filter((f) => map.has(f)),
        ...[...map.keys()].filter((k): k is string => k !== null && !floorOrder.includes(k)),
        ...(map.has(null) ? [null] : []),
    ];
    return keys.map((floor) => ({
        floor,
        label: floor ? floorLabel(floor) : '층 미지정',
        spaces: [...(map.get(floor) ?? [])].sort(byOrder),
    }));
}

/**
 * 숨기지 않은 공간을 묶는다. 건물(숨기지 않은 것)은 공간이 없어도 묶음을 만든다 —
 * 막 등록한 건물이 화면에서 사라지지 않게. '건물 미지정'은 공간이 있을 때만 만든다.
 */
export function groupSpacesByLocation(spaces: Space[], buildings: Building[]): BuildingGroup[] {
    const active = buildings.filter((b) => !b.archived);
    const activeIds = new Set(active.map((b) => b.id));
    const groups: BuildingGroup[] = active.map((b) => {
        const mine = spaces.filter((s) => s.buildingId === b.id);
        return { buildingId: b.id, label: b.name, floors: floorGroups(mine, b.floors), count: mine.length };
    });
    const orphans = spaces.filter((s) => !s.buildingId || !activeIds.has(s.buildingId));
    if (orphans.length > 0) {
        groups.push({
            buildingId: null,
            label: '건물 미지정',
            // 건물이 없으면 층도 의미가 없어 한 묶음으로 둔다
            floors: [{ floor: null, label: '', spaces: [...orphans].sort(byOrder) }],
            count: orphans.length,
        });
    }
    return groups;
}

/** 같은 건물·층에 있는 공간인가 — 순서 바꾸기는 이 안에서만 한다 */
export function sameLocation(a: Space, b: Space, activeBuildingIds: Set<string>): boolean {
    const bid = (s: Space) => (s.buildingId && activeBuildingIds.has(s.buildingId) ? s.buildingId : null);
    if (bid(a) !== bid(b)) return false;
    if (bid(a) === null) return true;
    return (a.floor || null) === (b.floor || null);
}

/** 공간 위치 글자 — "본관 2층", 건물이 없으면 빈 글자 */
export function spaceLocationText(space: Space, buildings: Building[]): string {
    const b = buildings.find((x) => x.id === space.buildingId);
    if (!b) return '';
    return space.floor ? `${b.name} ${floorLabel(space.floor)}` : b.name;
}

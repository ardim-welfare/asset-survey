/**
 * 건물·층 순수 함수 — 이름 검사, 층 목록 파싱·만들기, 층 표시 이름 (2026-11-22)
 *
 * Firebase를 가져오지 않아 화면 컴포넌트와 테스트가 가볍게 쓴다. 저장은 lib/firestore/buildings.ts.
 */
import {
    BUILDING_NAME_MAX, BUILDING_ADDRESS_MAX, BUILDING_FLOORS_MAX, FLOOR_NAME_MAX,
} from '../schemas/building';
import type { Building } from '../types/building';

/** 건물 입력값(추가·고치기) */
export interface BuildingInput {
    name: string;
    address: string;
    floors: string[];
}

/** 표시 순서 — order가 같으면 이름순(한글) */
export function sortBuildings(buildings: Building[]): Building[] {
    return [...buildings].sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name, 'ko'));
}

/** 이름·주소 앞뒤 공백을 지우고 연속 공백을 하나로 줄인다 */
export function normalizeBuildingText(text: string): string {
    return text.trim().replace(/\s+/g, ' ');
}

/** 건물 이름 검사 — 문제가 없으면 null, 있으면 안내 문구. 숨긴 건물과 겹치는 것도 막는다 */
export function validateBuildingName(name: string, existing: Building[], selfId?: string): string | null {
    const normalized = normalizeBuildingText(name);
    if (!normalized) return '건물 이름을 입력해주세요.';
    if (normalized.length > BUILDING_NAME_MAX) return `건물 이름은 ${BUILDING_NAME_MAX}자까지 쓸 수 있습니다.`;
    const dup = existing.find((b) => b.id !== selfId && normalizeBuildingText(b.name) === normalized);
    if (dup) return dup.archived ? `숨긴 건물에 같은 이름(${normalized})이 있습니다. 숨김을 풀어 다시 쓰세요.` : `같은 이름의 건물(${normalized})이 이미 있습니다.`;
    return null;
}

/**
 * 층 목록 글자를 배열로 — "B1, 1, 2, 3" · "B1 1 2 3" · 줄바꿈 모두 받는다.
 * 앞뒤 공백·빈 칸·중복을 지우고, 적은 순서를 그대로 둔다(낮은 층부터 적는다).
 * "1층"·"지하1층"처럼 써도 그대로 받는다 — 기관마다 부르는 방식이 달라 고치지 않는다.
 */
export function parseFloors(text: string): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of text.split(/[,\n\s]+/)) {
        const floor = raw.trim();
        if (!floor || seen.has(floor)) continue;
        seen.add(floor);
        result.push(floor);
    }
    return result;
}

/** 지하·지상 층수로 층 목록을 만든다 — 지하 2, 지상 3 → B2, B1, 1, 2, 3 */
export function floorsFromRange(basement: number, above: number): string[] {
    const b = Math.max(0, Math.floor(basement));
    const a = Math.max(0, Math.floor(above));
    const floors: string[] = [];
    for (let i = b; i >= 1; i--) floors.push(`B${i}`);
    for (let i = 1; i <= a; i++) floors.push(String(i));
    return floors;
}

/** 층 목록 검사 — 문제가 없으면 null */
export function validateFloors(floors: string[]): string | null {
    if (floors.length > BUILDING_FLOORS_MAX) return `층은 건물당 ${BUILDING_FLOORS_MAX}개까지 등록할 수 있습니다.`;
    const tooLong = floors.find((f) => f.length > FLOOR_NAME_MAX);
    if (tooLong) return `층 이름은 ${FLOOR_NAME_MAX}자까지 쓸 수 있습니다: ${tooLong}`;
    return null;
}

/** 주소 검사 — 문제가 없으면 null */
export function validateBuildingAddress(address: string): string | null {
    return normalizeBuildingText(address).length > BUILDING_ADDRESS_MAX
        ? `주소는 ${BUILDING_ADDRESS_MAX}자까지 쓸 수 있습니다.`
        : null;
}

/** 층 표시 이름 — 숫자만 적었으면 "2층", 그 밖(B1·PH·옥상)은 그대로 */
export function floorLabel(floor: string): string {
    return /^\d+$/.test(floor) ? `${floor}층` : floor;
}

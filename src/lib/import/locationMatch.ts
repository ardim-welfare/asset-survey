/**
 * 엑셀 위치 원문 ↔ 건물·층·공간 맞추기 (2026-11-22)
 *
 * 희망이음 대장의 위치는 "본관 2층 상담실", "별관2F 교육장", "지하1층 창고"처럼 건물·층·공간이 한 칸에 섞여 있다.
 * - `spaceAliases`: 공간 하나를 가리킬 수 있는 위치 표기들 — 가져오기 자동 제안이 원문과 견준다.
 * - `parseLocation`: 위치 원문을 건물·층·나머지 이름으로 나눈다 — '공간 만들기'가 건물·층을 채워 만든다.
 * 비교는 띄어쓰기·대소문자를 무시한다("본관2층" = "본관 2층").
 */
import type { Building } from '../../types/building';
import type { Space } from '../../types/space';

const squash = (s: string) => s.replace(/\s+/g, '').toLowerCase();
/** lib/firestore/spaces.ts normalizeSpaceName과 같은 규칙(Firebase를 가져오지 않으려고 따로 둔다) */
const normalizeSpaceName = (s: string) => s.trim().replace(/\s+/g, ' ');

/** 층 하나의 여러 표기 — "2" → 2, 2층, 2f / "B1" → b1, b1층, 지하1, 지하1층 (띄어쓰기 없이, 소문자) */
export function floorVariants(floor: string): string[] {
    const f = squash(floor);
    const out = new Set([f]);
    if (/^\d+$/.test(f)) { out.add(`${f}층`); out.add(`${f}f`); }
    const under = /^b(\d+)$/.exec(f);
    if (under) { out.add(`${f}층`); out.add(`지하${under[1]}층`); out.add(`지하${under[1]}`); }
    const underKo = /^지하(\d+)층?$/.exec(f);
    if (underKo) { out.add(`b${underKo[1]}`); out.add(`b${underKo[1]}층`); }
    return [...out];
}

/** 공간을 가리키는 위치 표기들(띄어쓰기 없이, 소문자) — 이름만 / 건물+이름 / 건물+층+이름 / 층+이름 */
export function spaceAliases(space: Space, buildings: Building[]): string[] {
    const name = squash(space.name);
    const out = new Set([name]);
    const b = buildings.find((x) => x.id === space.buildingId);
    const floors = space.floor ? floorVariants(space.floor) : [];
    if (b) {
        const bn = squash(b.name);
        out.add(bn + name);
        for (const f of floors) out.add(bn + f + name);
    }
    for (const f of floors) out.add(f + name);
    return [...out];
}

/** 위치 원문에 맞는 공간 — 표기가 정확히 하나의 공간만 가리킬 때만 고른다(애매하면 사람이 고르게) */
export function matchSpaceByLocation(location: string, spaces: Space[], buildings: Building[]): Space | null {
    const key = squash(location);
    if (!key) return null;
    const hits = spaces.filter((s) => !s.archived && spaceAliases(s, buildings).includes(key));
    return hits.length === 1 ? hits[0] : null;
}

/**
 * text 앞부분이 prefix(띄어쓰기 없이 소문자)와 같으면 나머지를 돌려준다(원문 띄어쓰기 유지, 앞뒤 공백 정리).
 * 같지 않으면 null.
 */
function cutPrefix(text: string, prefix: string): string | null {
    let i = 0;
    let j = 0;
    while (j < prefix.length) {
        if (i >= text.length) return null;
        const ch = text[i];
        if (/\s/.test(ch)) { i++; continue; }
        if (ch.toLowerCase() !== prefix[j]) return null;
        i++; j++;
    }
    return text.slice(i).trim();
}

export interface ParsedLocation {
    buildingId: string | null;
    floor: string | null;
    /** 건물·층을 떼고 남은 공간 이름(남은 것이 없으면 원문 그대로) */
    name: string;
}

/**
 * 위치 원문을 건물·층·나머지로 나눈다 — "본관 2층 상담실" → { 본관, '2', '상담실' }.
 * 건물은 숨기지 않은 건물 중 이름이 원문 앞에 오는 것(가장 긴 이름), 층은 그 건물의 층 목록 중 다음에 오는 것.
 * 건물을 못 찾으면 층도 정하지 않는다(층은 건물에 딸려 있다).
 */
export function parseLocation(location: string, buildings: Building[]): ParsedLocation {
    const text = normalizeSpaceName(location);
    const candidates = buildings
        .filter((b) => !b.archived)
        .map((b) => ({ b, rest: cutPrefix(text, squash(b.name)) }))
        .filter((x): x is { b: Building; rest: string } => x.rest !== null)
        .sort((x, y) => squash(y.b.name).length - squash(x.b.name).length);
    const hit = candidates[0];
    if (!hit) return { buildingId: null, floor: null, name: text };

    let floor: string | null = null;
    let rest = hit.rest;
    // 표기가 긴 것부터 견준다("지하1층"을 "지하1"보다 먼저)
    const options = hit.b.floors
        .flatMap((f) => floorVariants(f).map((v) => ({ f, v })))
        .sort((x, y) => y.v.length - x.v.length);
    for (const { f, v } of options) {
        const after = cutPrefix(rest, v);
        if (after === null) continue;
        // "1" 층 뒤에 숫자가 이어지면("101호") 층이 아니다
        if (/^\d/.test(after) && /\d$/.test(v)) continue;
        floor = f;
        rest = after;
        break;
    }
    return { buildingId: hit.b.id, floor, name: rest || text };
}

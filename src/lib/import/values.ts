/**
 * 가져오기 값 정리 — 엑셀 셀 값을 앱이 저장할 형태로 바꾼다 (기획서 F04·F05)
 *
 * 원칙: **조용히 바꾸지 않는다.** 읽을 수 없는 값은 null로 두고 문제 목록에 올린다.
 * 공란은 null, 0원은 0으로 구분해 보존한다.
 */

/** 문자열 셀 — 앞뒤 공백 정리, 빈 값은 null. 숫자 셀(코드가 숫자로 적힌 경우)도 문자열로 */
export function toText(value: unknown): string | null {
    if (value == null) return null;
    if (value instanceof Date) return formatDate(value);
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) return null;
        // 1e21 이상이나 지수 표기가 생기는 값은 원문 그대로 둘 수 없으므로 정수만 고정 표기한다
        return Number.isInteger(value) ? value.toFixed(0) : String(value);
    }
    const s = String(value).replace(/\s+/g, ' ').trim();
    return s === '' ? null : s;
}

/**
 * 숫자 셀(수량·금액) — "1,200,000", "1,200,000원", " 45 " 같은 표기를 읽는다.
 * 읽을 수 없으면 `{ value: null, invalid: true }`. 빈 칸은 `{ value: null, invalid: false }`.
 */
export function toNumber(value: unknown): { value: number | null; invalid: boolean } {
    if (value == null || value === '') return { value: null, invalid: false };
    if (typeof value === 'number') return Number.isFinite(value) ? { value, invalid: false } : { value: null, invalid: true };
    const s = String(value).replace(/[,\s원₩]/g, '').trim();
    if (s === '' || s === '-') return { value: null, invalid: false };
    const n = Number(s);
    return Number.isFinite(n) ? { value: n, invalid: false } : { value: null, invalid: true };
}

function pad(n: number): string {
    return String(n).padStart(2, '0');
}

/** Date → 'YYYY-MM-DD' (현지 시각 기준 — 엑셀 날짜에는 시간대가 없다) */
export function formatDate(d: Date): string {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function validYmd(y: number, m: number, d: number): boolean {
    if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
    const date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

/**
 * 날짜 셀 — 'YYYY-MM-DD'로 맞춘다.
 * 받는 표기: 엑셀 날짜(Date), "2021-03-13", "2021.03.13", "2021/3/13", "20210313", "2021.03"(일 없으면 1일).
 */
export function toDateText(value: unknown): { value: string | null; invalid: boolean } {
    if (value == null || value === '') return { value: null, invalid: false };
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? { value: null, invalid: true } : { value: formatDate(value), invalid: false };
    }
    const s = String(value).trim();
    if (s === '') return { value: null, invalid: false };
    let m = /^(\d{4})[-./년\s]+(\d{1,2})[-./월\s]+(\d{1,2})일?$/.exec(s);
    if (m && validYmd(+m[1], +m[2], +m[3])) return { value: `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`, invalid: false };
    m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
    if (m && validYmd(+m[1], +m[2], +m[3])) return { value: `${m[1]}-${m[2]}-${m[3]}`, invalid: false };
    m = /^(\d{4})[-./년\s]+(\d{1,2})월?$/.exec(s);
    if (m && validYmd(+m[1], +m[2], 1)) return { value: `${m[1]}-${pad(+m[2])}-01`, invalid: false };
    return { value: null, invalid: true };
}

/** 재물 상태 — 운영(조사 대상) · 불용 · 폐기 */
export type AssetStatus = 'active' | 'inactive' | 'disposed';

export const ASSET_STATUS_LABEL: Record<AssetStatus, string> = {
    active: '운영',
    inactive: '불용',
    disposed: '폐기',
};

const STATUS_WORDS: Array<[RegExp, AssetStatus]> = [
    [/폐기|매각|처분|양여|멸실|망실|반납/, 'disposed'],
    [/불용|미사용|사용중지|고장|보관/, 'inactive'],
    [/운영|사용|정상|보유|활용/, 'active'],
];

/**
 * 원본 상태 글자를 앱 상태로 옮긴다. 빈 칸은 운영으로 본다(대장에 상태 열이 없는 기관이 많다).
 * 알아보지 못한 값은 `known: false` — 운영으로 두되 검사 결과에 올려 사람이 확인하게 한다.
 */
export function toStatus(raw: string | null): { status: AssetStatus; known: boolean } {
    if (!raw) return { status: 'active', known: true };
    for (const [re, status] of STATUS_WORDS) {
        if (re.test(raw)) return { status, known: true };
    }
    return { status: 'active', known: false };
}

/** 합계·소계 줄인지 — 코드가 없고 어느 칸에 '합계'·'소계'·'총계'가 적힌 줄 */
export function isTotalRow(cells: unknown[]): boolean {
    return cells.some((c) => /^(합\s*계|소\s*계|총\s*계|계)$/.test(String(c ?? '').replace(/\s+/g, ' ').trim()));
}

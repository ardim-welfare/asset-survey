/**
 * 내용연수(내구연한) — 재물을 쓸 수 있는 햇수와 그 끝나는 날 (2026-11-22)
 *
 * 취득일자 + 내용연수 = 내용연수가 끝나는 날. 둘 중 하나라도 없으면 계산하지 않는다(표시 없음).
 * 소수 햇수(2.5년)는 달 단위로 올림해 더한다. 날짜는 모두 'YYYY-MM-DD' 글자로 다룬다
 * (취득일자가 그 형식으로 저장된다 — src/lib/import/values.ts formatDate).
 */

/** 내용연수 입력 범위 — firestore.rules assetDataValid와 같은 값 */
export const USEFUL_LIFE_MAX = 100;

/** 내용연수가 끝나는 날('YYYY-MM-DD'). 계산할 수 없으면 null */
export function usefulLifeEnd(acquiredAt: string | null | undefined, years: number | null | undefined): string | null {
    if (!acquiredAt || years == null || !Number.isFinite(years) || years <= 0) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(acquiredAt);
    if (!m) return null;
    const months = Math.ceil(years * 12);
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1 + months;
    const d = Number(m[3]);
    // 말일 보정 — 1월 31일 + 1개월이 3월로 넘어가지 않게 그 달의 마지막 날로 맞춘다
    const targetYear = y + Math.floor(mo / 12);
    const targetMonth = ((mo % 12) + 12) % 12;
    const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${targetYear}-${pad(targetMonth + 1)}-${pad(Math.min(d, lastDay))}`;
}

/** 오늘('YYYY-MM-DD', 현지 시각) */
export function todayText(now: Date = new Date()): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** 내용연수가 지났는가 — 끝나는 날 당일까지는 '아직'으로 본다 */
export function isUsefulLifeOver(
    asset: { acquiredAt?: string | null; usefulLife?: number | null },
    today: string = todayText(),
): boolean {
    const end = usefulLifeEnd(asset.acquiredAt, asset.usefulLife);
    return end != null && end < today;
}

/** 엑셀 칸 → 햇수. "5", "5년", "5.0" 모두 5. 읽지 못하면 invalid */
export function parseUsefulLife(value: unknown): { value: number | null; invalid: boolean } {
    if (value == null || value === '') return { value: null, invalid: false };
    if (typeof value === 'number') {
        return Number.isFinite(value) && value >= 0 && value <= USEFUL_LIFE_MAX ? { value, invalid: false } : { value: null, invalid: true };
    }
    const s = String(value).replace(/\s/g, '').replace(/년$/, '');
    if (s === '' || s === '-') return { value: null, invalid: false };
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 && n <= USEFUL_LIFE_MAX ? { value: n, invalid: false } : { value: null, invalid: true };
}

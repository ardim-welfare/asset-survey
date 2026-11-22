/**
 * 내용연수(내구연한) 계산 — 끝나는 날·지났는지·엑셀 칸 읽기 (2026-11-22)
 */
import { describe, it, expect } from 'vitest';
import { usefulLifeEnd, isUsefulLifeOver, parseUsefulLife, todayText } from '../../lib/usefulLife';

describe('usefulLifeEnd', () => {
    it('취득일자에 햇수를 더한다', () => {
        expect(usefulLifeEnd('2021-03-15', 5)).toBe('2026-03-15');
    });
    it('소수 햇수는 달로 올림해 더한다', () => {
        expect(usefulLifeEnd('2024-01-10', 2.5)).toBe('2026-07-10');
    });
    it('말일은 그 달의 마지막 날로 맞춘다(2월 29일 → 평년 2월 28일)', () => {
        expect(usefulLifeEnd('2024-02-29', 1)).toBe('2025-02-28');
        expect(usefulLifeEnd('2024-01-31', 0.05)).toBe('2024-02-29'); // 0.6달 → 1달로 올림
    });
    it('취득일자나 햇수가 없거나 0이면 계산하지 않는다', () => {
        expect(usefulLifeEnd(null, 5)).toBeNull();
        expect(usefulLifeEnd('2024-01-01', null)).toBeNull();
        expect(usefulLifeEnd('2024-01-01', 0)).toBeNull();
        expect(usefulLifeEnd('2024년 1월', 5)).toBeNull();
    });
});

describe('isUsefulLifeOver', () => {
    it('끝나는 날 당일까지는 지나지 않은 것으로 본다', () => {
        const a = { acquiredAt: '2021-03-15', usefulLife: 5 };
        expect(isUsefulLifeOver(a, '2026-03-15')).toBe(false);
        expect(isUsefulLifeOver(a, '2026-03-16')).toBe(true);
    });
    it('내용연수가 없는 예전 재물은 표시하지 않는다', () => {
        expect(isUsefulLifeOver({ acquiredAt: '2000-01-01' }, '2026-11-22')).toBe(false);
    });
});

describe('parseUsefulLife', () => {
    it('숫자·"5년"·빈 칸을 읽는다', () => {
        expect(parseUsefulLife(5)).toEqual({ value: 5, invalid: false });
        expect(parseUsefulLife('5년')).toEqual({ value: 5, invalid: false });
        expect(parseUsefulLife(' 8 ')).toEqual({ value: 8, invalid: false });
        expect(parseUsefulLife('')).toEqual({ value: null, invalid: false });
        expect(parseUsefulLife('-')).toEqual({ value: null, invalid: false });
    });
    it('숫자가 아니거나 범위(0~100) 밖이면 비우고 알린다', () => {
        expect(parseUsefulLife('영구')).toEqual({ value: null, invalid: true });
        expect(parseUsefulLife(150)).toEqual({ value: null, invalid: true });
        expect(parseUsefulLife(-1)).toEqual({ value: null, invalid: true });
    });
});

describe('todayText', () => {
    it('현지 날짜를 YYYY-MM-DD로', () => {
        expect(todayText(new Date(2026, 10, 2))).toBe('2026-11-02');
    });
});

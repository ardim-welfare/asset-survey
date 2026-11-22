/**
 * useAssetForm — 재물 직접 등록 입력 검사·값 바꾸기 (2026-11-22)
 */
import { describe, it, expect } from 'vitest';
import { validateAssetForm, toManualFields, EMPTY_ASSET_FORM, formatAmountInput } from '../../hooks/useAssetForm';

const form = (over: Partial<typeof EMPTY_ASSET_FORM> = {}) => ({ ...EMPTY_ASSET_FORM, code: 'A-1', name: '책상', ...over });

describe('validateAssetForm', () => {
    it('새로 등록할 때는 자산코드·품명이 있어야 하고, 문서 경로를 깨는 글자는 막는다', () => {
        expect(validateAssetForm(form({ code: ' ' }), true)).toMatch(/자산코드/);
        expect(validateAssetForm(form({ code: 'A/1' }), true)).toMatch(/쓸 수 없습니다/);
        expect(validateAssetForm(form({ name: '' }), true)).toMatch(/품명/);
        expect(validateAssetForm(form(), true)).toBeNull();
        // 고칠 때는 자산코드를 보지 않는다
        expect(validateAssetForm(form({ code: '' }), false)).toBeNull();
    });

    it('날짜·수량·금액 형식을 확인한다', () => {
        expect(validateAssetForm(form({ acquiredAt: '2024/3/15' }), true)).toMatch(/취득일자/);
        expect(validateAssetForm(form({ quantity: '1.5' }), true)).toMatch(/수량/);
        expect(validateAssetForm(form({ amount: '이십만' }), true)).toMatch(/자산금액/);
        expect(validateAssetForm(form({ amount: '250,000원' }), true)).toBeNull();
    });
});

describe('toManualFields', () => {
    it('빈 칸은 null, 숫자는 쉼표·원을 떼고 바꾼다', () => {
        const { fields, amount } = toManualFields(form({ category: '  ', quantity: '', amount: '1,200원', spaceId: '' }));
        expect(fields).toMatchObject({ name: '책상', category: null, quantity: null, spaceId: null, status: 'active' });
        expect(amount).toBe(1200);
    });
});

describe('formatAmountInput', () => {
    it('숫자만 남겨 천 단위 쉼표를 붙이고, 저장 값은 쉼표 없는 숫자다', () => {
        expect(formatAmountInput('200000')).toBe('200,000');
        expect(formatAmountInput('1,234,5678원')).toBe('12,345,678');
        expect(formatAmountInput('00012')).toBe('12');
        expect(formatAmountInput('')).toBe('');
        expect(toManualFields(form({ amount: formatAmountInput('250000') })).amount).toBe(250000);
    });
});

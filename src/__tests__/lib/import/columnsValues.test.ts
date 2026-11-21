/**
 * 가져오기 열 인식·값 정리 (기획서 F04·F05)
 */
import { describe, it, expect } from 'vitest';
import { normalizeHeader, autoMapColumns, headerScore } from '../../../lib/import/columns';
import { toText, toNumber, toDateText, toStatus, isTotalRow } from '../../../lib/import/values';

describe('열 인식', () => {
    it('머리글의 공백·괄호·별표를 지우고 비교한다', () => {
        expect(normalizeHeader(' 자산 코드(필수) ')).toBe('자산코드');
        expect(normalizeHeader('품명*')).toBe('품명');
        expect(normalizeHeader(null)).toBe('');
    });

    it('희망이음 대장 13열을 모두 알아본다', () => {
        const headers = ['자산분류', '자산코드', '자산명', '취득일자', '취득수량', '현재수량', '자산금액',
            '감가상각충당금', '잔존가액', '자산상태', '자산위치', '운영부서', '용도'];
        expect(autoMapColumns(headers)).toEqual({
            code: '자산코드', name: '자산명', category: '자산분류', acquiredAt: '취득일자', acquiredQuantity: '취득수량',
            quantity: '현재수량', amount: '자산금액', depreciation: '감가상각충당금', residual: '잔존가액',
            status: '자산상태', location: '자산위치', department: '운영부서', usage: '용도',
        });
    });

    it('다른 앱의 이름도 알아보고, 사람 이름 열은 고르지 않는다', () => {
        const map = autoMapColumns(['관리번호', '품명', '규격', '수량', '단가', '금액', '현재위치', '현 사용자', '담당부서']);
        expect(map).toMatchObject({ code: '관리번호', name: '품명', spec: '규격', quantity: '수량', amount: '금액', location: '현재위치', department: '담당부서' });
        expect(Object.values(map)).not.toContain('현 사용자');
    });

    it('구체적인 이름을 먼저 잡는다 (자산금액이 있으면 금액보다 먼저)', () => {
        expect(autoMapColumns(['코드', '자산코드', '금액', '자산금액', '품명']).amount).toBe('자산금액');
    });

    it('기관이 지난번에 정한 연결이 이 파일에 있으면 그것을 먼저 쓴다', () => {
        const map = autoMapColumns(['자산코드', '비품번호', '품명'], { code: '비품번호' });
        expect(map.code).toBe('비품번호');
    });

    it('한 머리글은 한 필드에만 쓴다', () => {
        const map = autoMapColumns(['구분', '자산코드', '품명']);
        const used = Object.values(map);
        expect(new Set(used).size).toBe(used.length);
    });

    it('머리글 줄 점수는 알아본 칸 수다', () => {
        expect(headerScore(['고정자산대장', '', ''])).toBe(0);
        expect(headerScore(['자산코드', '자산명', '아무거나'])).toBe(2);
    });
});

describe('값 정리', () => {
    it('문자열: 공백을 정리하고 빈 값은 null, 숫자 코드는 정수 표기', () => {
        expect(toText('  2층   사무실 ')).toBe('2층 사무실');
        expect(toText('   ')).toBeNull();
        expect(toText(20200414)).toBe('20200414');
        expect(toText(1.5)).toBe('1.5');
        expect(toText(new Date(2021, 2, 13))).toBe('2021-03-13');
    });

    it('숫자: 쉼표·원 표기를 읽고, 빈 칸과 못 읽는 값을 구분한다', () => {
        expect(toNumber('1,200,000원')).toEqual({ value: 1200000, invalid: false });
        expect(toNumber(0)).toEqual({ value: 0, invalid: false });
        expect(toNumber('')).toEqual({ value: null, invalid: false });
        expect(toNumber('-')).toEqual({ value: null, invalid: false });
        expect(toNumber('천원')).toEqual({ value: null, invalid: true });
    });

    it('날짜: 여러 표기를 YYYY-MM-DD로, 없는 날짜는 못 읽음으로', () => {
        expect(toDateText('2021.3.13').value).toBe('2021-03-13');
        expect(toDateText('2021/03/13').value).toBe('2021-03-13');
        expect(toDateText('20210313').value).toBe('2021-03-13');
        expect(toDateText('2021년 3월 13일').value).toBe('2021-03-13');
        expect(toDateText('2021.03').value).toBe('2021-03-01');
        expect(toDateText(new Date(2019, 1, 27)).value).toBe('2019-02-27');
        expect(toDateText('2021-02-30')).toEqual({ value: null, invalid: true });
        expect(toDateText('작년')).toEqual({ value: null, invalid: true });
        expect(toDateText('')).toEqual({ value: null, invalid: false });
    });

    it('상태: 운영·불용·폐기로 옮기고, 빈 칸은 운영, 모르는 값은 표시한다', () => {
        expect(toStatus('운영')).toEqual({ status: 'active', known: true });
        expect(toStatus('사용중')).toEqual({ status: 'active', known: true });
        expect(toStatus('미사용')).toEqual({ status: 'inactive', known: true });
        expect(toStatus('불용(A)')).toEqual({ status: 'inactive', known: true });
        expect(toStatus('폐기')).toEqual({ status: 'disposed', known: true });
        expect(toStatus('매각')).toEqual({ status: 'disposed', known: true });
        expect(toStatus(null)).toEqual({ status: 'active', known: true });
        expect(toStatus('???')).toEqual({ status: 'active', known: false });
    });

    it('합계 줄을 알아본다', () => {
        expect(isTotalRow(['', '합 계', '', 1000])).toBe(true);
        expect(isTotalRow(['소계', ''])).toBe(true);
        expect(isTotalRow(['계약서', ''])).toBe(false);
    });
});

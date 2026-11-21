/**
 * constants 테스트
 */
import { describe, it, expect } from 'vitest';
import { APP_URL, formatLegalVersion } from '../../lib/constants';

describe('constants', () => {
    it('APP_URL은 끝에 / 가 없다 (초대 링크에 `?code=`를 바로 붙인다)', () => {
        expect(APP_URL.endsWith('/')).toBe(false);
    });

    it('formatLegalVersion은 시행일을 한국어 날짜로 바꾼다', () => {
        expect(formatLegalVersion('2026-10-26')).toBe('2026년 10월 26일');
    });
});

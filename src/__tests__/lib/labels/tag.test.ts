/**
 * QR 태그 (기획서 F09) — 무작위 태그 ID, QR 주소, 찍힌 글자에서 태그 꺼내기
 */
import { describe, it, expect } from 'vitest';
import { newTagId, isTagId, tagUrl, parseTag, TAG_ALPHABET } from '../../../lib/labels/tag';

describe('newTagId', () => {
    it('헷갈리는 글자(I·L·O·U) 없는 10자이고 Rules 형식과 맞는다', () => {
        const rulesRe = /^[0-9A-HJKMNP-TV-Z]{10}$/; // firestore.rules assetDataValid와 같은 식
        for (let i = 0; i < 200; i++) {
            const t = newTagId();
            expect(t).toMatch(rulesRe);
            expect(isTagId(t)).toBe(true);
        }
        expect(TAG_ALPHABET).toHaveLength(32);
        expect(TAG_ALPHABET).not.toMatch(/[ILOU]/);
    });
    it('겹치지 않는다', () => {
        const set = new Set(Array.from({ length: 2000 }, newTagId));
        expect(set.size).toBe(2000);
    });
});

describe('tagUrl·parseTag', () => {
    it('서비스주소/t/태그 꼴, 주소 끝 빗금은 하나로', () => {
        expect(tagUrl('ABCDEFGH23', 'https://example.org/')).toBe('https://example.org/t/ABCDEFGH23');
    });
    it.each([
        ['https://example.org/t/ABCDEFGH23', 'ABCDEFGH23'],
        ['https://other-domain.kr/t/abcdefgh23/', 'ABCDEFGH23'], // 주소가 바뀌어도 태그로 찾는다
        ['https://example.org/t/ABCDEFGH23?x=1', 'ABCDEFGH23'],
        ['  ABCDEFGH23 ', 'ABCDEFGH23'],
        ['1-1-1', null], // 자산코드 — 4단계 스캔에서 코드로 다시 찾는다
        ['https://example.org/t/ABCDEFGHIO', null], // 쓰지 않는 글자
        ['https://example.org/t/ABC', null],
    ])('%s → %s', (text, expected) => {
        expect(parseTag(text)).toBe(expected);
    });
});

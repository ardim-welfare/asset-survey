/**
 * pendingTag — 로그인 전에 연 라벨 QR 주소를 로그인 뒤까지 보관
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { capturePendingTag, peekPendingTag, clearPendingTag, PENDING_TAG_KEY } from '../../lib/pendingTag';

beforeEach(() => localStorage.clear());

describe('pendingTag', () => {
    it('/t/태그 주소면 보관하고, 읽어도 지우지 않으며, clear로 지운다', () => {
        capturePendingTag('/t/abcdefgh23');
        expect(peekPendingTag()).toBe('ABCDEFGH23');
        expect(peekPendingTag()).toBe('ABCDEFGH23'); // 렌더 중 두 번 불려도 같다
        clearPendingTag();
        expect(peekPendingTag()).toBeNull();
    });

    it('다른 주소는 보관하지 않는다', () => {
        capturePendingTag('/admin/assets');
        capturePendingTag('/t/short');
        expect(localStorage.getItem(PENDING_TAG_KEY)).toBeNull();
    });

    it('30분이 지나면 무시한다', () => {
        capturePendingTag('/t/ABCDEFGH23');
        expect(peekPendingTag(Date.now() + 31 * 60 * 1000)).toBeNull();
    });

    it('망가진 값은 무시한다', () => {
        localStorage.setItem(PENDING_TAG_KEY, '{oops');
        expect(peekPendingTag()).toBeNull();
        localStorage.setItem(PENDING_TAG_KEY, JSON.stringify({ tag: '../../x', at: Date.now() }));
        expect(peekPendingTag()).toBeNull();
    });
});

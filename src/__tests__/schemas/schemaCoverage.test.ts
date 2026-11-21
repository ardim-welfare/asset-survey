/**
 * 스키마 필드 누락 회귀 테스트
 *
 * `createZodConverter`의 `fromFirestore`는 Zod가 모르는 키를 **조용히 제거한다**(z.object 기본 동작).
 * 그래서 스키마에 필드를 빠뜨리면 저장은 되는데 앱에서는 항상 undefined가 되고, 타입 선언과
 * 스키마가 따로 놀던 시절에는 이게 컴파일 에러 없이 통과했다. 실제로 아래 필드들이 그렇게
 * 죽어 있었다 — 코드가 멀쩡한데 화면에 값이 뜨지 않았다.
 *
 * 지금은 타입이 스키마에서 파생되므로 같은 방식의 어긋남은 컴파일 단계에서 잡힌다. 이 테스트는
 * 그 위에 한 겹 더 두는 것이다 — **필드가 실제로 컨버터를 통과해 나오는지**는 타입이 보장하지
 * 못하고(스키마에서 지우면 타입도 같이 사라져 조용히 통과한다), 여기서만 확인할 수 있다.
 */
import { describe, it, expect } from 'vitest';
import {
    createZodConverter,
    userSchema,
} from '../../schemas';
import type { QueryDocumentSnapshot } from 'firebase/firestore';

/** 컨버터를 통과시킨 결과를 돌려준다 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readThrough(schema: any, data: Record<string, unknown>) {
    const snapshot = {
        id: 'doc-1',
        ref: { path: 'test/doc-1' },
        data: () => data,
    } as unknown as QueryDocumentSnapshot;
    return createZodConverter(schema).fromFirestore(snapshot) as Record<string, unknown>;
}

describe('스키마가 앱이 실제로 쓰는 필드를 모두 담는다', () => {

    it('사용자: FCM 토큰이 컨버터를 통과한다', () => {
        const result = readThrough(userSchema, {
            name: '홍길동',
            email: 'a@b.c',
            role: 'employee',
            organizationId: 'org1',
            fcmToken: 'token-abc',
        });

        expect(result.fcmToken).toBe('token-abc');
    });

    it('컨버터는 스키마에 없는 키를 조용히 제거한다 — 이 테스트들이 필요한 이유', () => {
        const result = readThrough(userSchema, {
            name: '홍길동',
            email: 'a@b.c',
            role: 'employee',
            organizationId: 'org1',
            somethingNobodyDeclared: '사라진다',
        });

        expect(result.somethingNobodyDeclared).toBeUndefined();
    });
});

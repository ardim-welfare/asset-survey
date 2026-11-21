/**
 * 스캔 판정 (기획서 F11) — 6종: 정상·다른 공간·미등록·범위 밖·중복·직접 입력
 * 4단계 완료 기준 "판정 6종이 모두 재현됨, 중복 스캔이 수를 늘리지 않음"을 여기서 고정한다.
 */
import { describe, it, expect } from 'vitest';
import {
    buildTargetIndex, findInTargets, judge, resolveInput, scanDocId, progressBySpace, normalizeCode, remainingIn,
    type IndexedTarget,
} from '../../../lib/survey/judge';
import { makeQrGate } from '../../../lib/survey/qrGate';
import type { Scan, SurveyTarget } from '../../../types/survey';

const target = (spaceId: string | null, items: Array<[string, string, string | null]>): SurveyTarget => ({
    id: `sv1__${spaceId ?? '_none'}`, organizationId: 'org-A', surveyId: 'sv1', spaceId, lastEditedByUid: 'a',
    items: items.map(([id, code, tagId]) => ({ id, code, name: `품명${code}`, tagId })),
});
const TARGETS = [
    target('sp-1', [['org-A__1', '2021-001', 'AAAAAAAAA1'], ['org-A__2', '2021-002', null]]),
    target('sp-2', [['org-A__3', '2021-003', 'AAAAAAAAA3']]),
    target(null, [['org-A__4', '2021-004', null]]),
];
const index = buildTargetIndex(TARGETS);
const none = () => null;

function run(text: string, method: 'qr' | 'manual', spaceId = 'sp-1', opts: { found?: Parameters<typeof judge>[0]['found']; existing?: (id: string) => Pick<Scan, 'spaceId' | 'result'> | null } = {}) {
    const lookup = resolveInput(text, method)!;
    const t: IndexedTarget | null = findInTargets(index, lookup);
    return judge({ surveyId: 'sv1', spaceId, lookup, target: t, found: opts.found ?? null, existing: opts.existing ?? none });
}

describe('판정 6종', () => {
    it('정상 — QR 주소의 태그로 이 공간 대상을 찾는다', () => {
        const j = run('https://app.example/t/AAAAAAAAA1', 'qr');
        expect(j).toEqual({ kind: 'save', draft: {
            scanId: 'sv1__org-A__1', assetId: 'org-A__1', code: '2021-001', name: '품명2021-001', expectedSpaceId: 'sp-1', result: 'ok',
        } });
    });

    it('다른 공간 — 목록상 다른 공간(또는 미지정) 재물', () => {
        const j = run('https://app.example/t/AAAAAAAAA3', 'qr');
        expect(j.kind === 'save' && [j.draft.result, j.draft.expectedSpaceId]).toEqual(['otherSpace', 'sp-2']);
        const k = run('2021-004', 'manual');
        expect(k.kind === 'save' && [k.draft.result, k.draft.expectedSpaceId]).toEqual(['otherSpace', null]);
    });

    it('미등록 — 아무 데도 없으면 읽힌 글자로 남긴다', () => {
        const j = run('9-9-9', 'qr');
        expect(j.kind === 'save' && j.draft).toMatchObject({ result: 'unregistered', assetId: null, code: '9-9-9', scanId: 'sv1__u__9-9-9' });
    });

    it('범위 밖 — 기관 재물이지만 대상이 아님(서버에서만 찾음)', () => {
        const j = run('2021-099', 'manual', 'sp-1', { found: { id: 'org-A__99', code: '2021-099', name: '폐기 TV', status: 'disposed' } });
        expect(j.kind === 'save' && j.draft).toMatchObject({ result: 'outOfScope', assetId: 'org-A__99', expectedSpaceId: null });
    });

    it('중복 — 이미 찍은 재물은 저장하지 않는다(수가 늘지 않음)', () => {
        const existing = (id: string) => (id === 'sv1__org-A__1' ? { spaceId: 'sp-2', result: 'otherSpace' as const } : null);
        const j = run('2021-001', 'manual', 'sp-1', { existing });
        expect(j).toEqual({ kind: 'duplicate', scanId: 'sv1__org-A__1', existing: { spaceId: 'sp-2', result: 'otherSpace' }, code: '2021-001', name: '품명2021-001' });
        // 같은 미등록 코드도 한 번만
        const u = run('9 9 9', 'manual', 'sp-1', { existing: (id) => (id === 'sv1__u__999' ? { spaceId: 'sp-1', result: 'unregistered' } : null) });
        expect(u.kind).toBe('duplicate');
    });

    it('직접 입력 — 자산코드로 찾고(띄어쓰기·대소문자 무시) 판정은 같다', () => {
        expect(resolveInput(' 2021-002 ', 'manual')).toEqual({ kind: 'code', code: '2021-002', text: '2021-002' });
        const j = run('2021 - 002', 'manual');
        expect(j.kind === 'save' && j.draft.result).toBe('ok');
        // 직접 입력에 태그 주소를 넣어도 태그로 보지 않는다(라벨 코드를 손으로 옮기는 용도)
        expect(resolveInput('AAAAAAAAA1', 'manual')?.kind).toBe('code');
    });
});

describe('찾기', () => {
    it('QR에 태그가 아닌 글자(관리번호만 담긴 옛 QR)는 자산코드로 찾는다', () => {
        expect(resolveInput('2021-003', 'qr')).toEqual({ kind: 'code', code: '2021-003', text: '2021-003' });
        expect(run('2021-003', 'qr', 'sp-2').kind === 'save').toBe(true);
    });
    it('빈 글자는 무시', () => {
        expect(resolveInput('   ', 'qr')).toBeNull();
    });
    it('scanDocId — 등록 재물은 회차+재물, 미등록은 정규화한 코드', () => {
        expect(scanDocId('sv1', 'org-A__1', 'x')).toBe('sv1__org-A__1');
        expect(scanDocId('sv1', null, 'a/b c')).toBe(`sv1__u__${encodeURIComponent('A/BC')}`);
        expect(normalizeCode(' ab c ')).toBe('ABC');
    });
});

describe('progressBySpace', () => {
    const scan = (over: Partial<Scan>): Scan => ({
        id: 'x', organizationId: 'org-A', surveyId: 'sv1', assetId: null, code: 'c', name: null, spaceId: 'sp-1', expectedSpaceId: null,
        result: 'ok', method: 'qr', condition: 'normal', memo: '', scannedByUid: 'u', lastEditedByUid: 'u', ...over,
    });
    it('대상별 찾은 수는 어디서 찍혔든 센다. 이 공간에서 나온 예외는 따로', () => {
        const p = progressBySpace(TARGETS, [
            scan({ assetId: 'org-A__1', expectedSpaceId: 'sp-1' }),
            scan({ assetId: 'org-A__3', expectedSpaceId: 'sp-2', result: 'otherSpace', method: 'manual', condition: 'damaged' }),
            scan({ result: 'unregistered' }),
            scan({ assetId: 'org-A__99', result: 'outOfScope' }),
        ]);
        expect(p.get('sp-1')).toEqual({ target: 2, found: 1, elsewhere: 0, foreign: 3, manual: 0, issues: 0 });
        expect(p.get('sp-2')).toEqual({ target: 1, found: 1, elsewhere: 1, foreign: 0, manual: 1, issues: 1 });
        expect(p.get('_none')?.target).toBe(1);
    });
    it('남은 재물', () => {
        expect(remainingIn(TARGETS[0], new Set(['org-A__1'])).map((i) => i.code)).toEqual(['2021-002']);
    });
});

describe('같은 QR 3초 규칙', () => {
    it('받아들인 QR이 3초 안에 다시 보이면 무시, 거절한 판독은 곧 다시 넘긴다', () => {
        const gate = makeQrGate(3000);
        const seen: string[] = [];
        let accept = false;
        const fn = (t: string) => { seen.push(t); return accept; };
        gate('A', 0, fn); // 처리 중이라 거절
        accept = true;
        gate('A', 100, fn); // 다시 넘어감 → 받아들임
        gate('A', 2000, fn); // 무시(시각 늘림)
        gate('A', 4500, fn); // 마지막 본 2000에서 2.5초 → 여전히 무시
        gate('B', 4600, fn); // 다른 QR
        gate('A', 8000, fn); // 3초 지남
        expect(seen).toEqual(['A', 'A', 'B', 'A']);
    });
});

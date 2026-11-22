/**
 * 조사 결과 계산 (기획서 F15·F16) — 보고서·희망이음 반영 목록·마감 조건·남은 날
 */
import { describe, it, expect } from 'vitest';
import { buildReport, buildSyncTasks, closeBlockers, daysLeft } from '../../../lib/survey/report';
import { buildReportTables, submissionText } from '../../../lib/survey/reportTables';
import { buildSurveyReportHtml } from '../../../lib/pdf/surveyReportPdf';
import type { Scan, SurveySubmission, SurveyTarget } from '../../../types/survey';

const target = (spaceId: string | null, ids: string[]): SurveyTarget => ({
    id: `sv1__${spaceId ?? '_none'}`, organizationId: 'org-A', surveyId: 'sv1', spaceId, lastEditedByUid: 'a',
    items: ids.map((id) => ({ id, code: id.replace('a', ''), name: `품명${id}`, tagId: null })),
});
const scan = (over: Partial<Scan>): Scan => ({
    id: 'x', organizationId: 'org-A', surveyId: 'sv1', assetId: null, code: 'c', name: null, spaceId: 'sp-1', expectedSpaceId: null,
    result: 'ok', method: 'qr', condition: 'normal', memo: '', scannedByUid: 'u', lastEditedByUid: 'u', ...over,
});
const sub = (spaceId: string, over: Partial<SurveySubmission> = {}): SurveySubmission => ({
    id: `sv1__${spaceId}`, organizationId: 'org-A', surveyId: 'sv1', spaceId, state: 'approved', submittedByUid: 'emp',
    reviewedByUid: 'adm', reason: '', selfApproved: false, proxyApproved: false, lastEditedByUid: 'adm', ...over,
});

const TARGETS = [target('sp-1', ['a1', 'a2', 'a3']), target('sp-2', ['a4']), target(null, ['a5'])];
const SCANS = [
    scan({ assetId: 'a1', code: '1', expectedSpaceId: 'sp-1' }),
    scan({ assetId: 'a4', code: '4', expectedSpaceId: 'sp-2', result: 'otherSpace', condition: 'damaged', memo: '다리 부러짐' }),
    scan({ assetId: 'a2', code: '2', expectedSpaceId: 'sp-1', method: 'manual', condition: 'labelDamaged' }),
    scan({ code: 'X-9', result: 'unregistered' }),
    scan({ assetId: 'a99', code: '99', result: 'outOfScope', spaceId: 'sp-2' }),
];
const report = buildReport(TARGETS, SCANS, [sub('sp-1'), sub('sp-2', { proxyApproved: true, submittedByUid: null, reason: '담당자 휴가' })], ['sp-2', 'sp-1']);

describe('buildReport', () => {
    it('종합 — 찾은 것은 대상 중 정상·다른 공간, 미발견은 나머지', () => {
        expect(report.summary).toEqual({
            target: 5, found: 3, missing: 2, otherSpace: 1, unregistered: 1, outOfScope: 1, damaged: 1, labelDamaged: 1, manual: 1,
        });
        expect(report.missing.map((m) => [m.code, m.spaceKey])).toEqual([['3', 'sp-1'], ['5', '_none']]);
    });

    it('공간별 — 순서대로, 미지정은 끝에, 제출 상태를 붙인다', () => {
        expect(report.spaces.map((s) => [s.key, s.target, s.found, s.missing, s.elsewhere, s.manual, s.issues])).toEqual([
            ['sp-2', 1, 1, 0, 1, 0, 1],
            ['sp-1', 3, 2, 1, 0, 1, 1],
            ['_none', 1, 0, 1, 0, 0, 0],
        ]);
        expect(report.spaces[0].submission?.proxyApproved).toBe(true);
    });
});

describe('buildSyncTasks — 희망이음 반영 목록', () => {
    it('위치 변경·불용 검토·미발견·등록·라벨, ID는 회차·종류·재물로 정해진다', () => {
        const tasks = buildSyncTasks('sv1', report);
        expect(tasks.map((t) => [t.kind, t.code])).toEqual([
            ['move', '4'], ['dispose', '4'], ['missing', '3'], ['missing', '5'], ['register', 'X-9'], ['relabel', '2'],
        ]);
        expect(tasks[0]).toMatchObject({ id: 'sv1__move__a4', fromSpaceId: 'sp-2', toSpaceId: 'sp-1' });
        expect(tasks[3]).toMatchObject({ fromSpaceId: null }); // 공간 미지정
        expect(tasks[1].memo).toBe('다리 부러짐');
        expect(new Set(tasks.map((t) => t.id)).size).toBe(tasks.length);
    });
});

describe('마감 조건·남은 날', () => {
    it('나눠서 조사는 승인 안 된 공간이 남으면 막는다, 혼자 조사는 막지 않는다', () => {
        expect(closeBlockers('delegated', ['sp-1', 'sp-2'], [sub('sp-1'), sub('sp-2', { state: 'submitted' })])).toEqual(['sp-2']);
        expect(closeBlockers('delegated', ['sp-1'], [sub('sp-1')])).toEqual([]);
        expect(closeBlockers('solo', ['sp-1'], [])).toEqual([]);
    });
    it('daysLeft — 끝나는 날까지', () => {
        const today = new Date(2026, 10, 21);
        expect(daysLeft('2026-12-05', today)).toBe(14);
        expect(daysLeft('2026-11-21', today)).toBe(0);
        expect(daysLeft('2026-11-20', today)).toBe(-1);
    });
});

describe('보고서 표·PDF', () => {
    const ctx = {
        survey: { name: '2026 조사', startDate: '2026-11-21', endDate: '2026-12-05', mode: 'delegated' as const, status: 'closed' as const },
        report,
        spaceName: (k: string | null) => (k === null || k === '_none' ? '공간 미지정' : ({ 'sp-1': '101호', 'sp-2': '창고' } as Record<string, string>)[k] ?? '?'),
        personName: (uid: string | null) => (uid === 'adm' ? '박관리' : '-'),
    };

    it('제출·승인 문구 — 대신 승인·본인 승인·반려 사유', () => {
        expect(submissionText(report.spaces[0], 'delegated', ctx.personName)).toBe('대신 승인(박관리) — 담당자 휴가');
        expect(submissionText({ ...report.spaces[1], submission: sub('sp-1', { selfApproved: true, reason: '겸임' }) }, 'delegated', ctx.personName)).toBe('본인 승인(박관리) — 겸임');
        expect(submissionText({ ...report.spaces[1], submission: sub('sp-1', { state: 'rejected', reason: '다시' }) }, 'delegated', ctx.personName)).toBe('반려 — 다시');
        expect(submissionText(report.spaces[2], 'delegated', ctx.personName)).toBe('관리자 확인');
        expect(submissionText(report.spaces[1], 'solo', ctx.personName)).toBe('-');
    });

    it('표 — 종합·공간별·예외 목록, 빈 목록은 문장', () => {
        const tables = buildReportTables(ctx);
        expect(tables.map((t) => t.title)).toEqual([
            '종합', '공간별', '미발견', '위치 다름', '파손·불용 필요', '라벨 훼손', '미등록', '범위 밖(불용·폐기 등)', '직접 입력(재확인 대상)',
        ]);
        expect(tables[3].rows).toEqual([['4', '', '창고', '101호']]); // 품명은 스캔 문서에 찍을 때 남긴 값(이 예시는 비어 있음)
        expect(tables[1].rows[0]).toEqual(['창고', 1, 1, 0, 1, 0, 1, '대신 승인(박관리) — 담당자 휴가']);
    });

    it('건물·층(2026-11-22): 위치가 있으면 건물·층별 표와 위치 열을 더하고, 예외 목록 공간에 위치를 붙인다', () => {
        const loc: Record<string, string> = { 'sp-1': '본관 1층', 'sp-2': '본관 2층' };
        const tables = buildReportTables({ ...ctx, spaceLocation: (k: string | null) => (k ? loc[k] ?? '' : '') });
        expect(tables.map((t) => t.title).slice(0, 3)).toEqual(['종합', '건물·층별', '공간별']);
        // 공간별 순서(sp-2, sp-1, 미지정) 그대로 위치별로 모은다
        expect(tables[1].rows.map((r) => r[0])).toEqual(['본관 2층', '본관 1층', '건물 미지정']);
        expect(tables[2].columns[0]).toBe('건물·층');
        expect(tables[2].rows[0].slice(0, 2)).toEqual(['본관 2층', '창고']);
        expect(tables[4].rows).toEqual([['4', '', '본관 2층 창고', '본관 1층 101호']]);
    });

    it('위치가 하나도 없으면 표 모양이 예전과 같다', () => {
        const tables = buildReportTables({ ...ctx, spaceLocation: () => '' });
        expect(tables.map((t) => t.title)[1]).toBe('공간별');
        expect(tables[1].columns[0]).toBe('공간');
    });

    it('PDF HTML — 기관명·결재란·표를 담고 값은 이스케이프한다', () => {
        const html = buildSurveyReportHtml({ ...ctx, survey: { ...ctx.survey, name: '<b>조사</b>' } }, '행복복지관', [{ title: '담당' }, { title: '관장' }], new Date(2026, 11, 6));
        expect(html).toContain('재물조사 결과 보고서');
        expect(html).toContain('행복복지관');
        expect(html).toContain('&lt;b&gt;조사&lt;/b&gt;');
        expect(html).toContain('approval-table');
        expect(html).toContain('<h2>미발견 (2건)</h2>');
        expect(html).not.toMatch(/금액<\/th>/);
    });
});

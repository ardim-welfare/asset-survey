/**
 * 결과 보고서 표 (기획서 F15) — PDF와 엑셀이 같은 표를 쓴다(내용이 어긋나지 않게).
 *
 * 화면·파일 형식과 떨어진 순수 변환이라 단위 테스트로 고정한다.
 * 사람 이름은 제출·승인한 사람만 담는다(누가 찍었는지는 담지 않는다 — 최소수집).
 */
import { CONDITION_LABEL, SCAN_RESULT_LABEL } from './judge';
import type { SurveyReport, ReportSpace } from './report';
import type { Survey, Scan } from '../../types/survey';

export interface ReportTable {
    title: string;
    columns: string[];
    rows: Array<Array<string | number>>;
    /** 행이 없을 때 표 대신 쓸 문장 */
    empty: string;
}

export interface ReportContext {
    survey: Pick<Survey, 'name' | 'startDate' | 'endDate' | 'mode' | 'status'>;
    report: SurveyReport;
    /** 공간 키 → 이름(마감 회차는 survey.spaceNames) */
    spaceName: (key: string | null) => string;
    /** uid → 이름 */
    personName: (uid: string | null) => string;
}

const MODE_LABEL = { delegated: '나눠서 조사', solo: '혼자 조사' } as const;

/** 공간별 제출·승인 상태 한 줄 */
export function submissionText(space: ReportSpace, mode: 'delegated' | 'solo', personName: (uid: string | null) => string): string {
    if (mode === 'solo') return '-';
    const x = space.submission;
    if (!x) return space.key === '_none' ? '관리자 확인' : '미제출';
    if (x.state === 'submitted') return `제출(${personName(x.submittedByUid)})`;
    if (x.state === 'rejected') return `반려 — ${x.reason}`;
    const kind = x.proxyApproved ? '대신 승인' : x.selfApproved ? '본인 승인' : '승인';
    return `${kind}(${personName(x.reviewedByUid)})${x.reason ? ` — ${x.reason}` : ''}`;
}

export function reportHeader(ctx: ReportContext): Array<[string, string]> {
    const { survey } = ctx;
    return [
        ['회차', survey.name],
        ['기간', `${survey.startDate} ~ ${survey.endDate}`],
        ['조사 방식', MODE_LABEL[survey.mode]],
        ['상태', survey.status === 'closed' ? '마감' : '진행 중(중간 보고서)'],
    ];
}

export function buildReportTables(ctx: ReportContext): ReportTable[] {
    const { report, spaceName } = ctx;
    const s = report.summary;
    const scanRow = (x: Scan, extra: Array<string | number> = []) => [x.code, x.name ?? '', ...extra];

    return [
        {
            title: '종합',
            columns: ['대상', '확인', '미발견', '다른 공간', '미등록', '범위 밖', '파손·불용 필요', '라벨 훼손', '직접 입력(재확인)'],
            rows: [[s.target, s.found, s.missing, s.otherSpace, s.unregistered, s.outOfScope, s.damaged, s.labelDamaged, s.manual]],
            empty: '',
        },
        {
            title: '공간별',
            columns: ['공간', '대상', '확인', '미발견', '다른 곳에서 찾음', '직접 입력', '상태 이상', '제출·승인'],
            rows: report.spaces.map((x) => [
                spaceName(x.key), x.target, x.found, x.missing, x.elsewhere, x.manual, x.issues,
                submissionText(x, ctx.survey.mode, ctx.personName),
            ]),
            empty: '대상 공간이 없습니다.',
        },
        {
            title: '미발견',
            columns: ['자산코드', '품명', '목록상 공간'],
            rows: report.missing.map((m) => [m.code, m.name ?? '', spaceName(m.spaceKey)]),
            empty: '모든 대상을 찾았습니다.',
        },
        {
            title: '위치 다름',
            columns: ['자산코드', '품명', '목록상 공간', '찾은 공간'],
            rows: report.otherSpace.map((x) => scanRow(x, [spaceName(x.expectedSpaceId), spaceName(x.spaceId)])),
            empty: '없음',
        },
        {
            title: '파손·불용 필요',
            columns: ['자산코드', '품명', '찾은 공간', '메모'],
            rows: report.damaged.map((x) => scanRow(x, [spaceName(x.spaceId), x.memo])),
            empty: '없음',
        },
        {
            title: '라벨 훼손',
            columns: ['자산코드', '품명', '찾은 공간', '메모'],
            rows: report.labelDamaged.map((x) => scanRow(x, [spaceName(x.spaceId), x.memo])),
            empty: '없음',
        },
        {
            title: '미등록',
            columns: ['읽힌 코드', '찾은 공간', '물건 상태', '메모'],
            rows: report.unregistered.map((x) => [x.code, spaceName(x.spaceId), CONDITION_LABEL[x.condition], x.memo]),
            empty: '없음',
        },
        {
            title: '범위 밖(불용·폐기 등)',
            columns: ['자산코드', '품명', '찾은 공간', '메모'],
            rows: report.outOfScope.map((x) => scanRow(x, [spaceName(x.spaceId), x.memo])),
            empty: '없음',
        },
        {
            title: '직접 입력(재확인 대상)',
            columns: ['자산코드', '품명', '찾은 공간', '판정'],
            rows: report.manual.map((x) => scanRow(x, [spaceName(x.spaceId), SCAN_RESULT_LABEL[x.result]])),
            empty: '없음',
        },
    ];
}

/**
 * 재물조사 결과 보고서 엑셀 (기획서 F15) — 보고서 표마다 시트 하나, 반출 기록
 */
import { describe, it, expect, vi } from 'vitest';

const sheets: Array<{ name: string; aoa: unknown[][] }> = [];
const writeFile = vi.fn();
vi.mock('xlsx', () => ({
    utils: {
        aoa_to_sheet: (aoa: unknown[][]) => ({ aoa }),
        book_new: () => ({}),
        book_append_sheet: (_wb: unknown, ws: { aoa: unknown[][] }, name: string) => sheets.push({ name, aoa: ws.aoa }),
    },
    writeFile: (...a: unknown[]) => writeFile(...a),
}));
const recordExport = vi.fn();
vi.mock('../../lib/audit/recordExport', () => ({ recordExport: (...a: unknown[]) => recordExport(...a) }));

import { downloadSurveyReportExcel } from '../../lib/excelExport';
import { buildReport } from '../../lib/survey/report';

describe('downloadSurveyReportExcel', () => {
    it('표마다 시트를 만들고 첫 시트에 회차 정보를 적는다', async () => {
        const report = buildReport([{ id: 't', organizationId: 'o', surveyId: 's', spaceId: 'sp', lastEditedByUid: 'a', items: [{ id: 'a1', code: '1', name: 'TV', tagId: null }] }], [], [], ['sp']);
        await downloadSurveyReportExcel({
            survey: { name: '2026 조사', startDate: '2026-11-21', endDate: '2026-12-05', mode: 'solo', status: 'closed' },
            report, spaceName: () => '101호', personName: () => '-',
        }, '행복복지관', '재물조사_2026');

        expect(sheets.map((s) => s.name)).toEqual([
            '종합', '공간별', '미발견', '위치 다름', '파손·불용 필요', '라벨 훼손', '미등록', '범위 밖(불용·폐기 등)', '직접 입력(재확인 대상)',
        ]);
        expect(sheets[0].aoa[0]).toEqual(['기관명', '행복복지관']);
        expect(sheets[2].aoa).toEqual([['자산코드', '품명', '목록상 공간'], ['1', 'TV', '101호']]);
        expect(sheets[3].aoa).toEqual([['자산코드', '품명', '목록상 공간', '찾은 공간'], ['없음']]);
        expect(writeFile).toHaveBeenCalledWith(expect.anything(), '재물조사_2026.xlsx');
        expect(recordExport).toHaveBeenCalledWith('excel', 'surveyReport', 1);
    });
});

// @vitest-environment node
/**
 * 엑셀 읽기 — 실제 xlsx 파일을 만들어 읽는다 (기획서 F04·F05)
 *
 * 희망이음 대장 모양(제목 줄 → 빈 줄 → 머리글 → 데이터 → 합계 줄)과 공유패키지 기관이 겪은
 * 함정(틀린 범위 정보, 코드 없는 줄, 겹친 코드, 못 읽는 숫자)을 재현한다.
 */
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
    readWorkbook, detectHeaderRow, toImportTable, parseAssets, blockingReasons, fixRange,
} from '../../../lib/import/parseSheet';
import { autoMapColumns } from '../../../lib/import/columns';

const HEADER = ['자산분류', '자산코드', '자산명', '취득일자', '취득수량', '현재수량', '자산금액',
    '감가상각충당금', '잔존가액', '자산상태', '자산위치', '운영부서', '용도'];

function workbook(sheets: Record<string, unknown[][]>): Uint8Array {
    const wb = XLSX.utils.book_new();
    for (const [name, rows] of Object.entries(sheets)) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
    }
    return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}

const LEDGER: unknown[][] = [
    ['고정자산대장'],
    [],
    HEADER,
    ['비품', '1-1-1', 'TV', '2021-03-13', 1, 1, 450000, 449000, 1000, '운영', '101호', '지원팀', '업무용'],
    ['비품', '1-5-1', '냉장고', new Date(2019, 1, 27), 1, 1, '1,200,000', 1199000, 1000, '운영', '101호', '지원팀', ''],
    ['비품', '3-2-4', '모니터', '2019.05.01', 1, 0, 170000, 169000, 1000, '폐기', '본부 사무실', '지원팀', ''],
    [],
    ['', '', '합계', '', '', '', 1820000, '', '', '', '', '', ''],
];

describe('범위 보정', () => {
    it('범위 정보(!ref)가 실제 셀보다 작게 적혀 있어도 실제 셀까지 늘린다', () => {
        const ws = XLSX.utils.aoa_to_sheet(LEDGER);
        ws['!ref'] = 'A1:M4'; // 실제 파일에서 겪은 모양 — 셀은 있는데 범위 정보가 틀렸다
        fixRange(ws, XLSX.utils.decode_cell, XLSX.utils.encode_range);
        expect(ws['!ref']).toBe('A1:M8');
        expect(XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: true }).length).toBe(8);
    });

    it('readWorkbook은 모든 줄을 빈 줄까지 읽는다', async () => {
        const sheets = await readWorkbook(workbook({ 대장: LEDGER }));
        expect(sheets[0].rows.length).toBe(8);
    });
});

describe('머리글 찾기·표 만들기', () => {
    it('제목·빈 줄 아래의 머리글 줄을 찾는다', async () => {
        const [sheet] = await readWorkbook(workbook({ 대장: LEDGER }));
        expect(detectHeaderRow(sheet.rows)).toBe(2);
        const table = toImportTable(sheet)!;
        expect(table.headers).toEqual(HEADER);
        expect(table.dataRows[0].rowNumber).toBe(4); // 엑셀에 보이는 줄 번호
    });

    it('머리글이 없으면 null, 같은 이름의 열은 뒤쪽에 번호를 붙인다', async () => {
        const [plain] = await readWorkbook(workbook({ s: [['가', '나'], [1, 2]] }));
        expect(toImportTable(plain)).toBeNull();
        const [dup] = await readWorkbook(workbook({ s: [['자산코드', '품명', '비고', '비고'], ['1', 'TV', 'a', 'b']] }));
        expect(toImportTable(dup)!.headers).toEqual(['자산코드', '품명', '비고', '비고 (2)']);
    });
});

describe('parseAssets', () => {
    it('희망이음 대장: 건수·상태·금액을 세고 합계 줄을 대조용으로 남긴다', async () => {
        const [sheet] = await readWorkbook(workbook({ 대장: LEDGER }));
        const table = toImportTable(sheet)!;
        const r = parseAssets(table, autoMapColumns(table.headers));

        expect(r.counts).toEqual({ total: 3, active: 2, inactive: 0, disposed: 1 });
        expect(r.amountTotals).toEqual({ all: 1820000, active: 1650000 });
        expect(r.totalRows).toEqual([{ rowNumber: 8, amount: 1820000 }]);
        expect(r.blankRows).toBe(1);
        expect(r.problems).toEqual([]);
        expect(r.assets[1]).toMatchObject({
            code: '1-5-1', name: '냉장고', acquiredAt: '2019-02-27', amount: 1200000, usage: null, status: 'active',
        });
        expect(r.assets[2]).toMatchObject({ code: '3-2-4', acquiredAt: '2019-05-01', status: 'disposed', statusRaw: '폐기' });
    });

    it('겹친 코드는 확정을 막고, 못 읽는 값·코드 없는 줄은 알린다', async () => {
        const [sheet] = await readWorkbook(workbook({ s: [
            ['자산코드', '품명', '금액', '취득일자', '상태'],
            ['A1', '책상', '천원', '2021-02-30', '???'],
            ['A1', '의자', 1000, '', '운영'],
            ['', '메모만 적힌 줄', '', '', ''],
            ['A2', '', '', '', ''],
        ] }));
        const table = toImportTable(sheet)!;
        const map = autoMapColumns(table.headers);
        const r = parseAssets(table, map);

        expect(r.duplicates).toEqual([{ code: 'A1', rowNumbers: [2, 3] }]);
        expect(r.noCodeRows).toEqual([4]);
        expect(r.problems.map((p) => [p.rowNumber, p.field])).toEqual([
            [2, 'acquiredAt'], [2, 'status'], [2, 'amount'], [5, 'name'],
        ]);
        expect(r.assets[0].amount).toBeNull();
        expect(blockingReasons(map, r)).toEqual([expect.stringMatching(/겹치는 줄이 1건/)]);
    });

    it('필수 열을 고르지 않았거나 가져올 재물이 없으면 확정을 막는다', () => {
        expect(blockingReasons({}, null)).toEqual(['자산코드 열을 골라 주세요.', '품명 열을 골라 주세요.']);
        const empty = parseAssets({ sheetName: 's', headerRowIndex: 0, headers: ['자산코드', '품명'], dataRows: [] }, { code: '자산코드', name: '품명' });
        expect(blockingReasons({ code: '자산코드', name: '품명' }, empty)).toEqual([expect.stringMatching(/가져올 재물이 없습니다/)]);
    });
});

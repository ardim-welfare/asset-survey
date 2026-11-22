/**
 * 엑셀 읽기 — 파일 → 시트별 표 → 재물 행 (기획서 F04·F05)
 *
 * 브라우저에서 읽고 원본 파일은 서버로 보내지 않는다. 값만 저장한다.
 *
 * 공유패키지 기관이 실제로 겪은 함정을 그대로 막는다:
 *  - 엑셀의 범위 정보(`!ref`)가 틀려 뒤쪽 행이 잘리는 파일이 있다 → 실제 셀로 범위를 다시 잡는다.
 *  - 머리글이 첫 줄이 아니다(제목 줄·빈 줄이 먼저 온다) → 별칭이 가장 많이 맞는 줄을 머리글로 본다.
 *  - 코드 없는 소계·합계 줄이 섞여 있다 → 재물로 세지 않고, 합계 금액은 대조에 쓴다.
 */
import type { WorkBook, WorkSheet } from 'xlsx';
import { parseUsefulLife } from '../usefulLife';
import { headerScore, type ColumnMap, type ImportField, FIELD_DEF } from './columns';
import { toText, toNumber, toDateText, toStatus, isTotalRow, type AssetStatus } from './values';

export interface SheetTable {
    name: string;
    /** 시트의 모든 줄(빈 칸은 ''), 0부터 */
    rows: unknown[][];
}

export interface ImportTable {
    sheetName: string;
    /** 머리글 줄 위치(0부터) */
    headerRowIndex: number;
    /** 머리글 원문 — 같은 이름이 두 번 나오면 뒤쪽에 " (2)"를 붙여 구분한다 */
    headers: string[];
    /** 머리글 아래 줄들. rowNumber는 엑셀에 보이는 줄 번호(1부터) */
    dataRows: Array<{ rowNumber: number; cells: unknown[] }>;
}

/** 실제 셀로 범위를 다시 잡는다 (`!ref`가 틀린 파일 대비) */
export function fixRange(ws: WorkSheet, decodeCell: (a: string) => { r: number; c: number }, encodeRange: (r: { s: { r: number; c: number }; e: { r: number; c: number } }) => string): void {
    let maxR = -1;
    let maxC = -1;
    for (const key of Object.keys(ws)) {
        if (key.startsWith('!')) continue;
        const { r, c } = decodeCell(key);
        if (r > maxR) maxR = r;
        if (c > maxC) maxC = c;
    }
    if (maxR >= 0) ws['!ref'] = encodeRange({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } });
}

/** 파일 내용 → 시트별 표. xlsx 라이브러리는 이때만 불러온다(번들 분리) */
export async function readWorkbook(data: ArrayBuffer | Uint8Array): Promise<SheetTable[]> {
    const XLSX = await import('xlsx');
    // 바이트 배열로 넘긴다 — ArrayBuffer는 다른 실행 영역(테스트의 jsdom 등)에서 온 것이면 알아보지 못한다
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const wb: WorkBook = XLSX.read(bytes, { type: 'array', cellDates: true });
    return wb.SheetNames.map((name) => {
        const ws = wb.Sheets[name];
        fixRange(ws, XLSX.utils.decode_cell, XLSX.utils.encode_range);
        const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '', blankrows: true });
        return { name, rows };
    });
}

/** 별칭이 가장 많이 맞는 줄(첫 30줄 안, 2칸 이상)을 머리글로 본다. 없으면 -1 */
export function detectHeaderRow(rows: unknown[][]): number {
    let best = -1;
    let bestScore = 1;
    rows.slice(0, 30).forEach((row, i) => {
        const score = headerScore(row);
        if (score > bestScore) {
            best = i;
            bestScore = score;
        }
    });
    return best;
}

/** 시트 → 머리글과 데이터 줄. 머리글을 못 찾으면 null */
export function toImportTable(sheet: SheetTable, headerRowIndex = detectHeaderRow(sheet.rows)): ImportTable | null {
    if (headerRowIndex < 0 || headerRowIndex >= sheet.rows.length) return null;
    const seen = new Map<string, number>();
    const headers = sheet.rows[headerRowIndex].map((cell, i) => {
        const base = toText(cell) ?? `(이름 없는 열 ${i + 1})`;
        const n = (seen.get(base) ?? 0) + 1;
        seen.set(base, n);
        return n === 1 ? base : `${base} (${n})`;
    });
    const dataRows = sheet.rows
        .slice(headerRowIndex + 1)
        .map((cells, i) => ({ rowNumber: headerRowIndex + 2 + i, cells }));
    return { sheetName: sheet.name, headerRowIndex, headers, dataRows };
}

export interface ParsedAsset {
    rowNumber: number;
    code: string;
    name: string | null;
    category: string | null;
    spec: string | null;
    acquiredAt: string | null;
    acquiredQuantity: number | null;
    quantity: number | null;
    /** 내용연수(햇수) */
    usefulLife: number | null;
    status: AssetStatus;
    statusRaw: string | null;
    location: string | null;
    department: string | null;
    usage: string | null;
    amount: number | null;
    depreciation: number | null;
    residual: number | null;
}

export interface ImportProblem {
    rowNumber: number;
    field: ImportField;
    message: string;
    value: string;
}

export interface ParseResult {
    assets: ParsedAsset[];
    /** 아무 값도 없는 줄 */
    blankRows: number;
    /** 코드가 없어 뺀 줄(합계 줄 제외) */
    noCodeRows: number[];
    /** 합계·소계 줄 — 대장이 적어 둔 합계 금액 */
    totalRows: Array<{ rowNumber: number; amount: number | null }>;
    /** 파일 안에서 코드가 겹친 경우 — 확정을 막는다 */
    duplicates: Array<{ code: string; rowNumbers: number[] }>;
    /** 확정은 되지만 사람이 확인할 것 */
    problems: ImportProblem[];
    counts: Record<AssetStatus | 'total', number>;
    /** 자산금액 합 (빈 칸 제외) */
    amountTotals: { all: number; active: number };
}

const cellText = (v: unknown) => String(v instanceof Date ? v.toISOString().slice(0, 10) : v ?? '').trim();

/** 표 + 열 연결 → 재물 행과 검사 결과 */
export function parseAssets(table: ImportTable, map: ColumnMap): ParseResult {
    const index: Partial<Record<ImportField, number>> = {};
    for (const [field, header] of Object.entries(map) as Array<[ImportField, string | undefined]>) {
        if (!header) continue;
        const i = table.headers.indexOf(header);
        if (i >= 0) index[field] = i;
    }
    const get = (cells: unknown[], field: ImportField): unknown => {
        const i = index[field];
        return i == null ? undefined : cells[i];
    };

    const result: ParseResult = {
        assets: [], blankRows: 0, noCodeRows: [], totalRows: [], duplicates: [], problems: [],
        counts: { total: 0, active: 0, inactive: 0, disposed: 0 },
        amountTotals: { all: 0, active: 0 },
    };
    const byCode = new Map<string, number[]>();

    for (const { rowNumber, cells } of table.dataRows) {
        if (cells.every((c) => cellText(c) === '')) {
            result.blankRows++;
            continue;
        }
        const code = toText(get(cells, 'code'));
        if (!code) {
            if (isTotalRow(cells)) {
                result.totalRows.push({ rowNumber, amount: toNumber(get(cells, 'amount')).value });
            } else {
                result.noCodeRows.push(rowNumber);
            }
            continue;
        }

        const problem = (field: ImportField, message: string) =>
            result.problems.push({ rowNumber, field, message, value: cellText(get(cells, field)) });

        const num = (field: ImportField) => {
            const { value, invalid } = toNumber(get(cells, field));
            if (invalid) problem(field, `${FIELD_DEF[field].label}을(를) 숫자로 읽지 못해 비워 둡니다`);
            return value;
        };
        const life = parseUsefulLife(get(cells, 'usefulLife'));
        if (life.invalid) problem('usefulLife', '내용연수를 햇수(0~100)로 읽지 못해 비워 둡니다');
        const date = toDateText(get(cells, 'acquiredAt'));
        if (date.invalid) problem('acquiredAt', '취득일자를 날짜로 읽지 못해 비워 둡니다');
        const statusRaw = toText(get(cells, 'status'));
        const { status, known } = toStatus(statusRaw);
        if (!known) problem('status', '알 수 없는 상태라 운영으로 봅니다');
        const name = toText(get(cells, 'name'));
        if (!name) problem('name', '품명이 비어 있습니다');

        const asset: ParsedAsset = {
            rowNumber, code, name,
            category: toText(get(cells, 'category')),
            spec: toText(get(cells, 'spec')),
            acquiredAt: date.value,
            acquiredQuantity: num('acquiredQuantity'),
            quantity: num('quantity'),
            usefulLife: life.value,
            status, statusRaw,
            location: toText(get(cells, 'location')),
            department: toText(get(cells, 'department')),
            usage: toText(get(cells, 'usage')),
            amount: num('amount'),
            depreciation: num('depreciation'),
            residual: num('residual'),
        };
        result.assets.push(asset);
        byCode.set(code, [...(byCode.get(code) ?? []), rowNumber]);
        result.counts.total++;
        result.counts[status]++;
        if (asset.amount != null) {
            result.amountTotals.all += asset.amount;
            if (status === 'active') result.amountTotals.active += asset.amount;
        }
    }

    for (const [code, rowNumbers] of byCode) {
        if (rowNumbers.length > 1) result.duplicates.push({ code, rowNumbers });
    }
    return result;
}

/** 확정을 막는 이유 — 없으면 빈 배열 */
export function blockingReasons(map: ColumnMap, parsed: ParseResult | null): string[] {
    const reasons: string[] = [];
    if (!map.code) reasons.push('자산코드 열을 골라 주세요.');
    if (!map.name) reasons.push('품명 열을 골라 주세요.');
    if (parsed) {
        if (parsed.assets.length === 0) reasons.push('가져올 재물이 없습니다. 머리글 줄과 열 연결을 확인해 주세요.');
        if (parsed.duplicates.length > 0) reasons.push(`자산코드가 겹치는 줄이 ${parsed.duplicates.length}건 있습니다. 엑셀에서 고친 뒤 다시 올려 주세요.`);
    }
    return reasons;
}

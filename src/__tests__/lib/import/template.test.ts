/**
 * 재물 대장 빈 양식 — 내려받은 양식을 그대로 채워 올리면 열이 모두 저절로 맞아야 한다
 */
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { buildImportTemplate, TEMPLATE_COLUMNS, TEMPLATE_DATA_SHEET } from '../../../lib/import/template';
import { readWorkbook, toImportTable, parseAssets } from '../../../lib/import/parseSheet';
import { autoMapColumns, IMPORT_FIELDS } from '../../../lib/import/columns';

describe('재물 대장 양식', () => {
    it('첫 시트는 머리글만 있는 재물 대장이고, 모든 열이 가져오기 필드에 맞는다', async () => {
        const bytes = XLSX.write(buildImportTemplate(XLSX), { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
        const sheets = await readWorkbook(new Uint8Array(bytes));
        expect(sheets[0].name).toBe(TEMPLATE_DATA_SHEET);
        expect(sheets[0].rows.filter((r) => r.some((c) => String(c).trim() !== ''))).toHaveLength(1);

        // 사용자가 예시대로 한 줄 채운 경우
        const filled = { ...sheets[0], rows: [sheets[0].rows[0], TEMPLATE_COLUMNS.map(([, , ex]) => ex)] };
        const table = toImportTable(filled)!;
        expect(table).not.toBeNull();
        const map = autoMapColumns(table.headers);
        expect(Object.values(map).filter(Boolean)).toHaveLength(TEMPLATE_COLUMNS.length);
        for (const f of IMPORT_FIELDS.filter((d) => d.required)) expect(map[f.field]).toBeTruthy();

        const parsed = parseAssets(table, map);
        expect(parsed.assets).toHaveLength(1);
        expect(parsed.assets[0]).toMatchObject({ code: 'A-2024-001', name: '사무용 책상', location: '본관 2층 상담실', status: 'active' });
    });
});

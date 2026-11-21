/**
 * 가져오기 열 정의 — 엑셀 머리글을 앱의 재물 필드에 맞춘다 (기획서 F04)
 *
 * 희망이음 고정자산대장(13열)·기관 자체 대장·다른 재물관리 앱(앱시트 재물관리대장 등)에서
 * 실제로 쓰는 머리글을 별칭으로 모았다. 순서가 달라도 이름으로 맞추고, 못 알아본 열은
 * 화면에서 직접 고른다(기관별로 저장해 다음에 다시 쓴다).
 *
 * ⚠️ 사람 이름이 들어가는 열(현 사용자·운영담당자 등)은 일부러 필드로 두지 않는다 —
 * 조사에 필요 없고, 가져오면 앱이 직원 실명 사본을 갖게 된다(최소수집).
 */

export type ImportField =
    | 'code' | 'name' | 'category' | 'acquiredAt' | 'quantity' | 'acquiredQuantity'
    | 'amount' | 'depreciation' | 'residual'
    | 'status' | 'location' | 'department' | 'usage' | 'spec';

export interface ImportFieldDef {
    field: ImportField;
    label: string;
    /** 머리글 별칭 — 공백·괄호를 지운 뒤 비교한다 */
    aliases: string[];
    required?: boolean;
    /** 금액 — 관리자만 보는 별도 문서에 저장한다 */
    accounting?: boolean;
}

export const IMPORT_FIELDS: ImportFieldDef[] = [
    { field: 'code', label: '자산코드', required: true,
        aliases: ['자산코드', '자산번호', '관리번호', '자산관리번호', '물품코드', '물품번호', '품목번호', '재물번호', '비품번호'] },
    { field: 'name', label: '품명', required: true,
        aliases: ['자산명', '품명', '물품명', '품목명', '자산이름', '재물명', '비품명'] },
    { field: 'category', label: '분류', aliases: ['자산분류', '자산구분', '자산종류', '분류', '구분', '품목종류', '품목분류'] },
    { field: 'spec', label: '규격', aliases: ['규격', '규격명', '모델명', '모델', '사양'] },
    { field: 'acquiredAt', label: '취득일자', aliases: ['취득일자', '취득일', '구입일자', '구입일', '구매일자', '구매일', '취득년월일'] },
    { field: 'acquiredQuantity', label: '취득수량', aliases: ['취득수량'] },
    { field: 'quantity', label: '현재수량', aliases: ['현재수량', '수량', '보유수량'] },
    { field: 'amount', label: '자산금액', accounting: true,
        aliases: ['자산금액', '취득가액', '취득금액', '취득원가', '구입금액', '구입가격', '금액'] },
    { field: 'depreciation', label: '감가상각충당금', accounting: true, aliases: ['감가상각충당금', '감가상각누계액', '상각누계액'] },
    { field: 'residual', label: '잔존가액', accounting: true, aliases: ['잔존가액', '잔존가치액', '장부가액', '잔존가치'] },
    { field: 'status', label: '자산상태', aliases: ['자산상태', '사용상태', '운영상태', '상태'] },
    { field: 'location', label: '위치', aliases: ['자산위치', '현재위치', '설치장소', '설치위치', '사용장소', '보관장소', '소재지', '위치', '장소'] },
    { field: 'department', label: '부서', aliases: ['운영부서', '관리부서', '담당부서', '사용부서', '부서'] },
    { field: 'usage', label: '용도', aliases: ['용도', '자산명세', '명세', '비고'] },
];

export const FIELD_DEF: Record<ImportField, ImportFieldDef> =
    Object.fromEntries(IMPORT_FIELDS.map((d) => [d.field, d])) as Record<ImportField, ImportFieldDef>;

/** 머리글 비교용 — 공백·괄호·점을 지운다 ("자산 코드", "자산코드(필수)" → "자산코드") */
export function normalizeHeader(text: unknown): string {
    return String(text ?? '')
        .replace(/\(.*?\)|\[.*?\]/g, '')
        .replace(/[\s.·*:]/g, '')
        .trim();
}

/** 열 연결 — 필드 → 머리글 원문(엑셀에 적힌 그대로) */
export type ColumnMap = Partial<Record<ImportField, string>>;

/**
 * 머리글 목록을 필드에 자동으로 맞춘다.
 *
 * `saved`(지난번 기관이 정한 연결)가 이 파일에도 있으면 그것을 먼저 쓴다. 그다음 별칭을
 * **목록 앞쪽(더 구체적인 이름)부터** 찾는다 — "금액"보다 "자산금액"이, "위치"보다 "자산위치"가 먼저다.
 * 한 머리글은 한 필드에만 쓴다.
 */
export function autoMapColumns(headers: string[], saved: ColumnMap = {}): ColumnMap {
    const map: ColumnMap = {};
    const used = new Set<string>();
    const present = new Set(headers);

    for (const def of IMPORT_FIELDS) {
        const prev = saved[def.field];
        if (prev && present.has(prev) && !used.has(prev)) {
            map[def.field] = prev;
            used.add(prev);
        }
    }
    for (const def of IMPORT_FIELDS) {
        if (map[def.field]) continue;
        for (const alias of def.aliases) {
            const hit = headers.find((h) => !used.has(h) && normalizeHeader(h) === alias);
            if (hit) {
                map[def.field] = hit;
                used.add(hit);
                break;
            }
        }
    }
    return map;
}

/** 머리글 줄 점수 — 별칭과 맞는 칸 수. 머리글 줄 찾기에 쓴다 */
export function headerScore(cells: unknown[]): number {
    const all = new Set(IMPORT_FIELDS.flatMap((d) => d.aliases));
    return cells.filter((c) => all.has(normalizeHeader(c))).length;
}

/**
 * 재물 대장 빈 양식 (2026-11-22) — 희망이음·자체 대장 엑셀이 없는 기관이 채워 올리는 양식
 *
 * 첫 시트 '재물 대장'은 머리글만 있다(예시 줄을 넣으면 지우지 않고 올려 가짜 재물이 생긴다).
 * 둘째 시트 '작성 안내'에 열마다 적는 법과 예시를 둔다. 가져오기는 첫 시트를 먼저 연다.
 * 머리글은 가져오기 열 별칭(lib/import/columns.ts)과 그대로 맞물려야 한다 — 테스트가 다시 읽어 확인한다.
 */

/** 양식 열 — [머리글, 적는 법, 예시] */
export const TEMPLATE_COLUMNS: Array<[header: string, guide: string, example: string]> = [
    ['자산코드(필수)', '재물마다 겹치지 않는 번호. 기관 관리번호를 그대로 쓰거나, 없으면 1, 2, 3…처럼 매겨 주세요. QR 라벨에 크게 찍힙니다.', 'A-2024-001'],
    ['품명(필수)', '물건 이름', '사무용 책상'],
    ['분류', '집기·전자기기 등 기관에서 쓰는 분류', '집기'],
    ['규격', '모델명·크기 등', '1400×700'],
    ['위치', "놓인 곳. 앱의 공간 이름과 같게 쓰면 자동으로 연결됩니다. 건물·층을 등록했으면 '본관 2층 상담실'처럼 써도 됩니다.", '본관 2층 상담실'],
    ['현재수량', '숫자만. 비우면 1로 봅니다.', '1'],
    ['취득일자', '2024-03-15처럼', '2024-03-15'],
    ['자산금액', '숫자만(원). 관리자만 봅니다.', '250000'],
    ['자산상태', '운영 / 불용 / 폐기 중 하나. 비우면 운영으로 봅니다.', '운영'],
    ['용도', '쓰는 곳·메모', '상담 업무'],
];

export const TEMPLATE_DATA_SHEET = '재물 대장';
export const TEMPLATE_GUIDE_SHEET = '작성 안내';
export const TEMPLATE_FILE_NAME = '재물대장_양식.xlsx';

/** 안내 시트 줄 — 맨 위 설명 몇 줄 + 열별 표 */
export function templateGuideRows(): string[][] {
    return [
        ['재물 대장 양식 — 첫 시트(재물 대장)에 한 줄에 재물 하나씩 적어 [재물 가져오기]에서 올리세요.'],
        ['자산코드와 품명은 꼭 적어야 합니다. 나머지는 비워도 됩니다. 열 이름은 바꾸지 마세요.'],
        ['같은 파일을 고쳐 다시 올리면 바뀐 것만 반영됩니다(자산코드로 같은 재물을 찾습니다).'],
        [],
        ['열', '적는 법', '예시'],
        ...TEMPLATE_COLUMNS.map(([h, g, e]) => [h, g, e]),
    ];
}

type Xlsx = typeof import('xlsx');

/** 양식 통합 문서 — 테스트가 이것을 다시 읽어 가져오기 열이 다 맞는지 확인한다 */
export function buildImportTemplate(XLSX: Xlsx): import('xlsx').WorkBook {
    const wb = XLSX.utils.book_new();

    const data = XLSX.utils.aoa_to_sheet([TEMPLATE_COLUMNS.map(([h]) => h)]);
    data['!cols'] = TEMPLATE_COLUMNS.map(([h]) => ({ wch: Math.max(10, h.length * 2 + 2) }));
    XLSX.utils.book_append_sheet(wb, data, TEMPLATE_DATA_SHEET);

    const guide = XLSX.utils.aoa_to_sheet(templateGuideRows());
    guide['!cols'] = [{ wch: 16 }, { wch: 90 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, guide, TEMPLATE_GUIDE_SHEET);
    return wb;
}

/** 양식 파일을 만들어 내려받게 한다. xlsx 라이브러리는 이때만 불러온다 */
export async function downloadImportTemplate(): Promise<void> {
    const XLSX = await import('xlsx');
    XLSX.writeFile(buildImportTemplate(XLSX), TEMPLATE_FILE_NAME);
}

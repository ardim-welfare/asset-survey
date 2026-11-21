/**
 * 엑셀 다운로드 유틸리티
 * xlsx 라이브러리는 동적 import로 필요 시에만 로드합니다 (276KB 절약).
 *
 * 차량운행일지에서 가져올 때 운행일지·주유·정비·하이패스 내보내기는 걷어내고
 * 접속기록 내보내기만 남겼다. 재물 목록·조사 결과 내보내기는 이 파일에 이어 붙인다.
 */
import { formatTimestampFull } from './dateUtils';
import { recordExport } from './audit/recordExport';
import type { AuditLog } from '../types/auditLog';
import {
    ACTOR_SOURCE_NOTE, describeChangedFields, describeEvent, describeExportTarget,
} from './auditLogLabels';

/**
 * 접속기록 엑셀 다운로드 — 기관 관리자의 월 1회 점검 결과 보관용
 *
 * 담는 것은 화면에 보이는 것과 같다 — **기록에 없는 것은 파일에도 없다.** 바뀐 값,
 * 반출한 데이터의 내용, 검색 조건은 애초에 저장하지 않으므로 여기에도 나오지 않는다.
 *
 * uid 대신 이름을 쓴다(`nameOf`). 기록에는 최소수집 원칙에 따라 uid만 남지만, 점검하는
 * 사람이 읽어야 하는 파일이므로 표시 시점에 이름을 붙인다 — 화면과 같은 규칙이다.
 *
 * ⚠️ 이 파일은 접속지 IP를 담는다. 즉 이 내보내기 자체가 개인정보 반출이며, 그 사실이
 * 다시 접속기록에 남는다(`recordExport('excel', 'auditLogs', n)`).
 */
export async function downloadAuditLogsExcel(
    logs: AuditLog[],
    nameOf: (uid?: string | null) => string,
    filename = '접속기록',
    { onError }: { onError?: (msg: string) => void } = {},
) {
    if (!logs || logs.length === 0) {
        onError?.('다운로드할 데이터가 없습니다.');
        return false;
    }

    const XLSX = await import('xlsx');

    const rows = logs.map((log) => ({
        '일시': formatTimestampFull(log.at) || '',
        '구분': describeEvent(log),
        '행위자': nameOf(log.actorUid),
        '행위자 확인': ACTOR_SOURCE_NOTE[log.actorSource] || '확정',
        '대상 직원': log.subjectUids.map((uid) => nameOf(uid)).join(', '),
        '바뀐 항목': describeChangedFields(log.changedFields),
        '접속지 IP': log.ip || '',
        '접속 환경': log.userAgent || '',
        '반출 대상': describeExportTarget(log),
        '반출 건수': typeof log.recordCount === 'number' ? log.recordCount : '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);

    ws['!cols'] = [
        { wch: 18 },  // 일시
        { wch: 16 },  // 구분
        { wch: 14 },  // 행위자
        { wch: 14 },  // 행위자 확인
        { wch: 18 },  // 대상 직원
        { wch: 24 },  // 바뀐 항목
        { wch: 16 },  // 접속지 IP
        { wch: 18 },  // 접속 환경
        { wch: 22 },  // 반출 대상
        { wch: 10 },  // 반출 건수
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '접속기록');
    XLSX.writeFile(wb, `${filename}.xlsx`);

    // 접속기록 — 반출 사실만 남긴다(형식·대상·건수). 데이터 내용은 담지 않는다.
    recordExport('excel', 'auditLogs', logs.length);
    return true;
}

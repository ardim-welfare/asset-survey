/**
 * auditLogLabels — 접속기록 코드값을 사람이 읽는 말로
 *
 * 화면과 엑셀이 같은 표를 쓰므로 여기서 한 번에 고정한다.
 */
import { describe, it, expect } from 'vitest';
import { describeChangedFields, describeEvent, describeExportTarget } from '../../lib/auditLogLabels';

describe('auditLogLabels', () => {
    it('대상 + 수행업무를 한 덩어리로 읽는다', () => {
        expect(describeEvent({ action: 'update', targetType: 'user' })).toBe('직원 정보 수정');
        expect(describeEvent({ action: 'login', targetType: 'session' })).toBe('로그인 접속');
    });

    it('바뀐 항목 이름은 표를 따르고, 표에 없는 이름은 원문을 쓴다', () => {
        expect(describeChangedFields(['status', 'role'])).toBe('계정 상태, 권한');
        expect(describeChangedFields(['unknownField'])).toBe('unknownField');
        expect(describeChangedFields([])).toBe('');
    });

    it('반출 대상과 형식을 한 줄로 쓴다', () => {
        expect(describeExportTarget({ exportDataset: 'auditLogs', exportFormat: 'excel' })).toBe('접속기록 · 엑셀 파일');
    });
});

/**
 * sendAlimtalk.test.ts — 알림톡 4종이 알리고에 등록한 템플릿과 같은 값을 보내는지
 *
 * 알림톡은 tpl_code·emtitle_1·message_1이 등록 템플릿과 **한 글자라도 다르면** 발송되지 않는다.
 * 그런데 실패는 운영에서 신청자가 알림을 못 받는 것으로만 드러난다. 그래서 등록한 본문
 * (2026-11-21, 카카오 채널 @소셜프리즘)을 여기에 그대로 적어 두고 코드가 만든 값과 맞춘다.
 * 템플릿을 다시 검수받으면 이 파일의 기대값도 그 문구로 바꾼다.
 */
const mockFetch = jest.fn();
(global as unknown as { fetch: typeof fetch }).fetch = mockFetch as unknown as typeof fetch;

import {
    sendReceivedAlimtalk, sendApprovalAlimtalk, sendRejectionAlimtalk, sendDuplicateAlimtalk,
} from '../services/alimtalk/sendAlimtalk';

const sentParams = () => JSON.parse(mockFetch.mock.calls.at(-1)[1].body).aligo_params as Record<string, string>;

const env = { ...process.env };
beforeEach(() => {
    jest.clearAllMocks();
    process.env.ALIMTALK_PROXY_URL = 'https://proxy.example/send.php';
    process.env.ALIMTALK_PROXY_TOKEN = 'test-token';
    mockFetch.mockResolvedValue({ json: async () => ({ success: true }) });
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
    process.env = { ...env };
    jest.restoreAllMocks();
});

describe('등록 템플릿과 같은 값을 보낸다', () => {
    it('신청 접수 UO_1053', async () => {
        await sendReceivedAlimtalk('010-1234-5678', '홍길동', '행복복지관', '2026-11-21');
        expect(sentParams()).toEqual({
            tpl_code: 'UO_1053', receiver_1: '01012345678', recvname_1: '홍길동', subject_1: '재물조사',
            emtitle_1: '기관 신청이 접수되었습니다',
            message_1: [
                '안녕하세요, 홍길동님.',
                '재물조사 서비스에 기관 등록 신청이 접수되었습니다.',
                '',
                '■ 신청 기관: 행복복지관',
                '■ 신청 일자: 2026-11-21',
                '',
                '제출하신 증빙서류를 운영자가 확인한 뒤 결과를 알림톡과 이메일로 안내해 드립니다.',
            ].join('\n'),
        });
    });

    it('승인 UO_1054 — 본문에는 초대 코드가 붙은 링크, 버튼은 등록한 고정 주소', async () => {
        await sendApprovalAlimtalk('01012345678', '홍길동', '행복복지관', 'AB23CD');
        const p = sentParams();
        expect(p).toMatchObject({ tpl_code: 'UO_1054', emtitle_1: '기관 신청이 승인됐습니다.', subject_1: '재물조사' });
        const base = p.message_1.match(/서비스 링크 : (https:\/\/[^?]+)\?code=AB23CD/)?.[1];
        expect(base).toBeTruthy();
        expect(p.message_1).toBe([
            '안녕하세요. 홍길동님!',
            '행복복지관에서 신청해주셔서 감사합니다.',
            '',
            '아래 정보를 사용하여 기관관리자로 등록해주세요.',
            `서비스 링크 : ${base}?code=AB23CD`,
            '로그인 방법 : 구글 계정으로 로그인',
            '초대 코드 : AB23CD',
            '',
            '안내사항',
            '- 이 초대 코드로 처음 등록하는 Google 계정이 기관관리자로 등록됩니다.',
            '- 초대 코드는 안전하게 보관해주세요.',
        ].join('\n'));
        expect(JSON.parse(p.button_1)).toEqual({
            button: [{ name: '재물조사 서비스링크', linkType: 'WL', linkM: base, linkP: base }],
        });
    });

    it('반려 UO_1055 — 버튼 없음', async () => {
        await sendRejectionAlimtalk('01012345678', '홍길동', '행복복지관', '2026-11-21', '증빙서류가 흐려 읽을 수 없습니다.');
        const p = sentParams();
        expect(p).toMatchObject({ tpl_code: 'UO_1055', emtitle_1: '기관 신청 결과 안내' });
        expect(p.button_1).toBeUndefined();
        expect(p.message_1).toBe([
            '안녕하세요, 홍길동님.',
            '재물조사 서비스에 신청하신 기관 등록이 아래와 같은 사유로 반려되었습니다.',
            '내용을 확인하신 후 정보를 수정하여 다시 신청해 주시기 바랍니다.',
            '■ 신청 기관: 행복복지관',
            '■ 신청 일자: 2026-11-21',
            '■ 반려 사유:',
            '증빙서류가 흐려 읽을 수 없습니다.',
        ].join('\n'));
    });

    it('중복 신청 UO_1056 — 버튼 없음', async () => {
        await sendDuplicateAlimtalk('01012345678', '홍길동', '행복복지관', '2026-11-21');
        const p = sentParams();
        expect(p).toMatchObject({ tpl_code: 'UO_1056', emtitle_1: '이미 등록된 기관입니다' });
        expect(p.button_1).toBeUndefined();
        expect(p.message_1).toBe([
            '안녕하세요, 홍길동님.',
            '신청하신 기관은 같은 고유번호로 재물조사에 이미 등록되어 있거나 신청이 진행 중입니다.',
            '',
            '■ 신청 기관: 행복복지관',
            '■ 신청 일자: 2026-11-21',
            '',
            '새로 신청하지 않으셔도 됩니다. 기관 관리자에게 초대 코드를 받아 참여해 주세요.',
        ].join('\n'));
    });
});

describe('프록시 호출', () => {
    it('토큰을 헤더로 실어 프록시 주소로 보낸다', async () => {
        await sendDuplicateAlimtalk('01012345678', '홍길동', '행복복지관', '2026-11-21');
        const [url, init] = mockFetch.mock.calls[0];
        expect(url).toBe('https://proxy.example/send.php');
        expect(init.headers['X-API-Token']).toBe('test-token');
    });

    it('프록시 주소가 비어 있으면 보내지 않는다(쓰지 않기로 한 기간의 꺼 두기)', async () => {
        delete process.env.ALIMTALK_PROXY_URL;
        const r = await sendReceivedAlimtalk('01012345678', '홍길동', '행복복지관', '2026-11-21');
        expect(r.success).toBe(false);
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('프록시 호출이 예외로 끝나도 던지지 않는다(신청 처리를 막지 않는다)', async () => {
        mockFetch.mockRejectedValueOnce(new Error('ECONNRESET'));
        await expect(sendApprovalAlimtalk('01012345678', '홍길동', '행복복지관', 'AB23CD'))
            .resolves.toEqual({ success: false, message: 'ECONNRESET' });
    });
});

/**
 * sendAlimtalk — Cafe24 PHP 프록시를 통한 카카오 알림톡 발송 헬퍼
 *
 * Cloud Functions에서 메시지를 구성하고, PHP 프록시는 알리고 API로 패스스루합니다.
 * Node.js의 \n은 확실히 LF(0x0A)이므로 CRLF 문제가 발생하지 않습니다.
 *
 * ## 템플릿 (카카오 채널 @소셜프리즘, 강조표기형, 2026-11-21 등록)
 * | 함수 | 코드 | 템플릿명 |
 * |---|---|---|
 * | sendReceivedAlimtalk  | UO_1053 | 재물조사 신청접수 |
 * | sendApprovalAlimtalk  | UO_1054 | 재물조사 승인 |
 * | sendRejectionAlimtalk | UO_1055 | 재물조사 반려 |
 * | sendDuplicateAlimtalk | UO_1056 | 재물조사 중복신청 |
 *
 * ⚠️ message_1·emtitle_1은 **등록한 템플릿과 글자 하나까지 같아야** 발송된다(변수 자리만 실제 값).
 *    빈 줄·마침표·■까지 같아야 한다. 문구를 바꾸려면 알리고에서 템플릿을 다시 검수받고 여기를 함께 고친다.
 *    서브타이틀("재물조사")은 템플릿에 고정돼 있어 보내지 않는다.
 * ⚠️ 승인 템플릿 버튼 링크는 https://asset-survey-sp.web.app 로 등록했다. 전용 도메인으로 옮기면
 *    템플릿 버튼도 다시 검수받아야 한다(버튼 URL이 템플릿과 다르면 발송 실패).
 * 차량운행일지 템플릿(UG_2592·UG_2597·UI_6491)은 그 서비스 문구라 쓰지 않는다.
 */
import { maskPhone, maskName } from "../../utils/mask";
import { serviceUrl } from "../../utils/serviceUrl";

export interface AlimtalkResult {
    success: boolean;
    code?: number;
    message?: string;
}

const SERVICE_URL = serviceUrl();

/** 프록시 호출 공통부 — 환경변수 확인, 전화번호 정리, 응답 로그 */
async function sendViaProxy(
    label: string,
    tplCode: string,
    phone: string,
    name: string,
    emtitle: string,
    message: string,
    button?: string,
): Promise<AlimtalkResult> {
    const proxyUrl = process.env.ALIMTALK_PROXY_URL;
    const proxyToken = process.env.ALIMTALK_PROXY_TOKEN;

    if (!proxyUrl || !proxyToken) {
        console.error(`[Alimtalk] ❌ ${label}: 프록시 환경변수가 설정되지 않았습니다.`);
        return { success: false, message: "프록시 환경변수 미설정" };
    }

    // 알리고 API 파라미터 (PHP에서 인증 정보 추가)
    const aligoParams: Record<string, string> = {
        tpl_code: tplCode,
        receiver_1: phone.replace(/-/g, ""),
        recvname_1: name,
        subject_1: "재물조사",
        emtitle_1: emtitle,
        message_1: message,
    };
    if (button) aligoParams.button_1 = button;

    try {
        const response = await fetch(proxyUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Token": proxyToken,
            },
            body: JSON.stringify({ aligo_params: aligoParams }),
        });

        const result = await response.json() as Record<string, unknown>;
        if (result.success) {
            console.log(`[Alimtalk] ✅ ${label} 발송 성공: ${maskPhone(phone)} (${maskName(name)})`);
        } else {
            console.error(`[Alimtalk] ❌ ${label} 발송 실패: code=${result.code}, message=${result.message}`);
        }
        return result as unknown as AlimtalkResult;
    } catch (err: unknown) {
        console.error(`[Alimtalk] ❌ ${label} 프록시 호출 중 예외:`, (err as Error).message);
        return { success: false, message: (err as Error).message };
    }
}

/**
 * 신청 접수 안내 (UO_1053) — AI가 자동으로 결정하지 못해 운영자 심사로 넘어갈 때만 보낸다.
 * 자동 승인·반려되는 신청에는 결과 알림톡만 간다(접수와 결과가 동시에 두 통 가지 않게).
 */
export async function sendReceivedAlimtalk(
    phone: string,
    name: string,
    orgName: string,
    applicationDate: string,
): Promise<AlimtalkResult> {
    const message = [
        `안녕하세요, ${name}님.`,
        "재물조사 서비스에 기관 등록 신청이 접수되었습니다.",
        "",
        `■ 신청 기관: ${orgName}`,
        `■ 신청 일자: ${applicationDate}`,
        "",
        "제출하신 증빙서류를 운영자가 확인한 뒤 결과를 알림톡과 이메일로 안내해 드립니다.",
    ].join("\n");
    return sendViaProxy("접수", "UO_1053", phone, name, "기관 신청이 접수되었습니다", message);
}

/** 승인 안내 (UO_1054) — 초대 코드와 서비스 링크 */
export async function sendApprovalAlimtalk(
    phone: string,
    name: string,
    centerName: string,
    inviteCode: string,
): Promise<AlimtalkResult> {
    const message = [
        `안녕하세요. ${name}님!`,
        `${centerName}에서 신청해주셔서 감사합니다.`,
        "",
        "아래 정보를 사용하여 기관관리자로 등록해주세요.",
        `서비스 링크 : ${SERVICE_URL}?code=${inviteCode}`,
        "로그인 방법 : 구글 계정으로 로그인",
        `초대 코드 : ${inviteCode}`,
        "",
        "안내사항",
        "- 이 초대 코드로 처음 등록하는 Google 계정이 기관관리자로 등록됩니다.",
        "- 초대 코드는 안전하게 보관해주세요.",
    ].join("\n");

    // 버튼 URL은 템플릿에 등록한 고정 주소 — 쿼리 파라미터를 붙이면 템플릿 불일치로 실패한다
    const button = JSON.stringify({
        button: [{
            name: "재물조사 서비스링크",
            linkType: "WL",
            linkM: SERVICE_URL,
            linkP: SERVICE_URL,
        }],
    });
    return sendViaProxy("승인", "UO_1054", phone, name, "기관 신청이 승인됐습니다.", message, button);
}

/** 반려 안내 (UO_1055) — 운영자 수동 반려, 영리 서류·서비스 대상 아님 자동 반려 공용 */
export async function sendRejectionAlimtalk(
    phone: string,
    name: string,
    orgName: string,
    applicationDate: string,
    reason: string,
): Promise<AlimtalkResult> {
    const message = [
        `안녕하세요, ${name}님.`,
        "재물조사 서비스에 신청하신 기관 등록이 아래와 같은 사유로 반려되었습니다.",
        "내용을 확인하신 후 정보를 수정하여 다시 신청해 주시기 바랍니다.",
        `■ 신청 기관: ${orgName}`,
        `■ 신청 일자: ${applicationDate}`,
        "■ 반려 사유:",
        reason,
    ].join("\n");
    return sendViaProxy("반려", "UO_1055", phone, name, "기관 신청 결과 안내", message);
}

/**
 * 중복 신청 안내 (UO_1056) — 같은 고유번호로 이미 승인됐거나 대기 중인 기관이 있을 때.
 * 기존 기관의 신청자·연락처는 알림톡에 싣지 않는다(다른 사람의 개인정보).
 */
export async function sendDuplicateAlimtalk(
    phone: string,
    name: string,
    orgName: string,
    applicationDate: string,
): Promise<AlimtalkResult> {
    const message = [
        `안녕하세요, ${name}님.`,
        "신청하신 기관은 같은 고유번호로 재물조사에 이미 등록되어 있거나 신청이 진행 중입니다.",
        "",
        `■ 신청 기관: ${orgName}`,
        `■ 신청 일자: ${applicationDate}`,
        "",
        "새로 신청하지 않으셔도 됩니다. 기관 관리자에게 초대 코드를 받아 참여해 주세요.",
    ].join("\n");
    return sendViaProxy("중복 신청", "UO_1056", phone, name, "이미 등록된 기관입니다", message);
}

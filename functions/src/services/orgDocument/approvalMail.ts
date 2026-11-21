/**
 * approvalMail — 기관 승인 메일 본문 (단일 원본)
 *
 * 관리자 수동 승인(handlers/callable/sendApprovalEmail)과 자동 검증 승인
 * (services/orgDocument/verifyHelpers)이 같은 메일을 Gmail로 직접 보낸다.
 * 자동 검증 쪽은 원래 EmailJS(외부 템플릿)였는데 2026-11-21 빼고 Gmail로 합쳤다 —
 * 템플릿이 차량운행일지 계정에 있었고, 처리위탁 업체를 하나 줄이려는 것이다.
 */
import { escapeHtml } from "../../utils/helpers";
import { systemMailFrom } from "../../core/mailer";
import { serviceUrl } from "../../utils/serviceUrl";

export function approvalMailOptions(recipientEmail: string, orgName: string, inviteCode: string, applicantName?: string) {
    const displayName = applicantName || orgName;
    const joinUrl = `${serviceUrl()}?code=${encodeURIComponent(inviteCode)}`;
    return {
        from: systemMailFrom(),
        to: recipientEmail,
        subject: `[재물조사] ${orgName} 기관 승인 완료`,
        html: `
                <div style="font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="background: linear-gradient(135deg, #3B82F6, #2563EB); color: white; padding: 24px; border-radius: 12px 12px 0 0;">
                        <h2 style="margin: 0; font-size: 20px;">✅ 기관 승인이 완료되었습니다</h2>
                    </div>
                    <div style="background: #F8FAFC; padding: 24px; border: 1px solid #E2E8F0; border-top: none; border-radius: 0 0 12px 12px;">
                        <p style="color: #1E293B; font-size: 16px;">안녕하세요, <strong>${escapeHtml(displayName)}</strong>님!</p>
                        <p style="color: #475569;"><strong>${escapeHtml(orgName)}</strong> 기관의 신청이 승인되었습니다.</p>
                        <div style="background: white; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; margin: 16px 0; text-align: center;">
                            <p style="color: #64748B; font-size: 14px; margin: 0 0 8px;">초대 코드</p>
                            <p style="color: #1E293B; font-size: 24px; font-weight: 700; margin: 0; letter-spacing: 2px;">${escapeHtml(inviteCode)}</p>
                        </div>
                        <p style="color: #475569; font-size: 14px;">위 초대 코드를 직원들에게 공유하여 기관에 가입하도록 안내해 주세요.</p>
                        <div style="margin-top: 20px; text-align: center;">
                            <a href="${escapeHtml(joinUrl)}"
                               style="display: inline-block; background: #3B82F6; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
                                서비스 바로가기
                            </a>
                        </div>
                    </div>
                    <p style="text-align: center; color: #94A3B8; font-size: 12px; margin-top: 16px;">
                        이 메일은 재물조사 시스템에서 자동 발송되었습니다.
                    </p>
                </div>
            `,
    };
}

/**
 * inviteMail — 미리 등록한 직원에게 보내는 초대 메일 본문 (2026-11-23)
 *
 * 관리자가 [팀·직원 관리]에서 가입 대기 직원을 골라 보낸다(handlers/callable/sendInviteEmails).
 * 본문은 승인 메일(approvalMail.ts)과 같은 모양이다. 가입은 **미리 등록한 그 이메일의 구글 계정**으로 해야
 * 이름·팀이 저절로 들어가므로 그 점을 분명히 적는다.
 */
import { escapeHtml } from "../../utils/helpers";
import { systemMailFrom } from "../../core/mailer";
import { serviceUrl } from "../../utils/serviceUrl";

export function inviteMailOptions(to: string, name: string, orgName: string, inviteCode: string) {
    const joinUrl = `${serviceUrl()}?code=${encodeURIComponent(inviteCode)}`;
    return {
        from: systemMailFrom(),
        to,
        subject: `[재물조사] ${orgName}에서 재물조사 앱에 초대했습니다`,
        html: `
                <div style="font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="background: linear-gradient(135deg, #3B82F6, #2563EB); color: white; padding: 24px; border-radius: 12px 12px 0 0;">
                        <h2 style="margin: 0; font-size: 20px;">📦 재물조사 앱에 초대합니다</h2>
                    </div>
                    <div style="background: #F8FAFC; padding: 24px; border: 1px solid #E2E8F0; border-top: none; border-radius: 0 0 12px 12px;">
                        <p style="color: #1E293B; font-size: 16px;">안녕하세요, <strong>${escapeHtml(name)}</strong>님!</p>
                        <p style="color: #475569;"><strong>${escapeHtml(orgName)}</strong>에서 재물조사에 함께하도록 초대했습니다. 휴대폰으로 재물의 QR 라벨을 찍어 조사하는 앱입니다.</p>
                        <ol style="color: #475569; font-size: 14px; line-height: 1.7; padding-left: 20px;">
                            <li>아래 [가입하기]를 누르세요.</li>
                            <li><strong>이 메일을 받은 주소(${escapeHtml(to)})의 구글 계정</strong>으로 로그인하세요. 그래야 이름과 팀이 저절로 들어갑니다.</li>
                            <li>약관에 동의하면 끝입니다. 홈 화면에 추가해 두면 앱처럼 쓸 수 있어요.</li>
                        </ol>
                        <div style="margin-top: 20px; text-align: center;">
                            <a href="${escapeHtml(joinUrl)}"
                               style="display: inline-block; background: #3B82F6; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600;">
                                가입하기
                            </a>
                        </div>
                        <p style="color: #64748B; font-size: 13px; margin-top: 16px;">버튼이 열리지 않으면 이 주소를 복사해 크롬·사파리에서 여세요: ${escapeHtml(joinUrl)}<br>기관 코드: <strong>${escapeHtml(inviteCode)}</strong></p>
                    </div>
                    <p style="text-align: center; color: #94A3B8; font-size: 12px; margin-top: 16px;">
                        이 메일은 ${escapeHtml(orgName)} 관리자의 요청으로 재물조사 시스템에서 보냈습니다. 받을 사람이 아니면 무시하셔도 됩니다.
                    </p>
                </div>
            `,
    };
}

/**
 * verifyHelpers — 기관 자동 검증 공통 유틸리티
 *
 * autoVerifyDocument.ts에서 분리된 헬퍼 함수 및 이메일 발송 로직.
 */
import { getStorage } from "firebase-admin/storage";
import { createGmailTransporter, isGmailConfigured, systemMailFrom } from "../../core/mailer";
import { maskEmail } from "../../utils/mask";
import { escapeHtml } from "../../utils/helpers";
import { approvalMailOptions } from "./approvalMail";

// ── 마스킹 유틸리티 ──
// 구현은 utils/mask.ts로 승격됨 (알림톡·이메일 로그 마스킹과 공용).
// 기존 import 경로 호환을 위해 re-export 유지.
export { maskName, maskEmail } from "../../utils/mask";

// ── 비영리 판별 ──
// 구현은 documentScreen.ts로 이관됨 (접수 프리스크린과 공용 — 접수 경로가 이메일 발송
// 모듈까지 끌어오지 않도록 분리). 기존 import 경로 호환을 위해 re-export 유지.
export { classifyByBizNumber } from "./documentScreen";

// ── 파일 유틸리티 ──

/**
 * Firebase Storage download URL에서 파일을 다운로드하여 base64로 변환
 *
 * Admin SDK 다운로드는 URL의 토큰을 무시하고 경로만 사용하므로, 호출자가 URL을 조작해
 * 타 기관 파일을 읽을 수 있다. expectedPathPrefix로 허용 경로를 강제한다 (2026-07-10 감사 #3).
 */
export async function downloadFileAsBase64(pathOrUrl: string, expectedPathPrefix?: string): Promise<{ base64: string; mimeType: string }> {
    const storage = getStorage();
    // 레거시 토큰 URL이면 경로를 역추출하고, 아니면 이미 Storage 경로로 간주한다.
    // (2026-07-18 보안 재검증 P0-3 — 신규 문서는 토큰 URL 대신 경로를 저장한다.)
    // 쿼리스트링/프래그먼트 전까지 매칭 — 쿼리 파라미터가 없어도 견고하게 동작한다.
    const urlMatch = pathOrUrl.match(/\/o\/([^?#]+)/);
    const filePath = urlMatch ? decodeURIComponent(urlMatch[1]) : pathOrUrl;
    // 경로 조작(상대경로·역슬래시·선행 슬래시) 및 허용 범위 밖 접근 차단
    if (filePath.includes("..") || filePath.includes("\\") || filePath.startsWith("/")) {
        throw new Error("유효하지 않은 파일 경로입니다: " + filePath);
    }
    if (expectedPathPrefix && !filePath.startsWith(expectedPathPrefix)) {
        throw new Error(`허용 범위를 벗어난 Storage 경로입니다: ${filePath} (기대 prefix: ${expectedPathPrefix})`);
    }
    const isPdf = filePath.toLowerCase().endsWith(".pdf");
    const mimeType = isPdf ? "application/pdf" : "image/jpeg";

    const [buffer] = await storage.bucket().file(filePath).download();
    return { base64: buffer.toString("base64"), mimeType };
}

// ── 이메일 발송 ──

/**
 * 승인 이메일 발송 (Nodemailer — Gmail SMTP)
 *
 * 관리자 수동 승인과 같은 본문(approvalMail.ts)을 쓴다. 원래 EmailJS였다(2026-11-21 제거).
 */
export async function sendApprovalEmailServer(recipientEmail: string, orgName: string, inviteCode: string, applicantName?: string): Promise<boolean> {
    if (!isGmailConfigured()) {
        console.error("[AutoVerify] GMAIL_USER 또는 GMAIL_APP_PASSWORD가 설정되지 않아 승인 이메일을 보내지 못했습니다.");
        return false;
    }
    try {
        const transporter = createGmailTransporter();
        await transporter.sendMail(approvalMailOptions(recipientEmail, orgName, inviteCode, applicantName));
        console.log(`[AutoVerify] 📧 승인 이메일 발송 성공: ${maskEmail(recipientEmail)}`);
        return true;
    } catch (err: unknown) {
        console.error(`[AutoVerify] ❌ 승인 이메일 발송 실패: ${maskEmail(recipientEmail)}`, err);
        return false;
    }
}

/**
 * 거부 이메일 발송 (Nodemailer — Gmail SMTP)
 */
export async function sendRejectionEmail(recipientEmail: string, orgName: string, reason: string): Promise<boolean> {
    try {
        const transporter = createGmailTransporter();

        const mailOptions = {
            from: systemMailFrom(),
            to: recipientEmail,
            subject: `[재물조사] 기관 신청 결과 안내: ${orgName}`,
            html: `
                <div style="font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="background: linear-gradient(135deg, #EF4444, #DC2626); color: white; padding: 24px; border-radius: 12px 12px 0 0;">
                        <h2 style="margin: 0; font-size: 20px;">기관 신청이 승인되지 않았습니다</h2>
                    </div>
                    <div style="background: #F8FAFC; padding: 24px; border: 1px solid #E2E8F0; border-top: none; border-radius: 0 0 12px 12px;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 12px 0; border-bottom: 1px solid #E2E8F0; color: #64748B; width: 100px;">기관명</td>
                                <td style="padding: 12px 0; border-bottom: 1px solid #E2E8F0; font-weight: 600; color: #1E293B;">${escapeHtml(orgName)}</td>
                            </tr>
                            <tr>
                                <td style="padding: 12px 0; color: #64748B;">거부 사유</td>
                                <td style="padding: 12px 0; color: #DC2626; font-weight: 600;">${escapeHtml(reason)}</td>
                            </tr>
                        </table>
                        <div style="margin-top: 20px; padding: 16px; background: #FEF2F2; border-radius: 8px; border: 1px solid #FECACA;">
                            <p style="margin: 0; color: #991B1B; font-size: 14px;">
                                문의사항이 있으시면 관리자에게 연락해 주세요.
                            </p>
                        </div>
                    </div>
                    <p style="text-align: center; color: #94A3B8; font-size: 12px; margin-top: 16px;">
                        이 메일은 재물조사 시스템에서 자동 발송되었습니다.
                    </p>
                </div>
            `,
        };

        await transporter.sendMail(mailOptions);
        console.log(`[AutoVerify] 📧 거부 이메일 발송 성공: ${maskEmail(recipientEmail)}`);
        return true;
    } catch (err: unknown) {
        console.error(`[AutoVerify] ❌ 거부 이메일 발송 실패: ${maskEmail(recipientEmail)}`, (err as Error).message);
        return false;
    }
}

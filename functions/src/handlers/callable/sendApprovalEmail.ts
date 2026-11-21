/**
 * sendApprovalEmail — 기관 승인 시 이메일 발송 (서버사이드)
 *
 * Gmail SMTP로 직접 보낸다. 본문은 자동 검증 승인과 같은 approvalMail.ts를 쓴다.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { checkRateLimitByUid } from "../../utils/rateLimit";
import { RATE_LIMITS } from "../../utils/constants";
import { requireSuperAdmin } from "../../utils/helpers";
import { createGmailTransporter, isGmailConfigured } from "../../core/mailer";
import { maskEmail } from "../../utils/mask";
import { GMAIL_APP_PASSWORD } from "../../core/params";
import { approvalMailOptions } from "../../services/orgDocument/approvalMail";

export const sendApprovalEmail = onCall(
    { region: "asia-northeast3", enforceAppCheck: true, secrets: [GMAIL_APP_PASSWORD] },
    async (request) => {
        requireSuperAdmin(request);

        // Rate Limiting
        await checkRateLimitByUid(
            "sendApprovalEmail",
            request.auth.uid,
            RATE_LIMITS.sendApprovalEmail.max,
            RATE_LIMITS.sendApprovalEmail.windowSec
        );

        // 파라미터 검증
        const { recipientEmail, orgName, inviteCode, applicantName } = request.data;
        if (!recipientEmail || !orgName || !inviteCode) {
            throw new HttpsError("invalid-argument", "recipientEmail, orgName, inviteCode는 필수입니다.");
        }

        // Gmail 환경변수 확인
        if (!isGmailConfigured()) {
            console.error("GMAIL_USER 또는 GMAIL_APP_PASSWORD 환경변수가 설정되지 않았습니다.");
            throw new HttpsError("internal", "이메일 발송 설정이 완료되지 않았습니다.");
        }

        const mailOptions = approvalMailOptions(recipientEmail, orgName, inviteCode, applicantName);

        try {
            const transporter = createGmailTransporter();
            await transporter.sendMail(mailOptions);
            console.log(`승인 이메일 전송 완료: to=${maskEmail(recipientEmail)}, org=${orgName}`);
            return { success: true };
        } catch (err: unknown) {
            console.error("승인 이메일 전송 실패:", (err as Error).message);
            throw new HttpsError("internal", "이메일 발송에 실패했습니다.");
        }
    }
);

/**
 * sendInviteEmails — 가입 대기(미리 등록한) 직원에게 초대 메일을 보낸다 (기관관리자·superAdmin, 2026-11-23)
 *
 * 시범 기관에서 직원 45명을 미리 등록했지만 아무도 가입하지 않았다 — 초대 링크를 따로 복사해 보내야 했다.
 * 관리자가 [팀·직원 관리]에서 고른 사람에게 한 번에 보낸다. 받는 주소는 클라이언트가 아니라 **사전 등록 문서**에서
 * 읽는다(관리자가 임의의 주소로 우리 시스템 메일을 보내지 못하게). 한 번에 100명까지.
 * 같은 사람에게 10분 안에 다시 보내지 않는다(두 번 누름 방지). 보낸 시각·횟수는 사전 등록 문서에 남는다.
 *
 * 권한은 커스텀 클레임(role·orgId)으로 본다 — regenerateInviteCode와 같다.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, type Timestamp } from "firebase-admin/firestore";
import { wrapCallableHandler } from "../../utils/helpers";
import { createGmailTransporter, isGmailConfigured } from "../../core/mailer";
import { GMAIL_APP_PASSWORD } from "../../core/params";
import { inviteMailOptions } from "../../services/organization/inviteMail";
import { maskEmail } from "../../utils/mask";

const db = getFirestore();

/** 한 번에 보내는 최대 인원 */
export const INVITE_MAX = 100;
/** 같은 사람에게 다시 보내기까지 기다리는 시간 */
export const INVITE_COOLDOWN_MS = 10 * 60 * 1000;

interface SendInviteEmailsRequest {
    organizationId?: unknown;
    preRegIds?: unknown;
}

interface SendInviteEmailsResult {
    sent: number;
    skipped: number;
    failed: number;
}

/** 요청 값 검사 — 문자열 ID 1~100개, 겹친 ID는 하나로 */
export function parseInviteRequest(data: SendInviteEmailsRequest | undefined): { organizationId: string; ids: string[] } {
    const { organizationId, preRegIds } = data ?? {};
    if (typeof organizationId !== "string" || organizationId.length === 0) {
        throw new HttpsError("invalid-argument", "organizationId가 필요합니다.");
    }
    if (!Array.isArray(preRegIds) || preRegIds.length === 0 || preRegIds.some((x) => typeof x !== "string" || x.length === 0)) {
        throw new HttpsError("invalid-argument", "보낼 사람을 골라 주세요.");
    }
    const ids = [...new Set(preRegIds as string[])];
    if (ids.length > INVITE_MAX) {
        throw new HttpsError("invalid-argument", `한 번에 ${INVITE_MAX}명까지 보낼 수 있습니다.`);
    }
    return { organizationId, ids };
}

export const sendInviteEmails = onCall(
    // 관리자 화면(InAppBrowserGuard 안쪽)에서만 호출된다.
    { region: "asia-northeast3", enforceAppCheck: true, secrets: [GMAIL_APP_PASSWORD], timeoutSeconds: 300 },
    wrapCallableHandler<SendInviteEmailsRequest, SendInviteEmailsResult>(
        "sendInviteEmails",
        // 정상 사용은 기관 시작 때 몇 번. 상한은 메일 폭탄 남용만 막는다.
        { rateLimitKey: "sendInviteEmails" },
        async (request) => {
            const { organizationId, ids } = parseInviteRequest(request.data);
            const token = request.auth!.token as { role?: unknown; orgId?: unknown };
            const isSuperAdmin = token.role === "superAdmin";
            const isOrgAdmin = token.role === "admin" && token.orgId === organizationId;
            if (!isSuperAdmin && !isOrgAdmin) {
                throw new HttpsError("permission-denied", "해당 기관의 관리자만 초대 메일을 보낼 수 있습니다.");
            }
            if (!isGmailConfigured()) {
                throw new HttpsError("failed-precondition", "메일 발송 설정이 아직 되어 있지 않습니다. 초대 링크를 복사해 보내 주세요.");
            }

            const orgSnap = await db.collection("organizations").doc(organizationId).get();
            const org = orgSnap.data();
            if (!orgSnap.exists || !org) throw new HttpsError("not-found", "기관을 찾을 수 없습니다.");
            if (org.status !== "approved") throw new HttpsError("failed-precondition", "승인된 기관만 초대 메일을 보낼 수 있습니다.");
            if (typeof org.inviteCode !== "string" || !org.inviteCode) {
                throw new HttpsError("failed-precondition", "초대 코드가 없습니다. [코드 새로 만들기]를 먼저 눌러 주세요.");
            }

            const preRef = db.collection("organizations").doc(organizationId).collection("preRegistered");
            const snaps = await db.getAll(...ids.map((id) => preRef.doc(id)));
            const transporter = createGmailTransporter();
            const now = Date.now();
            let sent = 0;
            let skipped = 0;
            let failed = 0;
            for (const snap of snaps) {
                const p = snap.data();
                const email = typeof p?.email === "string" ? p.email.trim() : "";
                const last = (p?.invitedAt as Timestamp | undefined)?.toMillis?.() ?? 0;
                if (!snap.exists || !email || now - last < INVITE_COOLDOWN_MS) { skipped++; continue; }
                try {
                    await transporter.sendMail(inviteMailOptions(email, String(p?.name || email), String(org.name || "기관"), org.inviteCode));
                    await snap.ref.update({ invitedAt: FieldValue.serverTimestamp(), inviteCount: FieldValue.increment(1) });
                    sent++;
                } catch (err) {
                    failed++;
                    console.error(`초대 메일 실패: to=${maskEmail(email)}`, (err as Error).message);
                }
            }
            console.log(`초대 메일: org=${organizationId} 보냄 ${sent} 건너뜀 ${skipped} 실패 ${failed}`);
            return { sent, skipped, failed };
        },
    ),
);

/**
 * computeDashboardStats — 시스템 관리자 운영 현황 대시보드 집계
 *
 * 차량운행일지의 같은 이름 서비스를 재물조사 지표로 옮긴 것이다. 구조도 같다:
 * 밤 배치(dailyNightlyBatch)와 수동 갱신(refreshDashboardStats)이 전 기관을 한 번 훑어
 * `system/dashboardStats` 한 문서에 저장하고, 화면은 그 문서 1건만 읽는다
 * (화면이 매번 전 기관을 풀스캔하면 시스템 관리자가 열 때마다 읽기 비용이 기관 수만큼 든다).
 *
 * 무엇을 보나 — 서비스가 기관에 **자리를 잡는지**:
 * - 요약: 기관(승인·대기·반려·해지)·사용자·재물·공간·조사 회차·스캔 수
 * - 도입 단계 퍼널: 신청 → 승인 → 첫 사용자 가입 → 재물 대장 등록 → 조사 시작 → 조사 마감
 * - 첫 사용자 가입까지 걸린 날(승인 기준) — 승인 뒤 방치되는 기관을 찾는다
 * - 최근 30일 일별 스캔·스캔한 사람 수, 최근 12개월 신규 기관·사용자
 * - 기관별 표: 사용자·재물·공간·조사·30일 스캔·마지막 스캔
 *
 * 읽기 비용: 기관·사용자·조사 회차 문서 전체 + 기관마다 count() 3번 + 최근 30일(또는 이번 달)
 * 스캔 문서. 스캔이 가장 크므로 필요한 필드만 select()한다.
 *
 * 계산(buildDashboardStats)은 순수 함수로 떼어 두었다 — 읽기와 섞이면 테스트에 Firestore 목이
 * 수십 개 필요해져 집계 규칙(퍼널 정의·날짜 경계)이 검사되지 않는다.
 */
import { getFirestore } from "firebase-admin/firestore";
import { getKSTDateString } from "../../utils/kstDate";

const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_DAYS = 30;
const GROWTH_MONTHS = 12;

// ── 입력 행 (Firestore 문서에서 필요한 필드만) ──

export interface OrgRow {
    id: string;
    name: string;
    status: string;
    createdAt: Date | null;
    approvedAt: Date | null;
    firstEmployeeAt: Date | null;
    timeToFirstEmployeeDays: number | null;
}
export interface UserRow {
    organizationId: string | null;
    role: string;
    createdAt: Date | null;
}
export interface SurveyRow {
    organizationId: string;
    status: string;
}
export interface ScanRow {
    organizationId: string;
    scannedByUid: string;
    scannedAt: Date;
}
export interface OrgCounts {
    /** 처분하지 않은 재물(사용·미사용) */
    assets: number;
    spaces: number;
}

export interface DashboardInput {
    now: Date;
    orgs: OrgRow[];
    users: UserRow[];
    surveys: SurveyRow[];
    /** 최근 30일과 이번 달을 모두 덮는 창의 스캔 (scanWindowStart 이후) */
    scans: ScanRow[];
    orgCounts: Map<string, OrgCounts>;
    totalScans: number;
    prevMonthScans: number;
}

// ── 출력 (system/dashboardStats) — 화면 스키마(src/schemas/dashboard.ts)와 짝이다 ──

export interface FunnelStage {
    key: string;
    label: string;
    value: number;
    /** 첫 단계 대비 % */
    rate: number;
    /** 바로 앞 단계 대비 % */
    conversionFromPrev: number;
}
export interface DashboardStats {
    lastUpdatedAt: string;
    computeDurationMs: number;
    overview: {
        approvedOrgs: number; pendingOrgs: number; rejectedOrgs: number; deletedOrgs: number;
        totalUsers: number; adminCount: number; employeeCount: number;
        totalAssets: number; totalSpaces: number;
        openSurveys: number; closedSurveys: number; totalScans: number;
    };
    monthly: {
        monthLabel: string;
        scans: number; prevScans: number;
        /** 이번 달 한 번이라도 스캔한 사람 수 */
        activeUsers: number;
        /** 최근 30일 스캔이 있는 기관 수 / 승인 기관 수 */
        activeOrgs30d: number;
    };
    firstEmployee: { count: number; avgDays: number; medianDays: number; sameDayRate: number } | null;
    funnel: FunnelStage[];
    dailyScans: { date: string; scans: number; users: number }[];
    monthlyGrowth: { month: string; newOrgs: number; cumulativeOrgs: number; newUsers: number }[];
    orgs: {
        id: string; name: string; approvedAt: string | null;
        users: number; assets: number; spaces: number;
        openSurveys: number; closedSurveys: number;
        scans30d: number; lastScanAt: string | null;
    }[];
}

/** KST 기준 이번 달 1일 00:00(KST)의 순간 */
export function kstMonthStart(now: Date, offsetMonths = 0): Date {
    const [y, m] = getKSTDateString(now).split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + offsetMonths, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
    return new Date(`${key}T00:00:00+09:00`);
}

/** 최근 30일 일별 차트의 첫날 00:00(KST) */
export function dailyWindowStart(now: Date): Date {
    return new Date(`${getKSTDateString(new Date(now.getTime() - (DAILY_DAYS - 1) * DAY_MS))}T00:00:00+09:00`);
}

/** 스캔을 읽어야 하는 시작점 — 30일 차트와 이번 달 통계를 모두 덮는 이른 쪽 */
export function scanWindowStart(now: Date): Date {
    const a = dailyWindowStart(now);
    const b = kstMonthStart(now);
    return a < b ? a : b;
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);
const monthKey = (d: Date) => getKSTDateString(d).slice(0, 7);

export function buildDashboardStats(input: DashboardInput): Omit<DashboardStats, "lastUpdatedAt" | "computeDurationMs"> {
    const { now, orgs, users, surveys, scans, orgCounts } = input;

    // ── 요약 ──
    const byStatus = (s: string) => orgs.filter((o) => o.status === s).length;
    const approved = orgs.filter((o) => o.status === "approved");
    const members = users.filter((u) => u.role !== "superAdmin" && u.organizationId);
    let totalAssets = 0;
    let totalSpaces = 0;
    for (const o of approved) {
        const c = orgCounts.get(o.id);
        totalAssets += c?.assets ?? 0;
        totalSpaces += c?.spaces ?? 0;
    }

    // ── 스캔 창 나누기 ──
    const dailyStart = dailyWindowStart(now);
    const monthStart = kstMonthStart(now);
    const scans30 = scans.filter((s) => s.scannedAt >= dailyStart);
    const scansMonth = scans.filter((s) => s.scannedAt >= monthStart);

    // ── 일별 스캔 (최근 30일, 비는 날도 0으로 채운다) ──
    const daily = new Map<string, { scans: number; users: Set<string> }>();
    for (let i = DAILY_DAYS - 1; i >= 0; i--) {
        daily.set(getKSTDateString(new Date(now.getTime() - i * DAY_MS)), { scans: 0, users: new Set() });
    }
    for (const s of scans30) {
        const d = daily.get(getKSTDateString(s.scannedAt));
        if (!d) continue;
        d.scans += 1;
        if (s.scannedByUid) d.users.add(s.scannedByUid);
    }

    // ── 기관별 ──
    const surveyByOrg = new Map<string, { open: number; closed: number }>();
    for (const sv of surveys) {
        const e = surveyByOrg.get(sv.organizationId) ?? { open: 0, closed: 0 };
        if (sv.status === "closed") e.closed += 1; else e.open += 1;
        surveyByOrg.set(sv.organizationId, e);
    }
    const usersByOrg = new Map<string, number>();
    for (const u of members) usersByOrg.set(u.organizationId!, (usersByOrg.get(u.organizationId!) ?? 0) + 1);
    const scanByOrg = new Map<string, { count: number; last: Date }>();
    for (const s of scans30) {
        const e = scanByOrg.get(s.organizationId);
        if (!e) scanByOrg.set(s.organizationId, { count: 1, last: s.scannedAt });
        else { e.count += 1; if (s.scannedAt > e.last) e.last = s.scannedAt; }
    }

    const orgRows = approved.map((o) => {
        const sv = surveyByOrg.get(o.id) ?? { open: 0, closed: 0 };
        const sc = scanByOrg.get(o.id);
        const c = orgCounts.get(o.id);
        return {
            id: o.id,
            name: o.name,
            approvedAt: o.approvedAt ? o.approvedAt.toISOString() : null,
            users: usersByOrg.get(o.id) ?? 0,
            assets: c?.assets ?? 0,
            spaces: c?.spaces ?? 0,
            openSurveys: sv.open,
            closedSurveys: sv.closed,
            scans30d: sc?.count ?? 0,
            lastScanAt: sc ? sc.last.toISOString() : null,
        };
    }).sort((a, b) => b.scans30d - a.scans30d || b.assets - a.assets || a.name.localeCompare(b.name, "ko"));

    // ── 도입 단계 퍼널 — 해지(deleted)는 뺀다: 떠난 기관이 "막힌 단계"로 섞이면 원인을 오해한다 ──
    const live = orgs.filter((o) => o.status !== "deleted");
    const wasApproved = live.filter((o) => o.status === "approved");
    const hasUser = wasApproved.filter((o) => o.firstEmployeeAt || (usersByOrg.get(o.id) ?? 0) > 0);
    const hasAssets = hasUser.filter((o) => (orgCounts.get(o.id)?.assets ?? 0) > 0);
    const startedSurvey = hasAssets.filter((o) => (surveyByOrg.get(o.id)?.open ?? 0) + (surveyByOrg.get(o.id)?.closed ?? 0) > 0);
    const closedSurvey = startedSurvey.filter((o) => (surveyByOrg.get(o.id)?.closed ?? 0) > 0);
    const stages: [string, string, number][] = [
        ["applied", "기관 신청", live.length],
        ["approved", "승인", wasApproved.length],
        ["firstUser", "첫 사용자 가입", hasUser.length],
        ["assets", "재물 대장 등록", hasAssets.length],
        ["surveyStarted", "조사 시작", startedSurvey.length],
        ["surveyClosed", "조사 마감", closedSurvey.length],
    ];
    const funnel: FunnelStage[] = stages.map(([key, label, value], i) => ({
        key, label, value,
        rate: pct(value, stages[0][2]),
        conversionFromPrev: i === 0 ? 100 : pct(value, stages[i - 1][2]),
    }));

    // ── 첫 사용자 가입까지 걸린 날 ──
    const days = approved
        .map((o) => o.timeToFirstEmployeeDays)
        .filter((d): d is number => typeof d === "number" && d >= 0)
        .sort((a, b) => a - b);
    const firstEmployee = days.length === 0 ? null : {
        count: days.length,
        avgDays: Math.round((days.reduce((s, d) => s + d, 0) / days.length) * 10) / 10,
        medianDays: days.length % 2
            ? days[(days.length - 1) / 2]
            : (days[days.length / 2 - 1] + days[days.length / 2]) / 2,
        sameDayRate: pct(days.filter((d) => d === 0).length, days.length),
    };

    // ── 최근 12개월 신규 기관(승인 기준)·사용자 ──
    const months: string[] = [];
    for (let i = GROWTH_MONTHS - 1; i >= 0; i--) months.push(monthKey(kstMonthStart(now, -i)));
    const newOrgsByMonth = new Map<string, number>();
    for (const o of orgs) if (o.approvedAt) newOrgsByMonth.set(monthKey(o.approvedAt), (newOrgsByMonth.get(monthKey(o.approvedAt)) ?? 0) + 1);
    const newUsersByMonth = new Map<string, number>();
    for (const u of members) if (u.createdAt) newUsersByMonth.set(monthKey(u.createdAt), (newUsersByMonth.get(monthKey(u.createdAt)) ?? 0) + 1);
    let cumulative = orgs.filter((o) => o.approvedAt && monthKey(o.approvedAt) < months[0]).length;
    const monthlyGrowth = months.map((m) => {
        const n = newOrgsByMonth.get(m) ?? 0;
        cumulative += n;
        return { month: m, newOrgs: n, cumulativeOrgs: cumulative, newUsers: newUsersByMonth.get(m) ?? 0 };
    });

    return {
        overview: {
            approvedOrgs: approved.length,
            pendingOrgs: byStatus("pending"),
            rejectedOrgs: byStatus("rejected"),
            deletedOrgs: byStatus("deleted"),
            totalUsers: members.length,
            adminCount: members.filter((u) => u.role === "admin").length,
            employeeCount: members.filter((u) => u.role !== "admin").length,
            totalAssets,
            totalSpaces,
            openSurveys: surveys.filter((s) => s.status !== "closed").length,
            closedSurveys: surveys.filter((s) => s.status === "closed").length,
            totalScans: input.totalScans,
        },
        monthly: {
            monthLabel: `${monthKey(now).slice(0, 4)}년 ${Number(monthKey(now).slice(5, 7))}월`,
            scans: scansMonth.length,
            prevScans: input.prevMonthScans,
            activeUsers: new Set(scansMonth.map((s) => s.scannedByUid).filter(Boolean)).size,
            activeOrgs30d: approved.filter((o) => scanByOrg.has(o.id)).length,
        },
        firstEmployee,
        funnel,
        dailyScans: [...daily.entries()].map(([date, d]) => ({ date, scans: d.scans, users: d.users.size })),
        monthlyGrowth,
        orgs: orgRows,
    };
}

// ── Firestore 읽기 + 저장 ──

const toDate = (v: unknown): Date | null => {
    if (!v) return null;
    if (v instanceof Date) return v;
    const t = v as { toDate?: () => Date };
    if (typeof t.toDate === "function") return t.toDate();
    const d = new Date(v as string);
    return isNaN(d.getTime()) ? null : d;
};

export async function computeAllDashboardStats(now: Date = new Date()): Promise<DashboardStats> {
    const startedAt = Date.now();
    const db = getFirestore();

    const [orgSnap, userSnap, surveySnap] = await Promise.all([
        db.collection("organizations").get(),
        db.collection("users").select("organizationId", "role", "createdAt").get(),
        db.collection("surveys").select("organizationId", "status").get(),
    ]);

    const orgs: OrgRow[] = orgSnap.docs.map((d) => {
        const o = d.data();
        return {
            id: d.id,
            name: (o.name as string) || "(이름 없음)",
            status: (o.status as string) || "pending",
            createdAt: toDate(o.createdAt),
            approvedAt: toDate(o.approvedAt),
            firstEmployeeAt: toDate(o.firstEmployeeRegisteredAt),
            timeToFirstEmployeeDays: typeof o.timeToFirstEmployeeDays === "number" ? o.timeToFirstEmployeeDays : null,
        };
    });
    const users: UserRow[] = userSnap.docs.map((d) => ({
        organizationId: (d.get("organizationId") as string | null) ?? null,
        role: (d.get("role") as string) || "employee",
        createdAt: toDate(d.get("createdAt")),
    }));
    const surveys: SurveyRow[] = surveySnap.docs.map((d) => ({
        organizationId: (d.get("organizationId") as string) || "",
        status: (d.get("status") as string) || "open",
    }));

    // 기관별 count() — 등호 조건만 써서 복합 인덱스 없이 돈다(처분 재물은 전체에서 뺀다)
    const orgCounts = new Map<string, OrgCounts>();
    await Promise.all(orgs.filter((o) => o.status === "approved").map(async (o) => {
        const [all, disposed, spaces] = await Promise.all([
            db.collection("assets").where("organizationId", "==", o.id).count().get(),
            db.collection("assets").where("organizationId", "==", o.id).where("status", "==", "disposed").count().get(),
            db.collection("spaces").where("organizationId", "==", o.id).count().get(),
        ]);
        orgCounts.set(o.id, {
            assets: all.data().count - disposed.data().count,
            spaces: spaces.data().count,
        });
    }));

    const windowStart = scanWindowStart(now);
    const thisMonth = kstMonthStart(now);
    const prevMonth = kstMonthStart(now, -1);
    const [scanSnap, totalScans, prevMonthScans] = await Promise.all([
        db.collection("scans").where("scannedAt", ">=", windowStart)
            .select("organizationId", "scannedByUid", "scannedAt").get(),
        db.collection("scans").count().get(),
        db.collection("scans").where("scannedAt", ">=", prevMonth).where("scannedAt", "<", thisMonth).count().get(),
    ]);
    const scans: ScanRow[] = scanSnap.docs.flatMap((d) => {
        const at = toDate(d.get("scannedAt"));
        return at ? [{
            organizationId: (d.get("organizationId") as string) || "",
            scannedByUid: (d.get("scannedByUid") as string) || "",
            scannedAt: at,
        }] : [];
    });

    const body = buildDashboardStats({
        now, orgs, users, surveys, scans, orgCounts,
        totalScans: totalScans.data().count,
        prevMonthScans: prevMonthScans.data().count,
    });
    const stats: DashboardStats = {
        ...body,
        lastUpdatedAt: new Date().toISOString(),
        computeDurationMs: Date.now() - startedAt,
    };
    await db.doc("system/dashboardStats").set(stats);
    console.log(`[DashboardStats] 집계 완료: 기관 ${orgs.length}, 스캔 ${scans.length}건 창, ${stats.computeDurationMs}ms`);
    return stats;
}

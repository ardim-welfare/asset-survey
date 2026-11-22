import { z } from 'zod';

/**
 * 시스템 관리자 운영 현황 통계 (system/dashboardStats) — 단일 원본
 *
 * 서버(functions/src/services/statistics/computeDashboardStats.ts)가 밤 배치·수동 갱신으로 쓰고
 * 화면은 읽기만 한다. 필드를 바꾸면 서버의 DashboardStats 타입도 함께 바꾼다.
 * 모든 필드에 catch를 둔다 — 집계 코드가 바뀐 직후 옛 문서가 남아 있어도 화면이 깨지지 않게.
 */
const n = z.number().catch(0);

export const funnelStageSchema = z.object({
    key: z.string().catch(''),
    label: z.string().catch(''),
    value: n,
    rate: n,
    conversionFromPrev: n,
});

export const dashboardOrgRowSchema = z.object({
    id: z.string().catch(''),
    name: z.string().catch(''),
    approvedAt: z.string().nullable().catch(null),
    users: n,
    assets: n,
    spaces: n,
    openSurveys: n,
    closedSurveys: n,
    scans30d: n,
    lastScanAt: z.string().nullable().catch(null),
});

export const dashboardStatsSchema = z.object({
    lastUpdatedAt: z.string().catch(''),
    computeDurationMs: n,
    overview: z.object({
        approvedOrgs: n, pendingOrgs: n, rejectedOrgs: n, deletedOrgs: n,
        totalUsers: n, adminCount: n, employeeCount: n,
        totalAssets: n, totalSpaces: n,
        openSurveys: n, closedSurveys: n, totalScans: n,
    }).catch({
        approvedOrgs: 0, pendingOrgs: 0, rejectedOrgs: 0, deletedOrgs: 0,
        totalUsers: 0, adminCount: 0, employeeCount: 0,
        totalAssets: 0, totalSpaces: 0, openSurveys: 0, closedSurveys: 0, totalScans: 0,
    }),
    monthly: z.object({
        monthLabel: z.string().catch(''),
        scans: n, prevScans: n, activeUsers: n, activeOrgs30d: n,
    }).catch({ monthLabel: '', scans: 0, prevScans: 0, activeUsers: 0, activeOrgs30d: 0 }),
    firstEmployee: z.object({ count: n, avgDays: n, medianDays: n, sameDayRate: n }).nullable().catch(null),
    funnel: z.array(funnelStageSchema).catch([]),
    dailyScans: z.array(z.object({ date: z.string().catch(''), scans: n, users: n })).catch([]),
    monthlyGrowth: z.array(z.object({ month: z.string().catch(''), newOrgs: n, cumulativeOrgs: n, newUsers: n })).catch([]),
    orgs: z.array(dashboardOrgRowSchema).catch([]),
});

export type DashboardStats = z.infer<typeof dashboardStatsSchema>;
export type DashboardOrgRow = z.infer<typeof dashboardOrgRowSchema>;
export type FunnelStage = z.infer<typeof funnelStageSchema>;

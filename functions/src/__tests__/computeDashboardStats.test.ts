/**
 * computeDashboardStats.test.ts — 시스템 관리자 운영 현황 집계 규칙
 *
 * 지키는 것:
 * - 날짜 경계는 KST다(UTC로 자르면 밤 배치 02:20 KST = 전날 17:20 UTC에 일별 차트가 하루 밀린다)
 * - 30일 일별 차트는 비는 날도 0으로 채워 정확히 30칸이다
 * - 퍼널은 해지 기관을 빼고, 각 단계는 앞 단계를 통과한 기관만 센다
 * - 처분 재물·시스템 관리자 계정은 숫자에 넣지 않는다(computeAll 쪽 count에서 처리 — 여기선 입력 그대로)
 * - 첫 사용자 가입까지 걸린 날: 평균·중앙값·당일 비율
 * - 기관별 표는 승인 기관만, 최근 30일 스캔 많은 순
 */
jest.mock('firebase-admin/firestore', () => ({ getFirestore: jest.fn() }));

import {
    buildDashboardStats, kstMonthStart, dailyWindowStart, scanWindowStart,
    type DashboardInput, type OrgRow,
} from '../services/statistics/computeDashboardStats';

// 2026-11-22 10:00 KST
const NOW = new Date('2026-11-22T01:00:00Z');
const kst = (s: string) => new Date(`${s}+09:00`);

const org = (id: string, over: Partial<OrgRow> = {}): OrgRow => ({
    id, name: `기관${id}`, status: 'approved', createdAt: kst('2026-10-01T09:00:00'),
    approvedAt: kst('2026-10-01T10:00:00'), firstEmployeeAt: null, timeToFirstEmployeeDays: null, ...over,
});

const base = (over: Partial<DashboardInput> = {}): DashboardInput => ({
    now: NOW, orgs: [], users: [], surveys: [], scans: [], orgCounts: new Map(),
    totalScans: 0, prevMonthScans: 0, ...over,
});

describe('날짜 경계(KST)', () => {
    it('이번 달 1일 00:00 KST', () => {
        expect(kstMonthStart(NOW).toISOString()).toBe('2026-10-31T15:00:00.000Z');
        expect(kstMonthStart(NOW, -1).toISOString()).toBe('2026-09-30T15:00:00.000Z');
    });

    it('연 경계를 넘는 이전 달', () => {
        expect(kstMonthStart(kst('2027-01-05T12:00:00'), -1).toISOString()).toBe('2026-11-30T15:00:00.000Z');
    });

    it('UTC로는 전날인 KST 새벽에도 KST 날짜를 쓴다', () => {
        // 2026-11-22 02:20 KST = 2026-11-21 17:20 UTC (밤 배치 시각)
        const batch = new Date('2026-11-21T17:20:00Z');
        expect(dailyWindowStart(batch).toISOString()).toBe('2026-10-23T15:00:00.000Z'); // 10-24 00:00 KST
    });

    it('스캔 창은 30일 차트와 이번 달을 모두 덮는 이른 쪽', () => {
        // 11-22: 30일 창 시작 10-24 < 이번 달 11-01 → 10-24
        expect(scanWindowStart(NOW)).toEqual(dailyWindowStart(NOW));
        // 12-31: 30일 창 시작 12-02 > 이번 달 12-01 → 12-01
        const dec31 = kst('2026-12-31T12:00:00');
        expect(scanWindowStart(dec31)).toEqual(kstMonthStart(dec31));
    });
});

describe('일별 스캔', () => {
    it('30칸을 빈 날도 0으로 채우고, 사람 수는 중복 없이 센다', () => {
        const s = buildDashboardStats(base({
            scans: [
                { organizationId: 'a', scannedByUid: 'u1', scannedAt: kst('2026-11-22T09:00:00') },
                { organizationId: 'a', scannedByUid: 'u1', scannedAt: kst('2026-11-22T09:05:00') },
                { organizationId: 'a', scannedByUid: 'u2', scannedAt: kst('2026-11-22T00:10:00') }, // UTC로는 11-21
                { organizationId: 'a', scannedByUid: 'u3', scannedAt: kst('2026-10-20T09:00:00') }, // 30일 밖
            ],
        }));
        expect(s.dailyScans).toHaveLength(30);
        expect(s.dailyScans[0].date).toBe('2026-10-24');
        expect(s.dailyScans.at(-1)).toEqual({ date: '2026-11-22', scans: 3, users: 2 });
        expect(s.dailyScans.reduce((n, d) => n + d.scans, 0)).toBe(3);
    });

    it('이번 달 스캔·스캔한 사람 수와 지난달 스캔 수', () => {
        const s = buildDashboardStats(base({
            prevMonthScans: 40,
            scans: [
                { organizationId: 'a', scannedByUid: 'u1', scannedAt: kst('2026-11-01T00:00:00') },
                { organizationId: 'a', scannedByUid: 'u2', scannedAt: kst('2026-11-10T09:00:00') },
                { organizationId: 'a', scannedByUid: 'u1', scannedAt: kst('2026-10-31T23:59:00') }, // 지난달
            ],
        }));
        expect(s.monthly).toMatchObject({ monthLabel: '2026년 11월', scans: 2, prevScans: 40, activeUsers: 2 });
    });
});

describe('요약과 기관별 표', () => {
    it('기관 상태·사용자 역할을 나눠 세고 시스템 관리자는 뺀다', () => {
        const s = buildDashboardStats(base({
            orgs: [org('a'), org('b', { status: 'pending', approvedAt: null }), org('c', { status: 'rejected', approvedAt: null }), org('d', { status: 'deleted' })],
            users: [
                { organizationId: 'a', role: 'admin', createdAt: null },
                { organizationId: 'a', role: 'employee', createdAt: null },
                { organizationId: null, role: 'superAdmin', createdAt: null },
            ],
            surveys: [{ organizationId: 'a', status: 'open' }, { organizationId: 'a', status: 'closed' }],
            orgCounts: new Map([['a', { assets: 120, spaces: 8 }]]),
            totalScans: 999,
        }));
        expect(s.overview).toEqual({
            approvedOrgs: 1, pendingOrgs: 1, rejectedOrgs: 1, deletedOrgs: 1,
            totalUsers: 2, adminCount: 1, employeeCount: 1,
            totalAssets: 120, totalSpaces: 8, openSurveys: 1, closedSurveys: 1, totalScans: 999,
        });
    });

    it('기관별 표는 승인 기관만, 최근 30일 스캔 많은 순이고 마지막 스캔 시각을 단다', () => {
        const s = buildDashboardStats(base({
            orgs: [org('a'), org('b'), org('p', { status: 'pending' })],
            scans: [
                { organizationId: 'b', scannedByUid: 'u', scannedAt: kst('2026-11-20T09:00:00') },
                { organizationId: 'b', scannedByUid: 'u', scannedAt: kst('2026-11-21T09:00:00') },
                { organizationId: 'a', scannedByUid: 'u', scannedAt: kst('2026-11-01T09:00:00') },
            ],
        }));
        expect(s.orgs.map((o) => o.id)).toEqual(['b', 'a']);
        expect(s.orgs[0]).toMatchObject({ scans30d: 2, lastScanAt: kst('2026-11-21T09:00:00').toISOString() });
        expect(s.monthly.activeOrgs30d).toBe(2);
    });
});

describe('도입 단계 퍼널', () => {
    it('해지 기관을 빼고, 앞 단계를 통과한 기관만 다음 단계에 센다', () => {
        const s = buildDashboardStats(base({
            orgs: [
                org('full', { firstEmployeeAt: kst('2026-10-02T09:00:00') }),
                org('noSurvey', { firstEmployeeAt: kst('2026-10-02T09:00:00') }),
                org('noAssets', { firstEmployeeAt: kst('2026-10-02T09:00:00') }),
                org('noUser'),
                org('pending', { status: 'pending', approvedAt: null }),
                org('gone', { status: 'deleted' }),
                // 사용자가 없는데 조사가 있는 이상한 기관은 '조사 시작'에 넣지 않는다(앞 단계 미통과)
                org('odd'),
            ],
            users: [{ organizationId: 'full', role: 'admin', createdAt: null }],
            orgCounts: new Map([
                ['full', { assets: 10, spaces: 1 }], ['noSurvey', { assets: 5, spaces: 1 }],
                ['noAssets', { assets: 0, spaces: 0 }], ['odd', { assets: 3, spaces: 1 }],
            ]),
            surveys: [{ organizationId: 'full', status: 'closed' }, { organizationId: 'odd', status: 'open' }],
        }));
        expect(s.funnel.map((f) => [f.key, f.value])).toEqual([
            ['applied', 6], ['approved', 5], ['firstUser', 3], ['assets', 2], ['surveyStarted', 1], ['surveyClosed', 1],
        ]);
        expect(s.funnel[1]).toMatchObject({ rate: 83.3, conversionFromPrev: 83.3 });
        expect(s.funnel[3]).toMatchObject({ rate: 33.3, conversionFromPrev: 66.7 });
    });

    it('기관이 하나도 없으면 비율은 0', () => {
        const s = buildDashboardStats(base());
        expect(s.funnel.every((f) => f.value === 0 && f.rate === 0)).toBe(true);
    });
});

describe('첫 사용자 가입까지 걸린 날', () => {
    it('평균·중앙값·당일 비율(승인 기관만)', () => {
        const s = buildDashboardStats(base({
            orgs: [
                org('a', { timeToFirstEmployeeDays: 0 }), org('b', { timeToFirstEmployeeDays: 2 }),
                org('c', { timeToFirstEmployeeDays: 7 }), org('d', { timeToFirstEmployeeDays: 1 }),
                org('x', { status: 'deleted', timeToFirstEmployeeDays: 30 }),
            ],
        }));
        expect(s.firstEmployee).toEqual({ count: 4, avgDays: 2.5, medianDays: 1.5, sameDayRate: 25 });
    });

    it('기록이 없으면 null', () => {
        expect(buildDashboardStats(base({ orgs: [org('a')] })).firstEmployee).toBeNull();
    });
});

describe('최근 12개월 성장', () => {
    it('12칸, 승인 월 기준 신규·누적 기관과 신규 사용자', () => {
        const s = buildDashboardStats(base({
            orgs: [
                org('old', { approvedAt: kst('2025-05-01T09:00:00') }), // 창 이전 → 누적 시작값
                org('a', { approvedAt: kst('2026-10-31T23:30:00') }), // KST 10월
                org('b', { approvedAt: kst('2026-11-01T00:30:00') }), // KST 11월(UTC로는 10월)
                org('p', { status: 'pending', approvedAt: null }),
            ],
            users: [{ organizationId: 'a', role: 'admin', createdAt: kst('2026-11-03T09:00:00') }],
        }));
        expect(s.monthlyGrowth).toHaveLength(12);
        expect(s.monthlyGrowth[0].month).toBe('2025-12');
        expect(s.monthlyGrowth.at(-2)).toEqual({ month: '2026-10', newOrgs: 1, cumulativeOrgs: 2, newUsers: 0 });
        expect(s.monthlyGrowth.at(-1)).toEqual({ month: '2026-11', newOrgs: 1, cumulativeOrgs: 3, newUsers: 1 });
    });
});

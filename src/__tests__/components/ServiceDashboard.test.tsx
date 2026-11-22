/**
 * ServiceDashboard.test.tsx — 시스템 관리자 운영 현황 화면
 *
 * 지키는 것:
 * - 집계 문서가 없으면 "아직 집계 없음"과 갱신 안내(빈 차트를 0으로 오해하지 않게)
 * - 읽기 실패는 오류 안내 + 다시 시도
 * - 요약 숫자·퍼널의 가장 많이 멈추는 단계·30일 스캔 없는 기관 수
 * - 갱신이 쿨다운으로 건너뛰어지면 남은 시간을 안내한다
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { dashboardStatsSchema, type DashboardStats } from '../../schemas/dashboard';

const hook = {
    stats: null as DashboardStats | null,
    loading: false,
    loadError: false,
    refreshing: false,
    load: vi.fn(),
    refresh: vi.fn(),
};
vi.mock('../../hooks/useServiceDashboard', () => ({ default: () => hook }));
const showToast = vi.fn();
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ showToast }) }));

import ServiceDashboard from '../../components/superAdmin/ServiceDashboard';

const stats = (): DashboardStats => dashboardStatsSchema.parse({
    lastUpdatedAt: '2026-11-22T01:00:00.000Z',
    computeDurationMs: 1200,
    overview: {
        approvedOrgs: 4, pendingOrgs: 1, rejectedOrgs: 0, deletedOrgs: 1,
        totalUsers: 23, adminCount: 4, employeeCount: 19,
        totalAssets: 1520, totalSpaces: 64, openSurveys: 2, closedSurveys: 3, totalScans: 4100,
    },
    monthly: { monthLabel: '2026년 11월', scans: 300, prevScans: 200, activeUsers: 12, activeOrgs30d: 3 },
    firstEmployee: { count: 4, avgDays: 1.5, medianDays: 1, sameDayRate: 50 },
    funnel: [
        { key: 'applied', label: '기관 신청', value: 5, rate: 100, conversionFromPrev: 100 },
        { key: 'approved', label: '승인', value: 4, rate: 80, conversionFromPrev: 80 },
        { key: 'firstUser', label: '첫 사용자 가입', value: 4, rate: 80, conversionFromPrev: 100 },
        { key: 'assets', label: '재물 대장 등록', value: 2, rate: 40, conversionFromPrev: 50 },
        { key: 'surveyStarted', label: '조사 시작', value: 2, rate: 40, conversionFromPrev: 100 },
        { key: 'surveyClosed', label: '조사 마감', value: 2, rate: 40, conversionFromPrev: 100 },
    ],
    dailyScans: [{ date: '2026-11-21', scans: 10, users: 2 }, { date: '2026-11-22', scans: 5, users: 1 }],
    monthlyGrowth: [{ month: '2026-11', newOrgs: 2, cumulativeOrgs: 4, newUsers: 9 }],
    orgs: [
        { id: 'a', name: '행복복지관', approvedAt: '2026-10-01T01:00:00.000Z', users: 10, assets: 900, spaces: 40, openSurveys: 1, closedSurveys: 2, scans30d: 280, lastScanAt: '2026-11-21T01:00:00.000Z' },
        { id: 'b', name: '희망센터', approvedAt: null, users: 2, assets: 0, spaces: 0, openSurveys: 0, closedSurveys: 0, scans30d: 0, lastScanAt: null },
    ],
});

beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(hook, { stats: null, loading: false, loadError: false, refreshing: false });
});

describe('ServiceDashboard', () => {
    it('집계 문서가 없으면 처음 집계 안내를 보여 준다', () => {
        render(<ServiceDashboard />);
        expect(screen.getByText('아직 집계된 통계가 없습니다')).toBeInTheDocument();
        expect(screen.queryByText('도입 단계')).not.toBeInTheDocument();
    });

    it('읽기 실패는 오류와 다시 시도를 보여 준다', () => {
        hook.loadError = true;
        render(<ServiceDashboard />);
        expect(screen.getByText('통계를 불러오지 못했습니다')).toBeInTheDocument();
        fireEvent.click(screen.getByText('다시 시도'));
        expect(hook.load).toHaveBeenCalled();
    });

    it('요약·퍼널·기관별 현황을 그린다', () => {
        hook.stats = stats();
        render(<ServiceDashboard />);
        expect(screen.getByText('이용 기관').nextSibling).toHaveTextContent('4곳');
        expect(screen.getByText('1,520개')).toBeInTheDocument();
        expect(screen.getByText('지난달 대비 +50%')).toBeInTheDocument();
        // 가장 많이 멈추는 단계 = 앞 단계 대비 가장 낮은 전환
        expect(screen.getByText('재물 대장 등록', { selector: 'strong' })).toBeInTheDocument();
        expect(screen.getByText(/이용 기관 2곳 중 1곳은 최근 30일 스캔이 없습니다/)).toBeInTheDocument();
        expect(screen.getByText('30일 넘음')).toBeInTheDocument();
    });

    it('기관 표를 이름순으로 바꿀 수 있다', () => {
        hook.stats = stats();
        render(<ServiceDashboard />);
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'name' } });
        const names = screen.getAllByText(/행복복지관|희망센터/).map((el) => el.textContent);
        expect(names).toEqual(['행복복지관', '희망센터']);
    });

    it('갱신이 쿨다운으로 건너뛰어지면 남은 시간을 안내한다', async () => {
        hook.stats = stats();
        hook.refresh.mockResolvedValue({ skipped: true, retryAfterSec: 250 });
        render(<ServiceDashboard />);
        fireEvent.click(screen.getByText('지금 갱신'));
        await waitFor(() => expect(showToast).toHaveBeenCalledWith('방금 갱신했습니다. 약 5분 뒤에 다시 갱신할 수 있어요.', 'info'));
    });

    it('갱신이 실패하면 오류 토스트', async () => {
        hook.stats = stats();
        hook.refresh.mockRejectedValue(new Error('x'));
        render(<ServiceDashboard />);
        fireEvent.click(screen.getByText('지금 갱신'));
        await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.stringContaining('갱신하지 못했습니다'), 'error'));
    });
});

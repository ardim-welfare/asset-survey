/**
 * OrgCardHeader — 기관 카드 접힌 상태 헤더
 * 기관명, 뱃지(직원 수, 신청일, 직원 없이 승인 뒤 지난 날, 초대코드), 삭제 버튼
 *
 * 펼치기 버튼과 삭제 버튼을 나란히 둔다 — 예전에는 div role="button" 안에 삭제 버튼이 들어 있어
 * 화면 읽기 프로그램에서 버튼 안의 버튼이 됐다.
 */
import { memo, useMemo, useState } from 'react';
import { formatTimestampFull, toDateOrNull } from '../../../lib/dateUtils';
import type { Organization } from '../../../types';

interface Props {
    org: Organization;
    memberCount: number;
    isExpanded: boolean;
    editing: boolean;
    onToggle: (orgId: string) => void;
    onDelete: (org: Organization) => void;
}

function getDaysBadgeStyle(days: number) {
    if (days >= 14) return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
    if (days >= 7) return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
    return 'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-300';
}

export default memo(function OrgCardHeader({ org, memberCount, isExpanded, editing, onToggle, onDelete }: Props) {
    const [now] = useState(() => Date.now());
    const daysSinceApproval = useMemo(() => {
        if (memberCount > 0) return null;
        const approved = toDateOrNull(org.approvedAt);
        if (!approved) return null;
        return Math.floor((now - approved.getTime()) / (1000 * 60 * 60 * 24));
    }, [memberCount, org.approvedAt, now]);

    const appliedDate = formatTimestampFull(org.createdAt);

    return (
        <div className="flex items-center justify-between gap-2 px-2 py-1">
            <button
                type="button"
                onClick={() => { if (!editing) onToggle(org.id); }}
                aria-expanded={isExpanded}
                className="flex-1 min-w-0 flex items-start gap-3 text-left px-2 py-2 min-h-[48px] rounded-xl hover:bg-surface-50 dark:hover:bg-surface-700/40 transition-colors"
            >
                {/* 펼침/접힘 표시 */}
                <span aria-hidden="true" className="mt-0.5 w-4 shrink-0 text-surface-600 dark:text-surface-400">
                    {isExpanded ? '▾' : '▸'}
                </span>

                <span className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                    {/* 기관명 — 휴대폰에서 잘리지 않게 줄바꿈한다 */}
                    <span className="text-sm font-semibold text-surface-900 dark:text-surface-100 break-keep">
                        {org.name}
                    </span>

                    {/* 요약 뱃지들 */}
                    <span className="flex flex-wrap items-center gap-1.5 sm:shrink-0">
                        <span className="badge-neutral">직원 {memberCount}명</span>

                        {appliedDate && (
                            <span className="badge-neutral">신청 {appliedDate}</span>
                        )}

                        {daysSinceApproval !== null && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${getDaysBadgeStyle(daysSinceApproval)}`}>
                                승인 후 {daysSinceApproval}일
                            </span>
                        )}

                        <code className="hidden sm:inline-block bg-surface-100 dark:bg-surface-700 px-1.5 py-0.5 rounded text-primary-700 dark:text-primary-300 font-mono text-xs">
                            <span className="sr-only">초대코드 </span>{org.inviteCode}
                        </code>
                    </span>
                </span>
            </button>

            {/* 삭제 버튼 */}
            <button
                type="button"
                onClick={() => onDelete(org)}
                className="btn-icon btn-ghost text-red-700 dark:text-red-300 hover:text-red-800 dark:hover:text-red-200 hover:bg-red-50 dark:hover:bg-red-900/20 shrink-0"
                aria-label={`${org.name} 기관 삭제`}
            >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
            </button>
        </div>
    );
});

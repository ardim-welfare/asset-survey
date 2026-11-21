/**
 * 재물 상태·표시 배지 — 목록·상세가 함께 쓴다 (기획서 F08)
 */
import { ASSET_STATUS_LABEL } from '../../lib/import/values';
import type { AssetStatus } from '../../types/asset';

const STATUS_CLASS: Record<AssetStatus, string> = {
    active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    inactive: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    disposed: 'bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-300',
};

const base = 'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap';

export function StatusBadge({ status }: { status: AssetStatus }) {
    return <span className={`${base} ${STATUS_CLASS[status]}`}>{ASSET_STATUS_LABEL[status]}</span>;
}

/** 마지막 가져오기 파일에 없던 재물 */
export function MissingBadge() {
    return (
        <span className={`${base} bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300`} title="마지막으로 가져온 대장 파일에 없던 재물입니다">
            대장에 없음
        </span>
    );
}

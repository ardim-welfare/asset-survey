/**
 * 재물 상태·표시 배지 — 목록·상세가 함께 쓴다 (기획서 F08)
 */
import { ASSET_STATUS_LABEL } from '../../lib/import/values';
import type { AssetStatus } from '../../types/asset';

// 공용 배지(index.css)를 쓴다 — 직접 만든 색·모양이 화면마다 달랐다(2026-11-22 점검)
const STATUS_CLASS: Record<AssetStatus, string> = {
    active: 'badge-success',
    inactive: 'badge-warning',
    disposed: 'badge-neutral',
};

export function StatusBadge({ status }: { status: AssetStatus }) {
    return <span className={`${STATUS_CLASS[status]} whitespace-nowrap`}>{ASSET_STATUS_LABEL[status]}</span>;
}

/** 내용연수(내구연한)가 지난 재물 (2026-11-22) — 바꿀 때가 됐는지 살펴볼 대상 */
export function UsefulLifeOverBadge() {
    return <span className="badge-warning whitespace-nowrap">내용연수 지남</span>;
}

/** 마지막 가져오기 파일에 없던 재물 */
export function MissingBadge() {
    return (
        <span className="badge-danger whitespace-nowrap" title="마지막으로 가져온 대장 파일에 없던 재물입니다">
            대장에 없음
        </span>
    );
}

/**
 * EmployeeAssetDetail — 직원 재물 상세 (기획서 F08)
 *
 * 공용 상세(AssetDetailView)를 쓰되 금액·변경 이력·라벨 인쇄는 빼고 연다
 * (금액은 관리자만 — 사용자 결정 2026-11-21. Rules도 막는다).
 */
import AssetDetailView from '../common/AssetDetailView';

export default function EmployeeAssetDetail() {
    return <AssetDetailView admin={false} />;
}

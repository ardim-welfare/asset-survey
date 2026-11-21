/**
 * AssetDetail — 관리자 재물 상세 (기획서 F08·F09)
 *
 * 화면은 직원과 같은 공용 상세(AssetDetailView)를 쓰고, 금액·이력·라벨 인쇄를 더한다.
 */
import AssetDetailView from '../common/AssetDetailView';
import LabelPrintDialog from './LabelPrintDialog';

export default function AssetDetail() {
    return <AssetDetailView admin renderLabelPrint={(p) => <LabelPrintDialog {...p} />} />;
}

/**
 * LabelSheet — A4 라벨지 한 장 (기획서 F09)
 *
 * 인쇄 영역과 화면 미리보기가 같은 컴포넌트를 쓴다(미리보기에서 본 배치 그대로 인쇄된다).
 * 치수는 모두 mm로 그린다. 인쇄물이라 다크 모드와 상관없이 흰 바탕·검은 글자로 고정한다.
 */
import { cellPos, labelLayout, LABEL_GAP, LABEL_PAD, type LabelSpec } from '../../lib/labels/layout';

export interface SheetLabel {
    id: string;
    code: string;
    name: string;
    qr: string | null;
}

interface LabelProps {
    spec: LabelSpec;
    label: SheetLabel;
    orgName: string;
    cell: number;
    cutLines: boolean;
}

function Label({ spec, label, orgName, cell, cutLines }: LabelProps) {
    const pos = cellPos(spec, cell);
    const l = labelLayout(spec, label.code);
    return (
        <div
            data-testid="label-cell"
            style={{
                position: 'absolute', left: `${pos.left}mm`, top: `${pos.top}mm`, width: `${spec.w}mm`, height: `${spec.h}mm`,
                display: 'flex', alignItems: 'center', gap: `${LABEL_GAP}mm`, padding: `0 ${LABEL_PAD}mm`, boxSizing: 'border-box',
                overflow: 'hidden', color: '#000', background: '#fff',
                outline: cutLines ? '0.2mm dashed #9ca3af' : 'none', outlineOffset: '-0.1mm',
            }}
        >
            {label.qr
                ? <img src={label.qr} alt="" style={{ width: `${l.qr}mm`, height: `${l.qr}mm`, flexShrink: 0 }} />
                : <div style={{ width: `${l.qr}mm`, height: `${l.qr}mm`, flexShrink: 0, background: '#e5e7eb' }} />}
            <div style={{ width: `${l.textW}mm`, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.5mm', lineHeight: 1.15 }}>
                {l.showOrg && orgName && (
                    <span style={{ fontSize: `${l.org}mm`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{orgName}</span>
                )}
                <span style={{ fontSize: `${l.code}mm`, fontWeight: 700, whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>{label.code}</span>
                {label.name && (
                    <span style={{
                        fontSize: `${l.name}mm`, overflow: 'hidden', display: '-webkit-box',
                        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', wordBreak: 'keep-all',
                    }}>{label.name}</span>
                )}
            </div>
        </div>
    );
}

interface SheetProps {
    spec: LabelSpec;
    cells: Array<{ cell: number; item: SheetLabel }>;
    orgName: string;
    cutLines: boolean;
}

/** A4 한 장 (210×297mm) */
export default function LabelSheet({ spec, cells, orgName, cutLines }: SheetProps) {
    return (
        <div className="label-page" style={{ position: 'relative', width: '210mm', height: '297mm', overflow: 'hidden', background: '#fff' }}>
            {cells.map(({ cell, item }) => (
                <Label key={`${item.id}-${cell}`} spec={spec} label={item} orgName={orgName} cell={cell} cutLines={cutLines} />
            ))}
        </div>
    );
}

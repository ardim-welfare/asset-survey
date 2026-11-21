/**
 * useLabelPrint — QR 라벨 인쇄 (기획서 F09)
 *
 * 흐름: 규격·시작 칸 고르기 → [인쇄] → 태그가 없는 재물에 태그 발급(저장) → QR 만들기 → 인쇄 영역을
 * 그린 뒤 브라우저 인쇄 창을 연다. QR은 브라우저에서 만든다 — 외부 QR 서비스로 주소를 보내지 않는다.
 *
 * - 고른 규격은 기관 기본값으로 기억한다(다음에 같은 규격으로 열린다). 저장이 안 돼도 인쇄는 한다.
 * - 재단선 표시는 기기마다 다를 수 있어(일반 종이에 뽑아 자르는 PC, 라벨지 쓰는 PC) 이 기기에 기억한다.
 * - 태그 발급이 중간에 실패하면 이미 저장된 태그가 목록에 반영되지 않았을 수 있어 목록을 새로 읽게 한다.
 *   (Rules가 태그 바꾸기를 막으므로 낡은 목록으로 다시 발급하면 실패한다.)
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getOrganization, updateOrganization, issueTags } from '../lib/firestore';
import {
    DEFAULT_LABEL_SIZE, LABEL_PRESETS, paginate, specOf, validateSpec,
    type LabelSize, type LabelSpec,
} from '../lib/labels/layout';
import { tagUrl } from '../lib/labels/tag';
import type { Asset } from '../types/asset';

export interface PrintItem {
    id: string;
    code: string;
    name: string;
    qr: string;
}

const CUT_KEY = 'labelCutLines';

/** QR 이미지(SVG data URL) — 오류 정정 M(약 15% 훼손까지 읽힘), 둘레 여백 2칸 */
export async function qrDataUrl(text: string): Promise<string> {
    const QRCode = (await import('qrcode')).default;
    const svg = await QRCode.toString(text, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 });
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function readCutLines(): boolean {
    try { return localStorage.getItem(CUT_KEY) !== 'off'; } catch { return true; }
}

const SPEC_KEYS: Array<keyof LabelSpec> = ['w', 'h', 'cols', 'rows', 'top', 'left', 'hpitch', 'vpitch'];
const sameSpec = (a: LabelSpec | undefined, b: LabelSpec | undefined) => !!a && !!b && SPEC_KEYS.every((k) => a[k] === b[k]);

interface Options {
    orgId: string | null;
    /** 새로 발급한 태그를 부른 쪽 화면에 반영 */
    onTags?: (tags: Map<string, string>) => void;
    /** 태그 발급이 실패해 목록을 새로 읽어야 할 때 */
    onReloadNeeded?: () => void;
}

export default function useLabelPrint(assets: Asset[], { orgId, onTags, onReloadNeeded }: Options) {
    const [orgName, setOrgName] = useState('');
    const [size, setSize] = useState<LabelSize>(DEFAULT_LABEL_SIZE);
    const [custom, setCustom] = useState<LabelSpec>(() => {
        const { label: _label, ...spec } = LABEL_PRESETS.medium;
        return spec;
    });
    const [saved, setSaved] = useState<{ size?: LabelSize; custom?: LabelSpec }>({});
    const [startCell, setStartCell] = useState(1);
    const [cutLines, setCutLinesState] = useState(readCutLines);
    const [busy, setBusy] = useState<null | 'issuing' | 'drawing'>(null);
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [items, setItems] = useState<PrintItem[] | null>(null);
    const [previewQr, setPreviewQr] = useState<string | null>(null);

    useEffect(() => {
        if (!orgId) return;
        let cancelled = false;
        getOrganization(orgId).then((org) => {
            if (cancelled || !org) return;
            setOrgName(org.name || '');
            if (org.labelSize) setSize(org.labelSize);
            if (org.labelCustom) setCustom(org.labelCustom);
            setSaved({ size: org.labelSize, custom: org.labelCustom });
        }).catch(() => { /* 기본 규격으로 연다 */ });
        return () => { cancelled = true; };
    }, [orgId]);

    // 미리보기용 QR 하나 — 크기만 보여 주는 것이라 첫 재물의 태그(없으면 빈 자리)로 만든다
    const firstTag = assets[0]?.tagId ?? null;
    useEffect(() => {
        let cancelled = false;
        qrDataUrl(tagUrl(firstTag ?? '0000000000')).then((u) => { if (!cancelled) setPreviewQr(u); }, () => { });
        return () => { cancelled = true; };
    }, [firstTag]);

    const customError = size === 'custom' ? validateSpec(custom) : null;
    const spec = useMemo(() => specOf(size, custom), [size, custom]);
    const pages = useMemo(() => (items ? paginate(items, spec, startCell) : null), [items, spec, startCell]);
    const pageCount = useMemo(() => paginate(assets, spec, startCell).length, [assets, spec, startCell]);

    const setCutLines = useCallback((on: boolean) => {
        setCutLinesState(on);
        try { localStorage.setItem(CUT_KEY, on ? 'on' : 'off'); } catch { /* 저장 불가 — 이번만 적용 */ }
    }, []);

    /** 인쇄 준비 — 태그 발급 → QR → 인쇄 영역. 준비되면 `items`가 채워지고 화면이 인쇄 창을 연다 */
    const prepare = useCallback(async () => {
        if (assets.length === 0 || customError || busy) return;
        setError(null);
        setBusy('issuing');
        setProgress(null);
        let tags: Map<string, string>;
        try {
            tags = await issueTags(assets, (done, total) => setProgress({ done, total }));
        } catch {
            setBusy(null);
            setError('라벨 번호를 저장하지 못했습니다. 목록을 새로 불러왔으니 다시 인쇄해 주세요.');
            onReloadNeeded?.();
            return;
        }
        onTags?.(tags);

        setBusy('drawing');
        try {
            const list: PrintItem[] = [];
            for (const a of assets) {
                const tag = tags.get(a.id);
                if (!tag) continue;
                list.push({ id: a.id, code: a.code, name: a.name ?? '', qr: await qrDataUrl(tagUrl(tag)) });
            }
            // 고른 규격을 기관 기본으로 기억 — 실패해도 인쇄는 한다
            if (orgId && (saved.size !== size || (size === 'custom' && !sameSpec(saved.custom, custom)))) {
                const nextCustom = size === 'custom' ? custom : saved.custom;
                updateOrganization(orgId, size === 'custom' ? { labelSize: size, labelCustom: custom } : { labelSize: size })
                    .then(() => setSaved({ size, custom: nextCustom }), () => { });
            }
            setItems(list);
        } catch {
            setError('QR을 만들지 못했습니다. 다시 시도해 주세요.');
        } finally {
            setBusy(null);
        }
    }, [assets, customError, busy, onTags, onReloadNeeded, orgId, saved, size, custom]);

    /** 인쇄 창이 닫히면 인쇄 영역을 걷는다 */
    const finish = useCallback(() => setItems(null), []);

    return {
        orgName, size, setSize, custom, setCustom, customError, spec,
        startCell, setStartCell, cutLines, setCutLines,
        busy, progress, error, prepare, items, pages, pageCount, finish, previewQr,
    };
}

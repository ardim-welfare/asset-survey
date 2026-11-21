/**
 * 스캔 판정 (기획서 F11) — 화면·저장과 떨어진 순수 계산이라 단위 테스트로 고정한다.
 *
 * 판정 6종:
 *   - 정상(ok): 대상 목록상 이 공간의 재물
 *   - 다른 공간(otherSpace): 대상이지만 목록상 다른 공간(또는 공간 미지정)의 재물
 *   - 미등록(unregistered): 이 기관 재물에서 찾지 못함
 *   - 범위 밖(outOfScope): 이 기관 재물이지만 이번 회차 대상이 아님(불용·폐기, 대상 공간 밖, 시작 뒤 추가)
 *   - 중복(duplicate): 이번 회차에서 이미 찍은 재물 — **저장하지 않아 수가 늘지 않는다**
 *   - 직접 입력: 판정과 따로 `method: 'manual'`로 남겨 재확인 대상이 된다
 */
import { parseTag } from '../labels/tag';
import { NO_SPACE_KEY } from '../../schemas/survey';
import type { Scan, ScanCondition, ScanMethod, ScanResult, SurveyTarget, SurveyTargetItem } from '../../types/survey';
import type { AssetStatus } from '../../types/asset';

/** 코드 맞대기 — 앞뒤·사이 띄어쓰기 무시, 대소문자 무시 */
export const normalizeCode = (s: string): string => s.replace(/\s+/g, '').toUpperCase();

export interface IndexedTarget {
    item: SurveyTargetItem;
    /** 대상 목록상 공간(미지정이면 null) */
    spaceId: string | null;
}

export interface TargetIndex {
    byId: Map<string, IndexedTarget>;
    byTag: Map<string, IndexedTarget>;
    byCode: Map<string, IndexedTarget>;
}

export function buildTargetIndex(targets: SurveyTarget[]): TargetIndex {
    const index: TargetIndex = { byId: new Map(), byTag: new Map(), byCode: new Map() };
    for (const t of targets) {
        for (const item of t.items) {
            const entry = { item, spaceId: t.spaceId };
            index.byId.set(item.id, entry);
            if (item.tagId) index.byTag.set(item.tagId, entry);
            index.byCode.set(normalizeCode(item.code), entry);
        }
    }
    return index;
}

/** 찍힌 글자를 무엇으로 찾을지 — QR은 태그 주소면 태그, 아니면 자산코드(관리번호만 담긴 옛 QR). 직접 입력은 자산코드 */
export type Lookup = { kind: 'tag'; tag: string; text: string } | { kind: 'code'; code: string; text: string };

export function resolveInput(text: string, method: ScanMethod): Lookup | null {
    const trimmed = text.trim();
    if (!trimmed) return null;
    if (method === 'qr') {
        const tag = parseTag(trimmed);
        if (tag) return { kind: 'tag', tag, text: trimmed };
    }
    return { kind: 'code', code: trimmed.slice(0, 300), text: trimmed };
}

/** 대상 목록에서 바로 찾기(인터넷 없이) */
export function findInTargets(index: TargetIndex, lookup: Lookup): IndexedTarget | null {
    if (lookup.kind === 'tag') return index.byTag.get(lookup.tag) ?? null;
    return index.byCode.get(normalizeCode(lookup.code)) ?? null;
}

/** 대상 목록 밖에서 찾은 재물(서버 조회 결과) */
export interface FoundAsset {
    id: string;
    code: string;
    name: string | null;
    status: AssetStatus;
}

/** 스캔 문서 ID — 회차+재물(미등록은 회차+u+코드). 같은 물건은 같은 문서 */
export function scanDocId(surveyId: string, assetId: string | null, code: string): string {
    return assetId ? `${surveyId}__${assetId}` : `${surveyId}__u__${encodeURIComponent(normalizeCode(code))}`;
}

export interface ScanDraft {
    scanId: string;
    assetId: string | null;
    code: string;
    name: string | null;
    expectedSpaceId: string | null;
    result: ScanResult;
}

export type Judgement =
    | { kind: 'save'; draft: ScanDraft }
    | { kind: 'duplicate'; scanId: string; existing: Pick<Scan, 'spaceId' | 'result'> | null; code: string; name: string | null };

interface JudgeInput {
    surveyId: string;
    /** 찍는 곳 */
    spaceId: string;
    lookup: Lookup;
    /** 대상 목록에서 찾은 것 */
    target: IndexedTarget | null;
    /** 대상 목록에 없을 때 서버에서 찾은 재물(없으면 null) */
    found: FoundAsset | null;
    /** 이미 있는 스캔(알면) — 문서 ID → 스캔 */
    existing: (scanId: string) => Pick<Scan, 'spaceId' | 'result'> | null | undefined;
}

/**
 * 판정 — 대상 목록에서 찾았으면 정상/다른 공간, 서버에서만 찾았으면 범위 밖, 아무 데도 없으면 미등록.
 * 이미 찍은 재물이면 저장하지 않고 '중복'.
 */
export function judge({ surveyId, spaceId, lookup, target, found, existing }: JudgeInput): Judgement {
    let draft: ScanDraft;
    if (target) {
        const { item } = target;
        draft = {
            scanId: scanDocId(surveyId, item.id, item.code), assetId: item.id, code: item.code, name: item.name,
            expectedSpaceId: target.spaceId,
            result: target.spaceId === spaceId ? 'ok' : 'otherSpace',
        };
    } else if (found) {
        draft = {
            scanId: scanDocId(surveyId, found.id, found.code), assetId: found.id, code: found.code, name: found.name,
            expectedSpaceId: null, result: 'outOfScope',
        };
    } else {
        const code = lookup.kind === 'tag' ? lookup.tag : lookup.code;
        draft = { scanId: scanDocId(surveyId, null, code), assetId: null, code, name: null, expectedSpaceId: null, result: 'unregistered' };
    }
    const prev = existing(draft.scanId);
    if (prev !== undefined && prev !== null) {
        return { kind: 'duplicate', scanId: draft.scanId, existing: prev, code: draft.code, name: draft.name };
    }
    return { kind: 'save', draft };
}

export const SCAN_RESULT_LABEL: Record<ScanResult | 'duplicate', string> = {
    ok: '정상',
    otherSpace: '다른 공간',
    unregistered: '미등록',
    outOfScope: '범위 밖',
    duplicate: '이미 찍음',
};

/** 물건 상태 (기획서 F12) */
export const CONDITION_LABEL: Record<ScanCondition, string> = {
    normal: '정상',
    damaged: '파손·불용 필요',
    labelDamaged: '라벨 훼손',
};

/** 대상 묶음 키 — 공간 ID 또는 미지정 */
export const targetKey = (spaceId: string | null): string => spaceId ?? NO_SPACE_KEY;

export interface SpaceProgress {
    /** 대상 수 */
    target: number;
    /** 대상 중 찾은 수(어느 공간에서 찍혔든) */
    found: number;
    /** 대상 중 다른 공간에서 찍힌 수 */
    elsewhere: number;
    /** 이 공간에서 찍은 것 중 다른 공간·미등록·범위 밖 */
    foreign: number;
    /** 직접 입력으로 확인한 수(재확인 대상) */
    manual: number;
    /** 물건 상태가 정상이 아닌 수 */
    issues: number;
}

/** 공간별 진행 — 대상 묶음과 스캔 목록으로 계산 */
export function progressBySpace(targets: SurveyTarget[], scans: Scan[]): Map<string, SpaceProgress> {
    const out = new Map<string, SpaceProgress>();
    const empty = (): SpaceProgress => ({ target: 0, found: 0, elsewhere: 0, foreign: 0, manual: 0, issues: 0 });
    const ownerOf = new Map<string, string>();
    for (const t of targets) {
        const key = targetKey(t.spaceId);
        const p = out.get(key) ?? empty();
        p.target += t.items.length;
        out.set(key, p);
        for (const item of t.items) ownerOf.set(item.id, key);
    }
    for (const s of scans) {
        const owner = s.assetId ? ownerOf.get(s.assetId) : undefined;
        if (owner && (s.result === 'ok' || s.result === 'otherSpace')) {
            const p = out.get(owner)!;
            p.found += 1;
            if (s.result === 'otherSpace') p.elsewhere += 1;
            if (s.method === 'manual') p.manual += 1;
            if (s.condition !== 'normal') p.issues += 1;
        }
        if (s.result !== 'ok') {
            const here = out.get(s.spaceId) ?? empty();
            here.foreign += 1;
            out.set(s.spaceId, here);
        }
    }
    return out;
}

/** 한 공간의 대상 중 아직 못 찾은 것 */
export function remainingIn(target: SurveyTarget | undefined, scannedAssetIds: Set<string>): SurveyTargetItem[] {
    return (target?.items ?? []).filter((i) => !scannedAssetIds.has(i.id));
}

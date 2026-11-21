/**
 * Firestore — 조사 회차(surveys)·조사 대상(surveyTargets)·스캔(scans) — 기획서 F10~F12
 *
 * - 회차 시작은 관리자만, 회차 문서와 공간별 대상 묶음을 한 배치로 쓴다(대상이 없는 회차가 생기지 않게).
 * - 스캔은 담당 공간에서만 쓴다(firestore.rules). 문서 ID가 회차+재물이라 같은 물건은 문서 하나.
 * - 스캔 저장은 기다리지 않는다 — 지하·창고처럼 전파가 약한 곳에서는 오프라인 캐시에 남았다가
 *   연결되면 전송된다. 서버가 거절하면(이미 다른 곳에서 찍힘 등) `onRejected`로 알린다.
 */
import {
    collection, doc, query, where, getDoc, getDocs, writeBatch, setDoc, updateDoc, deleteDoc,
    serverTimestamp, orderBy, limit, onSnapshot,
    type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';
import { createZodConverter, surveySchema, surveyTargetSchema, scanSchema, NO_SPACE_KEY } from '../../schemas';
import { captureError } from '../sentry';
import { actorStamp } from './actorStamp';
import type { Asset } from '../../types/asset';
import type { Survey, SurveyTarget, SurveyTargetItem, Scan, ScanCondition, ScanMethod } from '../../types/survey';
import type { SurveyMode } from '../../types';
import type { ScanDraft } from '../survey/judge';

const surveyConverter = createZodConverter(surveySchema);
const targetConverter = createZodConverter(surveyTargetSchema);
const scanConverter = createZodConverter(scanSchema);

/** 기관의 회차(최근 순) */
export const getSurveys = async (orgId: string, max = 20): Promise<Survey[]> => {
    try {
        const snap = await getDocs(query(
            collection(db, 'surveys').withConverter(surveyConverter),
            where('organizationId', '==', orgId),
            orderBy('createdAt', 'desc'),
            limit(max),
        ));
        return snap.docs.map((d) => d.data() as Survey);
    } catch (error) {
        captureError(error, { context: 'getSurveys', orgId });
        throw error;
    }
};

/** 진행 중인 회차 — 한 기관에 하나만 연다(화면이 막는다). 없으면 null */
export const getOpenSurvey = async (orgId: string): Promise<Survey | null> => {
    try {
        const snap = await getDocs(query(
            collection(db, 'surveys').withConverter(surveyConverter),
            where('organizationId', '==', orgId),
            where('status', '==', 'open'),
            limit(1),
        ));
        return snap.empty ? null : (snap.docs[0].data() as Survey);
    } catch (error) {
        captureError(error, { context: 'getOpenSurvey', orgId });
        throw error;
    }
};

/** 회차의 대상 묶음 전부(공간 수만큼, 문서 수십 개) */
export const getSurveyTargets = async (orgId: string, surveyId: string): Promise<SurveyTarget[]> => {
    try {
        const snap = await getDocs(query(
            collection(db, 'surveyTargets').withConverter(targetConverter),
            where('organizationId', '==', orgId),
            where('surveyId', '==', surveyId),
        ));
        return snap.docs.map((d) => d.data() as SurveyTarget);
    } catch (error) {
        captureError(error, { context: 'getSurveyTargets', orgId, surveyId });
        throw error;
    }
};

export interface StartSurveyInput {
    orgId: string;
    name: string;
    startDate: string;
    endDate: string;
    spaceIds: string[];
    includesUnassigned: boolean;
    mode: SurveyMode;
    /** 기관 재물 전부 — 이 중 운영 재물을 대상 공간별로 묶어 고정한다 */
    assets: Asset[];
}

/** 대상 묶기 — 운영 재물만, 고른 공간(+미지정)만. 공간 키 → 대상 목록 */
export function groupTargets(assets: Asset[], spaceIds: string[], includesUnassigned: boolean): Map<string, SurveyTargetItem[]> {
    const groups = new Map<string, SurveyTargetItem[]>(spaceIds.map((id) => [id, []]));
    if (includesUnassigned) groups.set(NO_SPACE_KEY, []);
    for (const a of assets) {
        if (a.status !== 'active') continue;
        const key = a.spaceId ?? NO_SPACE_KEY;
        groups.get(key)?.push({ id: a.id, code: a.code, name: a.name, tagId: a.tagId });
    }
    return groups;
}

/** 회차 시작 — 회차 문서와 공간별 대상 묶음을 한 배치로. @returns 회차 ID */
export const startSurvey = async (input: StartSurveyInput): Promise<string> => {
    const stamp = actorStamp();
    const now = serverTimestamp();
    const ref = doc(collection(db, 'surveys'));
    const groups = groupTargets(input.assets, input.spaceIds, input.includesUnassigned);
    const targetCount = [...groups.values()].reduce((n, list) => n + list.length, 0);
    const batch = writeBatch(db);
    batch.set(ref, {
        organizationId: input.orgId, name: input.name.trim(), startDate: input.startDate, endDate: input.endDate,
        spaceIds: input.spaceIds, includesUnassigned: input.includesUnassigned, mode: input.mode, status: 'open',
        targetCount, lastEditedByUid: stamp.lastEditedByUid ?? '', createdAt: now,
    });
    for (const [key, items] of groups) {
        batch.set(doc(db, 'surveyTargets', `${ref.id}__${key}`), {
            organizationId: input.orgId, surveyId: ref.id, spaceId: key === NO_SPACE_KEY ? null : key, items,
            lastEditedByUid: stamp.lastEditedByUid ?? '', createdAt: now,
        });
    }
    try {
        await batch.commit();
        return ref.id;
    } catch (error) {
        captureError(error, { context: 'startSurvey', orgId: input.orgId, spaces: input.spaceIds.length, targetCount });
        throw error;
    }
};

/** 스캔 한 건(중복 확인용) — 없으면 null. 오프라인이라 확인하지 못하면 undefined */
export const peekScan = async (scanId: string): Promise<Scan | null | undefined> => {
    try {
        const snap = await getDoc(doc(db, 'scans', scanId).withConverter(scanConverter));
        return snap.exists() ? (snap.data() as Scan) : null;
    } catch {
        return undefined;
    }
};

export interface SaveScanInput {
    orgId: string;
    surveyId: string;
    spaceId: string;
    method: ScanMethod;
    draft: ScanDraft;
    /** 서버가 저장을 거절했을 때(오프라인이었다가 연결된 뒤일 수 있다) */
    onRejected?: (error: unknown) => void;
}

/** 스캔 저장 — 기다리지 않고 바로 돌아온다(오프라인 캐시). 거절되면 onRejected */
export function saveScan({ orgId, surveyId, spaceId, method, draft, onRejected }: SaveScanInput): void {
    const stamp = actorStamp();
    const now = serverTimestamp();
    setDoc(doc(db, 'scans', draft.scanId), {
        organizationId: orgId, surveyId, assetId: draft.assetId, code: draft.code, name: draft.name,
        spaceId, expectedSpaceId: draft.expectedSpaceId, result: draft.result, method,
        condition: 'normal', memo: '', scannedByUid: stamp.lastEditedByUid ?? '', scannedAt: now,
        updatedAt: now, ...stamp,
    }).catch((error) => {
        captureError(error, { context: 'saveScan', orgId, surveyId, result: draft.result });
        onRejected?.(error);
    });
}

/** 물건 상태·메모 고치기 (기획서 F12) */
export function updateScanCondition(scanId: string, condition: ScanCondition, memo: string, onRejected?: (e: unknown) => void): void {
    updateDoc(doc(db, 'scans', scanId), {
        condition, memo: memo.slice(0, 200), updatedAt: serverTimestamp(), ...actorStamp(),
    }).catch((error) => {
        captureError(error, { context: 'updateScanCondition' });
        onRejected?.(error);
    });
}

/** 잘못 찍은 스캔 지우기 — 열린 회차에서 관리자 또는 찍은 사람 */
export const deleteScan = async (scanId: string): Promise<void> => {
    try {
        await deleteDoc(doc(db, 'scans', scanId));
    } catch (error) {
        captureError(error, { context: 'deleteScan' });
        throw error;
    }
};

/** 회차의 스캔 전부(관리자 진행 확인) */
export const getScans = async (orgId: string, surveyId: string): Promise<Scan[]> => {
    try {
        const snap = await getDocs(query(
            collection(db, 'scans').withConverter(scanConverter),
            where('organizationId', '==', orgId),
            where('surveyId', '==', surveyId),
        ));
        return snap.docs.map((d) => d.data() as Scan);
    } catch (error) {
        captureError(error, { context: 'getScans', orgId, surveyId });
        throw error;
    }
};

/**
 * 한 공간에 관한 스캔을 실시간으로 받는다 — 이 공간에서 찍은 것(`spaceId`)과 이 공간 대상이 어디서든
 * 찍힌 것(`expectedSpaceId`) 두 갈래. 회차 전체를 받지 않아 읽기가 공간 크기만큼만 든다.
 */
export function subscribeSpaceScans(
    orgId: string, surveyId: string, spaceId: string,
    onChange: (scans: Scan[]) => void, onError?: (e: unknown) => void,
): Unsubscribe {
    const here = new Map<string, Scan>();
    const mine = new Map<string, Scan>();
    const emit = () => onChange([...new Map([...mine, ...here]).values()]);
    const sub = (field: 'spaceId' | 'expectedSpaceId', bucket: Map<string, Scan>) => onSnapshot(
        query(
            collection(db, 'scans').withConverter(scanConverter),
            where('organizationId', '==', orgId),
            where('surveyId', '==', surveyId),
            where(field, '==', spaceId),
        ),
        (snap) => {
            bucket.clear();
            for (const d of snap.docs) bucket.set(d.id, d.data() as Scan);
            emit();
        },
        (error) => {
            captureError(error, { context: 'subscribeSpaceScans', field });
            onError?.(error);
        },
    );
    const a = sub('spaceId', here);
    const b = sub('expectedSpaceId', mine);
    return () => { a(); b(); };
}

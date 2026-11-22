/**
 * Firestore — 재물 마지막 확인(assetChecks) 도메인 함수 (2026-11-22, 상시 확인 기록)
 *
 * 쓰기는 같은 기관 구성원이면 누구나(관리자·직원), 본인 이름·서버 시각으로만(firestore.rules `assetChecks`).
 * 확인 기록은 화면 흐름을 막으면 안 되므로 기다리지 않고 보낸다 — 실패해도 사용자에게 알리지 않고 Sentry에만 남긴다
 * (재물 화면은 그대로 열려야 한다). 오프라인이면 Firestore가 들고 있다가 연결되면 보낸다.
 */
import { collection, doc, getDoc, getDocs, query, setDoc, where, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { createZodConverter, assetCheckSchema } from '../../schemas';
import { captureError } from '../sentry';
import { actorStamp } from './actorStamp';
import type { AssetCheck, AssetCheckVia } from '../../types/assetCheck';

const converter = createZodConverter(assetCheckSchema);

export interface RecordAssetCheckInput {
    orgId: string;
    assetId: string;
    via: AssetCheckVia;
    spaceId?: string | null;
    surveyId?: string | null;
}

/** 확인 기록 남기기 — 기다리지 않는다 */
export function recordAssetCheck({ orgId, assetId, via, spaceId = null, surveyId = null }: RecordAssetCheckInput): void {
    const uid = actorStamp().lastEditedByUid;
    if (!uid || !assetId.startsWith(`${orgId}__`)) return;
    setDoc(doc(db, 'assetChecks', assetId), {
        organizationId: orgId, assetId, checkedAt: serverTimestamp(), checkedByUid: uid, via, spaceId, surveyId,
    }).catch((error) => captureError(error, { context: 'recordAssetCheck', orgId, via }));
}

/** 재물 한 건의 마지막 확인 — 없으면 null */
export const getAssetCheck = async (assetId: string): Promise<AssetCheck | null> => {
    try {
        const snap = await getDoc(doc(db, 'assetChecks', assetId).withConverter(converter));
        return snap.exists() ? (snap.data() as AssetCheck) : null;
    } catch (error) {
        captureError(error, { context: 'getAssetCheck' });
        throw error;
    }
};

/** 기관 전체의 마지막 확인 — 재물 ID → 기록. 한 번도 확인하지 않은 재물은 없다 */
export const getAssetChecks = async (orgId: string): Promise<Map<string, AssetCheck>> => {
    try {
        const snap = await getDocs(query(collection(db, 'assetChecks').withConverter(converter), where('organizationId', '==', orgId)));
        return new Map(snap.docs.map((d) => [d.id, d.data() as AssetCheck]));
    } catch (error) {
        captureError(error, { context: 'getAssetChecks', orgId });
        throw error;
    }
};

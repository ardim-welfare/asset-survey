/**
 * Firestore — 사전 등록 직원 (preRegistered) 관련 함수
 */
import {
    collection, addDoc, getDocs, deleteDoc, doc, updateDoc,
    serverTimestamp, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { captureError } from '../sentry';

export interface PreRegisteredEmployee {
    id: string;
    name: string;
    email: string;
    /** 가입하면 이 팀으로 들어간다(2026-11-22) */
    teamId?: string | null;
    createdAt: unknown;
}

// 사전 등록 직원 목록 조회
export const getPreRegisteredEmployees = async (orgId: string): Promise<PreRegisteredEmployee[]> => {
    try {
        const snap = await getDocs(collection(db, 'organizations', orgId, 'preRegistered'));
        return snap.docs
            .map(d => ({ id: d.id, ...d.data() } as PreRegisteredEmployee))
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } catch (error) {
        captureError(error, { context: 'getPreRegisteredEmployees', orgId });
        throw error;
    }
};

// 사전 등록 직원 추가
export const addPreRegisteredEmployee = async (
    orgId: string,
    name: string,
    email: string,
    teamId: string | null = null,
): Promise<void> => {
    try {
        await addDoc(collection(db, 'organizations', orgId, 'preRegistered'), {
            name: name.trim(),
            email: email.trim().toLowerCase(),
            teamId,
            createdAt: serverTimestamp(),
        });
    } catch (error) {
        captureError(error, { context: 'addPreRegisteredEmployee', orgId });
        throw error;
    }
};

/** 사전 등록 직원의 팀 바꾸기(2026-11-22) — 예전엔 지우고 다시 등록해야 했다 */
export const updatePreRegisteredTeam = async (orgId: string, preRegId: string, teamId: string | null): Promise<void> => {
    try {
        await updateDoc(doc(db, 'organizations', orgId, 'preRegistered', preRegId), { teamId });
    } catch (error) {
        captureError(error, { context: 'updatePreRegisteredTeam', orgId });
        throw error;
    }
};

// 사전 등록 직원 삭제
export const deletePreRegisteredEmployee = async (orgId: string, preRegId: string): Promise<void> => {
    try {
        await deleteDoc(doc(db, 'organizations', orgId, 'preRegistered', preRegId));
    } catch (error) {
        captureError(error, { context: 'deletePreRegisteredEmployee', orgId, preRegId });
        throw error;
    }
};

/** 한 배치에 담는 쓰기 수 — Firestore 한도(500)보다 넉넉히 작게 */
const BATCH_LIMIT = 400;

async function inBatches<T>(items: T[], write: (batch: ReturnType<typeof writeBatch>, item: T) => void): Promise<void> {
    for (let i = 0; i < items.length; i += BATCH_LIMIT) {
        const batch = writeBatch(db);
        items.slice(i, i + BATCH_LIMIT).forEach((item) => write(batch, item));
        await batch.commit();
    }
}

/** 여러 명 한꺼번에 미리 등록(2026-11-23) — 이름·이메일은 미리 검사해 넘긴다 */
export const addPreRegisteredBatch = async (
    orgId: string, rows: Array<{ name: string; email: string; teamId: string | null }>,
): Promise<void> => {
    try {
        await inBatches(rows, (batch, r) => {
            batch.set(doc(collection(db, 'organizations', orgId, 'preRegistered')), {
                name: r.name.trim(), email: r.email.trim().toLowerCase(), teamId: r.teamId, createdAt: serverTimestamp(),
            });
        });
    } catch (error) {
        captureError(error, { context: 'addPreRegisteredBatch', orgId, count: rows.length });
        throw error;
    }
};

/** 가입 대기 여러 명의 팀을 한꺼번에(2026-11-23) */
export const updatePreRegisteredTeamBatch = async (orgId: string, ids: string[], teamId: string | null): Promise<void> => {
    try {
        await inBatches(ids, (batch, id) => batch.update(doc(db, 'organizations', orgId, 'preRegistered', id), { teamId }));
    } catch (error) {
        captureError(error, { context: 'updatePreRegisteredTeamBatch', orgId, count: ids.length });
        throw error;
    }
};

/** 가입 대기 여러 명을 한꺼번에 취소(2026-11-23) */
export const deletePreRegisteredBatch = async (orgId: string, ids: string[]): Promise<void> => {
    try {
        await inBatches(ids, (batch, id) => batch.delete(doc(db, 'organizations', orgId, 'preRegistered', id)));
    } catch (error) {
        captureError(error, { context: 'deletePreRegisteredBatch', orgId, count: ids.length });
        throw error;
    }
};

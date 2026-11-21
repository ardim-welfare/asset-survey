/**
 * e2e/emulator/seed.ts — Firebase 에뮬레이터 시드.
 * admin SDK로 Auth 계정(+custom claims)과 Firestore 테스트 데이터를 주입한다.
 * admin SDK는 firebase emulators:exec가 주입하는 FIREBASE_AUTH_EMULATOR_HOST /
 * FIRESTORE_EMULATOR_HOST 환경변수를 감지해 자동으로 에뮬레이터를 대상으로 동작한다.
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
// 값을 복제하지 않고 원본을 가져온다 — 약관 개정으로 버전이 오르면 시드도 자동으로 따라가야
// 재동의 게이트가 E2E를 막지 않는다. (constants.ts는 import가 없는 순수 상수 모듈이라 Node에서 안전)
import { TERMS_VERSION, PRIVACY_VERSION } from '../../src/lib/constants';

const PROJECT_ID =
    process.env.GCLOUD_PROJECT ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    'demo-asset-survey';

export const TEST_ORG_ID = 'e2e-org';
export const TEST_ADMIN = {
    uid: 'e2e-admin',
    email: 'e2e-admin@test.local',
    password: 'test1234',
    name: 'E2E 관리자',
};
export const TEST_EMPLOYEE = {
    uid: 'e2e-employee',
    email: 'e2e-emp@test.local',
    password: 'test1234',
    name: 'E2E 직원',
};

export async function seedEmulator(): Promise<void> {
    if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
    const auth = getAuth();
    const db = getFirestore();

    // 1) Auth 계정 (이미 있으면 무시)
    for (const u of [TEST_ADMIN, TEST_EMPLOYEE]) {
        try {
            await auth.createUser({ uid: u.uid, email: u.email, password: u.password, displayName: u.name });
        } catch (e: unknown) {
            const code = (e as { code?: string })?.code;
            if (code !== 'auth/uid-already-exists' && code !== 'auth/email-already-exists') throw e;
        }
    }
    // Custom claims (firestore.rules가 token.role / token.orgId를 검증)
    await auth.setCustomUserClaims(TEST_ADMIN.uid, { role: 'admin', orgId: TEST_ORG_ID });
    await auth.setCustomUserClaims(TEST_EMPLOYEE.uid, { role: 'employee', orgId: TEST_ORG_ID });

    // 2) Firestore 시드
    const now = new Date();
    // consent는 재동의 게이트(useConsentGate)가 참조한다. 없으면 관리자에게 차단 모달이 떠
    // 클릭을 가로채므로 인증 E2E 전체가 실패한다. 게이트 자체를 검증하는 테스트가 아니라면
    // 시드 계정은 항상 현행 버전에 동의한 상태여야 한다.
    await db.collection('organizations').doc(TEST_ORG_ID).set({
        name: 'E2E 테스트 기관',
        status: 'approved',
        createdAt: now,
        consent: {
            terms: true,
            privacy: true,
            termsVersion: TERMS_VERSION,
            privacyVersion: PRIVACY_VERSION,
            agreedAt: now,
        },
    }, { merge: true });

    await db.collection('users').doc(TEST_ADMIN.uid).set({
        uid: TEST_ADMIN.uid, name: TEST_ADMIN.name, email: TEST_ADMIN.email,
        role: 'admin', organizationId: TEST_ORG_ID, organizationStatus: 'approved',
        status: 'active', createdAt: now,
        consent: { terms: true, termsVersion: TERMS_VERSION, agreedAt: now },
    }, { merge: true });

    await db.collection('users').doc(TEST_EMPLOYEE.uid).set({
        uid: TEST_EMPLOYEE.uid, name: TEST_EMPLOYEE.name, email: TEST_EMPLOYEE.email,
        role: 'employee', organizationId: TEST_ORG_ID, organizationStatus: 'approved',
        status: 'active', createdAt: now,
        consent: { terms: true, termsVersion: TERMS_VERSION, agreedAt: now },
    }, { merge: true });


}

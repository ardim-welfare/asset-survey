/**
 * purgeOrganizationData — 해지된 기관의 데이터를 실제로 파기한다
 *
 * ## 왜 필요한가
 * 처리방침 제9조와 해지 화면은 "해지 30일 뒤 기관 데이터가 완전히 삭제된다"고 약속한다
 * (PrivacyPage.tsx·WithdrawOrgModal.tsx). 그런데 예전 purgeOrgs와 superAdmin의 영구 삭제는
 * users와 기관 문서만 지웠다. 기관의 나머지 기록은 기관이 사라진 뒤에도 영구히 남았다
 * (차량운행일지 2026-10-14 감사에서 발견). 수탁자로서 위탁이 끝난 개인정보를 파기하지 않는 상태였다.
 *
 * ## 순서가 곧 안전장치다
 * - **기관 문서를 맨 마지막에 지운다.** 중간에 타임아웃·오류가 나도 기관 문서가
 *   `status: "deleted"`로 남아 있으므로 다음 실행(주간 배치 또는 재호출)이 이어서 지운다.
 *   전 과정이 멱등이다 — 이미 지운 것은 다시 조회돼도 0건이다.
 * - 기록류를 그것이 가리키는 대상(사용자 등)보다 먼저 지운다. 삭제 트리거가 생기면
 *   isOrgRetired로 해지 기관의 부수효과를 건너뛰되, 순서로도 한 번 더 막는다.
 * - 감사 기록(auditLogs)은 **지우지 않는다.** 접속기록은 1년 보관이 법정 요건이고(TTL로
 *   자동 만료), 값이 아니라 필드 이름만 담는다. 이 파기로 생기는 삭제 감사 기록이 곧 파기
 *   기록이 된다.
 *
 * ## 이 함수가 지우지 못하는 것 (기록해 둔다)
 * - Firestore 백업(전 기관 통합, 90일 수명 주기로 만료 — 기관 단위로 지울 수 없다).
 * - uid로만 묶인 데이터(organizationId 없는 알림, Storage feedbacks/{uid}/) —
 *   users 문서가 해지 시점에 이미 지워져 기관→uid를 되찾을 정본이 없다.
 *   → 이 조각과 Firebase Auth 계정은 주간 배치의 cleanupOrphanAuthAccounts가 "소속 없이 90일" 기준으로
 *     정리한다(기본은 보고만, system/authCleanup.deleteEnabled로 켠다).
 */
import { getFirestore, type Firestore, type Query } from "firebase-admin/firestore";
import { SYSTEM_ORG_ID } from "../audit/writeAuditEntry";

/** 한 번에 지우는 문서 수 — 배치 상한(500)보다 여유를 둔다 */
const DELETE_PAGE = 400;

/**
 * `organizationId`(또는 다른 기관 필드)로 묶인 컬렉션 — **지우는 순서대로** 적는다.
 * 기록류 → 사용자 순이다. 재물·공간·조사 컬렉션을 만들면 여기에 먼저 추가한다
 * (빠뜨리면 해지 기관의 데이터가 파기되지 않고 남는다).
 */
const ORG_SCOPED: ReadonlyArray<readonly [collection: string, field: string]> = [
    ["notifications", "organizationId"],
    ["feedbacks", "organizationId"],
    // 조사 쪽 — 반영 목록·이력·제출·스캔 → 대상 → 회차 순(모두 회차를 가리킨다)
    ["syncTasks", "organizationId"],
    ["surveyEvents", "organizationId"],
    ["surveySubmissions", "organizationId"],
    ["scans", "organizationId"],
    ["surveyTargets", "organizationId"],
    ["surveys", "organizationId"],
    // 재물 쪽 — 이력·기록 → 금액 → 재물 → 공간 순(기록이 재물을, 재물이 공간을 가리킨다)
    ["history", "organizationId"],
    ["imports", "organizationId"],
    ["assetAccounting", "organizationId"],
    // 재물 마지막 확인 — 재물을 가리키므로 재물 앞
    ["assetChecks", "organizationId"],
    ["assets", "organizationId"],
    // 공간 — 재물·조사 컬렉션을 만들면 이보다 앞에 둔다(기록이 공간을 가리킨다)
    ["spaces", "organizationId"],
    // 건물 — 공간이 건물을 가리키므로 공간 뒤
    ["buildings", "organizationId"],
    // 해지 시점에 이미 지워졌지만, 그 뒤에 남은 문서가 있으면 함께 지운다.
    ["users", "organizationId"],
];


export interface PurgeBucket {
    deleteFiles(options: { prefix: string }): Promise<unknown>;
}

export interface PurgeSummary {
    orgId: string;
    /** 컬렉션별 삭제 문서 수 */
    deleted: Record<string, number>;
    storagePrefix: string;
}

/** 해지(status: deleted) 상태가 아닌 기관은 파기하지 않는다 — 호출자 실수에 대한 마지막 방어선 */
export class OrgNotRetiredError extends Error {
    constructor(orgId: string, status: unknown) {
        super(`기관 ${orgId}은(는) 해지 상태가 아니라 파기하지 않는다 (status=${String(status)})`);
        this.name = "OrgNotRetiredError";
    }
}

async function deleteByQuery(db: Firestore, query: Query): Promise<number> {
    let total = 0;
    for (;;) {
        const snap = await query.limit(DELETE_PAGE).get();
        if (snap.empty) return total;
        const batch = db.batch();
        snap.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
        total += snap.size;
    }
}

/** 기관 ID 형식 검사 — 빈 값으로 where(==)를 돌리면 organizationId가 빈 문서(공개 문의 등)를 통째로 지운다 */
function assertValidOrgId(orgId: unknown): asserts orgId is string {
    if (typeof orgId !== "string" || orgId.trim() === "" || orgId === SYSTEM_ORG_ID || orgId.includes("/")) {
        throw new Error(`파기할 기관 ID가 올바르지 않다: ${JSON.stringify(orgId)}`);
    }
}

/**
 * 파기 본체 — 해지 기관(purgeOrganizationData)과 고아 데이터(purgeOrphanOrganizationData)가 공유한다.
 * `guard`는 단계마다 불려 진행해도 되는지 다시 확인한다(던지면 그 자리에서 멈춘다).
 */
async function runPurge(
    orgId: string,
    bucket: PurgeBucket,
    db: Firestore,
    guard: () => Promise<void>,
): Promise<PurgeSummary> {
    const orgRef = db.collection("organizations").doc(orgId);
    const deleted: Record<string, number> = {};
    const count = (key: string, n: number) => { deleted[key] = (deleted[key] ?? 0) + n; };

    for (const [collection, field] of ORG_SCOPED) {
        await guard();
        count(collection, await deleteByQuery(db, db.collection(collection).where(field, "==", orgId)));
    }

    // 증빙 서류(사업자등록증 등) 이미지 — cleanupImages는 승인·반려 기관만 정리해 해지 기관 것은 남았다.
    const storagePrefix = `organizations/${orgId}/`;
    await bucket.deleteFiles({ prefix: storagePrefix });

    // 마지막: 기관 문서와 그 하위 컬렉션(preRegistered·stats).
    // 문서 delete는 하위 컬렉션을 지우지 않으므로 recursiveDelete를 쓴다. 기관 문서가 이미 없는
    // 고아도 하위 컬렉션은 남아 있을 수 있다(예전 퍼지는 문서만 지웠다) — 없는 문서에도 그대로 돈다.
    await guard();
    await db.recursiveDelete(orgRef);
    count("organizations", 1);

    return { orgId, deleted, storagePrefix };
}

/**
 * 기관 하나의 데이터를 파기한다. 기관 문서가 해지 상태(`status: "deleted"`)일 때만 진행한다.
 * 30일 유예 판정은 호출자(purgeOrgs·purgeOrganization 콜러블)의 몫이다.
 */
export async function purgeOrganizationData(
    orgId: string,
    bucket: PurgeBucket,
    db: Firestore = getFirestore(),
): Promise<PurgeSummary> {
    assertValidOrgId(orgId);

    const orgRef = db.collection("organizations").doc(orgId);
    const orgSnap = await orgRef.get();
    if (!orgSnap.exists) {
        // 이미 끝까지 지워졌다(기관 문서는 마지막에 지운다). 할 일이 없다.
        return { orgId, deleted: {}, storagePrefix: "" };
    }
    const status = orgSnap.data()?.status;
    if (status !== "deleted") throw new OrgNotRetiredError(orgId, status);

    /**
     * 파기 도중 복구(restoreOrganization)되면 멈춘다. 상태를 시작할 때 한 번만 보면, 파기가 도는
     * 수 초~수 분 사이에 슈퍼관리자가 복구를 눌러도 끝까지 진행해 **복구된 기관 문서까지** 지운다.
     * 이미 지운 것은 되돌릴 수 없지만, 기관 문서와 남은 데이터는 지킨다. 단계마다 읽기 1회다.
     */
    return runPurge(orgId, bucket, db, async () => {
        const now = (await orgRef.get()).data()?.status;
        if (now !== "deleted") throw new OrgNotRetiredError(orgId, now);
    });
}

/** 고아 파기 대상이 아닌 기관(기관 문서가 있다) — 해지 기관은 purgeOrganizationData로 지운다 */
export class OrgStillExistsError extends Error {
    constructor(orgId: string) {
        super(`기관 ${orgId}의 문서가 있어 고아 데이터로 보지 않는다 — 해지 기관이면 purgeOrganization을 쓴다`);
        this.name = "OrgStillExistsError";
    }
}

/**
 * **기관 문서가 이미 없는** 기관의 남은 데이터를 파기한다(일회성 정리 스크립트 전용).
 *
 * 2026-10-14 이전의 퍼지는 users와 기관 문서만 지워, 그 기관의 운행일지·예약 등이 기관 문서
 * 없이 남았다. 기관 문서가 없으니 주간 배치(status·deletedAt으로 대상을 찾는다)도 콜러블도
 * 그 기관을 찾지 못한다. `scripts/purge-orphan-org-data.ts`가 고아 기관 ID를 찾아 이 함수를 부른다.
 * 단계마다 기관 문서가 여전히 없는지 다시 확인한다 — 있으면 고아가 아니므로 멈춘다.
 */
export async function purgeOrphanOrganizationData(
    orgId: string,
    bucket: PurgeBucket,
    db: Firestore = getFirestore(),
): Promise<PurgeSummary> {
    assertValidOrgId(orgId);
    const orgRef = db.collection("organizations").doc(orgId);
    return runPurge(orgId, bucket, db, async () => {
        if ((await orgRef.get()).exists) throw new OrgStillExistsError(orgId);
    });
}

/** 고아 탐색 대상 — 기관 필드로 묶인 컬렉션(ORG_SCOPED) */
const ORPHAN_SCAN: ReadonlyArray<readonly [collection: string, field: string]> = ORG_SCOPED;

/** 기관 ID를 문서 ID로 쓰는 하위 컬렉션 — 예전 퍼지가 부모 문서만 지워 남겼을 수 있다 */
const ORG_SUBCOLLECTIONS = ["preRegistered", "stats"] as const;

/**
 * 데이터는 남아 있는데 기관 문서가 없는 기관 ID를 찾는다.
 *
 * 문서를 전부 읽지 않는다 — 컬렉션마다 `where(field, ">", 직전 ID).orderBy(field).limit(1)`로
 * **서로 다른 기관 ID만 건너뛰며** 훑으므로 읽기 비용은 (컬렉션 수 × 기관 수) 수준이다.
 * 기관 필드가 비었거나 문자열이 아닌 문서는 `> ""` 조건에서 빠진다(빈 값 일괄 삭제 방지).
 *
 * 컬렉션별 훑기는 **동시에** 돌린다. 처음 판은 순서대로 돌아 운영(기관 수십 곳)에서 출력 없이
 * 수 분이 걸려 멈춘 것처럼 보였다(2026-10-14 실측). `onProgress`로 진행을 알린다.
 */
export async function findOrphanOrgIds(
    db: Firestore = getFirestore(),
    onProgress: (message: string) => void = () => {},
): Promise<string[]> {
    const candidates = new Set<string>();
    await Promise.all(ORPHAN_SCAN.map(async ([collection, field]) => {
        let last = "";
        let distinct = 0;
        for (;;) {
            const snap = await db.collection(collection).where(field, ">", last).orderBy(field).limit(1).get();
            if (snap.empty) break;
            const value = snap.docs[0].get(field);
            if (typeof value !== "string" || value <= last) break; // 방어: 진행하지 않으면 멈춘다
            if (value !== SYSTEM_ORG_ID) candidates.add(value);
            distinct++;
            last = value;
        }
        onProgress(`  · ${collection}: 기관 ${distinct}곳`);
    }));
    // 예전 퍼지는 기관 문서만 지워 하위 컬렉션(preRegistered: 사전 등록 직원 이름·이메일 등)이 남았다.
    // listDocuments는 하위 컬렉션만 남은 "없는 문서"도 돌려주므로, 다른 데이터가 없는 고아도 여기서 잡힌다.
    for (const ref of await db.collection("organizations").listDocuments()) candidates.add(ref.id);

    const ids = [...candidates].filter((id) => !id.includes("/") && id.trim() !== "").sort();
    onProgress(`  · 후보 기관 ${ids.length}곳 — 기관 문서 존재 여부 확인 중`);
    const orphans: string[] = [];
    // 존재 확인은 getAll로 묶어 왕복을 줄인다(100개씩).
    for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        const snaps = await db.getAll(...chunk.map((id) => db.collection("organizations").doc(id)));
        snaps.forEach((snap, j) => { if (!snap.exists) orphans.push(chunk[j]); });
    }
    return orphans;
}

/**
 * 고아 기관 하나가 남긴 문서 수 (dry-run 보고용, count 집계라 1,000건당 읽기 1회).
 *
 * 기관 필드로 묶인 컬렉션뿐 아니라 **기관 하위 컬렉션**도 센다. 처음 판은 앞쪽만 세서,
 * 하위 컬렉션만 남은 고아가 "0건 {}"으로 보여 무엇을 지우는지 판단할 수 없었다.
 */
export async function countOrgData(orgId: string, db: Firestore = getFirestore()): Promise<Record<string, number>> {
    assertValidOrgId(orgId);
    const orgRef = db.collection("organizations").doc(orgId);
    const entries = await Promise.all([
        ...ORPHAN_SCAN.map(async ([collection, field]) =>
            [collection, (await db.collection(collection).where(field, "==", orgId).count().get()).data().count] as const),
        ...ORG_SUBCOLLECTIONS.map(async (sub) =>
            [`organizations/${sub}`, (await orgRef.collection(sub).count().get()).data().count] as const),
    ]);
    const out: Record<string, number> = {};
    for (const [key, n] of entries) if (n > 0) out[key] = n;
    return out;
}

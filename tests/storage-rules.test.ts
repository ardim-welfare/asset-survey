// @vitest-environment node
import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Firebase 에뮬레이터 프로젝트 ID
const PROJECT_ID = 'demo-asset-survey';

// 기관 고유번호증(정부 발급 PII) 경로
const ORG_DOC_PATH = 'organizations/org-A/unique-number.jpg';

let testEnv: RulesTestEnvironment;

describe('Storage Security Rules — 기관 증빙서류(PII) 접근 격리', () => {
  beforeAll(async () => {
    // 에뮬레이터 환경 초기화 (storage.rules 읽어오기)
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      storage: {
        rules: readFileSync(resolve(process.cwd(), 'storage.rules'), 'utf8'),
        host: '127.0.0.1',
        port: 9199,
      },
    });
  });

  beforeEach(async () => {
    await testEnv.clearStorage();
    // 각 테스트 전에 증빙서류 1건을 규칙 우회로 시드한다(업로드는 실서비스에선 Admin SDK가 수행).
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await uploadBytes(ref(context.storage(), ORG_DOC_PATH), new Uint8Array([1, 2, 3]));
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  it('org 멤버는 자기 기관 증빙서류를 직접 읽을 수 없다 (superAdmin 전용으로 축소)', async () => {
    // given: org-A 소속 일반 멤버
    const memberStorage = testEnv
      .authenticatedContext('user_A', { role: 'member', orgId: 'org-A' })
      .storage();

    // when & then: 자기 기관 경로라도 직접 읽기는 거부되어야 한다 (2026-07-18 보안 재점검 B)
    await assertFails(getBytes(ref(memberStorage, ORG_DOC_PATH)));
  });

  it('org 관리자(admin)도 증빙서류를 직접 읽을 수 없다', async () => {
    const adminStorage = testEnv
      .authenticatedContext('admin_A', { role: 'admin', orgId: 'org-A' })
      .storage();

    await assertFails(getBytes(ref(adminStorage, ORG_DOC_PATH)));
  });

  it('타 기관 멤버는 당연히 읽을 수 없다', async () => {
    const otherOrgStorage = testEnv
      .authenticatedContext('user_B', { role: 'member', orgId: 'org-B' })
      .storage();

    await assertFails(getBytes(ref(otherOrgStorage, ORG_DOC_PATH)));
  });

  it('미인증 사용자는 읽을 수 없다', async () => {
    const anonStorage = testEnv.unauthenticatedContext().storage();

    await assertFails(getBytes(ref(anonStorage, ORG_DOC_PATH)));
  });

  it('superAdmin은 증빙서류를 읽을 수 있다 (회귀 가드 — 정당한 접근 경로 보존)', async () => {
    const superAdminStorage = testEnv
      .authenticatedContext('super_1', { role: 'superAdmin' })
      .storage();

    await assertSucceeds(getBytes(ref(superAdminStorage, ORG_DOC_PATH)));
  });

  it('어떤 클라이언트도 증빙서류 경로에 쓰기할 수 없다 (업로드는 Admin SDK 전용)', async () => {
    const superAdminStorage = testEnv
      .authenticatedContext('super_1', { role: 'superAdmin' })
      .storage();

    // 쓰기는 superAdmin에게도 거부(allow write: if false) — Admin SDK만 업로드
    await assertFails(uploadBytes(ref(superAdminStorage, ORG_DOC_PATH), new Uint8Array([9])));
  });
});

describe('Storage Security Rules — 피드백 이미지 업로드 형식 제한', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: `${PROJECT_ID}-feedback`,
      storage: {
        rules: readFileSync(resolve(process.cwd(), 'storage.rules'), 'utf8'),
        host: '127.0.0.1',
        port: 9199,
      },
    });
  });

  beforeEach(async () => {
    await env.clearStorage();
  });

  afterAll(async () => {
    await env.cleanup();
  });

  const bytes = new Uint8Array([1, 2, 3]);
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

  it('본인 피드백 폴더에 JPEG 업로드는 허용된다 (회귀 가드 — 피드백 첨부 형식)', async () => {
    const storage = env.authenticatedContext('user_A').storage();
    await assertSucceeds(
      uploadBytes(ref(storage, 'feedbacks/user_A/1_0.jpg'), bytes, { contentType: 'image/jpeg' }),
    );
  });

  it('본인 피드백 폴더에 WebP 업로드는 허용된다 (회귀 가드 — 압축 이미지 형식)', async () => {
    const storage = env.authenticatedContext('user_A').storage();
    await assertSucceeds(
      uploadBytes(ref(storage, 'feedbacks/user_A/1.webp'), bytes, { contentType: 'image/webp' }),
    );
  });

  it('피드백 폴더에 SVG(image/svg+xml)는 업로드할 수 없다 — 스크립트 삽입 차단', async () => {
    const storage = env.authenticatedContext('user_A').storage();
    await assertFails(
      uploadBytes(ref(storage, 'feedbacks/user_A/1_0.svg'), svg, { contentType: 'image/svg+xml' }),
    );
  });

  it('이미지가 아닌 형식(text/html)은 업로드할 수 없다', async () => {
    const storage = env.authenticatedContext('user_A').storage();
    await assertFails(
      uploadBytes(ref(storage, 'feedbacks/user_A/1_0.jpg'), bytes, { contentType: 'text/html' }),
    );
  });
});

// 재물 대표 사진 (2026-11-22) — 같은 기관이 보고, 그 기관 관리자만 올리고 지운다
describe('Storage Security Rules — 재물 사진', () => {
  let env: RulesTestEnvironment;
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  const PATH = 'organizations/org-A/assets/org-A__1/photo-1.jpg';

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      storage: { rules: readFileSync(resolve(process.cwd(), 'storage.rules'), 'utf8'), host: '127.0.0.1', port: 9199 },
    });
  });
  beforeEach(async () => { await env.clearStorage(); });
  afterAll(async () => { await env.cleanup(); });

  const as = (uid: string, role: string, orgId: string) => env.authenticatedContext(uid, { role, orgId }).storage();

  it('기관 관리자는 자기 기관 재물 폴더에 JPEG를 올리고, 같은 기관 직원은 본다', async () => {
    await assertSucceeds(uploadBytes(ref(as('admin_A', 'admin', 'org-A'), PATH), jpg, { contentType: 'image/jpeg' }));
    await assertSucceeds(getBytes(ref(as('emp_A1', 'employee', 'org-A'), PATH)));
    await assertFails(getBytes(ref(as('emp_B1', 'employee', 'org-B'), PATH)));
  });

  it('직원·다른 기관 관리자·다른 기관 재물 폴더·이미지가 아닌 파일은 막힌다', async () => {
    await assertFails(uploadBytes(ref(as('emp_A1', 'employee', 'org-A'), PATH), jpg, { contentType: 'image/jpeg' }));
    await assertFails(uploadBytes(ref(as('admin_B', 'admin', 'org-B'), PATH), jpg, { contentType: 'image/jpeg' }));
    await assertFails(uploadBytes(ref(as('admin_A', 'admin', 'org-A'), 'organizations/org-A/assets/org-B__1/photo-1.jpg'), jpg, { contentType: 'image/jpeg' }));
    await assertFails(uploadBytes(ref(as('admin_A', 'admin', 'org-A'), PATH), jpg, { contentType: 'text/html' }));
  });

  it('너무 큰 파일(2MB 이상)은 막힌다', async () => {
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    await assertFails(uploadBytes(ref(as('admin_A', 'admin', 'org-A'), PATH), big, { contentType: 'image/jpeg' }));
  });
});

// 조사 현장 사진 (2026-11-22) — 같은 기관 구성원이 올리고(올린 사람 표시 필수), 본인·관리자만 지운다
describe('Storage Security Rules — 조사 현장 사진', () => {
  let env: RulesTestEnvironment;
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  const PATH = 'organizations/org-A/scans/sv1/sv1__org-A__1-1.jpg';
  const meta = (uid: string) => ({ contentType: 'image/jpeg', customMetadata: { uploadedBy: uid } });

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      storage: { rules: readFileSync(resolve(process.cwd(), 'storage.rules'), 'utf8'), host: '127.0.0.1', port: 9199 },
    });
  });
  beforeEach(async () => { await env.clearStorage(); });
  afterAll(async () => { await env.cleanup(); });

  const as = (uid: string, role: string, orgId: string) => env.authenticatedContext(uid, { role, orgId }).storage();

  it('같은 기관 직원은 자기 이름을 남겨 올리고, 다른 기관은 못 올리거나 못 본다', async () => {
    await assertSucceeds(uploadBytes(ref(as('emp_A1', 'employee', 'org-A'), PATH), jpg, meta('emp_A1')));
    await assertSucceeds(getBytes(ref(as('emp_A2', 'employee', 'org-A'), PATH)));
    await assertFails(getBytes(ref(as('emp_B1', 'employee', 'org-B'), PATH)));
    await assertFails(uploadBytes(ref(as('emp_B1', 'employee', 'org-B'), 'organizations/org-A/scans/sv1/x.jpg'), jpg, meta('emp_B1')));
    await assertFails(uploadBytes(ref(as('emp_A1', 'employee', 'org-A'), 'organizations/org-A/scans/sv1/y.jpg'), jpg, meta('emp_A2')));
  });

  it('지우기는 올린 본인과 관리자만', async () => {
    await assertSucceeds(uploadBytes(ref(as('emp_A1', 'employee', 'org-A'), PATH), jpg, meta('emp_A1')));
    await assertFails(deleteObject(ref(as('emp_A2', 'employee', 'org-A'), PATH)));
    await assertSucceeds(deleteObject(ref(as('emp_A1', 'employee', 'org-A'), PATH)));
  });
});

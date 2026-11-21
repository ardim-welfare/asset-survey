# 🛠️ 운영 가이드 (OPERATIONS)

> **아직 운영 전입니다.** Firebase 프로젝트·도메인·저장소가 정해지면 이 문서를 채웁니다.
> 차량운행일지의 운영 가이드(같은 구조의 서비스)를 바탕으로 쓰되, 계정·프로젝트 이름은 이 서비스 것으로 바꿉니다.
> 이 저장소가 공개되면 계정 이메일·비밀값 내용은 적지 않고 **이름과 위치만** 적습니다.

---

## 1. 운영 시작 전 준비 목록

| 할 일 | 누가 | 메모 |
|---|---|---|
| Firebase 프로젝트 생성 (Blaze, 예산 알림) | 사용자 | Firestore는 서울(asia-northeast3). 만든 뒤 `.firebaserc`의 `demo-asset-survey`를 실제 ID로 바꾼다 |
| 웹 앱 등록 → `.env` 값 채우기 | 사용자 + AI | [.env.example](.env.example) |
| Google 로그인 사용 설정, OAuth 동의 화면 | 사용자 | **기본 주소부터** OAuth 클라이언트에 등록해야 한다 — 2.5의 2번. 전용 도메인을 정하면 같은 자리에 그 도메인도 추가 |
| App Check 키(Fraud Defense) | 사용자 + AI | 클래식 reCAPTCHA v3는 지원이 끝났다. 2.5의 3번 |
| Secret Manager 비밀값 등록 | 사용자 | `GEMINI_API_KEY` · `GMAIL_APP_PASSWORD` · `ALIMTALK_PROXY_TOKEN` → [README](README.md#환경변수) |
| `functions/.env` 채우기 | 사용자 + AI | [functions/.env.example](functions/.env.example) |
| 카카오 알림톡 템플릿 새로 등록 | 사용자 | 차량운행일지 템플릿 문구라 그대로 쓰지 않는다. 등록 전까지 알림톡은 끈다 |
| 이용약관·개인정보 처리방침 검토 | 사용자 검토 | 6단계에서 재물조사 서비스용 첫 초안으로 바꿨다(차량 처리 제거, 재물·조사 기록 처리 추가). **법률 검토와 시행일 확정**이 남았다 — 시행일은 `src/lib/constants.ts`의 `TERMS_VERSION`·`PRIVACY_VERSION` |
| Storage 버킷 리전 | 사용자 | 처리방침 제8조는 증빙서류 사본을 **미국(us-east1)**에 둔다고 적었다. 다른 리전으로 만들면 처리방침을 고친다 |
| 앱 아이콘 교체 | 사용자 + AI | `public/icons/`는 차량운행일지 아이콘이다 |
| 백업 버킷 `{프로젝트 ID}-backups` (asia-northeast3) | **완료 (2026-11-21, AI)** | `asset-survey-sp-backups` 서울·공개 차단·90일 자동 삭제([storage-lifecycle-backups.json](storage-lifecycle-backups.json)). Firestore 서비스 에이전트에 버킷 `storage.admin`, 기본 컴퓨트 계정에 `datastore.importExportAdmin`. 수동 export 시험 통과 — [dailyNightlyBatch.ts](functions/src/handlers/scheduled/dailyNightlyBatch.ts) |
| `auditLogs` TTL 정책 (`expiresAt`) | 사용자 | 접속기록 1년 보관 |
| GitHub 저장소·Actions Secrets | 사용자 | `ENV_FILE` · `FUNCTIONS_ENV_FILE` · `FIREBASE_SERVICE_ACCOUNT` · `SENTRY_AUTH_TOKEN` |

## 2. 처음 배포까지 — 단계별

> 시범(기획서 6단계)을 하려면 실제 주소가 있어야 한다(휴대폰 카메라는 HTTPS에서만 켜진다).
> 아래 순서대로 하고, **사용자** 표시가 붙은 단계를 마치면 AI에게 값을 알려 주면 나머지를 이어 받는다.
> 비밀값(키·토큰·서비스 계정 JSON)은 채팅에 붙여 넣지 말고 각자 콘솔·GitHub 설정에 직접 넣는다.

### 2.1 GitHub 저장소 — 완료 (2026-11-21)
1. **비공개** 저장소 `dreamworker0/asset-survey`를 만들고 `master`를 올렸다(AI가 `gh`로). `docs/` 참고 자료는 실명이 든 화면 캡처가 있어 `.gitignore`로 빼고 **이력에서도 지웠다**(지우기 전 전체 백업: `D:\apps\재물조사앱_백업_docs제외전_20261121.bundle`).
2. 기본 브랜치는 **`master`**다. CI·배포 워크플로가 모두 `master`를 기준으로 돈다(이 PC의 저장소는 2026-11-21에 `main`에서 `master`로 바꿨다). GitHub 저장소를 만들 때 기본 브랜치도 `master`로 둔다.
3. 원격 `origin` = `https://github.com/dreamworker0/asset-survey.git`. Dependabot이 의존성 갱신 PR을 열 수 있다.

### 2.2 Firebase 프로젝트
**AI가 CLI로 한 것 (2026-11-21)**
- 프로젝트 **`asset-survey-sp`** 생성(표시 이름 Asset Survey). `asset-survey`는 이미 다른 곳이 쓰고 있었다.
- 웹 앱 `Asset Survey Web` 등록 → 설정값으로 로컬 `.env`를 만들었다(git 제외).
- Firestore API를 켜고 **Firestore 기본 데이터베이스를 asia-northeast3(서울)**에 만들었다(처음엔 모두 막힌 규칙 — 첫 배포가 `firestore.rules`를 올린다).
- `.firebaserc` 기본값을 `asset-survey-sp`로(에뮬레이터용 `demo-asset-survey`는 별칭 `demo`), GitHub 저장소 변수 `FIREBASE_PROJECT_ID=asset-survey-sp`.

**사용자가 콘솔에서 할 것** — [Firebase 콘솔](https://console.firebase.google.com/project/asset-survey-sp/overview)
1. **요금제를 Blaze로** 바꾸고 Google Cloud 결제에서 **예산 알림**(예: 월 1만 원, 50·90·100%)을 만든다. Functions·Storage·백업에 Blaze가 필요하다.
2. **Storage** 시작하기 → 위치 **us-east1**(처리방침 제8조와 같게). 버킷 이름은 `asset-survey-sp.firebasestorage.app`.
3. **Authentication** 시작하기 → 로그인 방법에서 **Google** 사용 설정.
4. (선택) 이용 통계를 쓰려면 프로젝트 설정 → 통합 → **Google 애널리틱스** 연결 → 나오는 측정 ID를 AI에게 알려 주면 `.env`에 넣는다(처리방침 제1조가 이용 통계를 적고 있다).

### 2.3 환경 변수 (사용자 + AI)
1. AI가 [.env.example](.env.example)과 [functions/.env.example](functions/.env.example)를 보고 **채울 칸 목록**을 만들어 준다(값이 비밀이 아닌 것은 AI가 채운다).
2. 비밀값은 사용자가 직접 넣는다 — Secret Manager(`GEMINI_API_KEY` · `GMAIL_APP_PASSWORD` · `ALIMTALK_PROXY_TOKEN`). 메일은 모두 Gmail로 직접 보낸다(EmailJS는 2026-11-21 뺐다):
   ```powershell
   npx.cmd firebase-tools functions:secrets:set GEMINI_API_KEY --project <프로젝트 ID>
   ```
   (나머지 비밀도 같은 명령으로 이름만 바꿔 넣는다. 알림톡은 템플릿 등록 전까지 쓰지 않으므로 나중에 넣어도 된다.)
3. 주소를 아직 정하지 않았으면 `VITE_APP_URL`·`SERVICE_URL`은 비워 둔다 — Firebase 기본 주소(`https://<프로젝트 ID>.web.app`)를 쓴다.

### 2.4 배포용 계정과 GitHub 설정 (사용자)
1. Google Cloud 콘솔 → IAM → 서비스 계정 만들기(예: `github-deploy`) → 역할: **Firebase 관리자**, **Cloud Functions 관리자**, **서비스 계정 사용자**, **Secret Manager 보안 비밀 접근자**, **Cloud Scheduler 관리자**.
   (첫 배포가 권한 오류로 멈추면 AI가 로그를 보고 더 붙일 역할을 알려 준다.)
   **asset-survey-sp 첫 배포(2026-11-21)에서 실제로 더 필요했던 것** — 배포용 계정은 프로젝트 IAM·API를 바꿀 수 없어 소유자 계정으로 미리 해 둔다:
   - 배포용 계정 역할 추가: Artifact Registry·Cloud Run·Eventarc 관리자, Service Usage 소비자, **Datastore 인덱스 관리자**(인덱스 빌드 대기 스텝).
   - API 켜기: artifactregistry·cloudfunctions·cloudbuild·run·eventarc·pubsub·secretmanager·cloudscheduler·firebasehosting·firebaseextensions·storage·cloudresourcemanager·iamcredentials·**cloudbilling**·firebaseappcheck·recaptchaenterprise.
   - 서비스 에이전트 역할(배포 로그가 `gcloud projects add-iam-policy-binding …` 세 줄로 알려 준다): Pub/Sub 에이전트 → 서비스 계정 토큰 생성자, 기본 컴퓨트 계정 → Cloud Run 호출자·Eventarc 이벤트 수신자.
   - Secret Manager 비밀마다 기본 컴퓨트 계정(`<프로젝트 번호>-compute@developer.gserviceaccount.com`)에 **보안 비밀 접근자**.
   - 처음 함수 배포 때 Eventarc 권한이 퍼지는 몇 분 동안 트리거 함수가 실패할 수 있다 — 배포 워크플로가 재시도한다.
   - **첫 배포 뒤 호출형(onCall) 함수의 공개 호출 권한을 확인한다.** 첫 배포가 여러 번 실패·재시도하는 동안 22개 중 19개가 `allUsers` → Cloud Run 호출자 권한 없이 만들어졌고, 이후 배포는 이미 있는 함수의 권한을 다시 걸지 않는다. 증상은 앱에서 서버 함수를 부를 때 **CORS 오류**(사전 요청 403)다. 확인: `gcloud run services get-iam-policy <함수 이름 소문자> --region asia-northeast3`. 고침: 호출형 함수마다 `gcloud run services add-iam-policy-binding <이름> --region asia-northeast3 --member=allUsers --role=roles/run.invoker`. 이벤트·스케줄 함수에는 붙이지 않는다.
2. 그 계정의 **키(JSON)**를 만든다.
3. GitHub 저장소 → Settings → Secrets and variables → Actions:
   - **Secrets**: `FIREBASE_SERVICE_ACCOUNT`(키 JSON 전체), `ENV_FILE`(완성한 `.env` 전체), `FUNCTIONS_ENV_FILE`(완성한 `functions/.env` 전체), `SENTRY_AUTH_TOKEN`(Sentry를 쓰면)
   - **Variables**: `FIREBASE_PROJECT_ID`, (Sentry를 쓰면) `SENTRY_ORG` · `SENTRY_PROJECT` · `SENTRY_PROJECT_FUNCTIONS`
4. 키 JSON 파일은 PC에서 지운다.

### 2.5 첫 배포와 확인 (AI + 사용자)
1. `master`에 올리면 CI가 돌고, 초록이면 Deploy 워크플로가 Functions·Rules·인덱스·Hosting을 배포한다. AI가 결과를 확인해 알린다.
2. **Google 로그인 주소 등록(사용자)** — 앱은 로그인 뒤 접속한 주소(`<프로젝트 ID>.web.app`)로 돌아오게 되어 있는데, Firebase가 자동으로 만든 OAuth 클라이언트에는 `firebaseapp.com`만 들어 있어 `400 redirect_uri_mismatch`가 난다. [Google Cloud 콘솔 → API 및 서비스 → 사용자 인증 정보](https://console.cloud.google.com/apis/credentials) → **Web client (auto created by Google Service)** → 승인된 JavaScript 원본에 `https://<프로젝트 ID>.web.app`, 승인된 리디렉션 URI에 `https://<프로젝트 ID>.web.app/__/auth/handler` 추가 → 저장(반영까지 몇 분). 명령줄로는 못 바꾼다.
3. **App Check 키(사용자 + AI)** — 클래식 reCAPTCHA v3는 지원이 끝나 Firebase 콘솔에서 새로 등록되지 않는다. Google Cloud 콘솔 → 보안 → Fraud Defense에서 **웹·점수 기반** 키(도메인: `<프로젝트 ID>.web.app`, `<프로젝트 ID>.firebaseapp.com`)를 만들고, App Check에 `recaptchaEnterpriseConfig`로 등록한다(토큰 TTL 1일 — 월 1만 건 무료 한도를 아끼려고). 사이트 키를 `VITE_RECAPTCHA_SITE_KEY`로 `ENV_FILE`(Actions·Dependabot 둘 다)에 넣고 다시 배포한다. 키가 없으면 앱은 App Check를 켜지 않아 로그인은 되지만 `enforceAppCheck` 서버 함수가 거부된다.
4. `https://<프로젝트 ID>.web.app`에 Google 로그인으로 한 번 들어간다 — 초대 코드 화면이 나오면 정상이다(사용자 문서는 기관에 가입할 때 생긴다).
5. **첫 시스템 관리자 지정** — 첫 로그인만 한 계정에는 `users` 문서가 **없다**. Firebase 콘솔 → Authentication에서 내 UID를 확인하고, Firestore `users/{UID}` 문서를 새로 만든다: `role`=`superAdmin`, `name`, `email`, `organizationId`=null, `status`=`active`. 문서가 생기면 서버 함수(`setCustomClaims`)가 권한을 붙인다. 로그아웃했다가 다시 들어오면 시스템 관리자 화면이 열린다. (asset-survey-sp는 2026-11-21 AI가 소유자 권한으로 만들었다.)
6. 협력 기관이 기관 신청 → 시스템 관리자 화면에서 승인 → [시범운영안내.md](시범운영안내.md)대로 진행.

### 2.6 배포 뒤 남은 운영 준비 (사용자)
- `auditLogs` TTL 정책 — 위 1장 표 (백업 버킷은 2026-11-21 만들었다)
- 전용 도메인을 정하면: Hosting 사용자 지정 도메인 연결 → Authentication 승인된 도메인 추가 → `VITE_APP_URL`·`SERVICE_URL`에 넣고 다시 배포. **QR 라벨은 주소를 정한 뒤 뽑는 것이 좋다**(기본 카메라로 찍었을 때 새 주소로 열리게).

## 3. 배포

배포는 저장소 기본 브랜치(`master`) 푸시 → CI Deploy 워크플로만 쓴다(로컬 `firebase deploy` 금지 — [.agent/agents.md](.agent/agents.md) §1).
워크플로의 프로젝트 ID는 저장소 변수 `FIREBASE_PROJECT_ID`에서 읽는다.

## 4. 되돌리기

[ROLLBACK.md](ROLLBACK.md)

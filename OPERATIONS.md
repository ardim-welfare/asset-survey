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
| Google 로그인 사용 설정, OAuth 동의 화면 | 사용자 | 전용 도메인을 정하면 승인된 리디렉션 URI에 `https://<도메인>/__/auth/handler` 추가 |
| Secret Manager 비밀값 등록 | 사용자 | `GEMINI_API_KEY` · `GMAIL_APP_PASSWORD` · `EMAILJS_PRIVATE_KEY` · `ALIMTALK_PROXY_TOKEN` → [README](README.md#환경변수) |
| `functions/.env` 채우기 | 사용자 + AI | [functions/.env.example](functions/.env.example) |
| EmailJS 템플릿 새로 만들기 | 사용자 | 지금 코드의 서비스·템플릿 ID는 차량운행일지 것이다([verifyHelpers.ts](functions/src/services/orgDocument/verifyHelpers.ts)) |
| 카카오 알림톡 템플릿 새로 등록 | 사용자 | 차량운행일지 템플릿 문구라 그대로 쓰지 않는다. 등록 전까지 알림톡은 끈다 |
| 이용약관·개인정보 처리방침 개정 | 사용자 검토 | 지금은 서비스 이름만 바꾼 초안이다. 차량 관련 처리(계기판 사진·캘린더·Slack·TMAP·탑승자)를 빼고 재물 데이터 처리를 넣어야 한다 |
| 앱 아이콘 교체 | 사용자 + AI | `public/icons/`는 차량운행일지 아이콘이다 |
| 백업 버킷 `{프로젝트 ID}-backups` (asia-northeast3) | 사용자 | [dailyNightlyBatch.ts](functions/src/handlers/scheduled/dailyNightlyBatch.ts) |
| `auditLogs` TTL 정책 (`expiresAt`) | 사용자 | 접속기록 1년 보관 |
| GitHub 저장소·Actions Secrets | 사용자 | `ENV_FILE` · `FUNCTIONS_ENV_FILE` · `FIREBASE_SERVICE_ACCOUNT` · `SENTRY_AUTH_TOKEN` |

## 2. 배포

배포는 저장소 기본 브랜치 푸시 → CI Deploy 워크플로만 쓴다(로컬 `firebase deploy` 금지 — [.agent/agents.md](.agent/agents.md) §1).
워크플로의 프로젝트 ID는 저장소 변수 `FIREBASE_PROJECT_ID`에서 읽는다. 자세한 절차는 저장소를 만든 뒤 적는다.

## 3. 되돌리기

[ROLLBACK.md](ROLLBACK.md)

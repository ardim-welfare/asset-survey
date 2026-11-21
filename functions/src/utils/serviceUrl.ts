/**
 * serviceUrl — 이메일·알림톡·푸시 알림의 링크가 가리키는 서비스 주소
 *
 * 차량운행일지에서는 주소가 파일마다 문자열로 박혀 있었다. 이 앱은 전용 도메인이
 * 아직 정해지지 않았으므로 한곳에서 정한다.
 *
 *  1. `SERVICE_URL` 환경변수(functions/.env)가 있으면 그 값을 쓴다 — 전용 도메인을 정하면 여기에 넣는다.
 *  2. 없으면 Firebase Hosting 기본 주소(`https://<프로젝트 ID>.web.app`)를 쓴다.
 *
 * 끝의 `/`는 떼어 낸다 — 호출부가 `${serviceUrl()}?code=…`, `${serviceUrl()}/super-admin`처럼 붙인다.
 */
export function serviceUrl(): string {
    const fromEnv = process.env.SERVICE_URL?.trim();
    if (fromEnv) return fromEnv.replace(/\/+$/, "");
    const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "demo-asset-survey";
    return `https://${projectId}.web.app`;
}

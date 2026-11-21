/**
 * 프로젝트 전역 상수 — 여러 컴포넌트에서 공유하는 값을 한 곳에서 관리한다.
 */
/**
 * 앱 공개 URL — 초대 링크 등에 쓴다. 전용 도메인이 정해지면 VITE_APP_URL로 넣는다.
 * 비어 있으면 지금 연 주소의 origin을 쓴다(Firebase 기본 도메인·미리보기 채널에서도 맞는 링크가 나온다).
 */
// import.meta.env는 Vite 밖(E2E 시드가 Node로 이 파일을 읽는다)에서는 없으므로 ?.로 읽는다
export const APP_URL: string = (import.meta.env?.VITE_APP_URL as string | undefined)?.replace(/\/+$/, '')
    || (typeof window !== 'undefined' ? window.location.origin : '');

/**
 * 이용약관·개인정보 처리방침의 시행일 버전 (동의 기록용)
 *
 * TermsPage/PrivacyPage 본문을 개정하면 해당 문서의 시행일로 이 값을 함께 갱신한다.
 * 기관 신청 시 동의한 버전이 organizations 문서에 저장되므로,
 * 값을 갱신하지 않으면 개정 후 동의가 이전 버전으로 기록된다.
 *
 * ## 두 값은 항상 함께 움직인다
 * 약관 제9조(개인정보 처리의 위탁)와 처리방침 제7·8조(위탁·국외 이전)는 짝이다.
 * 한쪽만 올리면 "약관은 위탁을 규정하는데 처리방침 구버전에는 수탁자 고지가 없는"
 * 구간이 시행일 차이만큼 생긴다. 본문이 한쪽만 바뀌어도 시행일은 같이 옮긴다.
 *
 * ## 개정 이력
 * - `2026-11-21` (재물조사 서비스 최초 초안): 차량운행일지의 문안을 바탕으로 차량·운행일지·예약·
 *   계기판 OCR·캘린더·Slack·챗봇 처리를 빼고 재물·공간·조사 기록 처리를 넣었다(6단계).
 *   **실제 서비스 시작일이 정해지면 그날로 옮긴다** — 시범 기간에 동의한 기관은 그때 재동의한다.
 *   (차량운행일지 시절의 개정 이력은 그 서비스의 것이라 옮겨 오지 않았다.)
 */
export const TERMS_VERSION = '2026-11-21';
export const PRIVACY_VERSION = '2026-11-21';

/**
 * 시행일 버전('2026-08-10')을 문서 표기('2026년 8월 10일')로 변환한다.
 *
 * 약관·처리방침 페이지의 시행일 표기를 이 함수로 파생시켜, 본문 표기와 동의 기록에
 * 남는 버전이 어긋나는 것을 구조적으로 막는다. 표기를 문자열로 하드코딩하면
 * 개정 때 한쪽만 고쳐도 아무것도 실패하지 않는다.
 */
export const formatLegalVersion = (version: string) => {
    const [year, month, day] = version.split('-');
    return `${year}년 ${Number(month)}월 ${Number(day)}일`;
};


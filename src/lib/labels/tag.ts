/**
 * QR 태그 (기획서 F09) — 라벨 QR에 담는 값
 *
 * QR에는 `서비스주소/t/태그ID`를 담는다(사용자 결정 2026-11-21).
 * - 휴대폰 기본 카메라로 찍어도 앱의 그 재물 화면이 열린다.
 * - 태그 ID는 기관·물건 정보를 담지 않은 무작위 글자라 QR만으로는 아무것도 알 수 없다.
 *   재물 화면은 로그인한 같은 기관 사람만 열린다(firestore.rules).
 * - 서비스 주소가 나중에 바뀌어도 앱 안 스캐너는 주소 끝의 태그 ID로 찾으므로 라벨을 다시 붙일 필요가 없다.
 *
 * 글자는 헷갈리는 I·L·O·U를 뺀 대문자·숫자 32종 × 10자(약 10^15가지) — 기관 안에서 겹칠 일이 없다.
 * firestore.rules의 `assetDataValid`가 같은 형식을 확인한다.
 */
import { APP_URL } from '../constants';

export const TAG_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const TAG_LENGTH = 10;
const TAG_RE = new RegExp(`^[${TAG_ALPHABET}]{${TAG_LENGTH}}$`);

/** 새 태그 ID — 암호학적 난수. 32가 256을 나누므로 `& 31`은 치우침이 없다 */
export function newTagId(): string {
    const bytes = new Uint8Array(TAG_LENGTH);
    crypto.getRandomValues(bytes);
    let out = '';
    for (const b of bytes) out += TAG_ALPHABET[b & 31];
    return out;
}

export const isTagId = (v: string): boolean => TAG_RE.test(v);

/** 라벨 QR에 담을 주소 */
export const tagUrl = (tagId: string, base: string = APP_URL): string => `${base.replace(/\/+$/, '')}/t/${tagId}`;

/**
 * 찍힌 글자에서 태그 ID를 꺼낸다 — `…/t/태그ID` 주소(어느 도메인이든) 또는 태그 ID만.
 * 소문자로 적혀 있어도 받는다. 태그가 아니면 null(4단계 스캔에서 자산코드로 다시 찾는다).
 */
export function parseTag(text: string): string | null {
    const raw = text.trim();
    const m = /\/t\/([0-9A-Za-z]+)\/?(?:[?#].*)?$/.exec(raw);
    const candidate = (m ? m[1] : raw).toUpperCase();
    return isTagId(candidate) ? candidate : null;
}

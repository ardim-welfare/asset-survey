/**
 * 같은 QR 3초 규칙 (기획서 F11) — 카메라가 같은 라벨을 계속 비추면 한 번만 처리한다.
 *
 * 기억하는 것은 받아들여진 QR뿐이다(거절된 판독은 기억하지 않음 → 처리가 끝나면 곧 다시 넘어감).
 * 받아들여진 QR이 3초 안에 다시 보이면 무시하고 시각을 늘린다(비춘 채로 두어도 한 번만).
 * 공유패키지 앱에서 실제 휴대폰으로 확인한 규칙이다.
 */
export const SAME_QR_MS = 3000;

export function makeQrGate(ms = SAME_QR_MS) {
    let last = { text: '', at: -Infinity };
    return (text: string, now: number, accept: (text: string) => boolean): void => {
        if (text === last.text && now - last.at < ms) { last = { text, at: now }; return; }
        if (accept(text)) last = { text, at: now };
    };
}

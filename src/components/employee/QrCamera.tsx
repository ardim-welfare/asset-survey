/**
 * QrCamera — QR 카메라 (기획서 F11)
 *
 * html5-qrcode를 필요할 때만 불러온다. 후면 카메라, QR만 읽는다. 같은 QR이 3초 안에 다시 보이면
 * 무시한다(lib/survey/qrGate.ts). 공유패키지 앱에서 Android·iPhone 실제 판독을 확인한 방식이다.
 * iPhone Safari·Android Chrome 모두 HTTPS(또는 localhost)에서만 카메라를 쓸 수 있다 → 아니면 unsupported.
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { Html5Qrcode } from 'html5-qrcode';
import { makeQrGate } from '../../lib/survey/qrGate';

export type CameraState = 'starting' | 'running' | 'denied' | 'unsupported';

interface Props {
    /** 받아들였으면 true. false(처리 중 등)면 기억하지 않아 다음 프레임에 다시 넘긴다 */
    onScan: (text: string) => boolean;
    onStateChange: (state: CameraState) => void;
}

const isDenied = (e: unknown) => /NotAllowedError|SecurityError|Permission/i.test(String(e));

export default function QrCamera({ onScan, onStateChange }: Props) {
    const hostRef = useRef<HTMLDivElement>(null);
    const cb = useRef({ onScan, onStateChange });
    // 카메라를 다시 켜지 않고 최신 콜백을 쓰게 한다
    useLayoutEffect(() => { cb.current = { onScan, onStateChange }; });

    useEffect(() => {
        // 실행마다 새 자리(div)를 써서, 이전 카메라 정리(비동기)가 새 카메라 화면을 지우지 않게 한다
        const el = document.createElement('div');
        el.id = `qr-${Math.random().toString(36).slice(2)}`;
        hostRef.current?.appendChild(el);
        let alive = true;
        let scanner: Html5Qrcode | null = null;
        const gate = makeQrGate();
        cb.current.onStateChange('starting');

        const started = (async () => {
            if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
            const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
            if (!alive) return false;
            scanner = new Html5Qrcode(el.id, { formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE], verbose: false });
            await scanner.start({ facingMode: 'environment' }, {
                fps: 10, aspectRatio: 1,
                qrbox: (w, h) => { const s = Math.max(50, Math.floor(Math.min(w, h) * 0.7)); return { width: s, height: s }; },
            }, (text) => gate(text, Date.now(), (t) => cb.current.onScan(t)), () => { /* 프레임마다 나는 '못 읽음'은 무시 */ });
            return true;
        })();
        started.then(
            (ok) => { if (ok && alive) cb.current.onStateChange('running'); },
            (e) => { if (alive) cb.current.onStateChange(isDenied(e) ? 'denied' : 'unsupported'); },
        );
        return () => {
            alive = false;
            started.then((ok) => (ok && scanner ? scanner.stop() : undefined)).catch(() => { }).finally(() => el.remove());
        };
    }, []);

    return (
        <div
            ref={hostRef}
            className="w-full aspect-square max-w-sm mx-auto overflow-hidden rounded-2xl bg-black [&_video]:w-full [&_video]:h-full [&_video]:object-cover"
            aria-label="QR 카메라"
        />
    );
}

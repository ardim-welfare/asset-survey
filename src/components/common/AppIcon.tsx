/**
 * AppIcon — 재물조사 앱 표시 아이콘(QR 코드 모양)
 *
 * 랜딩·로그인·관리자/직원 화면 머리·인앱 브라우저 경고가 같은 아이콘을 쓴다.
 * 차량운행일지에서 복사해 온 트럭 아이콘이 네 곳에 남아 있던 것을 이것으로 모았다(2026-11-21).
 * 장식용이라 스크린리더에서는 숨긴다 — 바로 옆에 앱 이름 글자가 있다.
 */
interface AppIconProps {
    className?: string;
}

export default function AppIcon({ className = 'w-10 h-10' }: AppIconProps) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z" />
        </svg>
    );
}

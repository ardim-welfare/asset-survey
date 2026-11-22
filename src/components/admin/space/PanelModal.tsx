/**
 * PanelModal — 공간 관리 화면의 작은 입력 창(건물 고치기·공간 위치 바꾸기) 껍데기
 *
 * ESC·바깥 클릭으로 닫힌다. 안의 첫 입력 칸에 초점을 준다.
 */
import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
    open: boolean;
    title: string;
    titleId: string;
    onClose: () => void;
    children: ReactNode;
}

export default function PanelModal({ open, title, titleId, onClose, children }: Props) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const timer = setTimeout(() => ref.current?.querySelector<HTMLElement>('input, select, button')?.focus(), 50);
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => { clearTimeout(timer); window.removeEventListener('keydown', onKey); };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onClick={onClose}>
            {/* ESC는 위 keydown이 처리한다 — 창 안 클릭이 바깥 닫기로 번지지 않게만 막는다 (ConfirmModal과 같은 방식) */}
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
            <div
                ref={ref}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="glass-card w-full max-w-md p-5 animate-scale-in max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 id={titleId} className="text-lg font-bold text-surface-900 dark:text-surface-100 mb-4">{title}</h2>
                {children}
            </div>
        </div>
    );
}

/**
 * TestOrgPickerModal — 시스템 관리자가 관리자·직원 화면으로 볼 기관을 고르는 창
 *
 * 시스템 관리자 계정은 소속 기관이 없어 화면을 볼 기관을 따로 정해야 한다(lib/saTestMode.ts).
 * 승인된 기관이 하나뿐이면 이 창 없이 바로 들어간다(SuperAdminLayout).
 */
import { useEffect, useMemo, useRef, useState } from 'react';

export interface TestOrgOption {
    id: string;
    name: string;
}

interface Props {
    open: boolean;
    roleLabel: string;
    orgs: TestOrgOption[];
    onSelect: (orgId: string) => void;
    onClose: () => void;
}

export default function TestOrgPickerModal({ open, roleLabel, orgs, onSelect, onClose }: Props) {
    const [term, setTerm] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!open) return;
        setTerm('');
        const timer = setTimeout(() => inputRef.current?.focus(), 50);
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => { clearTimeout(timer); window.removeEventListener('keydown', onKey); };
    }, [open, onClose]);

    const filtered = useMemo(() => {
        const t = term.trim().toLowerCase();
        return [...orgs]
            .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
            .filter(o => !t || o.name.toLowerCase().includes(t));
    }, [orgs, term]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            role="presentation"
            onClick={onClose}
        >
            {/* ESC는 위 keydown이 처리한다 — 창 안 클릭이 바깥 닫기로 번지지 않게만 막는다 (ConfirmModal과 같은 방식) */}
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="test-org-picker-title"
                className="glass-card w-full max-w-md p-5 animate-scale-in"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 id="test-org-picker-title" className="text-lg font-bold text-surface-900 dark:text-surface-100">
                    어느 기관의 {roleLabel} 화면을 볼까요?
                </h2>
                <p className="mt-1 text-sm text-surface-600 dark:text-surface-400">
                    시스템 관리자 계정은 소속 기관이 없어 볼 기관을 골라야 합니다. 화면에서 바꾼 내용은 그 기관에 그대로 저장됩니다.
                </p>
                <input
                    ref={inputRef}
                    type="search"
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                    placeholder="기관 이름 검색"
                    aria-label="기관 이름 검색"
                    className="input mt-4 w-full"
                />
                <ul className="mt-3 max-h-72 overflow-y-auto divide-y divide-surface-100 dark:divide-surface-700">
                    {filtered.map(o => (
                        <li key={o.id}>
                            <button
                                type="button"
                                onClick={() => onSelect(o.id)}
                                className="w-full text-left px-3 py-3 min-h-[48px] rounded-lg text-surface-800 dark:text-surface-200 hover:bg-primary-50 dark:hover:bg-primary-900/30"
                            >
                                {o.name}
                            </button>
                        </li>
                    ))}
                    {filtered.length === 0 && (
                        <li className="px-3 py-6 text-center text-sm text-surface-600 dark:text-surface-400">맞는 기관이 없습니다</li>
                    )}
                </ul>
                <div className="mt-4 flex justify-end">
                    <button type="button" onClick={onClose} className="btn-secondary">닫기</button>
                </div>
            </div>
        </div>
    );
}

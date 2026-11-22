import { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { firebaseFunctions } from '../../lib/firebase';
import { useToast } from '../../hooks/useToast';

interface PublicFeedbackModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function PublicFeedbackModal({ isOpen, onClose }: PublicFeedbackModalProps) {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { showToast } = useToast(); // 조기 return보다 위에서 호출 (훅 규칙)

    // Esc로 닫는다 (보내는 중에는 닫지 않는다)
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !isSubmitting) onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [isOpen, isSubmitting, onClose]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!name.trim()) return showToast('이름을 입력해주세요.', 'error');
        if (!email.trim() || !email.includes('@')) return showToast('유효한 이메일을 입력해주세요.', 'error');
        if (!message.trim()) return showToast('문의하실 내용을 입력해주세요.', 'error');

        setIsSubmitting(true);
        const submitFn = httpsCallable(firebaseFunctions, 'submitPublicFeedback');

        try {
            await submitFn({
                userName: name.trim(),
                userEmail: email.trim(),
                message: message.trim(),
            });
            
            showToast('문의가 접수되었습니다. 최대한 빠르게 답변해 드리겠습니다.', 'success', 4000);
            setName('');
            setEmail('');
            setMessage('');
            onClose();
        } catch (error: unknown) {
            console.error(error);
            // 서버가 준 한국어 안내는 그대로, 그 밖의 영문 오류 코드는 다음 할 일을 담은 문구로 바꾼다
            const raw = error instanceof Error ? error.message : '';
            showToast(/[가-힣]/.test(raw) ? raw : '보내지 못했습니다. 쓰신 내용은 그대로 있으니 잠시 뒤 다시 눌러 주세요.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="public-feedback-title"
                className="bg-white dark:bg-surface-800 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl animate-slide-up"
            >
                {/* 헤더 */}
                <div className="flex items-center justify-between p-6 border-b border-surface-200 dark:border-surface-700">
                    <h2 id="public-feedback-title" className="text-xl font-bold text-surface-900 dark:text-white">문의하기 / 의견 보내기</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 text-surface-600 hover:text-surface-800 dark:text-surface-300 dark:hover:text-surface-100 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-full transition-colors min-w-[48px] min-h-[48px] flex items-center justify-center"
                        aria-label="창 닫기"
                    >
                        <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* 폼 콘텐츠 */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <p className="text-sm text-surface-600 dark:text-surface-300">
                        기관 등록 문제, 오류 제보, 혹은 서비스와 관련된 문의를 남겨주세요.<br />
                        남겨주신 이메일로 답변해 드립니다.
                    </p>
                    
                    <div className="space-y-1">
                        <label htmlFor="public-feedback-name" className="block text-sm font-medium text-surface-700 dark:text-surface-300">
                            이름 (또는 기관명) <span className="text-red-700 dark:text-red-300">*</span>
                        </label>
                        <input
                            id="public-feedback-name"
                            autoComplete="name"
                            type="text"
                            placeholder="이름이나 기관명을 입력해주세요"
                            className="w-full px-4 py-2 border border-surface-300 dark:border-surface-600 rounded-xl bg-white dark:bg-surface-700/50 text-surface-900 dark:text-white focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all min-h-[48px]"
                            value={name}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                            required
                            disabled={isSubmitting}
                        />
                    </div>
                    
                    <div className="space-y-1">
                        <label htmlFor="public-feedback-email" className="block text-sm font-medium text-surface-700 dark:text-surface-300">
                            답변 받을 이메일 주소 <span className="text-red-700 dark:text-red-300">*</span>
                        </label>
                        <input
                            id="public-feedback-email"
                            autoComplete="email"
                            type="email"
                            placeholder="example@email.com"
                            className="w-full px-4 py-2 border border-surface-300 dark:border-surface-600 rounded-xl bg-white dark:bg-surface-700/50 text-surface-900 dark:text-white focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all min-h-[48px]"
                            value={email}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                            required
                            disabled={isSubmitting}
                        />
                    </div>

                    <div className="space-y-1">
                        <label htmlFor="public-feedback-message" className="block text-sm font-medium text-surface-700 dark:text-surface-300">
                            문의 내용 <span className="text-red-700 dark:text-red-300">*</span>
                        </label>
                        <textarea
                            id="public-feedback-message"
                            className="w-full px-4 py-2 border border-surface-300 dark:border-surface-600 rounded-xl bg-white dark:bg-surface-700/50 text-surface-900 dark:text-white focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500 transition-all resize-y min-h-[120px]"
                            placeholder="어떤 점이 불편하신가요? 구체적으로 적어주실수록 정확한 안내가 가능합니다."
                            value={message}
                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setMessage(e.target.value)}
                            required
                            disabled={isSubmitting}
                        />
                    </div>

                    <div className="pt-2">
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full btn bg-primary-600 dark:bg-primary-500 hover:bg-primary-700 text-white !py-3 rounded-xl font-bold transition-all disabled:opacity-50 min-h-[48px]"
                        >
                            {isSubmitting ? '보내는 중...' : '문의 보내기'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

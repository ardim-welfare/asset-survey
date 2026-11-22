/**
 * MorePage — 더보기 페이지
 */
import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { logout } from '../../lib/auth';
import { useTheme } from '../../hooks/useTheme';
import { useFontSize } from '../../hooks/useFontSize';
import { clearUserOrganization } from '../../lib/firestore';
import useNotification from '../../hooks/useNotification';
import { useToast } from '../../hooks/useToast';
import { useConfirm } from '../../hooks/useConfirm';
import FeedbackForm from '../common/FeedbackForm';
import ReleaseNotesModal from '../common/ReleaseNotesModal';
import useReleaseNotesStatus from '../../hooks/useReleaseNotesStatus';
import Toggle from '../common/Toggle';

export default function MorePage() {
    const { user, userData } = useAuth();
    const [showFeedback, setShowFeedback] = useState(false);
    const [showReleaseNotes, setShowReleaseNotes] = useState(false);
    const { hasNew: hasNewReleaseNotes, markSeen: markReleaseNotesSeen } = useReleaseNotesStatus();
    const { permission, requestPermission } = useNotification();
    const { isDark, toggleTheme } = useTheme();
    const { fontSize, setSize } = useFontSize();
    const { showToast } = useToast();
    const { confirm } = useConfirm();

    const notifApiAvailable = typeof window !== 'undefined' && 'Notification' in window;

    return (
        <div className="max-w-lg mx-auto animate-fade-in space-y-3">
            <h1 className="text-lg font-bold text-surface-900 dark:text-surface-100 mb-2">더보기</h1>

            {/* 로그인 계정 정보 */}
            <div className="glass-card p-4 flex items-center gap-3">
                <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900/40 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg aria-hidden="true" className="w-5 h-5 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" /></svg>
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-surface-800 dark:text-surface-200 truncate">{userData?.name || user?.displayName || '사용자'}</p>
                    <p className="text-xs text-surface-500 dark:text-surface-400 truncate">{user?.email || ''}</p>
                </div>
                <button onClick={logout} className="flex-shrink-0 flex items-center justify-center gap-1.5 text-xs text-red-700 dark:text-red-300 hover:text-red-600 dark:hover:text-red-300 px-3 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors">
                    <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" /></svg>
                    로그아웃
                </button>
            </div>

            <div className="glass-card divide-y divide-surface-100 dark:divide-surface-700">
                <button onClick={() => { markReleaseNotesSeen(); setShowReleaseNotes(true); }} className="w-full flex items-center gap-3 p-4 hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors text-left">
                    <svg aria-hidden="true" className="w-5 h-5 text-surface-400 dark:text-surface-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 0 1-2.25 2.25M16.5 7.5V18a2.25 2.25 0 0 0 2.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 0 0 2.25 2.25h13.5M6 7.5h3v3H6v-3Z" /></svg>
                    <span className="text-sm text-surface-700 dark:text-surface-300">업데이트 소식</span>
                    {hasNewReleaseNotes && (
                        <span className="ml-auto inline-flex items-center px-2 py-0.5 text-[11px] font-bold rounded-full bg-red-500 text-white">NEW</span>
                    )}
                </button>
                <button onClick={() => setShowFeedback(true)} className="w-full flex items-center gap-3 p-4 hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors text-left">
                    <svg aria-hidden="true" className="w-5 h-5 text-primary-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 0 1 1.037-.443 48.282 48.282 0 0 0 5.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" /></svg>
                    <span className="text-sm text-primary-600 dark:text-primary-400">개발자에게 건의하기</span>
                </button>
                {/* 알림 설정 */}
                {notifApiAvailable && (
                    <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors" role="button" tabIndex={0} onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            if (permission === 'default') { requestPermission(); }
                            else {
                                const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
                                const isAndroid = /Android/.test(navigator.userAgent);
                                if (isIOS) showToast('설정 → 알림에서 이 앱의 알림을 변경할 수 있습니다.', 'info');
                                else if (isAndroid) showToast('앱 아이콘을 길게 눌러 앱 정보 → 알림에서 변경할 수 있습니다.', 'info');
                                else showToast('주소창 왼쪽 🔒 아이콘을 눌러 알림을 변경할 수 있습니다.', 'info');
                            }
                        }
                    }} onClick={() => {
                        if (permission === 'default') { requestPermission(); }
                        else {
                            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
                            const isAndroid = /Android/.test(navigator.userAgent);
                            if (isIOS) showToast('설정 → 알림에서 이 앱의 알림을 변경할 수 있습니다.', 'info');
                            else if (isAndroid) showToast('앱 아이콘을 길게 눌러 앱 정보 → 알림에서 변경할 수 있습니다.', 'info');
                            else showToast('주소창 왼쪽 🔒 아이콘을 눌러 알림을 변경할 수 있습니다.', 'info');
                        }
                    }}>
                        <div className="flex items-center gap-3">
                            <svg aria-hidden="true" className={`w-5 h-5 ${permission === 'granted' ? 'text-blue-500 dark:text-blue-400' : 'text-surface-400 dark:text-surface-500'}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" /></svg>
                            <span className="text-sm text-surface-700 dark:text-surface-300">알림</span>
                        </div>
                        {permission === 'default' ? (<span className="text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-full">활성화</span>)
                            : permission === 'granted' ? (<span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2.5 py-1 rounded-full">켜짐</span>)
                                : (<span className="text-xs font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 px-2.5 py-1 rounded-full">꺼짐</span>)}
                    </div>
                )}
                {/* 다크 모드 토글 */}
                <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                        {isDark ? (<svg aria-hidden="true" className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" /></svg>)
                            : (<svg aria-hidden="true" className="w-5 h-5 text-amber-500 dark:text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" /></svg>)}
                        <span className="text-sm text-surface-700 dark:text-surface-300">{isDark ? '다크 모드' : '라이트 모드'}</span>
                    </div>
                    <Toggle label="다크 모드" checked={isDark} onChange={toggleTheme} />
                </div>
                {/* 글자 크기 */}
                <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                        <svg aria-hidden="true" className="w-5 h-5 text-surface-400 dark:text-surface-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M12 17.25h8.25" /></svg>
                        <span className="text-sm text-surface-700 dark:text-surface-300">글자 크기</span>
                    </div>
                    <div className="flex rounded-lg border border-surface-200 dark:border-surface-600 overflow-hidden">
                        {[{ key: 'small', label: '작게' }, { key: 'normal', label: '보통' }, { key: 'large', label: '크게' }].map(opt => (
                            <button key={opt.key} onClick={() => setSize(opt.key as 'small' | 'normal' | 'large')} className={`px-3 py-1.5 text-xs font-medium transition-colors ${fontSize === opt.key ? 'bg-primary-600 dark:bg-primary-500 text-white' : 'bg-surface-50 dark:bg-surface-700 text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-600'}`}>{opt.label}</button>
                        ))}
                    </div>
                </div>
                {/* 슈퍼관리자(직원 화면 테스트 모드)에게는 숨긴다 — 누르면 role이 employee로 바뀌어 슈퍼관리자 권한을 잃는다 */}
                {userData?.role !== 'superAdmin' && (
                <button onClick={async () => {
                    if (!await confirm({ message: '정말 이 기관에서 나가시겠습니까?\n나가면 다시 초대 코드를 입력해야 합니다.', confirmColor: 'warning' })) return;
                    try {
                        // users 문서 삭제는 Rules상 superAdmin 전용이다 — 본인 탈퇴는 소속만 비우는 update 분기를 쓴다.
                        // useAuth의 onSnapshot이 organizationId=null을 받아 초대 코드 화면으로 보낸다.
                        await clearUserOrganization(user!.uid);
                    } catch (err) {
                        console.error('clearUserOrganization 실패:', err);
                        showToast('기관 나가기에 실패했습니다.', 'error');
                    }
                }} className="w-full flex items-center gap-3 p-4 hover:bg-orange-50 dark:hover:bg-orange-900/30 transition-colors text-left">
                    <svg aria-hidden="true" className="w-5 h-5 text-orange-400 dark:text-orange-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" /></svg>
                    <span className="text-sm text-orange-600 dark:text-orange-400">기관 나가기</span>
                </button>
                )}
            </div>

            {/* 제작자 정보 */}
            <div className="mt-6 flex items-center justify-center gap-2 text-xs text-surface-500 dark:text-surface-400">
                <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" /></svg>
                <span>제작자: 소셜프리즘</span><span>·</span>
                <a href="mailto:ehsheh@gmail.com" className="text-primary-700 dark:text-primary-300 hover:text-primary-800 transition-colors">ehsheh@gmail.com</a>
            </div>

            {showReleaseNotes && <ReleaseNotesModal onClose={() => setShowReleaseNotes(false)} />}
            {showFeedback && <FeedbackForm onClose={() => setShowFeedback(false)} />}
        </div>
    );
}

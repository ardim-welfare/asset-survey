/**
 * EmployeeHome — 직원(공간 담당자) 첫 화면
 *
 * 0단계에서는 안내만 보여 준다. 담당 공간의 조사 대상·진행 상황은
 * 기획서 F10~F13(조사 회차·스캔·제출)에서 채운다.
 */
import { useAuth } from '../../hooks/useAuth';

export default function EmployeeHome() {
    const { userData } = useAuth();

    return (
        <div className="max-w-lg mx-auto animate-fade-in space-y-4">
            <h1 className="text-xl font-bold text-surface-900 dark:text-surface-100">
                {userData?.name ? `${userData.name}님, 안녕하세요` : '안녕하세요'}
            </h1>
            <div className="glass-card p-6 text-center">
                <div className="text-4xl mb-3" aria-hidden="true">📋</div>
                <p className="text-surface-700 dark:text-surface-300 font-medium">진행 중인 재물조사가 없습니다</p>
                <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
                    재물 담당자가 조사를 시작하면 담당 공간의 조사 목록이 여기에 나옵니다.
                </p>
            </div>
        </div>
    );
}

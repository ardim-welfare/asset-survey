/**
 * ScanPlaceholder — QR 스캔 탭 자리
 *
 * 카메라 스캔은 기획서 F11(현장 스캔)에서 구현한다. 그때 이 파일을 실제 스캔 화면으로 바꾼다.
 */
export default function ScanPlaceholder() {
    return (
        <div className="max-w-lg mx-auto animate-fade-in">
            <div className="glass-card p-6 text-center">
                <div className="text-4xl mb-3" aria-hidden="true">📷</div>
                <p className="text-surface-700 dark:text-surface-300 font-medium">QR 스캔은 준비 중입니다</p>
                <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
                    재물조사가 시작되면 이 탭에서 라벨의 QR을 찍어 조사합니다.
                </p>
            </div>
        </div>
    );
}

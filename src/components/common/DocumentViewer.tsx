/**
 * DocumentViewer — 증빙서류(이미지/PDF) 표시 컴포넌트
 * OrgCard, OrgAppCard 등에서 공통 사용
 */
interface DocumentViewerProps {
    url: string;
    /** 클릭 이벤트 전파 차단 여부 (아코디언 내부 등) */
    stopPropagation?: boolean;
}

export default function DocumentViewer({ url, stopPropagation }: DocumentViewerProps) {
    const isPdf = /\.pdf($|\?)/i.test(url) || (url.includes('%2F') && url.toLowerCase().includes('.pdf'));
    const handleClick = stopPropagation ? (e: React.MouseEvent) => e.stopPropagation() : undefined;

    if (isPdf) {
        return (
            <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleClick}
                className="mt-2 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 border border-primary-200 dark:border-primary-700 hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors text-sm font-medium animate-slide-down min-h-[48px]"
            >
                PDF 증빙서류 보기 (새 창)
            </a>
        );
    }

    // 눌러도 아무 일이 없던 버튼 대신, 누르면 새 창에서 원본 크기로 여는 링크로 둔다
    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleClick}
            className="inline-block mt-2 animate-slide-down rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
            <img
                src={url}
                alt="증빙서류 (누르면 새 창에서 크게 보기)"
                className="max-w-full sm:max-w-md rounded-lg border border-surface-200 dark:border-surface-600 block"
            />
            <span className="block mt-1 text-xs text-primary-700 dark:text-primary-300 underline underline-offset-2">새 창에서 크게 보기</span>
        </a>
    );
}

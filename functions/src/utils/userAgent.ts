/**
 * User-Agent를 브라우저·OS 수준으로 축약한다.
 *
 * 원문을 그대로 저장하면 기기 지문에 가까워져 접속기록 자체가 과잉 수집이 된다.
 * 비정상 접근 탐지에는 "어떤 브라우저·OS에서 들어왔는가"면 충분하다.
 */
export function summarizeUserAgent(ua: unknown): string {
    if (typeof ua !== "string" || !ua) return "unknown";

    const os =
        /Android/i.test(ua) ? "Android"
            : /iPhone|iPad|iPod/i.test(ua) ? "iOS"
                : /Windows/i.test(ua) ? "Windows"
                    : /Mac OS X|Macintosh/i.test(ua) ? "macOS"
                        : /Linux/i.test(ua) ? "Linux"
                            : "기타";

    // 순서 주의 — Edge/Samsung/Chrome은 UA에 서로를 포함하므로 좁은 것부터 본다.
    const browser =
        /Edg\//i.test(ua) ? "Edge"
            : /SamsungBrowser/i.test(ua) ? "Samsung Internet"
                : /OPR\//i.test(ua) ? "Opera"
                    : /Whale/i.test(ua) ? "Whale"
                        : /Chrome\//i.test(ua) ? "Chrome"
                            : /Firefox\//i.test(ua) ? "Firefox"
                                : /Safari\//i.test(ua) ? "Safari"
                                    : "기타";

    return `${browser} / ${os}`;
}

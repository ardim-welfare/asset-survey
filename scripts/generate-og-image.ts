/**
 * 오픈 그래프 이미지(링크 미리보기) 생성 — `npx tsx scripts/generate-og-image.ts`
 *
 * 그림(scripts/assets/og-art.jpg)은 Codex CLI의 이미지 생성으로 만들었다(2026-11-22, 글자 없이
 * 오른쪽에만 그리게 했다). 한글 제목은 이미지 생성 모델이 깨뜨리기 쉬워 여기서 Pretendard로 얹는다.
 * Playwright(크로미움)로 1200×630 HTML을 찍어 public/og-image.jpg로 저장한다.
 *
 * ⚠️ 호스팅에서 jpg는 1년 immutable 캐시다(firebase.json). 그림을 바꾸면 파일 이름도 바꾸고
 * index.html·SEOHead의 og:image를 함께 고친다. 카카오톡은 자체 캐시도 있어
 * 카카오 개발자 사이트의 "공유 디버거"에서 캐시를 지워야 새 그림이 보인다.
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const art = readFileSync(join(root, 'scripts', 'assets', 'og-art.jpg')).toString('base64');
const icon = readFileSync(join(root, 'public', 'icons', 'app-icon.svg')).toString('base64');
const fontCss = pathToFileURL(join(root, 'public', 'fonts', 'pretendard-1.3.9', 'pretendardvariable-dynamic-subset.css')).href;

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<link rel="stylesheet" href="${fontCss}">
<style>
  * { margin: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; overflow: hidden; font-family: 'Pretendard Variable', sans-serif;
         background: #f3f8fe url(data:image/jpeg;base64,${art}) 90px center / auto 100% no-repeat; color: #0f172a; }
  .text { position: absolute; left: 72px; top: 0; bottom: 0; width: 600px;
          display: flex; flex-direction: column; justify-content: center; }
  .brand { display: flex; align-items: center; gap: 16px; font-size: 34px; font-weight: 800; color: #1d4ed8; }
  .brand img { width: 64px; height: 64px; }
  h1 { margin-top: 30px; font-size: 58px; line-height: 1.22; font-weight: 800; letter-spacing: -0.03em; }
  h1 em { font-style: normal; color: #2563eb; }
  p { margin-top: 24px; font-size: 26px; line-height: 1.5; color: #475569; font-weight: 500; letter-spacing: -0.01em; }
  .badge { margin-top: 32px; align-self: flex-start; padding: 12px 22px; border-radius: 999px;
           background: #dcfce7; color: #15803d; font-size: 24px; font-weight: 700; }
</style></head><body>
<div class="text">
  <div class="brand"><img src="data:image/svg+xml;base64,${icon}" alt="">재물조사</div>
  <h1>QR 찍고 끝내는<br><em>우리 기관 재물조사</em></h1>
  <p>엑셀 대장 가져오기 · QR 라벨 · 휴대폰 조사<br>승인 · 결과 보고서까지 한 번에</p>
  <div class="badge">사회복지기관·비영리단체 무료</div>
</div>
</body></html>`;

// 플레이라이트 브라우저를 받아 두지 않은 PC에서는 설치된 Edge로 찍는다
const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'msedge' }));
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
// setContent(about:blank)에서는 file:// 글꼴을 못 읽으므로 임시 파일로 연다
const dir = mkdtempSync(join(tmpdir(), 'og-'));
const htmlPath = join(dir, 'og.html');
writeFileSync(htmlPath, html);
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: join(root, 'public', 'og-image.jpg'), type: 'jpeg', quality: 88 });
await browser.close();
rmSync(dir, { recursive: true, force: true });
console.log('✅ public/og-image.jpg 생성 완료');

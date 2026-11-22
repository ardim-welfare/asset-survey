/**
 * 앱 아이콘·파비콘 생성 — `npx tsx scripts/generate-icons.ts`
 *
 * 그림 원본은 이 파일의 GLYPH 하나다(QR 코드 + 확인 표시). 용도별로 배경만 달리 감싼다.
 * - 일반 아이콘(any): 둥근 사각형 배경, 모서리 투명 — 매니페스트·파비콘
 * - 마스커블·애플 터치: 배경을 끝까지 채우고 그림을 안전 영역(가운데 80%) 안으로 줄인다.
 *   안드로이드는 원·물방울 모양으로 잘라 내고, iOS는 투명 영역을 검게 칠하기 때문이다.
 *
 * ⚠️ public/icons/·favicon.svg는 호스팅에서 1년 immutable로 캐시된다(firebase.json).
 * 그림을 바꾸면 **파일 이름도 바꾼다** — 같은 이름이면 기존 사용자에게 옛 아이콘이 1년 남는다.
 * 이름을 바꿨으면 index.html·manifest.json·vite.config.js(includeAssets)·
 * firebase-messaging-sw(.template).js·SEOHead를 함께 고친다.
 */
import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const iconsDir = join(root, 'icons');

/** 300×300 좌표계의 그림 — QR 위치 찾기 무늬 3개 + 데이터 점 + 초록 확인 표시 */
const GLYPH = `
  <g fill="none" stroke="#fff" stroke-width="20">
    <rect x="10" y="10" width="100" height="100" rx="24"/>
    <rect x="190" y="10" width="100" height="100" rx="24"/>
    <rect x="10" y="190" width="100" height="100" rx="24"/>
  </g>
  <g fill="#fff">
    <rect x="40" y="40" width="40" height="40" rx="10"/>
    <rect x="220" y="40" width="40" height="40" rx="10"/>
    <rect x="40" y="220" width="40" height="40" rx="10"/>
    <rect x="136" y="18" width="28" height="28" rx="7"/>
    <rect x="136" y="74" width="28" height="28" rx="7"/>
    <rect x="136" y="136" width="28" height="28" rx="7"/>
    <rect x="18" y="136" width="28" height="28" rx="7"/>
    <rect x="74" y="136" width="28" height="28" rx="7"/>
  </g>
  <circle cx="240" cy="240" r="64" fill="#22c55e" stroke="#fff" stroke-width="12"/>
  <path d="M210 241 L232 263 L271 222" fill="none" stroke="#fff" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>`;

const GRADIENT = `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#1d4ed8"/>
    </linearGradient>
  </defs>`;

/** 일반 아이콘 — 둥근 사각형, 그림은 가운데 300/512 */
const anySvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${GRADIENT}
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <g transform="translate(106 106)">${GLYPH}</g>
</svg>
`;

/** 마스커블 — 배경을 끝까지, 그림은 안전 영역(지름 80%) 안으로 */
const fullBleedSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${GRADIENT}
  <rect width="512" height="512" fill="url(#bg)"/>
  <g transform="translate(136 136) scale(0.8)">${GLYPH}</g>
</svg>
`;

const png = (svg: string, size: number) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();

/** PNG 조각을 그대로 담는 ICO (Vista 이후 모든 브라우저가 읽는다) */
function toIco(pngs: { size: number; data: Buffer }[]): Buffer {
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(pngs.length, 4);
    const dir = Buffer.alloc(16 * pngs.length);
    let offset = 6 + dir.length;
    pngs.forEach(({ size, data }, i) => {
        const o = i * 16;
        dir.writeUInt8(size >= 256 ? 0 : size, o);
        dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
        dir.writeUInt16LE(1, o + 4);
        dir.writeUInt16LE(32, o + 6);
        dir.writeUInt32LE(data.length, o + 8);
        dir.writeUInt32LE(offset, o + 12);
        offset += data.length;
    });
    return Buffer.concat([header, dir, ...pngs.map((p) => p.data)]);
}

writeFileSync(join(root, 'favicon.svg'), anySvg);
writeFileSync(join(iconsDir, 'app-icon.svg'), anySvg);
writeFileSync(join(iconsDir, 'app-icon-192.png'), await png(anySvg, 192));
writeFileSync(join(iconsDir, 'app-icon-512.png'), await png(anySvg, 512));
writeFileSync(join(iconsDir, 'app-icon-maskable-512.png'), await png(fullBleedSvg, 512));
writeFileSync(join(iconsDir, 'apple-touch-icon-180.png'), await png(fullBleedSvg, 180));
writeFileSync(
    join(root, 'favicon.ico'),
    toIco(await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await png(anySvg, size) })))),
);
console.log('✅ 아이콘·파비콘 생성 완료');

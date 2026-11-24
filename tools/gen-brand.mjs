// Renders HealthHub brand PNGs from the heart-pulse mark (same paths as the Figma icon kit).
// Usage: npm i @resvg/resvg-js in any scratch folder, copy this there, then: node gen-brand.mjs <healthhub>/assets/images
// NAVY must match C.primary in src/constants/healthhub.ts and the two colours in app.json.
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';

const OUT = process.argv[2];
const NAVY = '#1F2E5C', WHITE = '#FFFFFF';
const MARK = '<path d="M12 20.5s-8.5-4.9-8.5-11A4.75 4.75 0 0 1 12 6.6a4.75 4.75 0 0 1 8.5 2.9c0 6.1-8.5 11-8.5 11z"/><path d="M6 12h3l1.5-2.5 2.5 5 1.5-2.5h3.5"/>';
// mark drawn in a 24 grid, centred at (cx, cy) with the given size in px
function glyph(cx, cy, size, color, stroke) {
  const s = size / 24;
  return `<g transform="translate(${cx - size / 2} ${cy - size / 2 + size * 0.02}) scale(${s})" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${MARK}</g>`;
}
function png(name, w, body) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${w}" viewBox="0 0 ${w} ${w}">${body}</svg>`;
  writeFileSync(OUT + '/' + name, new Resvg(svg, { fitTo: { mode: 'width', value: w } }).render().asPng());
  console.log('wrote', name);
}
const W = 1024;
// iOS / store icon: navy square, white mark (the OS rounds the corners)
png('icon.png', W, `<rect width="${W}" height="${W}" fill="${NAVY}"/>` + glyph(W / 2, W / 2, 600, WHITE, 1.9));
// Android adaptive icon: background + foreground mark inside the 66% safe zone + monochrome
png('android-icon-background.png', W, `<rect width="${W}" height="${W}" fill="${NAVY}"/>`);
png('android-icon-foreground.png', W, glyph(W / 2, W / 2, 470, WHITE, 1.9));
png('android-icon-monochrome.png', W, glyph(W / 2, W / 2, 470, WHITE, 1.9));
// splash (on navy): the Figma splash mark — white rounded square with a navy heart pulse
png('splash-icon.png', 512, `<rect x="0" y="0" width="512" height="512" rx="154" fill="${WHITE}"/>` + glyph(256, 256, 300, NAVY, 1.6));
// web favicon
png('favicon.png', 48, `<rect width="48" height="48" rx="12" fill="${NAVY}"/>` + glyph(24, 24, 32, WHITE, 2));

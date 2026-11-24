// Prints colour runs down a column and across a row of a PNG (debug helper for check-png.mjs).
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
function decode(file) {
  const b = readFileSync(file); let p = 8, w, h, ct; const idat = [];
  while (p < b.length) { const len = b.readUInt32BE(p), type = b.toString('ascii', p + 4, p + 8), d = b.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; } if (type === 'IDAT') idat.push(d); p += 12 + len; }
  const raw = inflateSync(Buffer.concat(idat)); const bpp = ct === 6 ? 4 : 3, stride = w * bpp, out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) { const a = x >= bpp ? out[y * stride + x - bpp] : 0, up = y ? out[(y - 1) * stride + x] : 0, c = y && x >= bpp ? out[(y - 1) * stride + x - bpp] : 0;
      let v = row[x]; if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) { const pp = a + up - c, pa = Math.abs(pp - a), pb = Math.abs(pp - up), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; }
      out[y * stride + x] = v & 255; } }
  return { w, h, px: (x, y) => { const i = y * stride + x * bpp; return '#' + [0, 1, 2].map((k) => out[i + k].toString(16).padStart(2, '0')).join('').toUpperCase() + (bpp === 4 && out[i + 3] < 255 ? ' a' + out[i + 3] : ''); } };
}
const [file, x0 = '6', y0] = process.argv.slice(2);
const im = decode(file);
function runs(label, pts) { const out = []; let last = null, start = 0;
  pts.forEach(([x, y], i) => { const c = im.px(x, y); if (c !== last) { if (last) out.push(start + '–' + (i - 1) + ' ' + last); last = c; start = i; } });
  out.push(start + '–' + (pts.length - 1) + ' ' + last); console.log(label + ':\n  ' + out.join('\n  ')); }
runs('column x=' + x0 + ' (y runs)', Array.from({ length: im.h }, (_, y) => [Number(x0), y]));
const yy = Number(y0 || Math.round(im.h * 0.5));
runs('row y=' + yy + ' (x runs)', Array.from({ length: im.w }, (_, x) => [x, yy]));

// Reads exported screen PNGs and reports the background colour at a few margin points.
// Usage: node figma-plugin/check-png.mjs figma-audit/screens/a4-*.png
// (Images can *look* light in a viewer while the pixels are black; this checks the real values.)
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

function decode(file) {
  const b = readFileSync(file);
  let p = 8, w, h, ct, depth;
  const idat = [];
  while (p < b.length) {
    const len = b.readUInt32BE(p), type = b.toString('ascii', p + 4, p + 8), d = b.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; ct = d[9]; }
    if (type === 'IDAT') idat.push(d);
    p += 12 + len;
  }
  if (depth !== 8 || (ct !== 6 && ct !== 2)) throw new Error(file + ': unsupported PNG (depth ' + depth + ', type ' + ct + ')');
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = ct === 6 ? 4 : 3, stride = w * bpp, out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0, up = y ? out[(y - 1) * stride + x] : 0;
      const c = y && x >= bpp ? out[(y - 1) * stride + x - bpp] : 0;
      let v = row[x];
      if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) { const pp = a + up - c, pa = Math.abs(pp - a), pb = Math.abs(pp - up), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; }
      out[y * stride + x] = v & 255;
    }
  }
  const px = (x, y) => { const i = y * stride + x * bpp; return [out[i], out[i + 1], out[i + 2], bpp === 4 ? out[i + 3] : 255]; };
  return { w, h, px };
}

const hex = (c) => '#' + c.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase() + (c[3] < 255 ? ' a' + c[3] : '');
let bad = 0;
for (const file of process.argv.slice(2)) {
  const im = decode(file);
  // left margin (x = 6px) at 40% and 60% of the height: always screen background on these layouts
  const pts = [[6, Math.round(im.h * 0.4)], [6, Math.round(im.h * 0.6)]];
  const cols = pts.map(([x, y]) => hex(im.px(x, y)));
  const dark = pts.some(([x, y]) => { const c = im.px(x, y); return c[3] > 0 && c[0] + c[1] + c[2] < 120; });
  if (dark) bad++;
  console.log((dark ? 'DARK ' : 'ok   ') + file.split(/[\\/]/).pop().padEnd(34) + im.w + 'x' + im.h + '  bg ' + cols.join(' / '));
}
process.exit(bad ? 1 : 0);

// Local receiver for the HealthHub Builder Figma plugin.
// Saves screen PNGs and the audit report into ../figma-audit/, then exits once the report arrives.
// Run: node figma-plugin/receiver.mjs   (from the healthhub folder)
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 4201;
// how many reports to wait for before exiting (e.g. `node receiver.mjs 2` for A4 then A5a)
let remaining = Number(process.argv[2] || 1);
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'figma-audit');
mkdirSync(join(OUT, 'screens'), { recursive: true });

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const server = createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const shot = req.url.match(/^\/screens\/([a-z0-9-]+)$/);
    if (req.method === 'POST' && shot) {
      writeFileSync(join(OUT, 'screens', shot[1] + '.png'), body);
      console.log('saved screen', shot[1], Math.round(body.length / 1024) + 'KB');
      res.writeHead(200, cors); return res.end('ok');
    }
    const asset = req.url.match(/^\/asset\/([a-z0-9-]+)$/);
    if (req.method === 'POST' && asset) {
      const dir = join(OUT, '..', 'assets', 'images', 'tiles');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, asset[1] + '.webp'), body);
      console.log('saved asset', asset[1] + '.webp', Math.round(body.length / 1024) + 'KB');
      res.writeHead(200, cors); return res.end('ok');
    }
    const report = req.url.match(/^\/report\/([a-z0-9-]+)$/);
    if (req.method === 'POST' && report) {
      writeFileSync(join(OUT, report[1] + '.json'), body);
      remaining--;
      console.log('saved ' + report[1] + '.json', Math.round(body.length / 1024) + 'KB' + (remaining > 0 ? ', waiting for ' + remaining + ' more' : ' — done'));
      res.writeHead(200, cors); res.end('ok');
      if (remaining <= 0) setTimeout(() => process.exit(0), 300);
      return;
    }
    res.writeHead(404, cors); res.end('not found');
  });
});

server.listen(PORT, () => console.log('HealthHub receiver on http://localhost:' + PORT + ' → ' + OUT));
setTimeout(() => { console.log('no report after 3 hours, stopping'); process.exit(1); }, 3 * 60 * 60 * 1000);

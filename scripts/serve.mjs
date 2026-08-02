// Minimal static file server for local dev and the Playwright suite. Kept
// dependency-free on purpose — the app has no build step and this shouldn't
// add the project's first runtime-adjacent dependency.
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const ROOT = process.cwd();
const PORT = Number(process.argv[2] ?? 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  // normalize() collapses `..` so a crafted URL can't escape ROOT.
  const rel = normalize(path === '/' ? '/index.html' : path).replace(/^(\.\.[/\\])+/, '');
  const file = join(ROOT, rel);

  let stat;
  try {
    stat = statSync(file);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
    return;
  }
  if (stat.isDirectory()) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
    return;
  }

  res.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`serving ${ROOT} on http://localhost:${PORT}`));

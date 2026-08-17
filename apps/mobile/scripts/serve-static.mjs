import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve } from 'node:path';

const root = resolve('dist');
const port = Number(process.env.PORT || 8082);
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

async function existingFile(pathname) {
  const cleanPath = decodeURIComponent(pathname).replace(/^\/+/, '');
  const candidates = cleanPath
    ? [resolve(root, cleanPath), resolve(root, `${cleanPath}.html`), resolve(root, cleanPath, 'index.html')]
    : [resolve(root, 'index.html')];

  for (const candidate of candidates) {
    if (!candidate.startsWith(root)) continue;
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next static-route shape.
    }
  }
  return null;
}

createServer(async (request, response) => {
  const pathname = new URL(request.url || '/', 'http://localhost').pathname;
  const file = await existingFile(pathname);
  if (!file) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  response.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Type': contentTypes[extname(file)] || 'application/octet-stream',
  });
  createReadStream(file).pipe(response);
}).listen(port, '0.0.0.0', () => {
  console.log(`Curio web preview: http://localhost:${port}`);
});

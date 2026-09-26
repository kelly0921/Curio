import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { extname, resolve } from 'node:path';

const root = resolve('dist');
const port = Number(process.env.PORT || 8082);
const processorOrigin = process.env.CURIO_PROXY_ORIGIN || 'http://localhost:3031';
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
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

function proxyApi(request, response) {
  const incomingUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  const targetUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, processorOrigin);
  const requestImpl = targetUrl.protocol === 'https:' ? httpsRequest : httpRequest;
  const proxyRequest = requestImpl(targetUrl, {
    method: request.method,
    headers: { ...request.headers, host: targetUrl.host },
  }, (proxyResponse) => {
    response.writeHead(proxyResponse.statusCode || 502, proxyResponse.headers);
    proxyResponse.pipe(response);
  });
  proxyRequest.on('error', () => {
    if (response.headersSent) {
      response.destroy();
      return;
    }
    response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({
      ok: false,
      error: { code: 'PROCESSOR_UNREACHABLE', message: 'Curio could not reach its local processor.' },
    }));
  });
  request.pipe(proxyRequest);
}

createServer(async (request, response) => {
  const pathname = new URL(request.url || '/', 'http://localhost').pathname;
  if (pathname.startsWith('/api/')) {
    proxyApi(request, response);
    return;
  }
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

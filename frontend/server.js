const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const bundledAssets = require('./bundled_assets.js');

const PORT = process.env.PORT || 3000;
const BACKEND_URL = process.env.BACKEND_URL || '';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function resolveStaticFile(relPath) {
  const candidates = [
    path.join(__dirname, 'public', relPath),
    path.join(__dirname, relPath),
    path.join(process.cwd(), 'frontend', 'public', relPath),
    path.join(process.cwd(), 'public', relPath),
    path.join(process.cwd(), relPath)
  ];

  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && !fs.statSync(c).isDirectory()) {
        return c;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

function getNormalizedAssetKey(pathname) {
  let cleanPath = (pathname || '/').replace(/\/+$/, '') || '/index.html';
  if (cleanPath === '') cleanPath = '/index.html';
  return '/' + cleanPath.replace(/^\/+/, '');
}

// Web Standard fetch(request) handler for Vercel Services / Serverless runtime
async function fetchHandler(webReq) {
  const parsedUrl = new URL(webReq.url || '/', `http://localhost:${PORT}`);

  if (parsedUrl.pathname.startsWith('/api') && BACKEND_URL) {
    try {
      const targetUrl = new URL(parsedUrl.pathname + parsedUrl.search, BACKEND_URL);
      const hasBody = webReq.method !== 'GET' && webReq.method !== 'HEAD';
      return await fetch(targetUrl, {
        method: webReq.method,
        headers: webReq.headers,
        body: hasBody ? await webReq.text() : undefined
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: 'Backend service unavailable', details: err.message }),
        { status: 502, headers: { 'Content-Type': 'application/json; charset=utf-8' } }
      );
    }
  }

  const normalizedKey = getNormalizedAssetKey(parsedUrl.pathname);

  if (bundledAssets[normalizedKey]) {
    const ext = path.extname(normalizedKey).toLowerCase() || '.html';
    return new Response(bundledAssets[normalizedKey], {
      status: 200,
      headers: { 'Content-Type': MIME_TYPES[ext] || 'text/html; charset=utf-8' }
    });
  }

  if (bundledAssets['/index.html']) {
    return new Response(bundledAssets['/index.html'], {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  return new Response('Frontend asset not found.', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}

// Standard Node.js (req, res) handler for local development and Node server compatibility
function requestHandler(req, res) {
  const parsedUrl = new URL(req.url || '/', `http://localhost:${PORT}`);

  if (parsedUrl.pathname.startsWith('/api') && BACKEND_URL) {
    try {
      const targetUrl = new URL(parsedUrl.pathname + parsedUrl.search, BACKEND_URL);
      const clientModule = targetUrl.protocol === 'https:' ? https : http;
      const proxyReq = clientModule.request(
        targetUrl,
        {
          method: req.method,
          headers: { ...req.headers, host: targetUrl.host }
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode, proxyRes.headers);
          proxyRes.pipe(res);
        }
      );
      proxyReq.on('error', (err) => {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Backend service unavailable', details: err.message }));
      });
      req.pipe(proxyReq);
      return;
    } catch (e) {
      console.error('Proxy error:', e);
    }
  }

  const normalizedKey = getNormalizedAssetKey(parsedUrl.pathname);

  // 1. Check disk first in local development so live edits to public/* are reflected immediately
  const safePath = normalizedKey.replace(/^\/+/, '');
  const localFile = resolveStaticFile(safePath);
  if (localFile) {
    try {
      const content = fs.readFileSync(localFile);
      const ext = path.extname(localFile).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      res.end(content);
      return;
    } catch {
      // fall through to bundledAssets
    }
  }

  // 2. Serve from bundled in-memory assets (guarantees Vercel Serverless never misses static files)
  if (bundledAssets[normalizedKey]) {
    const ext = path.extname(normalizedKey).toLowerCase() || '.html';
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'text/html; charset=utf-8' });
    res.end(bundledAssets[normalizedKey]);
    return;
  }

  // 3. SPA fallback to index.html
  if (bundledAssets['/index.html']) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(bundledAssets['/index.html']);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Frontend file not found.');
}

const isVercelRuntime = Boolean(
  process.env.VERCEL ||
  process.env.VERCEL_ENV ||
  process.env.VERCEL_URL ||
  process.env.NOW_REGION ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  fs.existsSync('/opt/rust/nodejs.js')
);

if (!isVercelRuntime && require.main === module) {
  const server = http.createServer(requestHandler);
  server.listen(PORT, () => {
    console.log('==========================================================');
    console.log('  RECLAIM — Campus Lost & Found Frontend Web Application');
    console.log(`  Open in Browser : http://localhost:${PORT}`);
    console.log('  Connected API   : http://localhost:5000');
    console.log('==========================================================');
  });
}

requestHandler.fetch = fetchHandler;
requestHandler.default = requestHandler;
module.exports = requestHandler;
module.exports.fetch = fetchHandler;
module.exports.default = requestHandler;

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

function requestHandler(req, res) {
  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);

  // Internal Service Binding Proxy: If an /api request arrives at the frontend service
  // and BACKEND_URL is bound, forward it to the internal backend service.
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

  let cleanPath = parsedUrl.pathname.replace(/\/+$/, '') || '/index.html';
  if (cleanPath === '') cleanPath = '/index.html';
  const normalizedKey = '/' + cleanPath.replace(/^\/+/, '');

  // 1. Serve from bundled in-memory assets if available (guarantees Vercel Serverless never misses static files)
  if (bundledAssets[normalizedKey]) {
    const ext = path.extname(normalizedKey).toLowerCase() || '.html';
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'text/html; charset=utf-8' });
    res.end(bundledAssets[normalizedKey]);
    return;
  }

  // 2. Otherwise check disk for local dev edits
  const safePath = normalizedKey.replace(/^\/+/, '');
  let filePath = resolveStaticFile(safePath);

  if (!filePath) {
    if (bundledAssets['/index.html']) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(bundledAssets['/index.html']);
      return;
    }
    filePath = resolveStaticFile('index.html');
  }

  if (!filePath) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Frontend file not found.');
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Error reading frontend file.');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

const isVercelRuntime = Boolean(
  process.env.VERCEL ||
  process.env.VERCEL_ENV ||
  process.env.VERCEL_URL ||
  process.env.NOW_REGION ||
  process.env.NODE_ENV === 'production' ||
  fs.existsSync('/opt/rust/nodejs.js')
);

// Only call server.listen() when running locally on your computer, NEVER inside Vercel's runtime
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

// Export the callable request handler function for Vercel Serverless Function runtime
module.exports = requestHandler;

const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
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

const server = http.createServer((req, res) => {
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

  let safePath = path.normalize(parsedUrl.pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') {
    safePath = '/index.html';
  }

  const filePath = path.join(PUBLIC_DIR, safePath);

  fs.readFile(filePath, (err, content) => {
    if (err) {
      // SPA fallback to index.html
      fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err2, fallback) => {
        if (err2) {
          res.writeHead(500);
          res.end('Frontend files missing.');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fallback);
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log('==========================================================');
  console.log('  RECLAIM — Campus Lost & Found Frontend Web Application');
  console.log(`  Open in Browser : http://localhost:${PORT}`);
  console.log('  Connected API   : http://localhost:5000');
  console.log('==========================================================');
});


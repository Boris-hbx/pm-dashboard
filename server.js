const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || '/persist';
const STATS_FILE = path.join(DATA_DIR, 'analytics.json');
const STATS_KEY = process.env.STATS_KEY || 'bxh2026';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.md':   'text/plain; charset=utf-8',
};

// ── Analytics ──
let analytics = { visits: [], events: [] };
try {
  if (fs.existsSync(STATS_FILE)) {
    analytics = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
  }
} catch(e) { console.log('Analytics init fresh'); }

function saveAnalytics() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STATS_FILE, JSON.stringify(analytics));
  } catch(e) {}
}
setInterval(saveAnalytics, 30000);

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 10000) req.destroy(); });
    req.on('end', () => resolve(body));
  });
}

http.createServer(async (req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  const query = new URLSearchParams((req.url.split('?')[1]) || '');

  // CORS for local dev
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Health check
  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  // Analytics: track
  if (url === '/api/track' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      const record = {
        ts: new Date().toISOString(),
        ip: (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(),
        ua: (req.headers['user-agent'] || '').slice(0, 200),
        type: body.type || 'page',
        page: body.page || '/',
        detail: (body.detail || '').slice(0, 300),
        project: (body.project || '').slice(0, 50),
      };
      if (record.type === 'page') {
        analytics.visits.push(record);
        if (analytics.visits.length > 5000) analytics.visits = analytics.visits.slice(-5000);
      } else {
        analytics.events.push(record);
        if (analytics.events.length > 10000) analytics.events = analytics.events.slice(-10000);
      }
    } catch(e) {}
    res.writeHead(204);
    res.end();
    return;
  }

  // Analytics: stats
  if (url === '/api/stats') {
    if (query.get('key') !== STATS_KEY) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end('{"error":"unauthorized"}');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(analytics));
    return;
  }

  // Serve root
  if (url === '/' || url === '/index.html') {
    url = '/web/index.html';
  }

  // Allow /data/ and /web/ paths
  if (!url.startsWith('/web/') && !url.startsWith('/data/')) {
    url = '/web' + url;
  }

  const filePath = path.join(ROOT, url);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found: ' + url);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': mime,
      'Cache-Control': 'public, max-age=60',
    });
    res.end(data);
  });
}).listen(PORT, '0.0.0.0', () => {
  console.log(`PM Dashboard Hub -> http://0.0.0.0:${PORT}`);
});

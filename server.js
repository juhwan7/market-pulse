const http = require('http');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const clients = new Set();
const market = {
  asOf: new Date().toISOString(),
  isDemo: true,
  overview: {
    regime: { label: '중립 · 경계', score: 54 },
    indicators: {
      kospi: { value: '2,781.32', change: 0.42 },
      kosdaq: { value: '884.18', change: -0.28 },
      futures: { value: '367.15', change: 0.31 },
      fx: { value: '1,368.40', change: 0.18 },
      nasdaq: { value: '20,114.50', change: 0.36 }
    }
  }
};

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function staticFile(req, res) {
  const requestPath = req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
  const file = path.resolve(root, requestPath);
  if (!file.startsWith(root + path.sep)) return json(res, 403, { error: 'forbidden' });
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8' };
  fs.readFile(file, (error, data) => {
    if (error) return json(res, 404, { error: 'not_found' });
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

http.createServer((req, res) => {
  if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });
  if (req.url === '/api/health') return json(res, 200, { ok: true, mode: market.isDemo ? 'demo' : 'live', asOf: market.asOf });
  if (req.url === '/api/market/overview') return json(res, 200, market);
  if (req.url === '/api/market/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' });
    res.write(`event: market\ndata: ${JSON.stringify(market)}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  staticFile(req, res);
}).listen(process.env.PORT || 4173, () => console.log(`Market Pulse listening on ${process.env.PORT || 4173}`));

// 실제 공급원 어댑터가 새 데이터를 저장하면, 같은 형식의 이벤트를 연결된 사용자에게 전송합니다.
setInterval(() => {
  market.asOf = new Date().toISOString();
  for (const client of clients) client.write(`event: market\ndata: ${JSON.stringify(market)}\n\n`);
}, 60_000);

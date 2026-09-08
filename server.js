const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');

const root = process.cwd();
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 4173);
const mcpToken = process.env.MARKET_PULSE_MCP_TOKEN;
const streamClients = new Set();

// Replace this demo object with server-side provider adapters. Do not expose raw provider responses.
const market = {
  asOf: new Date().toISOString(), source: 'demo', isDelayed: true,
  overview: {
    regime: { label: '중립 · 경계', score: 54, copy: '외국인 선물 수급은 약하지만 원/달러와 미국 금리의 부담은 제한적입니다.' },
    indicators: {
      kospi: { value: '2,781.32', change: 0.42 }, kosdaq: { value: '884.18', change: -0.28 },
      futures: { value: '367.15', change: 0.31 }, fx: { value: '1,368.40', change: 0.18 }, nasdaq: { value: '20,114.50', change: 0.36 }
    }
  },
  leverage: {
    asOf: '전일 장 마감', score: 67, label: '경계',
    evidence: ['코스닥 신용융자 잔고가 최근 1년 상위 구간에 위치합니다.', '신용잔고 대비 평균 거래대금 비율이 상승했습니다.', '최근 5거래일의 상환 증가는 단기 위험을 일부 완화합니다.']
  },
  news: [
    { time: '09:10', title: '국내 개장 직후 외국인 선물 매도 확대', summary: '코스피200 선물 순매도 폭이 커졌으나 현물 기관 매수가 낙폭을 제한했습니다.', confidence: 'demo' },
    { time: '08:42', title: '미국 10년물 금리 상승 지속', summary: '장기 금리 상승으로 성장주 밸류에이션 부담이 재차 부각됐습니다.', confidence: 'demo' }
  ]
};

const tools = [
  { name: 'market_get_overview', description: '현재 시장 국면과 코스피, 코스닥, 코스피200 선물, 원/달러, 나스닥100 선물의 요약을 반환합니다. 투자 권고가 아닌 관찰 정보입니다.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'market_get_leverage_risk', description: '시장 전체 신용 레버리지 위험도와 근거를 반환합니다. 신용 자료는 전일 또는 공표 기준일일 수 있습니다.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'market_get_news_timeline', description: '시장 분위기에 영향을 줄 수 있는 최신 뉴스 타임라인을 반환합니다. 원문 출처 연결 전에는 시연 데이터임을 함께 표시합니다.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'market_get_server_status', description: 'Market Pulse 데이터 수집 서버의 상태, 데이터 기준 시각, 지연 여부를 반환합니다.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } }
];

function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { body += chunk; if (body.length > 1_000_000) reject(new Error('request_too_large')); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function isAllowedOrigin(req) {
  const origin = req.headers.origin;
  return !origin || origin === `http://localhost:${port}` || origin === `http://127.0.0.1:${port}`;
}

function isAuthorized(req) {
  if (!mcpToken) return true;
  const header = req.headers.authorization || '';
  const expected = `Bearer ${mcpToken}`;
  return header.length === expected.length && crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

function mcpResult(id, result) { return { jsonrpc: '2.0', id, result }; }
function mcpError(id, code, message) { return { jsonrpc: '2.0', id: id ?? null, error: { code, message } }; }
function textResult(value) { return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }; }

function executeTool(name) {
  switch (name) {
    case 'market_get_overview': return { asOf: market.asOf, source: market.source, isDelayed: market.isDelayed, ...market.overview };
    case 'market_get_leverage_risk': return { asOf: market.asOf, source: market.source, isDelayed: market.isDelayed, ...market.leverage };
    case 'market_get_news_timeline': return { asOf: market.asOf, source: market.source, isDelayed: market.isDelayed, news: market.news };
    case 'market_get_server_status': return { status: 'ok', mode: market.source, asOf: market.asOf, isDelayed: market.isDelayed, readOnlyTools: true };
    default: throw new Error('unknown_tool');
  }
}

async function handleMcp(req, res) {
  if (!isAllowedOrigin(req)) return json(res, 403, mcpError(null, -32000, 'Origin is not allowed'));
  if (!isAuthorized(req)) return json(res, 401, mcpError(null, -32001, 'Missing or invalid Bearer token'), { 'WWW-Authenticate': 'Bearer' });
  if (req.method === 'GET') return json(res, 405, { error: 'This read-only MCP server accepts JSON-RPC POST requests.' }, { Allow: 'POST, DELETE' });
  if (req.method === 'DELETE') return res.writeHead(204).end();
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'POST, GET, DELETE' });

  let message;
  try { message = JSON.parse(await readBody(req)); } catch { return json(res, 400, mcpError(null, -32700, 'Invalid JSON-RPC payload')); }
  if (message.jsonrpc !== '2.0' || typeof message.method !== 'string') return json(res, 400, mcpError(message.id, -32600, 'Invalid JSON-RPC request'));
  const headerMethod = req.headers['mcp-method'];
  const headerName = req.headers['mcp-name'];
  if (headerMethod && headerMethod !== message.method) return json(res, 400, mcpError(message.id, -32020, 'Mcp-Method does not match request body'));
  if (message.method === 'tools/call' && headerName && headerName !== message.params?.name) return json(res, 400, mcpError(message.id, -32020, 'Mcp-Name does not match request body'));

  if (message.method === 'notifications/initialized') return res.writeHead(202).end();
  if (message.method === 'initialize') {
    const requested = message.params?.protocolVersion;
    const protocolVersion = ['2025-03-26', '2025-06-18', '2025-11-25'].includes(requested) ? requested : '2025-06-18';
    return json(res, 200, mcpResult(message.id, { protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'market-pulse', version: '0.1.0' } }), { 'MCP-Protocol-Version': protocolVersion });
  }
  if (message.method === 'tools/list') return json(res, 200, mcpResult(message.id, { tools }));
  if (message.method === 'tools/call') {
    try { return json(res, 200, mcpResult(message.id, textResult(executeTool(message.params?.name)))); }
    catch (error) { return json(res, 200, mcpResult(message.id, { content: [{ type: 'text', text: `도구 실행 실패: ${error.message}` }], isError: true })); }
  }
  return json(res, 200, mcpError(message.id, -32601, `Unsupported method: ${message.method}`));
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
  if (req.url === '/mcp' || req.url.startsWith('/mcp?')) return handleMcp(req, res);
  if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });
  if (req.url === '/api/health') return json(res, 200, { ok: true, mode: market.source, asOf: market.asOf, mcp: '/mcp' });
  if (req.url === '/api/market/overview') return json(res, 200, market);
  if (req.url === '/api/market/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' });
    res.write(`event: market\ndata: ${JSON.stringify(market)}\n\n`);
    streamClients.add(res);
    req.on('close', () => streamClients.delete(res));
    return;
  }
  staticFile(req, res);
}).listen(port, host, () => console.log(`Market Pulse listening on http://${host}:${port} · MCP: /mcp`));

setInterval(() => {
  market.asOf = new Date().toISOString();
  for (const client of streamClients) client.write(`event: market\ndata: ${JSON.stringify(market)}\n\n`);
}, 60_000);

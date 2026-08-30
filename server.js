// pastebin — Snippet-Host mit Ablaufdatum und Syntax-Highlight
// Nur Node-Builtins, keine Dependencies.
'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const PORT = Number(process.env.PORT) || 8211;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'pastes.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

const EXPIRY_MS = {
  never: null,
  '1h': 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
};
const LANGUAGES = ['generic', 'js', 'py'];
const MAX_CONTENT = 256 * 1024; // 256 KB

// ---------- Store ----------

let store = { pastes: {} }; // id -> { content, language, createdAt, expiresAt|null }
let saveTimer = null;

async function loadStore() {
  try {
    store = JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
    if (!store.pastes) store.pastes = {};
  } catch {
    store = { pastes: {} };
  }
}

let savePending = false;

function scheduleSave() {
  if (saveTimer) { savePending = true; return; } // Save laeuft/steht an -> danach erneut
  saveTimer = setTimeout(doSave, 100);
}

async function doSave() {
  savePending = false;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    // Atomar: erst in tmp-Datei schreiben, dann rename — nie eine halb
    // geschriebene pastes.json, auch wenn der Prozess mitten im Write stirbt.
    const tmp = DATA_FILE + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(store, null, 2));
    await fs.rename(tmp, DATA_FILE);
  } catch (err) {
    console.error('save failed:', err.message);
    savePending = true; // Retry beim naechsten Durchgang
  } finally {
    // saveTimer erst NACH dem Write freigeben -> kein paralleler zweiter Write
    saveTimer = null;
    if (savePending) scheduleSave();
  }
}

/** Liefert Paste oder null; loescht abgelaufene beim Zugriff. */
function getPaste(id) {
  // Nur echte eigene Keys — sonst liefert store.pastes['constructor'] die Prototype-Funktion
  if (!Object.hasOwn(store.pastes, id)) return null;
  const p = store.pastes[id];
  if (!p) return null;
  if (p.expiresAt && Date.now() > p.expiresAt) {
    delete store.pastes[id];
    scheduleSave();
    return null;
  }
  return p;
}

// ---------- Helpers ----------

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

async function readBody(req, limit = MAX_CONTENT + 4096) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// ---------- Routes ----------

async function handleCreate(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (err) {
    return sendJson(res, err.message === 'payload too large' ? 413 : 400, { error: err.message || 'invalid JSON' });
  }
  // JSON.parse('null') liefert null ohne Fehler -> ohne Check gaebe es 500 statt 400
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return sendJson(res, 400, { error: 'invalid body' });
  }
  const content = typeof body.content === 'string' ? body.content : '';
  if (!content.trim()) return sendJson(res, 400, { error: 'content required' });
  if (Buffer.byteLength(content) > MAX_CONTENT) return sendJson(res, 413, { error: 'content too large (max 256 KB)' });

  const language = LANGUAGES.includes(body.language) ? body.language : 'generic';
  const expiresIn = Object.hasOwn(EXPIRY_MS, body.expiresIn) ? body.expiresIn : 'never';
  const ttl = EXPIRY_MS[expiresIn];

  const id = crypto.randomBytes(5).toString('hex'); // 10 Zeichen
  store.pastes[id] = {
    content,
    language,
    createdAt: new Date().toISOString(),
    expiresAt: ttl ? Date.now() + ttl : null,
  };
  scheduleSave();
  const host = req.headers.host || `localhost:${PORT}`;
  sendJson(res, 201, { id, url: `http://${host}/${id}`, rawUrl: `http://${host}/raw/${id}` });
}

function handleView(res, id) {
  const p = getPaste(id);
  if (!p) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>404</h1><p>Paste nicht gefunden oder abgelaufen.</p>');
    return;
  }
  const expires = p.expiresAt ? new Date(p.expiresAt).toLocaleString('de-CH') : 'nie';
  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Paste ${escapeHtml(id)}</title>
<style>
  :root { --bg:#0f1420; --panel:#1a2233; --border:#2a3550; --text:#e8ecf4; --muted:#8b96ad;
          --kw:#c792ea; --str:#3ecf8e; --com:#5c6b8a; --num:#f78c6c; }
  * { box-sizing:border-box; margin:0; }
  body { font-family:system-ui,sans-serif; background:var(--bg); color:var(--text); padding:2rem 1rem; }
  .wrap { max-width:900px; margin:0 auto; }
  .meta { display:flex; gap:1rem; align-items:center; color:var(--muted); font-size:.85rem; margin-bottom:.75rem; flex-wrap:wrap; }
  .meta a { color:#4f8cff; text-decoration:none; }
  pre { background:var(--panel); border:1px solid var(--border); border-radius:8px; padding:1rem;
        overflow-x:auto; font-size:.9rem; line-height:1.5; font-family:ui-monospace,Consolas,monospace;
        white-space:pre; }
  .tok-kw { color:var(--kw); } .tok-str { color:var(--str); } .tok-com { color:var(--com); font-style:italic; }
  .tok-num { color:var(--num); }
</style>
</head>
<body>
<div class="wrap">
  <div class="meta">
    <strong>Paste ${escapeHtml(id)}</strong>
    <span>Sprache: ${escapeHtml(p.language)}</span>
    <span>Laeuft ab: ${escapeHtml(expires)}</span>
    <a href="/raw/${escapeHtml(id)}">Raw</a>
    <a href="/">Neuer Paste</a>
  </div>
  <pre id="code" data-lang="${escapeHtml(p.language)}">${escapeHtml(p.content)}</pre>
</div>
<script src="/mini-highlight.js"></script>
</body>
</html>`;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function handleRaw(res, id) {
  const p = getPaste(id);
  if (!p) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found or expired');
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(p.content);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

async function serveStatic(res, relPath) {
  const filePath = path.join(PUBLIC_DIR, relPath);
  if (!filePath.startsWith(PUBLIC_DIR)) return void res.writeHead(403).end();
  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
}

// ---------- Server ----------

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method === 'POST' && pathname === '/api/paste') return await handleCreate(req, res);
    if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) return await serveStatic(res, 'index.html');
    if (req.method === 'GET' && pathname === '/mini-highlight.js') return await serveStatic(res, 'mini-highlight.js');
    if (req.method === 'GET' && pathname.startsWith('/raw/')) return handleRaw(res, pathname.slice(5));
    if (req.method === 'GET' && /^\/[a-f0-9]{10}$/.test(pathname)) return handleView(res, pathname.slice(1));
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: 'internal error' });
  }
});

loadStore().then(() => {
  server.listen(PORT, () => {
    console.log(`pastebin laeuft auf http://localhost:${PORT}`);
  });
});

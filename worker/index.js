// Potato Pahtato backend: leaderboard + anonymous telemetry on Cloudflare Workers + D1.
// Everything that is not /api/* is served as static files from ./dist.

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

// ---------- helpers ----------
const BLOCKED = ['fuck', 'shit', 'bitch', 'cunt', 'dick', 'nigg', 'fag', 'whore', 'slut', 'rape', 'nazi', 'penis', 'vagina', 'porn'];

export function cleanName(raw) {
  const n = String(raw ?? '').replace(/[^A-Za-z0-9 _\-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14);
  if (!n) return 'Chef';
  const flat = n.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/[^a-z]/g, '');
  return BLOCKED.some((w) => flat.includes(w)) ? 'Chef' : n;
}

function int(value, min, max, field) {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) throw new ApiError(400, `"${field}" must be a whole number.`);
  if (n < min || n > max) throw new ApiError(400, `"${field}" must be between ${min} and ${max}.`);
  return n;
}

async function readJson(request, maxBytes = 16384) {
  const text = await request.text();
  if (text.length > maxBytes) throw new ApiError(413, 'That request is too big.');
  let body;
  try { body = JSON.parse(text); } catch { throw new ApiError(400, 'Request body must be valid JSON.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'Request body must be a JSON object.');
  return body;
}

// A hash that changes every day, used only to rate-limit. It is never shown and cannot be linked across days.
async function ipHash(request) {
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const day = new Date().toISOString().slice(0, 10);
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${ip}|${day}|potato-pahtato`));
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const deviceOf = (v) => (v === 'touch' ? 'touch' : 'desktop');

// ---------- leaderboard ----------
const BEST_PER_NAME = `
  SELECT s.* FROM scores s
  WHERE s.id = (SELECT id FROM scores WHERE lower(name) = lower(s.name) ORDER BY score DESC, id ASC LIMIT 1)
  ORDER BY s.score DESC, s.id ASC LIMIT ?`;

async function getScores(env) {
  const { results } = await env.DB.prepare(BEST_PER_NAME).bind(25).all();
  return json({
    scores: results.map((r, i) => ({
      rank: i + 1, name: r.name, score: r.score, wave: r.wave, kills: r.kills, seconds: r.seconds,
      accuracy: r.accuracy, won: !!r.won, device: r.device, date: r.created_at,
    })),
  });
}

async function postScore(request, env) {
  const b = await readJson(request);
  const name = cleanName(b.name);
  const wave = int(b.wave, 1, 500, 'wave');
  const kills = int(b.kills, 0, 20000, 'kills');
  const score = int(b.score, 0, 100_000_000, 'score');
  const seconds = int(b.seconds, 0, 86400, 'seconds');
  const accuracy = int(b.accuracy, 0, 100, 'accuracy');
  const won = b.won ? 1 : 0;
  const device = deviceOf(b.device);
  const version = String(b.version ?? '').replace(/[^0-9A-Za-z.\-]/g, '').slice(0, 20);

  // Plausibility checks. Anyone can still send fake data, so these only stop silly values.
  if (score < 1 || kills < 1) throw new ApiError(422, 'There is nothing to post yet. Get at least one kill first.');
  if (score > kills * 2500 + Math.floor(wave / 5) * 25000) throw new ApiError(422, 'That score does not look possible.');
  if (seconds < (wave - 1) * 5) throw new ApiError(422, 'That run was too fast to be possible.');

  const hash = await ipHash(request);
  const recent = await env.DB.prepare(`SELECT 1 FROM scores WHERE ip_hash = ? AND created_at > datetime('now', '-8 seconds') LIMIT 1`).bind(hash).first();
  if (recent) throw new ApiError(429, 'Slow down! Wait a few seconds before posting again.');

  await env.DB.prepare(
    `INSERT INTO scores (name, score, wave, kills, seconds, accuracy, won, device, version, ip_hash) VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).bind(name, score, wave, kills, seconds, accuracy, won, device, version, hash).run();

  const best = await env.DB.prepare(`SELECT MAX(score) AS m FROM scores WHERE lower(name) = lower(?)`).bind(name).first();
  const rank = await env.DB.prepare(
    `SELECT COUNT(*) + 1 AS r FROM (SELECT MAX(score) AS m FROM scores GROUP BY lower(name)) WHERE m > ?`,
  ).bind(best.m).first();
  const players = await env.DB.prepare(`SELECT COUNT(DISTINCT lower(name)) AS c FROM scores`).first();
  return json({ saved: true, name, rank: rank.r, players: players.c, personalBest: score >= best.m }, 201);
}

// ---------- telemetry ----------
const EVENT_TYPES = new Set(['session_start', 'run_start', 'run_end', 'wave_reached', 'upgrade_picked', 'perf', 'error']);

async function postTelemetry(request, env) {
  const b = await readJson(request);
  const session = String(b.session ?? '');
  if (!/^[A-Za-z0-9-]{8,40}$/.test(session)) throw new ApiError(400, '"session" must be 8 to 40 letters, numbers or dashes.');
  if (!Array.isArray(b.events) || b.events.length === 0) throw new ApiError(400, '"events" must be a non-empty list.');
  if (b.events.length > 20) throw new ApiError(400, 'Send at most 20 events at a time.');
  const device = deviceOf(b.device);
  const version = String(b.version ?? '').replace(/[^0-9A-Za-z.\-]/g, '').slice(0, 20);
  const country = String(request.cf?.country ?? '').slice(0, 2);

  const stmts = [];
  for (const ev of b.events) {
    if (!ev || !EVENT_TYPES.has(ev.type)) throw new ApiError(400, `Unknown event type "${ev?.type}".`);
    const data = JSON.stringify(ev.data && typeof ev.data === 'object' ? ev.data : {});
    if (data.length > 500) throw new ApiError(400, 'Event data is too big.');
    stmts.push(env.DB.prepare(`INSERT INTO events (session, type, data, device, country, version) VALUES (?,?,?,?,?,?)`).bind(session, ev.type, data, device, country, version));
  }
  await env.DB.batch(stmts);
  return json({ saved: stmts.length }, 201);
}

async function getStats(env) {
  const q = (sql) => env.DB.prepare(sql);
  const [runs, sessions, avg, devices, upgrades, quality, waves, perf, days, board] = await env.DB.batch([
    q(`SELECT COUNT(*) AS c FROM events WHERE type = 'run_end'`),
    q(`SELECT COUNT(DISTINCT session) AS c FROM events`),
    q(`SELECT AVG(json_extract(data, '$.wave')) AS wave, AVG(json_extract(data, '$.seconds')) AS seconds, SUM(json_extract(data, '$.won')) AS wins FROM events WHERE type = 'run_end'`),
    q(`SELECT device, COUNT(DISTINCT session) AS c FROM events GROUP BY device`),
    q(`SELECT json_extract(data, '$.id') AS id, COUNT(*) AS c FROM events WHERE type = 'upgrade_picked' GROUP BY 1 ORDER BY c DESC LIMIT 11`),
    q(`SELECT json_extract(data, '$.quality') AS quality, COUNT(*) AS c FROM events WHERE type = 'session_start' GROUP BY 1 ORDER BY c DESC`),
    q(`SELECT json_extract(data, '$.wave') AS wave, COUNT(*) AS c FROM events WHERE type = 'run_end' GROUP BY 1 ORDER BY 1`),
    q(`SELECT device, ROUND(AVG(json_extract(data, '$.fps'))) AS fps, COUNT(*) AS n FROM events WHERE type = 'perf' GROUP BY device`),
    q(`SELECT date(created_at) AS day, COUNT(*) AS c FROM events WHERE type = 'run_end' AND created_at > datetime('now', '-14 days') GROUP BY 1 ORDER BY 1`),
    q(`SELECT COUNT(*) AS runs, COUNT(DISTINCT lower(name)) AS players FROM scores`),
  ]);
  const a = avg.results[0] || {};
  return json({
    runs: runs.results[0].c,
    sessions: sessions.results[0].c,
    avgWave: a.wave == null ? 0 : Math.round(a.wave * 10) / 10,
    avgSeconds: a.seconds == null ? 0 : Math.round(a.seconds),
    wins: a.wins || 0,
    devices: devices.results,
    upgrades: upgrades.results,
    quality: quality.results,
    waves: waves.results,
    fps: perf.results,
    days: days.results,
    leaderboard: board.results[0],
  });
}

// ---------- router ----------
async function route(request, url, env) {
  const { pathname } = url;
  const method = request.method;
  const only = (...allowed) => { if (!allowed.includes(method)) throw new ApiError(405, `Use ${allowed.join(' or ')} for ${pathname}.`); };

  if (pathname === '/api/health') { only('GET'); return json({ ok: true }); }
  if (pathname === '/api/scores') {
    only('GET', 'POST');
    return method === 'GET' ? getScores(env) : postScore(request, env);
  }
  if (pathname === '/api/telemetry') { only('POST'); return postTelemetry(request, env); }
  if (pathname === '/api/stats') { only('GET'); return getStats(env); }
  throw new ApiError(404, `No such API route: ${pathname}`);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      return await route(request, url, env);
    } catch (err) {
      if (err instanceof ApiError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: 'Something went wrong on the server.' }, 500);
    }
  },
};

// Checks the backend API. Start it first with `npm run dev:api`, then run `npm run test:api`.
import { execSync } from 'node:child_process';

const BASE = process.env.API_URL || 'http://localhost:8787';
let passed = 0, failed = 0;
const failures = [];
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; failures.push(name); console.log('  ✗ ' + name + (detail ? '  -> ' + detail : '')); }
};
const call = async (path, { method = 'GET', body, raw } = {}) => {
  const res = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json' }, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
  let data = null; try { data = await res.json(); } catch { /* not json */ }
  return { status: res.status, data };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (n) => ({ name: n, score: 1500, wave: 5, kills: 20, seconds: 120, accuracy: 55, won: false, device: 'desktop', version: '1.5.0' });

console.log('Seeding the local database...');
execSync('npx wrangler d1 execute potato-pahtato --local --file=tests/seed.sql', { stdio: 'ignore' });

console.log('\nBasics');
let r = await call('/api/health');
check('health replies ok', r.status === 200 && r.data.ok === true);
r = await call('/api/nope');
check('unknown route is 404 JSON', r.status === 404 && typeof r.data.error === 'string');
r = await call('/api/health', { method: 'POST', body: {} });
check('wrong method is 405', r.status === 405);

console.log('\nLeaderboard (read)');
r = await call('/api/scores');
const names = r.data.scores.map((s) => s.name);
check('returns scores sorted high to low', r.status === 200 && r.data.scores.every((s, i, a) => i === 0 || a[i - 1].score >= s.score));
check('one row per player (Ada/ada merged, best kept)', names.filter((n) => n.toLowerCase() === 'ada').length === 1 && r.data.scores[0].score === 9000);
check('ranks start at 1', r.data.scores[0].rank === 1 && r.data.scores[1].rank === 2);
check('rows have no ip hash', !('ip_hash' in r.data.scores[0]));

console.log('\nLeaderboard (bad input is rejected)');
r = await call('/api/scores', { method: 'POST', raw: 'not json' });
check('non-JSON is 400', r.status === 400);
r = await call('/api/scores', { method: 'POST', raw: '[1,2]' });
check('JSON array is 400', r.status === 400);
r = await call('/api/scores', { method: 'POST', body: { name: 'X' } });
check('missing fields is 400', r.status === 400);
r = await call('/api/scores', { method: 'POST', body: { ...run('X'), score: 12.5 } });
check('decimal score is 400', r.status === 400);
r = await call('/api/scores', { method: 'POST', body: { ...run('X'), wave: 9999 } });
check('wave out of range is 400', r.status === 400);
r = await call('/api/scores', { method: 'POST', body: { ...run('X'), score: 99999999 } });
check('impossible score is 422', r.status === 422);
r = await call('/api/scores', { method: 'POST', body: { ...run('X'), wave: 20, seconds: 10 } });
check('impossibly fast run is 422', r.status === 422);
r = await call('/api/scores', { method: 'POST', body: { ...run('X'), kills: 0 } });
check('zero kills is 422', r.status === 422);
r = await call('/api/scores', { method: 'POST', raw: JSON.stringify({ ...run('X'), pad: 'a'.repeat(20000) }) });
check('huge body is 413', r.status === 413);
r = await call('/api/scores');
check('rejected posts were not saved', r.data.scores.length === 3);

console.log('\nLeaderboard (write)');
r = await call('/api/scores', { method: 'POST', body: run('Bad<b>Name!!') });
check('valid post is 201', r.status === 201 && r.data.saved === true, JSON.stringify(r));
check('name is cleaned', r.data.name === 'BadbName');
check('rank + player count returned', r.data.rank === 3 && r.data.players === 4, JSON.stringify(r.data));
r = await call('/api/scores', { method: 'POST', body: run('Zed') });
check('posting again right away is 429', r.status === 429);
await sleep(8500);
r = await call('/api/scores', { method: 'POST', body: { ...run('F-word fuck'), score: 1600 } });
check('rude names become Chef', r.status === 201 && r.data.name === 'Chef', JSON.stringify(r));
await sleep(8500);
r = await call('/api/scores', { method: 'POST', body: { ...run('ADA'), score: 300, kills: 5 } });
check('lower score for same player is not a personal best', r.status === 201 && r.data.personalBest === false && r.data.rank === 1, JSON.stringify(r.data));
r = await call('/api/scores');
check('new players appear on the board', r.data.scores.some((s) => s.name === 'BadbName') && r.data.scores.some((s) => s.name === 'Chef'));
check('Ada still shows her best score', r.data.scores.find((s) => s.name.toLowerCase() === 'ada').score === 9000);

console.log('\nTelemetry');
const sid = 'test-session-12345';
const ev = (type, data) => ({ type, data });
r = await call('/api/telemetry', { method: 'POST', body: { session: sid, device: 'touch', version: '1.5.0', events: [
  ev('session_start', { quality: 'low' }), ev('run_start', {}),
  ev('upgrade_picked', { id: 'dmg', level: 1, wave: 1 }), ev('upgrade_picked', { id: 'dmg', level: 2, wave: 2 }), ev('upgrade_picked', { id: 'mag', level: 1, wave: 3 }),
  ev('perf', { fps: 30, quality: 'low' }),
  ev('run_end', { wave: 5, seconds: 100, won: 0, kills: 20 }), ev('run_end', { wave: 9, seconds: 300, won: 1, kills: 80 }),
] } });
check('valid batch is 201', r.status === 201 && r.data.saved === 8, JSON.stringify(r));
r = await call('/api/telemetry', { method: 'POST', body: { session: 'x', events: [ev('run_start', {})] } });
check('short session id is 400', r.status === 400);
r = await call('/api/telemetry', { method: 'POST', body: { session: sid, events: [ev('steal_data', {})] } });
check('unknown event type is 400', r.status === 400);
r = await call('/api/telemetry', { method: 'POST', body: { session: sid, events: [] } });
check('empty list is 400', r.status === 400);
r = await call('/api/telemetry', { method: 'POST', body: { session: sid, events: Array.from({ length: 21 }, () => ev('run_start', {})) } });
check('more than 20 events is 400', r.status === 400);
r = await call('/api/telemetry', { method: 'POST', body: { session: sid, events: [ev('error', { msg: 'x'.repeat(600) })] } });
check('oversized event data is 400', r.status === 400);
r = await call('/api/telemetry');
check('GET telemetry is 405', r.status === 405);

console.log('\nStats');
r = await call('/api/stats');
const s = r.data;
check('stats replies 200', r.status === 200);
check('counts runs and sessions', s.runs === 2 && s.sessions === 1, JSON.stringify({ runs: s.runs, sessions: s.sessions }));
check('averages wave and counts wins', s.avgWave === 7 && s.avgSeconds === 200 && s.wins === 1, JSON.stringify(s));
check('device split', s.devices.length === 1 && s.devices[0].device === 'touch');
check('upgrade ranking', s.upgrades[0].id === 'dmg' && s.upgrades[0].c === 2 && s.upgrades[1].id === 'mag');
check('quality + fps + wave histogram', s.quality[0].quality === 'low' && s.fps[0].fps === 30 && s.waves.length === 2);
check('leaderboard totals', s.leaderboard.runs >= 6 && s.leaderboard.players >= 4);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) { console.log('Failed checks:'); failures.forEach((f) => console.log('  - ' + f)); process.exit(1); }

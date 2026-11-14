// Leaderboard + "Game stats" screen, and the calls to the backend.
import { S } from './settings.js';
import { showScreen } from './ui.js';
import { sfx } from './audio.js';
import { UPGRADES } from './upgrades.js';

const $ = (id) => document.getElementById(id);

async function api(path, opts = {}) {
  let res;
  try {
    res = await fetch('/api' + path, { ...opts, headers: { 'content-type': 'application/json' } });
  } catch {
    throw new Error('no connection to the server.');
  }
  let data = null;
  try { data = await res.json(); } catch { /* ignore */ }
  if (!res.ok) throw new Error(data?.error || `the server said ${res.status}.`);
  return data;
}
export const submitRun = (run) => api('/scores', { method: 'POST', body: JSON.stringify(run) });

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const upgradeName = Object.fromEntries(UPGRADES.map((u) => [u.id, u.name]));

let tab = 'top';
let from = 'main';

function note(body, text, retry) {
  body.innerHTML = '';
  const p = el('p', 'note center', text);
  body.appendChild(p);
  if (retry) { const b = el('button', 'mbtn', 'Try again'); b.addEventListener('click', load); body.appendChild(b); }
}

function renderTop(body, scores) {
  body.innerHTML = '';
  if (!scores.length) { note(body, 'No scores yet. Be the first chef on the board!'); return; }
  const head = el('div', 'lb-row lb-head');
  ['#', 'Chef', 'Score', 'Wave', 'Kills', ''].forEach((t) => head.appendChild(el('span', '', t)));
  body.appendChild(head);
  for (const r of scores) {
    const row = el('div', 'lb-row' + (r.name.toLowerCase() === S.name.toLowerCase() ? ' me' : '') + (r.rank <= 3 ? ' top' + r.rank : ''));
    row.appendChild(el('span', 'lb-rank', r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : String(r.rank)));
    row.appendChild(el('span', 'lb-name', r.name));
    row.appendChild(el('span', 'lb-score', r.score.toLocaleString()));
    row.appendChild(el('span', '', String(r.wave)));
    row.appendChild(el('span', '', String(r.kills)));
    row.appendChild(el('span', 'lb-ic', (r.won ? '🏆 ' : '') + (r.device === 'touch' ? '📱' : '💻')));
    body.appendChild(row);
  }
}

function bars(title, items, labelOf, valueOf = (i) => i.c) {
  const sec = el('div', 'st-sec');
  sec.appendChild(el('h3', '', title));
  if (!items.length) { sec.appendChild(el('p', 'note', 'No data yet.')); return sec; }
  const max = Math.max(...items.map(valueOf), 1);
  for (const it of items) {
    const row = el('div', 'bar-row');
    row.appendChild(el('span', 'bar-label', labelOf(it)));
    const track = el('span', 'bar-track');
    const fill = el('i', 'bar-fill');
    fill.style.width = Math.max(3, (valueOf(it) / max) * 100) + '%';
    track.appendChild(fill);
    row.appendChild(track);
    row.appendChild(el('span', 'bar-val', String(valueOf(it))));
    sec.appendChild(row);
  }
  return sec;
}

function renderStats(body, s) {
  body.innerHTML = '';
  const tiles = el('div', 'st-tiles');
  const tile = (v, l) => { const t = el('div', 'st-tile'); t.appendChild(el('b', '', v)); t.appendChild(el('span', '', l)); tiles.appendChild(t); };
  tile(String(s.runs), 'Runs played');
  tile(String(s.sessions), 'Players (visits)');
  tile(String(s.avgWave), 'Average wave');
  tile(s.runs ? Math.round((s.wins / s.runs) * 100) + '%' : '0%', 'Win rate');
  tile(fmtTime(s.avgSeconds), 'Average run');
  body.appendChild(tiles);
  body.appendChild(bars('Where runs end (wave)', s.waves, (i) => 'Wave ' + i.wave));
  body.appendChild(bars('Favorite upgrades', s.upgrades, (i) => upgradeName[i.id] || i.id));
  body.appendChild(bars('Phones vs computers', s.devices, (i) => (i.device === 'touch' ? '📱 Phone' : '💻 Computer')));
  body.appendChild(bars('Graphics presets', s.quality, (i) => i.quality || 'unknown'));
  body.appendChild(bars('Average FPS', s.fps, (i) => (i.device === 'touch' ? '📱 Phone' : '💻 Computer'), (i) => i.fps));
  body.appendChild(el('p', 'note', 'All numbers are anonymous and come from players who left "Share anonymous stats" on.'));
}

async function load() {
  const body = $('board-body');
  note(body, 'Loading…');
  try {
    if (tab === 'top') renderTop(body, (await api('/scores')).scores);
    else renderStats(body, await api('/stats'));
  } catch (e) {
    note(body, `Couldn't load this: ${e.message}`, true);
  }
}

export function openBoard(returnTo = 'main') {
  from = returnTo;
  showScreen('board');
  load();
}

export function initBoard() {
  const tabs = document.querySelectorAll('#board .tab');
  tabs.forEach((t) => t.addEventListener('click', () => {
    tab = t.dataset.bt;
    tabs.forEach((x) => x.setAttribute('aria-selected', x === t ? 'true' : 'false'));
    sfx.click(); load();
  }));
  $('b-refresh').addEventListener('click', () => { sfx.click(); load(); });
  $('b-back').addEventListener('click', () => { sfx.click(); showScreen(from); });
  $('m-board').addEventListener('click', () => { sfx.click(); openBoard('main'); });
  $('o-board').addEventListener('click', () => { sfx.click(); openBoard('over'); });
  $('v-board').addEventListener('click', () => { sfx.click(); openBoard('victory'); });
}

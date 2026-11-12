// Menus: screen switching, the settings panel (graphics / audio / gameplay / controls), name + rank.
import { S, save, applyPreset, resetSettings, PRESETS, DEFAULT_BINDS, ACTION_LABELS, resetBinds, codeLabel, setName, cleanName, profile, rankFor, nextRank } from './settings.js';
import { sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
let hooks = {};
let rebinding = null;       // { action, slot, btn }
let returnTo = 'main';
let currentTab = 'Graphics';

export const isRebinding = () => rebinding !== null;

const GRAPHICS_KEYS = new Set(['renderScale', 'shadows', 'bloom', 'particles']);

const SCHEMA = {
  Graphics: [
    { k: 'quality', type: 'select', label: 'Quality preset', help: 'Picks sensible values for everything below.', opts: [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra'], ['custom', 'Custom']] },
    { k: 'renderScale', type: 'range', min: 50, max: 100, step: 5, label: 'Render scale', help: 'Lower this if the game stutters.', fmt: (v) => v + '%' },
    { k: 'shadows', type: 'select', label: 'Shadows', opts: [['off', 'Off'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']] },
    { k: 'bloom', type: 'toggle', label: 'Glow (bloom)', help: 'Soft glow on lamps, peels and pickups.' },
    { k: 'particles', type: 'select', label: 'Particles', opts: [['low', 'Few'], ['med', 'Normal'], ['high', 'Lots']] },
    { k: 'fps', type: 'toggle', label: 'Show FPS counter' },
  ],
  Audio: [
    { k: 'master', type: 'range', min: 0, max: 100, step: 5, label: 'Master volume', fmt: (v) => v + '%' },
    { k: 'sfx', type: 'range', min: 0, max: 100, step: 5, label: 'Sound effects', fmt: (v) => v + '%' },
    { k: 'music', type: 'range', min: 0, max: 100, step: 5, label: 'Music', fmt: (v) => v + '%' },
  ],
  Gameplay: [
    { k: 'sens', type: 'range', min: 20, max: 300, step: 5, label: 'Mouse sensitivity', fmt: (v) => v + '%' },
    { k: 'invertY', type: 'toggle', label: 'Invert vertical look' },
    { k: 'fov', type: 'range', min: 60, max: 110, step: 1, label: 'Field of view', fmt: (v) => v + '°' },
    { k: 'shake', type: 'toggle', label: 'Screen shake' },
    { k: 'bob', type: 'toggle', label: 'Head bob' },
    { k: 'dmgNumbers', type: 'toggle', label: 'Floating damage numbers' },
    { k: 'crossColor', type: 'color', label: 'Crosshair color' },
    { k: 'crossSize', type: 'range', min: 50, max: 200, step: 10, label: 'Crosshair size', fmt: (v) => v + '%' },
  ],
  Controls: [],
};

// ---- screen switching ----
export function showScreen(id) {
  document.querySelectorAll('.screen').forEach((el) => el.classList.toggle('hidden', el.id !== id));
}

// ---- profile / nametag ----
export function refreshProfile() {
  const rank = rankFor();
  $('p-rank').textContent = rank;
  $('p-name').textContent = S.name;
  $('h-rank').textContent = rank;
  $('h-name').textContent = S.name;
  $('gt-rank').textContent = rank;
  $('gt-name').textContent = S.name;
  const nr = nextRank();
  $('p-stats').innerHTML =
    `Runs <b>${profile.runs}</b> · Kills <b>${profile.kills}</b><br>` +
    `Best score <b>${profile.bestScore.toLocaleString()}</b> · Best wave <b>${profile.bestWave}</b>` +
    (profile.wins ? ` · Wins <b>${profile.wins}</b>` : '') +
    (nr ? `<br>${nr.need} more kills to reach <b>${nr.name}</b>` : '<br>Top rank reached!');
}

// ---- settings builders ----
function row(def) {
  const wrap = document.createElement('div');
  wrap.className = 'opt';
  const id = 'opt-' + def.k;
  const lab = document.createElement('label');
  lab.htmlFor = id;
  lab.textContent = def.label;
  if (def.help) { const sm = document.createElement('small'); sm.textContent = def.help; lab.appendChild(sm); }
  const ctl = document.createElement('div');
  ctl.className = 'ctl';
  let input;
  if (def.type === 'range') {
    input = document.createElement('input');
    input.type = 'range'; input.min = def.min; input.max = def.max; input.step = def.step;
    input.value = S[def.k];
    const val = document.createElement('span');
    val.className = 'val'; val.textContent = def.fmt(S[def.k]);
    input.addEventListener('input', () => { S[def.k] = +input.value; val.textContent = def.fmt(+input.value); changed(def.k); });
    ctl.append(input, val);
  } else if (def.type === 'select') {
    input = document.createElement('select');
    for (const [v, t] of def.opts) { const o = document.createElement('option'); o.value = v; o.textContent = t; input.appendChild(o); }
    input.value = S[def.k];
    input.addEventListener('change', () => {
      if (def.k === 'quality') { if (input.value !== 'custom') { applyPreset(input.value); renderTab(currentTab); hooks.onApply?.('quality'); sfx.click(); return; } S.quality = 'custom'; save(); return; }
      S[def.k] = input.value; changed(def.k);
    });
    ctl.append(input);
  } else if (def.type === 'toggle') {
    const sw = document.createElement('span');
    sw.className = 'switch';
    input = document.createElement('input');
    input.type = 'checkbox'; input.checked = !!S[def.k];
    const knob = document.createElement('i');
    input.addEventListener('change', () => { S[def.k] = input.checked; sfx.click(); changed(def.k); });
    sw.append(input, knob);
    ctl.append(sw);
  } else if (def.type === 'color') {
    input = document.createElement('input');
    input.type = 'color'; input.value = S[def.k];
    input.addEventListener('input', () => { S[def.k] = input.value; changed(def.k); });
    ctl.append(input);
  }
  input.id = id;
  wrap.append(lab, ctl);
  return wrap;
}

function changed(k) {
  if (GRAPHICS_KEYS.has(k) && S.quality !== 'custom') {
    // if the values still match a preset keep it, otherwise mark custom
    const match = Object.entries(PRESETS).find(([, p]) => Object.entries(p).every(([pk, pv]) => S[pk] === pv));
    S.quality = match ? match[0] : 'custom';
    const sel = $('opt-quality'); if (sel) sel.value = S.quality;
  } else if (GRAPHICS_KEYS.has(k)) {
    const match = Object.entries(PRESETS).find(([, p]) => Object.entries(p).every(([pk, pv]) => S[pk] === pv));
    if (match) S.quality = match[0];
    const sel = $('opt-quality'); if (sel) sel.value = S.quality;
  }
  save();
  hooks.onApply?.(k);
}

function controlsTab(body) {
  const note = document.createElement('p');
  note.className = 'note';
  note.id = 'bind-note';
  note.textContent = 'Click a slot, then press a key or mouse button. Esc cancels, Backspace clears the slot.';
  body.appendChild(note);
  for (const action of Object.keys(DEFAULT_BINDS)) {
    const wrap = document.createElement('div');
    wrap.className = 'opt';
    const lab = document.createElement('span');
    lab.className = 'ol'; lab.textContent = ACTION_LABELS[action];
    const ctl = document.createElement('div');
    ctl.className = 'ctl';
    for (let slot = 0; slot < 2; slot++) {
      const b = document.createElement('button');
      b.className = 'bind';
      b.type = 'button';
      b.dataset.action = action; b.dataset.slot = slot;
      paintBind(b);
      b.addEventListener('click', () => beginRebind(action, slot, b));
      ctl.appendChild(b);
    }
    wrap.append(lab, ctl);
    body.appendChild(wrap);
  }
  const fixed = document.createElement('p');
  fixed.className = 'note';
  fixed.textContent = 'Always on: 1, 2, 3 choose upgrades. Esc pauses.';
  body.appendChild(fixed);
  const reset = document.createElement('button');
  reset.className = 'mbtn'; reset.textContent = 'Reset controls'; reset.style.alignSelf = 'flex-start';
  reset.addEventListener('click', () => { cancelRebind(); resetBinds(); renderTab('Controls'); setNote('Controls reset to default.'); });
  body.appendChild(reset);
}

function paintBind(b) {
  const code = S.binds[b.dataset.action][+b.dataset.slot];
  b.textContent = codeLabel(code);
  b.classList.toggle('empty', !code);
  b.classList.remove('listening');
  b.setAttribute('aria-label', `${ACTION_LABELS[b.dataset.action]}, slot ${+b.dataset.slot + 1}: ${codeLabel(code)}. Click to change.`);
}

function setNote(t) { const n = $('bind-note'); if (n) n.textContent = t; }

function beginRebind(action, slot, btn) {
  cancelRebind();
  rebinding = { action, slot, btn };
  btn.textContent = 'Press a key…';
  btn.classList.add('listening');
  setNote(`Binding "${ACTION_LABELS[action]}". Press a key or click a mouse button.`);
}

function cancelRebind() {
  if (!rebinding) return;
  paintBind(rebinding.btn);
  rebinding = null;
}

function finishRebind(code) {
  const { action, slot } = rebinding;
  const moved = [];
  if (code) {
    for (const a of Object.keys(S.binds)) for (let i = 0; i < 2; i++) {
      if (S.binds[a][i] === code && !(a === action && i === slot)) { S.binds[a][i] = ''; moved.push(ACTION_LABELS[a]); }
    }
  }
  S.binds[action][slot] = code;
  save();
  rebinding = null;
  renderTab('Controls');
  setNote(code ? `${ACTION_LABELS[action]} set to ${codeLabel(code)}.` + (moved.length ? ` Removed it from "${moved.join('", "')}".` : '') : `${ACTION_LABELS[action]} slot cleared.`);
  hooks.onApply?.('binds');
}

function onRebindKey(e) {
  if (!rebinding) return;
  e.preventDefault(); e.stopPropagation();
  if (e.code === 'Escape') { cancelRebind(); setNote('Cancelled.'); return; }
  if (e.code === 'Backspace' || e.code === 'Delete') { finishRebind(''); return; }
  if (/^Digit[123]$/.test(e.code)) { setNote('1, 2 and 3 are reserved for upgrades. Pick another key.'); return; }
  finishRebind(e.code);
}
function onRebindMouse(e) {
  if (!rebinding) return;
  if (e.target.closest?.('.bind')) return; // the click that started it
  e.preventDefault(); e.stopPropagation();
  finishRebind('Mouse' + e.button);
}

export function renderTab(name) {
  currentTab = name;
  const body = $('tab-body');
  body.innerHTML = '';
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', t.dataset.tab === name ? 'true' : 'false'));
  if (name === 'Controls') controlsTab(body);
  else for (const def of SCHEMA[name]) body.appendChild(row(def));
}

export function openSettings(tab = 'Graphics', from = 'main') {
  returnTo = from;
  renderTab(tab);
  showScreen('settings');
}

export function initUI(h) {
  hooks = h;
  const tabs = $('tabs');
  for (const name of Object.keys(SCHEMA)) {
    const t = document.createElement('button');
    t.className = 'tab'; t.type = 'button'; t.textContent = name; t.dataset.tab = name; t.setAttribute('role', 'tab');
    t.addEventListener('click', () => { cancelRebind(); renderTab(name); sfx.click(); });
    tabs.appendChild(t);
  }
  document.addEventListener('keydown', onRebindKey, true);
  document.addEventListener('mousedown', onRebindMouse, true);

  $('m-settings').addEventListener('click', () => { sfx.click(); openSettings('Graphics', 'main'); });
  $('m-controls').addEventListener('click', () => { sfx.click(); openSettings('Controls', 'main'); });
  $('m-howto').addEventListener('click', () => { sfx.click(); showScreen('howto'); });
  document.querySelector('#howto [data-back]').addEventListener('click', () => showScreen('main'));
  $('p-settings').addEventListener('click', () => { sfx.click(); openSettings('Graphics', 'pause'); });
  $('s-back').addEventListener('click', () => { cancelRebind(); sfx.click(); showScreen(returnTo); });
  $('s-reset').addEventListener('click', () => {
    if (!confirm('Put every setting back to default? Your name and records are kept.')) return;
    cancelRebind();
    resetSettings();
    renderTab(currentTab);
    hooks.onApply?.('all');
  });

  const input = $('name-input');
  input.value = S.name;
  input.addEventListener('input', () => {
    const cleaned = input.value.replace(/[^A-Za-z0-9 _\-]/g, '');
    if (cleaned !== input.value) input.value = cleaned;
    if (cleaned.trim()) { setName(cleaned); refreshProfile(); }
  });
  input.addEventListener('blur', () => { input.value = setName(input.value); refreshProfile(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); e.stopPropagation(); });
  input.addEventListener('keyup', (e) => e.stopPropagation());
  refreshProfile();
}

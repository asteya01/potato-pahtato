// Settings, key bindings and the player's saved profile. Everything lives in localStorage.
import { TOUCH } from './device.js';
const KEY = 'potato-pahtato-settings-v2';
const PKEY = 'potato-pahtato-profile-v2';

export const DEFAULT_BINDS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space', ''],
  sprint: ['ShiftLeft', ''],
  fire: ['Mouse0', ''],
  reload: ['KeyR', ''],
  storm: ['KeyQ', 'Mouse2'],
  nametag: ['F5', ''],
};

export const ACTION_LABELS = {
  forward: 'Move forward', back: 'Move back', left: 'Strafe left', right: 'Strafe right',
  jump: 'Jump', sprint: 'Sprint', fire: 'Fire peeler', reload: 'Reload', storm: 'Peel Storm', nametag: 'Show glass nametag',
};

export const PRESETS = {
  low:    { renderScale: 70,  shadows: 'off',    bloom: false, particles: 'low' },
  medium: { renderScale: 85,  shadows: 'medium', bloom: false, particles: 'med' },
  high:   { renderScale: 100, shadows: 'high',   bloom: true,  particles: 'high' },
  ultra:  { renderScale: 100, shadows: 'ultra',  bloom: true,  particles: 'high' },
};

const DEFAULTS = {
  name: 'Chef',
  quality: 'high',
  renderScale: 100, shadows: 'high', bloom: true, particles: 'high', fps: false,
  master: 70, sfx: 100, music: 45,
  sens: 100, invertY: false, fov: 75, shake: true, bob: true, dmgNumbers: true,
  crossColor: '#ffffff', crossSize: 100,
  touchSize: 100, lefty: false,
};

function clone(o) { return JSON.parse(JSON.stringify(o)); }

function load() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* ignore */ }
  const s = { ...DEFAULTS, ...saved };
  if (TOUCH && !Object.keys(saved).length) Object.assign(s, PRESETS.low, { quality: 'low', renderScale: 75 }); // phones start on light graphics
  s.binds = clone(DEFAULT_BINDS);
  if (saved.binds) for (const a of Object.keys(DEFAULT_BINDS)) if (Array.isArray(saved.binds[a])) s.binds[a] = [saved.binds[a][0] || '', saved.binds[a][1] || ''];
  s.name = cleanName(s.name);
  return s;
}

export const S = load();

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* private mode */ }
}

export function resetSettings() {
  const keep = S.name;
  Object.assign(S, clone(DEFAULTS), { name: keep });
  S.binds = clone(DEFAULT_BINDS);
  save();
}

export function resetBinds() {
  S.binds = clone(DEFAULT_BINDS);
  save();
}

export function applyPreset(name) {
  const p = PRESETS[name];
  if (!p) return;
  Object.assign(S, p);
  S.quality = name;
  save();
}

export function cleanName(raw) {
  const n = String(raw ?? '').replace(/[^A-Za-z0-9 _\-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14);
  return n || 'Chef';
}

export function setName(raw) {
  S.name = cleanName(raw);
  save();
  return S.name;
}

export function codeLabel(code) {
  if (!code) return 'None';
  if (code.startsWith('Mouse')) return ['Left click', 'Middle click', 'Right click', 'Mouse 4', 'Mouse 5'][+code.slice(5)] || code;
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map = {
    Space: 'Space', ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl',
    AltLeft: 'Left Alt', AltRight: 'Right Alt', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
    Tab: 'Tab', Enter: 'Enter', Backquote: '`', CapsLock: 'Caps Lock',
  };
  return map[code] || code;
}

// ---- profile (lifetime stats) ----
const PDEF = { kills: 0, runs: 0, bestScore: 0, bestWave: 0, wins: 0 };
function loadProfile() {
  try { return { ...PDEF, ...(JSON.parse(localStorage.getItem(PKEY)) || {}) }; } catch { return { ...PDEF }; }
}
export const profile = loadProfile();
export function saveProfile() {
  try { localStorage.setItem(PKEY, JSON.stringify(profile)); } catch { /* ignore */ }
}

export const RANKS = [
  [0, 'Spud Scout'], [40, 'Peeler Apprentice'], [150, 'Line Cook'], [400, 'Sous Chef'],
  [900, 'Head Chef'], [2000, 'Master Peeler'], [4500, 'Potato Legend'],
];
export function rankFor(kills = profile.kills) {
  let r = RANKS[0][1];
  for (const [k, n] of RANKS) if (kills >= k) r = n;
  return r;
}
export function nextRank(kills = profile.kills) {
  for (const [k, n] of RANKS) if (kills < k) return { need: k - kills, name: n };
  return null;
}

// On-screen controls for phones: floating joystick (move), drag anywhere on the other half (look), buttons.
import { S } from './settings.js';

export const T = { x: 0, y: 0, fire: false, jump: false, sprint: false, lookX: 0, lookY: 0 };

const $ = (id) => document.getElementById(id);
let movePid = null, lookPid = null, origin = { x: 0, y: 0 }, lastLook = { x: 0, y: 0 };
const RADIUS = 58;

export function resetTouch() {
  T.x = T.y = T.lookX = T.lookY = 0;
  T.fire = T.jump = T.sprint = false;
  movePid = lookPid = null;
  $('t-stick')?.classList.remove('on');
  document.querySelectorAll('.tbtn.held').forEach((b) => b.classList.remove('held'));
}

export function applyTouchPrefs() {
  document.body.classList.toggle('lefty', !!S.lefty);
  document.documentElement.style.setProperty('--ts', S.touchSize / 100);
}

export function initTouch({ onReload, onStorm, onPause, onNametag }) {
  const moveZone = $('t-move'), lookZone = $('t-look'), stick = $('t-stick'), knob = $('t-knob');
  const opt = { passive: false };

  moveZone.addEventListener('pointerdown', (e) => {
    if (movePid !== null) return;
    e.preventDefault();
    movePid = e.pointerId;
    moveZone.setPointerCapture(e.pointerId);
    origin = { x: e.clientX, y: e.clientY };
    stick.style.left = origin.x + 'px'; stick.style.top = origin.y + 'px';
    knob.style.transform = 'translate(0,0)';
    stick.classList.add('on');
  }, opt);
  moveZone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== movePid) return;
    e.preventDefault();
    let dx = e.clientX - origin.x, dy = e.clientY - origin.y;
    const d = Math.hypot(dx, dy);
    if (d > RADIUS) { dx = (dx / d) * RADIUS; dy = (dy / d) * RADIUS; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    T.x = Math.abs(dx) / RADIUS < 0.12 ? 0 : dx / RADIUS;
    T.y = Math.abs(dy) / RADIUS < 0.12 ? 0 : -dy / RADIUS;
    T.sprint = Math.min(d, RADIUS) / RADIUS > 0.92 && T.y > 0.5;
  }, opt);
  const endMove = (e) => {
    if (e.pointerId !== movePid) return;
    movePid = null; T.x = T.y = 0; T.sprint = false;
    stick.classList.remove('on');
  };
  moveZone.addEventListener('pointerup', endMove);
  moveZone.addEventListener('pointercancel', endMove);

  lookZone.addEventListener('pointerdown', (e) => {
    if (lookPid !== null) return;
    e.preventDefault();
    lookPid = e.pointerId;
    lookZone.setPointerCapture(e.pointerId);
    lastLook = { x: e.clientX, y: e.clientY };
  }, opt);
  lookZone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== lookPid) return;
    e.preventDefault();
    T.lookX += e.clientX - lastLook.x;
    T.lookY += e.clientY - lastLook.y;
    lastLook = { x: e.clientX, y: e.clientY };
  }, opt);
  const endLook = (e) => { if (e.pointerId === lookPid) lookPid = null; };
  lookZone.addEventListener('pointerup', endLook);
  lookZone.addEventListener('pointercancel', endLook);

  // buttons: hold buttons (fire, jump) and tap buttons
  const hold = (id, key) => {
    const b = $(id);
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture(e.pointerId); T[key] = true; b.classList.add('held'); }, opt);
    const up = () => { T[key] = false; b.classList.remove('held'); };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
  };
  const tap = (id, fn) => $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); fn(); }, opt);
  hold('t-fire', 'fire');
  hold('t-jump', 'jump');
  tap('t-reload', onReload);
  tap('t-storm', onStorm);
  tap('t-pause', onPause);
  tap('t-tag', onNametag);
  document.addEventListener('contextmenu', (e) => e.preventDefault());
}

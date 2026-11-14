// Anonymous gameplay stats. Never includes your name or IP address. Turn it off in Settings > Online.
import { S } from './settings.js';
import { TOUCH } from './device.js';
import { VERSION } from './version.js';

const DEV = import.meta.env.DEV;
let sid;
try {
  sid = localStorage.getItem('pp-sid');
  if (!sid) { sid = crypto.randomUUID ? crypto.randomUUID() : 'anon-' + Math.random().toString(36).slice(2, 12); localStorage.setItem('pp-sid', sid); }
} catch { sid = 'anon-' + Math.random().toString(36).slice(2, 12); }

const queue = [];

export function track(type, data = {}) {
  if (!S.telemetry || DEV) return;
  queue.push({ type, data });
  if (queue.length >= 15) flush();
}

export function flush(useBeacon = false) {
  while (queue.length) {
    const events = queue.splice(0, 20);
    const body = JSON.stringify({ session: sid, device: TOUCH ? 'touch' : 'desktop', version: VERSION, events });
    try {
      if (useBeacon && navigator.sendBeacon) navigator.sendBeacon('/api/telemetry', new Blob([body], { type: 'application/json' }));
      else fetch('/api/telemetry', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
    } catch { /* telemetry must never break the game */ }
  }
}

setInterval(() => flush(), 15000);
window.addEventListener('pagehide', () => flush(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) flush(true); });

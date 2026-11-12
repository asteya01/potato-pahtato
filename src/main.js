import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildWorld, resolveCircle, pointBlocked, BOUND } from './world.js';
import { createEnemy, TYPES, BOSSES } from './enemies.js';
import { initAudio, sfx, applyVolumes, startMusic, setMusicIntensity } from './audio.js';
import { S, profile, saveProfile, rankFor } from './settings.js';
import { initUI, showScreen, refreshProfile, isRebinding } from './ui.js';
import { TOUCH } from './device.js';
import { T, resetTouch, initTouch, applyTouchPrefs } from './touch.js';

const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const FINAL_WAVE = 20;

// ---------- renderer / scene / post-processing ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 100);
camera.rotation.order = 'YXZ';
scene.add(camera);

const world = buildWorld(scene);
const OBS = world.obstacles;
const sun = world.sun;

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.55, 0.88);
composer.addPass(bloom);
composer.addPass(new OutputPass());

let PMUL = 1; // particle multiplier from graphics settings

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function applyAll() {
  const pr = Math.min(window.devicePixelRatio || 1, 2) * (S.renderScale / 100);
  renderer.setPixelRatio(pr);
  composer.setPixelRatio(pr);
  resize();
  const on = S.shadows !== 'off';
  if (renderer.shadowMap.enabled !== on) {
    renderer.shadowMap.enabled = on;
    scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
  }
  sun.castShadow = on;
  const size = { medium: 1024, high: 2048, ultra: 4096 }[S.shadows] || 1024;
  if (sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); sun.shadow.map?.dispose(); sun.shadow.map = null; }
  PMUL = { low: 0.35, med: 0.7, high: 1 }[S.particles] ?? 1;
  $('fps').classList.toggle('hidden', !S.fps);
  document.documentElement.style.setProperty('--cross', S.crossColor);
  document.documentElement.style.setProperty('--cross-size', S.crossSize / 100);
  applyVolumes();
  $('name-input').value = S.name;
  applyTouchPrefs();
  refreshProfile();
}
window.addEventListener('resize', resize);

// ---------- the potato peeler (first-person model) ----------
const gun = new THREE.Group();
let bladeMesh;
{
  const wood = new THREE.MeshStandardMaterial({ color: 0xa56a35, roughness: 0.7 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xe6e9ee, roughness: 0.35, metalness: 0.25, emissive: 0x2a2d33, emissiveIntensity: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1c20, roughness: 0.5 });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.04, 0.34, 14), wood);
  handle.rotation.x = Math.PI / 2; handle.position.z = 0.12;
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 14), steel);
  collar.rotation.x = Math.PI / 2; collar.position.z = -0.06;
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.12), steel);
  neck.position.z = -0.14;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.025, 0.2), steel);
  head.position.z = -0.27;
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.1), dark);
  slot.position.set(0, 0.002, -0.27);
  bladeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.008, 0.02), steel);
  bladeMesh.position.set(0, 0.022, -0.27); bladeMesh.rotation.x = 0.35;
  const spike = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.05, 8), steel);
  spike.rotation.x = -Math.PI / 2; spike.position.set(0, 0, -0.4);
  gun.add(handle, collar, neck, head, slot, bladeMesh, spike);
  gun.position.set(0.26, -0.24, -0.5);
  gun.rotation.set(0.12, -0.1, 0);
  camera.add(gun);
}
const muzzle = new THREE.PointLight(0xffe2a0, 0, 8, 2);
muzzle.position.set(0.2, -0.1, -0.9);
camera.add(muzzle);

// ---------- shared assets ----------
const peelGeo = new THREE.TorusGeometry(0.13, 0.032, 6, 14, Math.PI * 1.55);
const peelMat = new THREE.MeshStandardMaterial({ color: 0xe9c37a, emissive: 0xffa930, emissiveIntensity: 0.9, roughness: 0.5 });
const critMat = new THREE.MeshStandardMaterial({ color: 0xffb0a0, emissive: 0xff4a2a, emissiveIntensity: 1.4, roughness: 0.5 });
const stormMat = new THREE.MeshStandardMaterial({ color: 0xffe27a, emissive: 0xffc01f, emissiveIntensity: 1.6, roughness: 0.4 });
const blobGeo = new THREE.SphereGeometry(0.26, 12, 10);
const blobMat = new THREE.MeshStandardMaterial({ color: 0xfff0b8, emissive: 0xc79a22, emissiveIntensity: 0.6, roughness: 0.5 });
const partGeo = new THREE.SphereGeometry(0.09, 6, 5);
const partMats = new Map();
const partMat = (c) => { if (!partMats.has(c)) partMats.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 })); return partMats.get(c); };
const butterGeo = new THREE.BoxGeometry(0.5, 0.26, 0.36);
const butterMat = new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0xffc400, emissiveIntensity: 0.5, roughness: 0.35 });
const goldGeo = new THREE.IcosahedronGeometry(0.34, 1);
const goldMat = new THREE.MeshStandardMaterial({ color: 0xffc933, emissive: 0xffa400, emissiveIntensity: 0.8, roughness: 0.25, metalness: 0.9 });
const ringGeo = new THREE.RingGeometry(0.9, 1, 48);
const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd45a, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
const ribbonGeo = new THREE.TorusGeometry(0.34, 0.028, 4, 20, Math.PI * 1.7);
const ribbonMats = new Map();
const ribbonMat = (c) => { if (!ribbonMats.has(c)) ribbonMats.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, side: THREE.DoubleSide })); return ribbonMats.get(c); };

// ---------- upgrades ----------
const UPGRADES = [
  { id: 'dmg',    icon: '🔪', name: 'Sharper Blade',  desc: '+20% peel damage.', max: 5 },
  { id: 'mag',    icon: '📦', name: 'Big Magazine',   desc: '+6 peels per magazine.', max: 4 },
  { id: 'reload', icon: '⚡', name: 'Quick Hands',    desc: 'Reload 25% faster.', max: 2 },
  { id: 'rate',   icon: '🌀', name: 'Rapid Peel',     desc: 'Fire 15% faster.', max: 4 },
  { id: 'hp',     icon: '🧈', name: 'Thick Skin',     desc: '+25 max health and heal 25.', max: 4 },
  { id: 'speed',  icon: '👟', name: 'Spud Sprint',    desc: 'Move 8% faster.', max: 3 },
  { id: 'pierce', icon: '🗡️', name: 'Double Slice',   desc: 'Peels pass through 1 extra enemy.', max: 2 },
  { id: 'storm',  icon: '🌪️', name: 'Storm Surge',    desc: 'Peel Storm charges 35% faster.', max: 3 },
  { id: 'steal',  icon: '💚', name: 'Butter Fingers', desc: 'Heal 3 HP on every kill.', max: 3 },
  { id: 'luck',   icon: '🍀', name: 'Lucky Spud',     desc: '50% more pickup drops.', max: 3 },
  { id: 'crit',   icon: '🎯', name: 'Critical Peel',  desc: '+12% chance to hit for 2.5x damage.', max: 4 },
];
let U = {};
const lvl = (id) => U[id] || 0;
const baseMag = 20;
const magSize = () => baseMag + 6 * lvl('mag');

// ---------- game state ----------
const G = {
  state: 'menu', noLock: false, t: 0, p: null,
  enemies: [], shots: [], blobs: [], parts: [], pickups: [], rings: [], dying: [], menuPots: [],
  score: 0, kills: 0, combo: 0, comboT: 0, bestCombo: 0, fired: 0, landed: 0, time: 0,
  wave: 0, toSpawn: [], spawnT: 0, waveState: 'idle', interT: 0, endless: false, runCounted: false,
  shake: 0, flashT: 0, shopOptions: [],
};

function newPlayer() {
  return { pos: new THREE.Vector3(0, 0, 11), vy: 0, yaw: 0, pitch: 0, hp: 100, maxHp: 100, ammo: baseMag, reload: 0, fireCd: 0, ult: 0, boost: 0, hurtT: 0, bob: 0, sprint: false };
}
G.p = newPlayer();

// ---------- input (rebindable) ----------
const down = new Set();
const isDown = (a) => S.binds[a].some((c) => c && down.has(c));
const actionsOf = (code) => Object.keys(S.binds).filter((a) => S.binds[a].includes(code));
const typing = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');

// ---------- effects helpers ----------
function burst(x, y, z, color, n = 10, speed = 4) {
  n = Math.max(1, Math.round(n * PMUL));
  if (G.parts.length > 500) return;
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(partGeo, partMat(color));
    m.position.set(x, y, z);
    m.scale.setScalar(rand(0.6, 1.4));
    scene.add(m);
    G.parts.push({ m, vx: rand(-1, 1) * speed, vy: rand(1, 1.8) * speed, vz: rand(-1, 1) * speed, life: rand(0.5, 0.9) });
  }
}

function pop(text, x, y, z, cls = '') {
  if (cls.includes('dmg') && !S.dmgNumbers) return;
  const v = new THREE.Vector3(x, y, z).project(camera);
  if (v.z > 1) return;
  const el = document.createElement('div');
  el.className = 'pop ' + cls;
  el.textContent = text;
  el.style.left = ((v.x + 1) / 2) * window.innerWidth + 'px';
  el.style.top = ((1 - v.y) / 2) * window.innerHeight + 'px';
  $('pops').appendChild(el);
  setTimeout(() => el.remove(), 900);
}

function banner(text, sub = '') {
  const b = $('banner');
  b.innerHTML = '';
  b.append(text);
  if (sub) { const sm = document.createElement('small'); sm.textContent = sub; b.appendChild(sm); }
  b.classList.remove('show');
  void b.offsetWidth;
  b.classList.add('show');
}

function crossFlash(cls) {
  const c = $('crosshair');
  c.classList.remove('hit', 'kill');
  c.classList.add(cls);
  clearTimeout(crossFlash.t);
  crossFlash.t = setTimeout(() => c.classList.remove('hit', 'kill'), cls === 'kill' ? 180 : 90);
}

const addShake = (v) => { if (S.shake) G.shake = Math.max(G.shake, v); };

// ---------- player actions ----------
function forward() {
  const p = G.p;
  const cp = Math.cos(p.pitch);
  return new THREE.Vector3(-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp);
}

function spawnPeel(origin, dir, { speed = 70, dmg = 20, pierce = false, pierceLeft = 0, life = 1.2, mat = peelMat, scale = 1, crit = false } = {}) {
  const m = new THREE.Mesh(peelGeo, mat);
  m.position.copy(origin);
  m.scale.setScalar(scale);
  m.lookAt(origin.clone().add(dir));
  scene.add(m);
  G.shots.push({ m, pos: origin.clone(), dir: dir.clone(), speed, dmg, pierce, pierceLeft, life, hit: new Set(), crit });
}

let gunKick = 0;
let bladeSpin = 0;

function fire() {
  const p = G.p;
  if (G.waveState === 'shop') return;
  if (p.reload > 0 || p.fireCd > 0) return;
  if (p.ammo <= 0) { startReload(); return; }
  p.ammo--;
  p.fireCd = (p.boost > 0 ? 0.08 : 0.14) / (1 + 0.15 * lvl('rate'));
  G.fired++;
  const dir = forward();
  const eye = new THREE.Vector3(p.pos.x, 1.6 + p.pos.y, p.pos.z);
  const right = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
  const origin = eye.clone().addScaledVector(dir, 0.7).addScaledVector(right, 0.2).add(new THREE.Vector3(0, -0.12, 0));
  const spread = 0.008;
  dir.x += rand(-spread, spread); dir.y += rand(-spread, spread); dir.z += rand(-spread, spread);
  dir.normalize();
  const crit = Math.random() < 0.12 * lvl('crit');
  let dmg = 20 * (1 + 0.2 * lvl('dmg')) * (p.boost > 0 ? 2 : 1);
  if (crit) dmg *= 2.5;
  spawnPeel(origin, dir, { dmg, pierceLeft: lvl('pierce'), crit, mat: crit ? critMat : peelMat });
  gunKick = 1;
  bladeSpin += 1.6;
  muzzle.intensity = 6;
  addShake(0.04);
  sfx.shoot();
  if (p.ammo === 0) startReload();
}

function startReload() {
  const p = G.p;
  if (p.reload > 0 || p.ammo === magSize()) return;
  p.reload = 1.3 * (1 - 0.25 * lvl('reload'));
  p.reloadTotal = p.reload;
  sfx.reload();
}

function peelStorm() {
  const p = G.p;
  if (p.ult < 100 || G.waveState === 'shop') return;
  p.ult = 0;
  sfx.ult();
  G.flashT = 0.35;
  addShake(0.4);
  const N = 48;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const origin = new THREE.Vector3(p.pos.x, 1.2 + p.pos.y + (i % 3) * 0.35, p.pos.z).addScaledVector(dir, 0.8);
    spawnPeel(origin, dir, { speed: 34, dmg: 90 * (1 + 0.2 * lvl('dmg')), pierce: true, life: 0.65, mat: stormMat, scale: 2.2 });
  }
  const ring = new THREE.Mesh(ringGeo, ringMat.clone());
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(p.pos.x, 0.08, p.pos.z);
  scene.add(ring);
  G.rings.push({ m: ring, t: 0 });
}

function hurtPlayer(dmg) {
  const p = G.p;
  if (G.state !== 'playing') return;
  p.hp -= dmg;
  p.hurtT = 0.45;
  addShake(0.18);
  sfx.hurt();
  if (p.hp <= 0) { p.hp = 0; gameOver(); }
}

// ---------- enemies ----------
function bossOpts(n) {
  const keys = [5, 10, 15, 20];
  const base = BOSSES[n] || BOSSES[keys[(Math.floor(n / 5) - 1) % 4]];
  return { ...base, hpMul: base.hpMul * (n > FINAL_WAVE ? 1 + (n - FINAL_WAVE) * 0.04 : 1) };
}

function addEnemy(type, x, z, opts) {
  const o = opts || (type === 'boss' ? bossOpts(Math.max(5, G.wave)) : undefined);
  const e = createEnemy(type, x, z, Math.max(1, G.wave), o);
  scene.add(e.root);
  G.enemies.push(e);
  return e;
}

function spawnEdge(type) {
  for (let tries = 0; tries < 30; tries++) {
    const a = rand(0, Math.PI * 2);
    const rr = rand(14, 18);
    const probe = { x: Math.sin(a) * rr, z: Math.cos(a) * rr };
    resolveCircle(probe, 0.6, OBS);
    if (Math.hypot(probe.x - G.p.pos.x, probe.z - G.p.pos.z) > 11) return addEnemy(type, probe.x, probe.z);
  }
  return addEnemy(type, 0, -16);
}

function dropFrom(e) {
  if (Math.random() > Math.min(1, e.T.drop * (1 + 0.5 * lvl('luck')))) return;
  const gold = e.type === 'boss' || Math.random() < 0.22;
  const m = new THREE.Mesh(gold ? goldGeo : butterGeo, gold ? goldMat : butterMat);
  m.position.set(e.x, 0.6, e.z);
  m.castShadow = true;
  scene.add(m);
  G.pickups.push({ m, kind: gold ? 'gold' : 'butter', x: e.x, z: e.z, t: 0, life: 14 });
}

// The peeling death: the skin spirals off in ribbons while the naked potato spins, then pops.
function startPeel(e) {
  e.bar.visible = false;
  const s = e.T.scale;
  const big = e.type === 'boss';
  const d = { e, t: 0, dur: big ? 1.7 : s > 1.2 ? 1.25 : 0.95, ribbons: [], skinned: false, popped: false };
  const N = Math.max(6, Math.round((10 + 8 * s) * (0.5 + 0.5 * PMUL)));
  for (let i = 0; i < N; i++) {
    const m = new THREE.Mesh(ribbonGeo, ribbonMat(e.skin));
    m.visible = false;
    scene.add(m);
    d.ribbons.push({ m, born: false, delay: 0.08 + (i / N) * d.dur * 0.6, a: i * 2.4 + Math.random(), h: (i / N) * 1.5 - 0.55, vx: 0, vy: 0, vz: 0, age: 0, spin: rand(4, 12) });
  }
  sfx.peel();
  G.dying.push(d);
}

function updateDying(dt) {
  for (const d of G.dying) {
    d.t += dt;
    const e = d.e, s = e.T.scale, k = Math.min(1, d.t / d.dur);
    if (!d.popped) {
      e.inner.rotation.y += dt * (20 * (1 - k) + 5);
      if (!d.skinned && d.t > 0.12) {
        d.skinned = true;
        e.mat.color.set(0xf6e7b4); e.mat.roughness = 0.55; e.mat.metalness = 0;
        e.mat.emissive.set(0xffe9a0); e.mat.emissiveIntensity = 0.3;
        e.spots.forEach((sp) => { sp.visible = false; });
      }
      const wob = 1 + Math.sin(d.t * 32) * 0.05 * (1 - k);
      e.inner.scale.set(wob, 1 / wob, wob);
      e.inner.position.y = 0.82 + Math.sin(k * Math.PI) * 0.3;
    }
    for (const r of d.ribbons) {
      if (!r.born && d.t >= r.delay) {
        r.born = true; r.m.visible = true;
        r.m.position.set(e.x + Math.sin(r.a) * 0.55 * s, e.hitY + r.h * s, e.z + Math.cos(r.a) * 0.55 * s);
        r.m.rotation.set(rand(0, 3), r.a, rand(0, 3));
        r.m.scale.setScalar(s * 0.9);
        const sp = 2.2 * Math.sqrt(s);
        r.vx = Math.sin(r.a) * sp; r.vz = Math.cos(r.a) * sp; r.vy = 2.6 + rand(0, 1.6);
        if (r.delay > d.dur * 0.3 && Math.random() < 0.3) sfx.peel();
      }
      if (r.born) {
        r.age += dt;
        r.vy -= 12 * dt;
        r.m.position.x += r.vx * dt; r.m.position.y += r.vy * dt; r.m.position.z += r.vz * dt;
        if (r.m.position.y < 0.05) { r.m.position.y = 0.05; r.vy = 0; r.vx *= 0.85; r.vz *= 0.85; r.spin *= 0.9; }
        r.m.rotation.x += r.spin * dt; r.m.rotation.z += r.spin * 0.5 * dt;
        const stretch = Math.min(1.7, 0.9 + r.age * 0.9);
        const shrink = r.age > 1.2 ? Math.max(0.01, 1 - (r.age - 1.2) / 0.4) : 1;
        r.m.scale.set(s * stretch * shrink, s * 0.9 * shrink, s * 0.9 * shrink);
      }
    }
    if (d.t >= d.dur && !d.popped) {
      d.popped = true;
      burst(e.x, e.hitY, e.z, 0xf6e7b4, 14 + s * 6, 5);
      burst(e.x, e.hitY, e.z, e.skin, 6, 3);
      sfx.pop();
      scene.remove(e.root);
    }
  }
  for (const d of G.dying) if (d.t > d.dur + 1.7) { d.ribbons.forEach((r) => scene.remove(r.m)); d.done = true; }
  G.dying = G.dying.filter((d) => !d.done);
}

function killEnemy(e) {
  e.dead = true;
  startPeel(e);
  burst(e.x, e.hitY, e.z, e.skin, 6, 3);
  sfx.kill();
  G.kills++;
  G.combo++;
  G.bestCombo = Math.max(G.bestCombo, G.combo);
  G.comboT = 3.2;
  const mult = Math.min(5, 1 + Math.floor((G.combo - 1) / 3));
  const pts = e.T.score * mult;
  G.score += pts;
  G.p.ult = Math.min(100, G.p.ult + (e.type === 'boss' ? 50 : 6) * (1 + 0.35 * lvl('storm')));
  if (lvl('steal')) G.p.hp = Math.min(G.p.maxHp, G.p.hp + 3 * lvl('steal'));
  pop('+' + pts, e.x, e.hitY * 2 + 0.4, e.z);
  crossFlash('kill');
  $('combo-x').classList.remove('bump'); void $('combo-x').offsetWidth; $('combo-x').classList.add('bump');
  dropFrom(e);
  if (e.T.splits) {
    for (let i = 0; i < e.T.splits; i++) {
      const a = (i / e.T.splits) * Math.PI * 2 + rand(0, 1);
      const c = addEnemy('grunt', e.x + Math.sin(a) * 1.2, e.z + Math.cos(a) * 1.2);
      resolveCircle(c, c.r, OBS);
    }
  }
  if (e.type === 'boss') { G.flashT = 0.25; banner(e.name.toUpperCase() + ' DOWN!', 'Peeled to perfection.'); }
}

function damageEnemy(e, dmg, crit) {
  if (e.dead) return;
  e.hp -= dmg;
  e.flash = 0.1;
  G.landed++;
  G.p.ult = Math.min(100, G.p.ult + dmg * 0.06 * (1 + 0.35 * lvl('storm')));
  crit ? sfx.crit() : sfx.hit();
  crossFlash('hit');
  pop(String(Math.round(dmg)) + (crit ? '!' : ''), e.x + rand(-0.3, 0.3), e.hitY * 2 + 0.2, e.z, crit ? 'dmg crit' : 'dmg');
  burst(e.x, e.hitY, e.z, e.skin, 3, 3);
  if (e.hp <= 0) killEnemy(e);
}

function shootBlob(e, speed, dmg, angle) {
  const o = new THREE.Vector3(e.x, e.hitY + 0.2, e.z);
  const target = new THREE.Vector3(G.p.pos.x, 1.2 + G.p.pos.y, G.p.pos.z);
  const dir = target.sub(o).normalize();
  const c = Math.cos(angle), s = Math.sin(angle);
  const dx = dir.x * c - dir.z * s, dz = dir.x * s + dir.z * c;
  dir.x = dx; dir.z = dz;
  pushBlob(o, dir, speed, dmg, e.type === 'boss' ? 1.6 : 1);
}
function pushBlob(o, dir, speed, dmg, size) {
  const m = new THREE.Mesh(blobGeo, blobMat);
  m.position.copy(o);
  m.scale.setScalar(size);
  scene.add(m);
  G.blobs.push({ m, pos: o.clone(), dir, speed, dmg, life: 4 });
  sfx.blob();
}

// shared walk/hop animation for real and menu potatoes
function animatePotato(e, nx, nz, moved, dt) {
  const T = e.T, r = e.root;
  e.phase += moved * 2.4 + dt * 2;
  r.position.set(e.x, 0, e.z);
  r.rotation.y = Math.atan2(nx, nz);
  const hop = Math.abs(Math.sin(e.phase * 2.2));
  e.inner.position.y = 0.82 + hop * 0.14;
  e.inner.scale.set(1 + (1 - hop) * 0.04, 1 + hop * 0.05, 1 + (1 - hop) * 0.04);
  e.feet[0].position.z = 0.1 + Math.sin(e.phase * 2.2) * 0.12;
  e.feet[1].position.z = 0.1 - Math.sin(e.phase * 2.2) * 0.12;
  const grow = 1 - e.spawnT / 0.5;
  r.scale.setScalar(T.scale * (0.2 + 0.8 * grow));
  e.flash = Math.max(0, e.flash - dt);
  e.mat.emissiveIntensity = e.flash > 0 ? 1.2 : 0;
}

function updateEnemies(dt) {
  const p = G.p;
  for (const e of G.enemies) {
    if (e.dead) continue;
    e.spawnT = Math.max(0, e.spawnT - dt);
    const T = e.T;
    const dx = p.pos.x - e.x, dz = p.pos.z - e.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    const nx = dx / dist, nz = dz / dist;
    let mx = 0, mz = 0;
    let sp = T.speed * e.speedMul * (1 + G.wave * 0.015);

    if (T.kind === 'melee') {
      mx = nx; mz = nz;
      if (T.lunge) {
        e.lungeCd -= dt;
        if (e.lungeT > 0) { e.lungeT -= dt; sp *= 2.6; }
        else if (e.lungeCd <= 0 && dist < 9 && dist > 3) { e.lungeT = 0.45; e.lungeCd = 3 + Math.random() * 1.5; }
      }
      if (dist < T.reach + 0.5) {
        mx = 0; mz = 0;
        if ((e.atkCd -= dt) <= 0) { e.atkCd = 0.9; hurtPlayer(T.dmg); }
      }
    } else if (T.kind === 'ranged') {
      if (dist > 13) { mx = nx; mz = nz; }
      else if (dist < 8) { mx = -nx; mz = -nz; }
      else { mx = -nz * e.side; mz = nx * e.side; }
      if ((e.shootCd -= dt) <= 0 && dist < 24) {
        e.shootCd = T.cd * rand(0.85, 1.2);
        shootBlob(e, 14, T.dmg, 0.05);
      }
    } else { // boss
      const enraged = e.hp < e.maxHp * 0.5;
      if (enraged && !e.calm) { e.calm = true; banner('ENRAGED!', e.name); sfx.boss(); }
      if (dist > 11) { mx = nx; mz = nz; } else if (dist < 6) { mx = -nx * 0.5; mz = -nz * 0.5; }
      if (enraged) sp *= 1.35;
      if ((e.shootCd -= dt) <= 0) {
        e.shootCd = T.cd * (enraged ? 0.62 : 1);
        e.volley++;
        for (let i = -2; i <= 2; i++) shootBlob(e, 13, T.dmg, i * 0.16);
        if (enraged && e.volley % 3 === 0) {
          for (let i = 0; i < 14; i++) {
            const a = (i / 14) * Math.PI * 2;
            pushBlob(new THREE.Vector3(e.x, e.hitY + 0.2, e.z), new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), 9, T.dmg, 1.3);
          }
        }
        sfx.boss();
      }
      if ((e.summonCd -= dt) <= 0) {
        e.summonCd = enraged ? 6 : 9;
        const kind = e.name === 'The Russet Emperor' ? 'dasher' : 'grunt';
        for (let i = 0; i < (kind === 'dasher' ? 4 : 3); i++) {
          const a = rand(0, 6.28);
          const g = addEnemy(kind, e.x + Math.sin(a) * 3, e.z + Math.cos(a) * 3);
          resolveCircle(g, g.r, OBS); g.root.position.set(g.x, 0, g.z);
        }
      }
      if (dist < 3.4 && (e.atkCd -= dt) <= 0) { e.atkCd = 1.0; hurtPlayer(25); }
    }

    // separation from other enemies
    for (const o of G.enemies) {
      if (o === e || o.dead) continue;
      const ox = e.x - o.x, oz = e.z - o.z, d = Math.hypot(ox, oz);
      const min = e.r + o.r;
      if (d > 0.0001 && d < min) { mx += (ox / d) * 0.9; mz += (oz / d) * 0.9; }
    }

    const len = Math.hypot(mx, mz);
    const bx = e.x, bz = e.z;
    if (len > 0.001) { e.x += (mx / len) * sp * dt; e.z += (mz / len) * sp * dt; }
    const blocked = resolveCircle(e, e.r, OBS);
    if (blocked && T.kind === 'melee') { // slide around cover instead of sticking to it
      e.x += -nz * e.side * sp * dt * 0.8; e.z += nx * e.side * sp * dt * 0.8;
      resolveCircle(e, e.r, OBS);
    }
    animatePotato(e, nx, nz, Math.hypot(e.x - bx, e.z - bz), dt);
    if (e.hp < e.maxHp && e.type !== 'boss') {
      e.bar.visible = true;
      e.fg.scale.x = Math.max(0.001, e.hp / e.maxHp);
      e.fg.position.x = -0.52 * (1 - e.hp / e.maxHp);
      e.bar.quaternion.copy(camera.quaternion);
      e.bar.quaternion.premultiply(e.root.quaternion.clone().invert());
    }
  }
  G.enemies = G.enemies.filter((e) => !e.dead);
}

// ---------- projectiles, particles, pickups ----------
function updateShots(dt) {
  for (const s of G.shots) {
    s.life -= dt;
    const steps = Math.ceil((s.speed * dt) / 0.4);
    const stepLen = (s.speed * dt) / steps;
    for (let i = 0; i < steps && s.life > -1; i++) {
      s.pos.addScaledVector(s.dir, stepLen);
      if (pointBlocked(s.pos.x, s.pos.y, s.pos.z, OBS)) { burst(s.pos.x, s.pos.y, s.pos.z, 0xe9c37a, 4, 2); s.life = -2; break; }
      for (const e of G.enemies) {
        if (e.dead || s.hit.has(e.id)) continue;
        const dx = s.pos.x - e.x, dy = s.pos.y - e.hitY, dz = s.pos.z - e.z;
        if (dx * dx + dy * dy + dz * dz < e.hitR * e.hitR) {
          s.hit.add(e.id);
          damageEnemy(e, s.dmg, s.crit);
          if (!s.pierce) {
            if (s.pierceLeft > 0) s.pierceLeft--; else { s.life = -2; break; }
          }
        }
      }
      if (s.life <= -2) break;
    }
    s.m.position.copy(s.pos);
    s.m.rotateZ(dt * 30);
  }
  for (const s of G.shots) if (s.life <= 0) scene.remove(s.m);
  G.shots = G.shots.filter((s) => s.life > 0);
}

function updateBlobs(dt) {
  const p = G.p;
  for (const b of G.blobs) {
    b.life -= dt;
    b.pos.addScaledVector(b.dir, b.speed * dt);
    b.m.position.copy(b.pos);
    if (pointBlocked(b.pos.x, b.pos.y, b.pos.z, OBS)) { burst(b.pos.x, Math.max(0.1, b.pos.y), b.pos.z, 0xfff0b8, 5, 2); b.life = 0; continue; }
    const dx = b.pos.x - p.pos.x, dz = b.pos.z - p.pos.z, dy = b.pos.y - (p.pos.y + 1.1);
    if (dx * dx + dz * dz + dy * dy < 0.55 * 0.55) { hurtPlayer(b.dmg); burst(b.pos.x, b.pos.y, b.pos.z, 0xfff0b8, 6, 2); b.life = 0; }
  }
  for (const b of G.blobs) if (b.life <= 0) scene.remove(b.m);
  G.blobs = G.blobs.filter((b) => b.life > 0);
}

function updateParts(dt) {
  for (const q of G.parts) {
    q.life -= dt;
    q.vy -= 14 * dt;
    q.m.position.x += q.vx * dt; q.m.position.y += q.vy * dt; q.m.position.z += q.vz * dt;
    if (q.m.position.y < 0.05) { q.m.position.y = 0.05; q.vy *= -0.3; q.vx *= 0.6; q.vz *= 0.6; }
    q.m.scale.multiplyScalar(1 - dt * 0.8);
  }
  for (const q of G.parts) if (q.life <= 0) scene.remove(q.m);
  G.parts = G.parts.filter((q) => q.life > 0);
  for (const r of G.rings) {
    r.t += dt;
    const k = r.t / 0.5;
    r.m.scale.setScalar(1 + k * 20);
    r.m.material.opacity = Math.max(0, 0.8 * (1 - k));
    if (k >= 1) { scene.remove(r.m); r.dead = true; }
  }
  G.rings = G.rings.filter((r) => !r.dead);
}

function updatePickups(dt) {
  const p = G.p;
  for (const k of G.pickups) {
    k.t += dt; k.life -= dt;
    k.m.position.y = 0.6 + Math.sin(k.t * 3) * 0.12;
    k.m.rotation.y += dt * 2;
    k.m.visible = k.life > 3 || Math.floor(k.life * 6) % 2 === 0;
    if (Math.hypot(k.x - p.pos.x, k.z - p.pos.z) < 1.2) {
      if (k.kind === 'butter') { p.hp = Math.min(p.maxHp, p.hp + 30); pop('+30 HP', k.x, 1.2, k.z); }
      else { p.boost = 10; pop('DOUBLE DAMAGE', k.x, 1.2, k.z); }
      sfx.pickup();
      k.life = 0;
    }
  }
  for (const k of G.pickups) if (k.life <= 0) scene.remove(k.m);
  G.pickups = G.pickups.filter((k) => k.life > 0);
}

// ---------- waves, shop, victory ----------
function composeWave(n) {
  const q = [];
  const add = (t, c) => { for (let i = 0; i < c; i++) q.push(t); };
  add('grunt', Math.min(3 + 2 * n, 26));
  if (n >= 2) add('tosser', Math.min(Math.floor(n * 0.9), 12));
  if (n >= 3) add('brute', Math.min(Math.floor(n / 3), 8));
  if (n >= 4) add('dasher', Math.min(Math.floor(n * 0.7), 10));
  if (n >= 6) add('splitter', Math.min(Math.floor((n - 3) / 3), 6));
  for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
  if (n % 5 === 0) q.unshift('boss');
  return q;
}

function startWave(n) {
  G.wave = n;
  G.toSpawn = composeWave(n);
  G.spawnT = 1.2;
  G.waveState = 'spawning';
  const boss = n % 5 === 0;
  banner(`WAVE ${n}`, boss ? `Boss: ${bossOpts(n).name}` : `${G.toSpawn.length} spuds incoming`);
  setMusicIntensity(n);
  sfx.wave();
  if (boss) setTimeout(() => G.state === 'playing' && sfx.boss(), 600);
}

function updateWaves(dt) {
  if (G.waveState === 'spawning') {
    G.spawnT -= dt;
    const cap = Math.min(14 + Math.floor(G.wave / 2), 22);
    if (G.spawnT <= 0 && G.toSpawn.length && G.enemies.length < cap) {
      spawnEdge(G.toSpawn.shift());
      G.spawnT = Math.max(0.3, 1.0 - G.wave * 0.04);
    }
    if (!G.toSpawn.length && G.enemies.length === 0) {
      G.p.hp = Math.min(G.p.maxHp, G.p.hp + 20);
      if (G.wave >= FINAL_WAVE && !G.endless) victory();
      else openShop();
    }
  } else if (G.waveState === 'intermission') {
    G.interT -= dt;
    if (G.interT <= 0) startWave(G.wave + 1);
  }
}

function openShop() {
  G.waveState = 'shop';
  const pool = UPGRADES.filter((u) => lvl(u.id) < u.max);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  G.shopOptions = pool.slice(0, 3);
  const box = $('shop-cards');
  box.innerHTML = '';
  G.shopOptions.forEach((u, i) => {
    const c = document.createElement('button');
    c.className = 'ucard'; c.type = 'button';
    const k = document.createElement('span'); k.className = 'k'; k.textContent = i + 1;
    const ic = document.createElement('span'); ic.className = 'ic'; ic.textContent = u.icon;
    const h = document.createElement('h3'); h.textContent = u.name;
    const d = document.createElement('p'); d.textContent = u.desc;
    const l = document.createElement('span'); l.className = 'lvl'; l.textContent = lvl(u.id) ? `Level ${lvl(u.id)} → ${lvl(u.id) + 1}` : 'New';
    c.append(k, ic, h, d, l);
    c.addEventListener('click', () => pickUpgrade(i));
    box.appendChild(c);
  });
  if (!G.shopOptions.length) { G.waveState = 'intermission'; G.interT = 2; return; }
  $('shop-sub').textContent = TOUCH ? 'Tap an upgrade' : 'Press 1, 2 or 3';
  $('shop').classList.remove('hidden');
  resetTouch();
  banner('WAVE CLEARED', '+20 HP. Choose an upgrade.');
}

function pickUpgrade(i) {
  const u = G.shopOptions[i];
  if (!u || G.waveState !== 'shop') return;
  U[u.id] = lvl(u.id) + 1;
  const p = G.p;
  if (u.id === 'hp') { p.maxHp += 25; p.hp = Math.min(p.maxHp, p.hp + 25); }
  if (u.id === 'mag') p.ammo = magSize();
  sfx.upgrade();
  $('shop').classList.add('hidden');
  G.shopOptions = [];
  G.waveState = 'intermission';
  G.interT = 2.5;
  pop(`${u.icon} ${u.name}`, p.pos.x + forward().x * 3, 1.8, p.pos.z + forward().z * 3);
}

function victory() {
  G.state = 'victory'; resetTouch();
  G.waveState = 'idle';
  mouse.down = false;
  document.exitPointerLock?.();
  sfx.win();
  finishRun(true);
  $('win-stats').innerHTML = statsHtml();
  setTimeout(() => { if (G.state === 'victory') { $('hud').classList.add('hidden'); showScreen('victory'); } }, 1200);
}

// ---------- player movement ----------
function updatePlayer(dt) {
  const p = G.p;
  const clamp1 = (v) => Math.max(-1, Math.min(1, v));
  const f = clamp1((isDown('forward') ? 1 : 0) - (isDown('back') ? 1 : 0) + T.y);
  const s = clamp1((isDown('right') ? 1 : 0) - (isDown('left') ? 1 : 0) + T.x);
  p.sprint = isDown('sprint') || T.sprint;
  if (T.lookX || T.lookY) {
    const k = 0.0042 * (S.sens / 100);
    p.yaw -= T.lookX * k;
    p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch - T.lookY * k * (S.invertY ? -1 : 1)));
    T.lookX = T.lookY = 0;
  }
  const speed = (p.sprint && f > 0 ? 9 : 6) * (1 + 0.08 * lvl('speed'));
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  let mx = -sy * f + cy * s;
  let mz = -cy * f - sy * s;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  p.pos.x += mx * speed * dt;
  p.pos.z += mz * speed * dt;

  if ((isDown('jump') || T.jump) && p.pos.y === 0) p.vy = 7.5;
  p.vy -= 22 * dt;
  p.pos.y += p.vy * dt;
  if (p.pos.y <= 0) { p.pos.y = 0; p.vy = 0; }
  resolveCircle(p.pos, 0.42, OBS, p.pos.y);

  if (len > 0.05 && p.pos.y === 0) p.bob += dt * (p.sprint ? 13 : 9);

  p.fireCd = Math.max(0, p.fireCd - dt);
  p.boost = Math.max(0, p.boost - dt);
  p.hurtT = Math.max(0, p.hurtT - dt);
  if (p.reload > 0) { p.reload -= dt; if (p.reload <= 0) { p.ammo = magSize(); p.reload = 0; } }
  if (isDown('fire') || T.fire) fire();
}

function updateCamera(dt) {
  const p = G.p;
  if (G.state === 'menu') return;
  const bob = S.bob ? Math.sin(p.bob) * 0.045 : 0;
  camera.position.set(p.pos.x, 1.6 + p.pos.y + bob, p.pos.z);
  if (G.shake > 0) {
    camera.position.x += rand(-1, 1) * G.shake * 0.4;
    camera.position.y += rand(-1, 1) * G.shake * 0.4;
    G.shake = Math.max(0, G.shake - dt * 1.4);
  }
  camera.rotation.set(p.pitch, p.yaw, 0);
  const targetFov = S.fov + (p.sprint && G.state === 'playing' ? 7 : 0) + (G.flashT > 0 ? 8 : 0);
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 8);
  camera.updateProjectionMatrix();
}

function updateGun(dt) {
  const p = G.p;
  gun.visible = G.state !== 'menu';
  gunKick = Math.max(0, gunKick - dt * 9);
  bladeSpin = Math.max(0, bladeSpin - dt * 5);
  bladeMesh.rotation.z = bladeSpin * 3;
  muzzle.intensity = Math.max(0, muzzle.intensity - dt * 70);
  const total = p.reloadTotal || 1.3;
  const rl = p.reload > 0 ? Math.sin(Math.min(1, (total - p.reload) / total) * Math.PI) : 0;
  const sway = S.bob ? 1 : 0;
  gun.position.set(0.26 + Math.sin(p.bob * 0.5) * 0.006 * sway, -0.24 - rl * 0.28 + Math.abs(Math.sin(p.bob)) * 0.012 * sway, -0.5 + gunKick * 0.08);
  gun.rotation.set(0.12 + gunKick * 0.18 + rl * 0.9, -0.1, rl * 1.2);
}

// ---------- HUD ----------
const radar = $('radar').getContext('2d');
const stormBtn = $('t-storm');
const H = {
  wave: $('h-wave'), score: $('h-score'), kills: $('h-kills'),
  hpFill: $('hp-fill'), hpText: $('hp-text'), hpWrap: $('hp-wrap'),
  ammoN: $('ammo-n'), ammoMax: $('ammo-max'), ammo: $('ammo'), ultFill: $('ult-fill'), ultWrap: $('ult-wrap'), ultText: $('ult-text'),
  combo: $('combo'), comboX: $('combo-x'), comboFill: $('combo-fill'),
  boss: $('boss'), bossName: $('boss-name'), bossFill: $('boss-fill'), vig: $('vignette'), flash: $('flash'), buffs: $('buffs'), target: $('target'),
};

function updateTarget() {
  const el = H.target;
  if (G.state !== 'playing') { el.classList.add('hidden'); return; }
  const p = G.p, f = forward();
  const ex = p.pos.x, ey = 1.6 + p.pos.y, ez = p.pos.z;
  let best = null, bestDot = 0;
  for (const e of G.enemies) {
    const vx = e.x - ex, vy = e.hitY - ey, vz = e.z - ez;
    const len = Math.hypot(vx, vy, vz);
    if (len > 45 || len < 0.1) continue;
    const dot = (vx * f.x + vy * f.y + vz * f.z) / len;
    if (dot > Math.cos(Math.atan(e.hitR * 1.1 / len)) && dot > bestDot) {
      let clear = true;
      for (let d = 1; d < len; d += 1) {
        const t = d / len;
        if (pointBlocked(ex + vx * t, ey + vy * t, ez + vz * t, OBS)) { clear = false; break; }
      }
      if (clear) { best = e; bestDot = dot; }
    }
  }
  if (!best) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const html = `${best.name}<small>${best.T.label} · ${Math.max(0, Math.ceil(best.hp))} / ${best.maxHp}</small>`;
  if (el.dataset.k !== html) { el.dataset.k = html; el.textContent = ''; el.append(best.name); const sm = document.createElement('small'); sm.textContent = `${best.T.label} · ${Math.max(0, Math.ceil(best.hp))} / ${best.maxHp}`; el.appendChild(sm); }
}

function updateHud() {
  const p = G.p;
  H.wave.textContent = G.wave;
  H.score.textContent = G.score.toLocaleString();
  H.kills.textContent = G.kills;
  H.hpFill.style.width = (p.hp / p.maxHp) * 100 + '%';
  H.hpText.textContent = Math.ceil(p.hp) + ' / ' + p.maxHp;
  H.hpWrap.classList.toggle('low', p.hp <= p.maxHp * 0.3);
  H.ammoN.textContent = p.reload > 0 ? '...' : p.ammo;
  H.ammoMax.textContent = '/ ' + magSize();
  H.ammo.classList.toggle('low', p.ammo <= 5);
  H.ultFill.style.width = p.ult + '%';
  H.ultWrap.classList.toggle('ready', p.ult >= 100);
  stormBtn.style.setProperty('--c', p.ult);
  stormBtn.classList.toggle('ready', p.ult >= 100);
  const keyName = S.binds.storm.find((c) => c) ? S.binds.storm.filter((c) => c).map((c) => (c.startsWith('Mouse') ? ['LMB', 'MMB', 'RMB'][+c.slice(5)] || c : c.replace('Key', ''))).join('/') : '?';
  H.ultText.textContent = p.ult >= 100 ? `PEEL STORM READY (${keyName})` : 'PEEL STORM ' + Math.floor(p.ult) + '%';
  const mult = Math.min(5, 1 + Math.floor((G.combo - 1) / 3));
  H.combo.classList.toggle('hidden', G.combo < 2);
  const cs = 'x' + mult + ' · ' + G.combo;
  if (H.comboX.dataset.v !== cs) { H.comboX.dataset.v = cs; H.comboX.textContent = 'x' + mult; const sm = document.createElement('small'); sm.style.cssText = 'font-size:20px;color:#fff6e0'; sm.textContent = ' ' + G.combo + ' in a row'; H.comboX.appendChild(sm); }
  H.comboFill.style.width = Math.max(0, (G.comboT / 3.2) * 100) + '%';
  H.vig.style.opacity = Math.max(p.hurtT * 1.6, p.hp <= p.maxHp * 0.3 ? 0.35 : 0);
  H.flash.style.opacity = Math.max(0, G.flashT * 1.5);
  H.buffs.textContent = '';
  if (p.boost > 0) { const b = document.createElement('span'); b.className = 'buff'; b.textContent = `Double damage ${Math.ceil(p.boost)}s`; H.buffs.appendChild(b); }
  const boss = G.enemies.find((e) => e.type === 'boss');
  H.boss.classList.toggle('hidden', !boss);
  if (boss) { H.bossName.textContent = boss.name; H.bossFill.style.width = Math.max(0, (boss.hp / boss.maxHp) * 100) + '%'; }

  // radar
  const R = 80, SC = 3.6;
  radar.clearRect(0, 0, 160, 160);
  radar.save();
  radar.beginPath(); radar.arc(R, R, R - 2, 0, 7); radar.clip();
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
  const toMap = (x, z) => { const dx = x - p.pos.x, dz = z - p.pos.z; return [R + (dx * rx + dz * rz) * SC, R - (dx * fx + dz * fz) * SC]; };
  radar.strokeStyle = 'rgba(255,246,224,.25)'; radar.lineWidth = 2;
  radar.beginPath();
  [[-BOUND, -BOUND], [BOUND, -BOUND], [BOUND, BOUND], [-BOUND, BOUND]].map(([x, z]) => toMap(x, z)).forEach(([x, y], i) => (i ? radar.lineTo(x, y) : radar.moveTo(x, y)));
  radar.closePath(); radar.stroke();
  radar.fillStyle = 'rgba(255,246,224,.18)';
  for (const o of OBS) {
    const [x, y] = toMap(o.x, o.z);
    radar.beginPath(); radar.arc(x, y, (o.type === 'cyl' ? o.r : Math.max(o.hw, o.hd)) * SC, 0, 7); radar.fill();
  }
  for (const e of G.enemies) {
    const [x, y] = toMap(e.x, e.z);
    radar.fillStyle = e.type === 'boss' ? '#ff3b2a' : e.type === 'brute' ? '#ff9a3a' : e.type === 'tosser' ? '#ffe066' : e.type === 'dasher' ? '#ff6b6b' : e.type === 'splitter' ? '#c9b48a' : '#d9a86a';
    radar.beginPath(); radar.arc(x, y, e.type === 'boss' ? 6 : e.type === 'brute' || e.type === 'splitter' ? 4.5 : 3.2, 0, 7); radar.fill();
  }
  for (const k of G.pickups) {
    const [x, y] = toMap(k.x, k.z);
    radar.fillStyle = k.kind === 'gold' ? '#ffc933' : '#fff3a0';
    radar.fillRect(x - 2, y - 2, 4, 4);
  }
  radar.restore();
  radar.fillStyle = '#fff'; radar.beginPath(); radar.moveTo(R, R - 7); radar.lineTo(R + 5, R + 5); radar.lineTo(R - 5, R + 5); radar.closePath(); radar.fill();
}

// ---------- menu background: friendly (for now) potatoes wandering about ----------
function spawnMenuPotatoes() {
  clearMenuPotatoes();
  const kinds = ['grunt', 'grunt', 'tosser', 'brute', 'dasher', 'splitter', 'grunt'];
  for (const k of kinds) {
    const e = createEnemy(k, rand(-12, 12), rand(-12, 12), 1);
    e.spawnT = 0; e.menu = true; e.tx = rand(-14, 14); e.tz = rand(-14, 14);
    resolveCircle(e, e.r, OBS);
    scene.add(e.root);
    G.menuPots.push(e);
  }
}
function clearMenuPotatoes() { G.menuPots.forEach((e) => scene.remove(e.root)); G.menuPots = []; }
function updateMenuPotatoes(dt) {
  for (const e of G.menuPots) {
    const dx = e.tx - e.x, dz = e.tz - e.z, d = Math.hypot(dx, dz);
    if (d < 1) { e.tx = rand(-14, 14); e.tz = rand(-14, 14); }
    const nx = dx / (d || 1), nz = dz / (d || 1);
    const bx = e.x, bz = e.z;
    const sp = e.T.speed * 0.45;
    e.x += nx * sp * dt; e.z += nz * sp * dt;
    if (resolveCircle(e, e.r, OBS)) { e.tx = rand(-14, 14); e.tz = rand(-14, 14); }
    animatePotato(e, nx, nz, Math.hypot(e.x - bx, e.z - bz), dt);
  }
}

// ---------- state flow ----------
function resetGame() {
  G.enemies.forEach((e) => scene.remove(e.root));
  G.dying.forEach((d) => { scene.remove(d.e.root); d.ribbons.forEach((r) => scene.remove(r.m)); });
  for (const list of [G.shots, G.blobs, G.parts, G.pickups, G.rings]) list.forEach((o) => scene.remove(o.m));
  Object.assign(G, { enemies: [], shots: [], blobs: [], parts: [], pickups: [], rings: [], dying: [], score: 0, kills: 0, combo: 0, comboT: 0, bestCombo: 0, fired: 0, landed: 0, time: 0, wave: 0, toSpawn: [], waveState: 'idle', shake: 0, flashT: 0, endless: false, runCounted: false, shopOptions: [] });
  U = {};
  G.p = newPlayer();
  $('pops').innerHTML = '';
  $('shop').classList.add('hidden');
}

function lock() { if (!G.noLock) renderer.domElement.requestPointerLock?.(); }

function begin(withLock = true) {
  initAudio(); startMusic();
  clearMenuPotatoes();
  resetGame();
  G.noLock = !withLock || TOUCH;
  resetTouch();
  showScreen(null);
  $('hud').classList.remove('hidden');
  G.state = 'playing';
  if (withLock) lock();
  startWave(1);
}

function toMenu() {
  mouse.down = false; resetTouch();
  document.exitPointerLock?.();
  resetGame();
  G.state = 'menu';
  G.noLock = false;
  $('hud').classList.add('hidden');
  setMusicIntensity(0);
  spawnMenuPotatoes();
  refreshProfile();
  showScreen('main');
}

function finishRun(won = false) {
  if (G.runCounted) return;
  G.runCounted = true;
  profile.runs++;
  profile.kills += G.kills;
  profile.bestScore = Math.max(profile.bestScore, G.score);
  profile.bestWave = Math.max(profile.bestWave, G.wave);
  if (won) profile.wins++;
  saveProfile();
  refreshProfile();
}

function fmtTime(s) { const m = Math.floor(s / 60); return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }
function statsHtml() {
  const acc = G.fired ? Math.round((G.landed / G.fired) * 100) : 0;
  const cell = (b, s) => `<div><b>${b}</b><span>${s}</span></div>`;
  return cell(G.score.toLocaleString(), 'Score') + cell(G.wave, 'Wave reached') + cell(G.kills, 'Spuds peeled') + cell(acc + '%', 'Accuracy') + cell('x' + Math.min(5, 1 + Math.floor((G.bestCombo - 1) / 3)) + ' · ' + G.bestCombo, 'Best combo') + cell(fmtTime(G.time), 'Time survived');
}

function gameOver() {
  G.state = 'over'; resetTouch();
  sfx.over();
  document.exitPointerLock?.();
  mouse.down = false;
  const prevBest = profile.bestScore;
  finishRun(false);
  $('over-stats').innerHTML = statsHtml();
  $('over-best').textContent = G.score > prevBest ? `New personal best, ${S.name}!` : `Best: ${profile.bestScore.toLocaleString()}`;
  setTimeout(() => { if (G.state === 'over') { $('hud').classList.add('hidden'); $('shop').classList.add('hidden'); showScreen('over'); } }, 900);
}

function pause() {
  if (G.state !== 'playing' || (G.noLock && !TOUCH)) return;
  G.state = 'paused';
  mouse.down = false; down.clear(); resetTouch();
  showScreen('pause');
}
function resume() {
  if (G.state !== 'paused') return;
  showScreen(null);
  G.state = 'playing';
  lock();
}

// ---------- events ----------
initUI({ onApply: (k) => { applyAll(); if (k === 'binds') down.clear(); } });

$('play').addEventListener('click', () => begin(true));
$('again').addEventListener('click', () => begin(true));
$('resume').addEventListener('click', resume);
$('p-quit').addEventListener('click', () => { finishRun(false); toMenu(); });
$('o-menu').addEventListener('click', toMenu);
$('v-menu').addEventListener('click', toMenu);
$('endless').addEventListener('click', () => {
  showScreen(null); $('hud').classList.remove('hidden');
  G.endless = true; G.state = 'playing'; G.runCounted = false; lock();
  openShop();
});

const mouse = { down: false };
initTouch({ onReload: () => G.state === 'playing' && startReload(), onStorm: () => G.state === 'playing' && peelStorm(), onPause: pause, onNametag: () => toggleNametag() });
$('m-full').addEventListener('click', async () => {
  try { await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }); await screen.orientation?.lock?.('landscape'); } catch { /* not supported, e.g. iPhone Safari */ }
});
function checkPortrait() { if (TOUCH && G.state === 'playing' && window.innerHeight > window.innerWidth) pause(); }
window.addEventListener('resize', checkPortrait);
document.addEventListener('visibilitychange', () => { if (document.hidden && TOUCH) pause(); });
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement) pause(); });
document.addEventListener('mousemove', (e) => {
  if (G.state !== 'playing' || (!document.pointerLockElement && !G.noLock)) return;
  const k = 0.0022 * (S.sens / 100);
  G.p.yaw -= e.movementX * k;
  G.p.pitch = Math.max(-1.45, Math.min(1.45, G.p.pitch - e.movementY * k * (S.invertY ? -1 : 1)));
});
document.addEventListener('mousedown', (e) => {
  initAudio(); startMusic();
  if (isRebinding() || TOUCH) return;
  if (G.state !== 'playing' || e.target.closest?.('.ucard')) return;
  const code = 'Mouse' + e.button;
  down.add(code);
  if (actionsOf(code).includes('storm')) peelStorm();
});
document.addEventListener('mouseup', (e) => down.delete('Mouse' + e.button));
document.addEventListener('contextmenu', (e) => e.preventDefault());
const glassTag = $('glasstag');
function toggleNametag(force) {
  const on = force ?? !glassTag.classList.contains('show');
  refreshProfile();
  glassTag.classList.toggle('show', on);
  glassTag.setAttribute('aria-hidden', on ? 'false' : 'true');
  if (on) sfx.click();
}
document.addEventListener('keydown', (e) => {
  if (isRebinding() || typing(e.target)) return;
  if (actionsOf(e.code).includes('nametag')) { // e.g. F5, which would otherwise reload the page
    e.preventDefault();
    if (!e.repeat) { initAudio(); toggleNametag(); }
    return;
  }
  if (e.repeat) return;
  down.add(e.code);
  if (G.state !== 'playing') return;
  if (G.waveState === 'shop' && /^Digit[123]$/.test(e.code)) { pickUpgrade(+e.code.slice(5) - 1); return; }
  const acts = actionsOf(e.code);
  if (acts.includes('reload')) startReload();
  if (acts.includes('storm')) peelStorm();
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
});
document.addEventListener('keyup', (e) => down.delete(e.code));
window.addEventListener('blur', () => { down.clear(); mouse.down = false; pause(); });

// ---------- main loop ----------
let wasPlaying = null;
function step(dt) {
  G.t += dt;
  const playing = G.state === 'playing';
  if (playing !== wasPlaying) { wasPlaying = playing; document.body.classList.toggle('playing', playing); }
  if (G.state === 'playing') {
    G.time += dt;
    updatePlayer(dt);
    updateWaves(dt);
    updateEnemies(dt);
    updateShots(dt);
    updateBlobs(dt);
    updatePickups(dt);
    G.comboT = Math.max(0, G.comboT - dt);
    if (G.comboT === 0) G.combo = 0;
    G.flashT = Math.max(0, G.flashT - dt);
  }
  if (G.state === 'playing' || G.state === 'over' || G.state === 'victory') { updateParts(dt); updateDying(dt); }
  if (G.state === 'menu') {
    updateMenuPotatoes(dt);
    const a = G.t * 0.12;
    camera.position.set(Math.sin(a) * 13, 4.2 + Math.sin(G.t * 0.3) * 0.5, Math.cos(a) * 13);
    camera.lookAt(0, 1.6, 0);
    camera.fov = 62; camera.updateProjectionMatrix();
  } else {
    updateCamera(dt);
    updateHud();
    updateTarget();
  }
  updateGun(dt);
}

let last = performance.now();
let fpsAcc = 0, fpsN = 0;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  step(dt);
  if (S.bloom) composer.render(dt); else renderer.render(scene, camera);
  if (S.fps) { fpsAcc += dt; fpsN++; if (fpsAcc >= 0.5) { $('fps').textContent = Math.round(fpsN / fpsAcc) + ' fps'; fpsAcc = 0; fpsN = 0; } }
  requestAnimationFrame(loop);
}

applyAll();
spawnMenuPotatoes();
requestAnimationFrame(loop);

// hooks for automated tests and debugging
window.__game = {
  G, S, begin, toMenu, step, fire, peelStorm, addEnemy, damageEnemy, pickUpgrade, openShop, startWave, pause, resume,
  render: () => { if (S.bloom) composer.render(0.016); else renderer.render(scene, camera); },
  down, camera, UPG: () => U, rankFor, toggleNametag,
};

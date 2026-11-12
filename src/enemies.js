import * as THREE from 'three';

export const TYPES = {
  grunt:    { label: 'Spudling',     hp: 40,   speed: 3.5, scale: 1.0,  color: 0xb98a52, kind: 'melee',  dmg: 10, reach: 1.25, score: 100,  drop: 0.12 },
  tosser:   { label: 'Tater Tosser', hp: 55,   speed: 2.9, scale: 0.95, color: 0xe6c35c, kind: 'ranged', dmg: 8,  cd: 1.9,     score: 200,  drop: 0.2 },
  dasher:   { label: 'Hash Brown',   hp: 30,   speed: 5.2, scale: 0.8,  color: 0xd9a441, kind: 'melee',  dmg: 8,  reach: 1.1,  score: 150,  drop: 0.1, lunge: true },
  splitter: { label: 'Jacket Spud',  hp: 130,  speed: 2.6, scale: 1.3,  color: 0xa87444, kind: 'melee',  dmg: 14, reach: 1.55, score: 300,  drop: 0.3, splits: 2 },
  brute:    { label: 'Sweet Brute',  hp: 240,  speed: 2.2, scale: 1.6,  color: 0xd9772b, kind: 'melee',  dmg: 25, reach: 1.9,  score: 500,  drop: 0.5 },
  boss:     { label: 'Boss',         hp: 1500, speed: 1.6, scale: 2.8,  color: 0xc9cad4, kind: 'boss',   dmg: 12, cd: 2.4,     score: 5000, drop: 1 },
};

export const BOSSES = {
  5:  { name: 'Mega Baked',         color: 0xc9cad4, hpMul: 1.0 },
  10: { name: 'Count Hashula',      color: 0x8e5aa8, hpMul: 1.35 },
  15: { name: 'Lord Latke',         color: 0xe0b43c, hpMul: 1.7 },
  20: { name: 'The Russet Emperor', color: 0xb8402e, hpMul: 2.3, crown: true },
};

const FIRST = ['Spud', 'Tater', 'Russet', 'Yukon', 'Fingerling', 'Idaho', 'Maris', 'Kennebec', 'Chip', 'Lumpy', 'Starchy', 'Murphy'];
const LAST = ['McMash', 'Von Fry', 'the Lumpy', 'Hashley', 'Starch', "O'Taters", 'Chipwell', 'Crisp', 'Gnocchi', 'Tuber', 'Boiler', 'Wedge'];
export function randomName() {
  return FIRST[Math.floor(Math.random() * FIRST.length)] + ' ' + LAST[Math.floor(Math.random() * LAST.length)];
}

// One lumpy potato shape, shared by everyone (each enemy still gets its own material).
const lumpy = (() => {
  const g = new THREE.SphereGeometry(0.6, 22, 16);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 5.1 + 1.3) * Math.cos(v.z * 4.3) * 0.07 + Math.sin(v.y * 6.7 + v.x * 3) * 0.05;
    v.multiplyScalar(1 + n);
    p.setXYZ(i, v.x, v.y * 1.12, v.z * 0.96);
  }
  g.computeVertexNormals();
  return g;
})();

const sphere = new THREE.SphereGeometry(1, 12, 8);
const box = new THREE.BoxGeometry(1, 1, 1);
const cyl = new THREE.CylinderGeometry(1, 1, 1, 10);
const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
const black = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 });
const barBg = new THREE.MeshBasicMaterial({ color: 0x000000, depthTest: false, transparent: true, opacity: 0.6 });
const barFg = new THREE.MeshBasicMaterial({ color: 0x7be05a, depthTest: false });

export function makePotato(type, skinColor, crown) {
  const T = TYPES[type];
  const color = skinColor ?? T.color;
  const root = new THREE.Group();
  const inner = new THREE.Group();
  inner.position.y = 0.82;
  root.add(inner);

  const boss = type === 'boss';
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: boss ? 0.45 : 0.85,
    metalness: boss ? 0.3 : 0,
    emissive: 0xff2a10,
    emissiveIntensity: 0,
  });
  const body = new THREE.Mesh(lumpy, mat);
  body.castShadow = true;
  inner.add(body);

  // little spots on the skin ("eyes" of the potato)
  const spots = [];
  if (!boss) {
    const spot = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.55), roughness: 1 });
    for (const [x, y, z] of [[-0.35, 0.3, -0.4], [0.4, -0.1, -0.4], [0.1, 0.5, -0.45], [-0.45, -0.25, -0.2]]) {
      const s = new THREE.Mesh(sphere, spot);
      s.scale.set(0.06, 0.05, 0.06);
      s.position.set(x, y, z);
      inner.add(s);
      spots.push(s);
    }
  }

  // angry face
  const eyeMat = boss ? new THREE.MeshStandardMaterial({ color: 0xff3a1a, emissive: 0xff3a1a, emissiveIntensity: 1.5 }) : white;
  const face = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(sphere, eyeMat);
    e.scale.set(0.15, 0.17, 0.09);
    e.position.set(s * 0.2, 0.2, 0.5);
    inner.add(e); face.push(e);
    if (!boss) {
      const pu = new THREE.Mesh(sphere, black);
      pu.scale.set(0.06, 0.07, 0.04);
      pu.position.set(s * 0.19, 0.2, 0.57);
      inner.add(pu); face.push(pu);
    }
    const brow = new THREE.Mesh(box, black);
    brow.scale.set(0.26, 0.055, 0.05);
    brow.position.set(s * 0.2, 0.42, 0.5);
    brow.rotation.z = s * 0.5; // inner end low = angry
    inner.add(brow); face.push(brow);
  }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.028, 6, 12, Math.PI), black);
  mouth.position.set(0, -0.08, 0.55);
  inner.add(mouth); face.push(mouth);

  // feet and arms
  const feet = [];
  for (const s of [-1, 1]) {
    const f = new THREE.Mesh(sphere, mat);
    f.scale.set(0.17, 0.11, 0.24);
    f.position.set(s * 0.26, -0.73, 0.1);
    inner.add(f);
    feet.push(f);
    const a = new THREE.Mesh(cyl, mat);
    a.scale.set(0.06, 0.45, 0.06);
    a.position.set(s * 0.66, -0.05, 0.05);
    a.rotation.z = s * 0.55;
    inner.add(a);
    const hand = new THREE.Mesh(sphere, mat);
    hand.scale.set(0.1, 0.1, 0.1);
    hand.position.set(s * 0.82, -0.28, 0.05);
    inner.add(hand);
  }

  // hats and hair
  if (type === 'tosser') {
    const hatMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    const band = new THREE.Mesh(cyl, hatMat); band.scale.set(0.3, 0.14, 0.3); band.position.y = 0.7;
    const puff = new THREE.Mesh(sphere, hatMat); puff.scale.set(0.36, 0.3, 0.36); puff.position.y = 0.92;
    inner.add(band, puff);
  } else if (type === 'brute') {
    const leaf = new THREE.MeshStandardMaterial({ color: 0x4faa4a, roughness: 0.7 });
    for (const [x, r] of [[-0.12, 0.5], [0.12, -0.5], [0, 0]]) {
      const l = new THREE.Mesh(sphere, leaf);
      l.scale.set(0.09, 0.22, 0.04);
      l.position.set(x, 0.78, 0);
      l.rotation.z = r;
      inner.add(l);
    }
  } else if (type === 'dasher') {
    const band = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: 0xe0392b, roughness: 0.6 }));
    band.scale.set(0.9, 0.09, 0.9); band.position.y = 0.3;
    inner.add(band);
  } else if (type === 'splitter') {
    const foil = new THREE.MeshStandardMaterial({ color: 0xd6d8de, roughness: 0.4, metalness: 0.5 });
    const crack = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: 0xfff1b8, roughness: 0.6 }));
    crack.scale.set(0.5, 0.05, 0.3); crack.position.set(0, 0.62, 0.1);
    const wrap = new THREE.Mesh(cyl, foil); wrap.scale.set(0.5, 0.07, 0.5); wrap.position.y = -0.15;
    inner.add(crack, wrap);
  } else if (boss) {
    const butter = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: 0xffe066, roughness: 0.4, emissive: 0x806000, emissiveIntensity: 0.4 }));
    butter.scale.set(0.5, 0.26, 0.5); butter.position.y = 0.78; butter.rotation.y = 0.5;
    if (crown) {
      const gold = new THREE.MeshStandardMaterial({ color: 0xffc933, emissive: 0xaa7700, emissiveIntensity: 0.6, roughness: 0.25, metalness: 0.7 });
      const ring = new THREE.Mesh(cyl, gold); ring.scale.set(0.3, 0.12, 0.3); ring.position.y = 0.78;
      inner.add(ring);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 6), gold);
        sp.position.set(Math.sin(a) * 0.28, 0.98, Math.cos(a) * 0.28);
        inner.add(sp);
      }
    } else inner.add(butter);
  }

  root.scale.setScalar(T.scale);

  // health bar (billboarded in the main loop)
  const bar = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.14), barBg);
  const fg = new THREE.Mesh(new THREE.PlaneGeometry(1.04, 0.09), barFg);
  fg.position.z = 0.001;
  bg.renderOrder = 10; fg.renderOrder = 11;
  bar.add(bg, fg);
  bar.position.y = 2.0 * T.scale + (boss ? 0.2 : 0);
  bar.scale.setScalar(1 / T.scale);
  bar.visible = false;
  root.add(bar);

  return { root, inner, body, mat, feet, bar, fg, spots, face, skin: color };
}

let uid = 1;
export function createEnemy(type, x, z, wave, opts = {}) {
  const T = TYPES[type];
  const m = makePotato(type, opts.color, opts.crown);
  const hp = Math.round(T.hp * (opts.hpMul ?? 1) * (1 + 0.07 * (wave - 1)));
  m.root.position.set(x, 0, z);
  return {
    id: uid++, type, T, ...m,
    name: opts.name || randomName(),
    x, z, hp, maxHp: hp,
    r: 0.5 * T.scale, hitR: 0.72 * T.scale, hitY: 0.85 * T.scale,
    atkCd: 0.6, shootCd: 1 + Math.random(), phase: Math.random() * 6, flash: 0, side: Math.random() < 0.5 ? -1 : 1,
    summonCd: 7, dead: false, spawnT: 0.5, speedMul: 0.9 + Math.random() * 0.25,
    lungeCd: 1 + Math.random() * 2, lungeT: 0, volley: 0, calm: false,
  };
}

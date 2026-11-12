import * as THREE from 'three';

export const HALF = 20;            // arena is 40 x 40
export const WALL_DEPTH = 0.6;     // cabinets line the walls
export const BOUND = HALF - WALL_DEPTH;
export const CEIL = 8;

function canvasTex(size, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 4;
  return t;
}

const floorTex = () => canvasTex(512, (g, s) => {
  const n = 4, w = s / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    g.fillStyle = (x + y) % 2 ? '#f2e6c8' : '#cfdcc0';
    g.fillRect(x * w, y * w, w, w);
    g.fillStyle = 'rgba(0,0,0,.05)';
    g.fillRect(x * w, y * w, w, 6);
  }
  g.strokeStyle = 'rgba(80,70,40,.45)'; g.lineWidth = 4;
  for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * w, 0); g.lineTo(i * w, s); g.stroke(); g.beginPath(); g.moveTo(0, i * w); g.lineTo(s, i * w); g.stroke(); }
}, [10, 10]);

const wallTex = () => canvasTex(256, (g, s) => {
  g.fillStyle = '#f4efe1'; g.fillRect(0, 0, s, s);
  const w = s / 4, h = s / 8;
  g.strokeStyle = 'rgba(120,110,80,.5)'; g.lineWidth = 3;
  for (let r = 0; r < 8; r++) {
    const off = r % 2 ? w / 2 : 0;
    for (let c = -1; c < 5; c++) g.strokeRect(c * w + off, r * h, w, h);
  }
}, [8, 2]);

const crateTex = () => canvasTex(256, (g, s) => {
  g.fillStyle = '#b9824a'; g.fillRect(0, 0, s, s);
  g.fillStyle = '#9a6a38';
  for (let i = 0; i < 4; i++) g.fillRect(0, i * 64 + 4, s, 6);
  g.fillStyle = '#7e5226'; g.fillRect(0, 0, 18, s); g.fillRect(s - 18, 0, 18, s);
  g.fillStyle = '#3b2410'; g.font = 'bold 54px Impact, sans-serif'; g.textAlign = 'center';
  g.fillText('SPUDS', s / 2, 118); g.font = 'bold 28px Impact, sans-serif'; g.fillText('GRADE A', s / 2, 160);
}, null);

const canTex = () => canvasTex(256, (g, s) => {
  g.fillStyle = '#d9392b'; g.fillRect(0, 0, s, s);
  g.fillStyle = '#fff3dc'; g.fillRect(0, 70, s, 116);
  g.fillStyle = '#b3241a'; g.font = 'bold 60px Impact, sans-serif'; g.textAlign = 'center';
  g.fillText('TOMATO', s / 2, 135); g.font = 'bold 30px Impact, sans-serif'; g.fillText('SOUP', s / 2, 172);
}, [2, 1]);

export function buildWorld(scene) {
  const obstacles = [];
  const lamps = [];

  // floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF * 2, HALF * 2),
    new THREE.MeshStandardMaterial({ map: floorTex(), roughness: 0.55 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // ceiling
  const ceil = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF * 2, HALF * 2),
    new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 0.9 }),
  );
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = CEIL;
  scene.add(ceil);

  // walls
  const wm = new THREE.MeshStandardMaterial({ map: wallTex(), roughness: 0.8 });
  for (const [x, z, ry] of [[0, -HALF, 0], [0, HALF, Math.PI], [-HALF, 0, Math.PI / 2], [HALF, 0, -Math.PI / 2]]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, CEIL), wm);
    w.position.set(x, CEIL / 2, z);
    w.rotation.y = ry;
    w.receiveShadow = true;
    scene.add(w);
  }

  // cabinets and counter tops along the walls (decoration, also the arena edge)
  const cabMat = new THREE.MeshStandardMaterial({ color: 0x7aa7a0, roughness: 0.6 });
  const topMat = new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.3, metalness: 0.2 });
  for (let i = 0; i < 4; i++) {
    const long = new THREE.Group();
    const cab = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, 1.7, WALL_DEPTH), cabMat);
    cab.position.y = 0.85;
    const top = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, 0.12, WALL_DEPTH + 0.15), topMat);
    top.position.y = 1.75;
    cab.castShadow = cab.receiveShadow = true;
    long.add(cab, top);
    // door handles
    for (let k = -9; k <= 9; k++) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.06), topMat);
      h.position.set(k * 2.1, 1.1, WALL_DEPTH / 2 + 0.03);
      long.add(h);
    }
    const ang = (i * Math.PI) / 2;
    long.rotation.y = ang;
    long.position.set(Math.sin(ang) * (HALF - WALL_DEPTH / 2), 0, Math.cos(ang) * (HALF - WALL_DEPTH / 2));
    long.rotation.y = ang + Math.PI;
    scene.add(long);
  }

  // obstacle helpers
  const crateMat = new THREE.MeshStandardMaterial({ map: crateTex(), roughness: 0.85 });
  const addCrate = (x, z, w, d, h) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), crateMat);
    m.position.set(x, h / 2, z);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    obstacles.push({ type: 'box', x, z, hw: w / 2, hd: d / 2, h });
  };
  const addCan = (x, z, r, h) => {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, h, 24),
      [new THREE.MeshStandardMaterial({ map: canTex(), roughness: 0.4, metalness: 0.3 }),
       new THREE.MeshStandardMaterial({ color: 0xcfd3d8, roughness: 0.3, metalness: 0.8 }),
       new THREE.MeshStandardMaterial({ color: 0xcfd3d8, roughness: 0.3, metalness: 0.8 })],
    );
    m.position.set(x, h / 2, z);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    obstacles.push({ type: 'cyl', x, z, r, h });
  };
  const addPot = (x, z, r, h) => {
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0xb9bec6, roughness: 0.25, metalness: 0.9 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.95, h, 32), steel);
    body.position.y = h / 2; body.castShadow = body.receiveShadow = true;
    const soup = new THREE.Mesh(new THREE.CircleGeometry(r * 0.92, 32), new THREE.MeshStandardMaterial({ color: 0xe9a23b, emissive: 0x7a3d05, emissiveIntensity: 0.6, roughness: 0.3 }));
    soup.rotation.x = -Math.PI / 2; soup.position.y = h + 0.01;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.07, 8, 32), steel);
    rim.rotation.x = Math.PI / 2; rim.position.y = h;
    g.add(body, soup, rim);
    for (const s of [-1, 1]) {
      const hd = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 0.2), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 }));
      hd.position.set(s * (r + 0.3), h * 0.8, 0);
      g.add(hd);
    }
    g.position.set(x, 0, z);
    scene.add(g);
    obstacles.push({ type: 'cyl', x, z, r, h });
  };

  addPot(0, -2, 2.4, 3.2);
  addCrate(7, 6, 3, 3, 2.4);
  addCrate(-8, 7, 3.4, 2.4, 2.4);
  addCrate(-7, -8, 3, 3, 2.4);
  addCrate(9, -9, 2.6, 4, 2.4);
  addCrate(0, 14, 5, 2, 2.4);
  addCrate(-14, -1, 2, 5, 2.4);
  addCrate(14, 1, 2, 5, 2.4);
  addCan(-4, 5, 1.2, 2.6);
  addCan(4, -9, 1.2, 2.6);
  addCan(15, 12, 1.4, 3);
  addCan(-15, -14, 1.4, 3);
  addCan(-14, 13, 1.2, 2.6);
  addCan(13, -14, 1.2, 2.6);


  // wall decor: chalkboard sign, pan rack and a clock
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 4.2),
    new THREE.MeshStandardMaterial({
      map: canvasTex(512, (g, sz) => {
        g.fillStyle = '#2b3a33'; g.fillRect(0, 0, sz, sz);
        g.strokeStyle = '#8a5a2b'; g.lineWidth = 22; g.strokeRect(0, 0, sz, sz);
        g.fillStyle = '#f4efe1'; g.textAlign = 'center';
        g.font = 'bold 70px Impact, sans-serif'; g.fillText('TODAY’S SPECIAL', sz / 2, 120);
        g.font = 'bold 120px Impact, sans-serif'; g.fillStyle = '#ffd84a'; g.fillText('MASHED', sz / 2, 250);
        g.font = '48px Impact, sans-serif'; g.fillStyle = '#f4efe1'; g.fillText('(you, if you lose)', sz / 2, 330);
        g.strokeStyle = '#f4efe1'; g.lineWidth = 5; g.beginPath(); g.moveTo(90, 380); g.lineTo(sz - 90, 380); g.stroke();
      }),
      roughness: 0.9,
    }),
  );
  sign.position.set(0, 5.2, -HALF + 0.02);
  scene.add(sign);

  const rack = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({ color: 0x2b2b30, roughness: 0.5, metalness: 0.6 });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(9, 0.1, 0.1), iron);
  rack.add(bar);
  for (let i = 0; i < 6; i++) {
    const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.5, 0.12, 20), iron);
    pan.rotation.x = Math.PI / 2; pan.position.set(-3.7 + i * 1.5, -0.95, 0.15);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.9), iron);
    handle.position.set(-3.7 + i * 1.5, -0.4, 0.15); handle.rotation.x = 0;
    handle.rotation.set(Math.PI / 2, 0, 0);
    const link = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5), iron);
    link.position.set(-3.7 + i * 1.5, -0.25, 0.1);
    rack.add(pan, link);
  }
  rack.position.set(HALF - 0.4, 5.6, 0);
  rack.rotation.y = -Math.PI / 2;
  scene.add(rack);

  const clock = new THREE.Mesh(
    new THREE.CircleGeometry(1.1, 32),
    new THREE.MeshStandardMaterial({
      map: canvasTex(256, (g, sz) => {
        g.fillStyle = '#fff6e0'; g.fillRect(0, 0, sz, sz);
        g.strokeStyle = '#2b1a0c'; g.lineWidth = 12; g.beginPath(); g.arc(sz / 2, sz / 2, sz / 2 - 8, 0, 7); g.stroke();
        g.lineWidth = 8;
        for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.beginPath(); g.moveTo(sz / 2 + Math.sin(a) * 96, sz / 2 - Math.cos(a) * 96); g.lineTo(sz / 2 + Math.sin(a) * 114, sz / 2 - Math.cos(a) * 114); g.stroke(); }
        g.lineWidth = 10; g.beginPath(); g.moveTo(sz / 2, sz / 2); g.lineTo(sz / 2 + 50, sz / 2 - 10); g.stroke();
        g.lineWidth = 7; g.beginPath(); g.moveTo(sz / 2, sz / 2); g.lineTo(sz / 2 - 20, sz / 2 - 85); g.stroke();
      }),
      roughness: 0.5,
    }),
  );
  clock.position.set(-HALF + 0.03, 5.4, 6);
  clock.rotation.y = Math.PI / 2;
  scene.add(clock);

  // lighting
  scene.add(new THREE.HemisphereLight(0xfff1d6, 0x6a5a40, 1.35));
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.0);
  sun.position.set(9, 18, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 50 });
  sun.shadow.bias = -0.0006;
  scene.add(sun);

  // hanging lamps
  const shadeMat = new THREE.MeshStandardMaterial({ color: 0xe0392b, roughness: 0.4, metalness: 0.2, side: THREE.DoubleSide });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const [x, z] of [[-10, -10], [10, -10], [-10, 10], [10, 10], [0, 0]]) {
    const g = new THREE.Group();
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.4), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    cord.position.y = 1.2 + 4.6;
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.7, 24, 1, true), shadeMat);
    shade.position.y = 4.6;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), bulbMat);
    bulb.position.y = 4.35;
    g.add(cord, shade, bulb);
    g.position.set(x, 1.0, z);
    scene.add(g);
    const pl = new THREE.PointLight(0xffd9a0, 55, 24, 2);
    pl.position.set(x, 4.9, z);
    scene.add(pl);
    lamps.push(pl);
  }

  scene.background = new THREE.Color(0x2a1d12);
  scene.fog = new THREE.Fog(0x2a1d12, 24, 60);

  return { obstacles, lamps, sun };
}

// Push a circle (position {x,z}, radius r) out of every obstacle and the arena walls.
// Returns true if anything pushed it.
export function resolveCircle(pos, r, obstacles, feetY = 0) {
  let hit = false;
  for (const o of obstacles) {
    if (feetY >= o.h) continue;
    if (o.type === 'box') {
      const cx = Math.max(o.x - o.hw, Math.min(pos.x, o.x + o.hw));
      const cz = Math.max(o.z - o.hd, Math.min(pos.z, o.z + o.hd));
      let dx = pos.x - cx, dz = pos.z - cz;
      let d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        hit = true;
        if (d2 < 1e-8) { // center inside the box: push along the shallowest axis
          const px = o.hw - Math.abs(pos.x - o.x), pz = o.hd - Math.abs(pos.z - o.z);
          if (px < pz) pos.x = o.x + Math.sign(pos.x - o.x || 1) * (o.hw + r);
          else pos.z = o.z + Math.sign(pos.z - o.z || 1) * (o.hd + r);
        } else {
          const d = Math.sqrt(d2);
          pos.x = cx + (dx / d) * r;
          pos.z = cz + (dz / d) * r;
        }
      }
    } else {
      const dx = pos.x - o.x, dz = pos.z - o.z;
      const d = Math.hypot(dx, dz), min = r + o.r;
      if (d < min) {
        hit = true;
        const k = d < 1e-6 ? 0 : 1 / d;
        pos.x = o.x + (d < 1e-6 ? min : dx * k * min);
        pos.z = o.z + (d < 1e-6 ? 0 : dz * k * min);
      }
    }
  }
  const lim = BOUND - r;
  if (pos.x > lim) { pos.x = lim; hit = true; }
  if (pos.x < -lim) { pos.x = -lim; hit = true; }
  if (pos.z > lim) { pos.z = lim; hit = true; }
  if (pos.z < -lim) { pos.z = -lim; hit = true; }
  return hit;
}

// Is a 3D point inside a solid thing (obstacle, wall, floor, ceiling)?
export function pointBlocked(x, y, z, obstacles) {
  if (y < 0 || y > CEIL || Math.abs(x) > BOUND || Math.abs(z) > BOUND) return true;
  for (const o of obstacles) {
    if (y > o.h) continue;
    if (o.type === 'box') {
      if (Math.abs(x - o.x) < o.hw && Math.abs(z - o.z) < o.hd) return true;
    } else if (Math.hypot(x - o.x, z - o.z) < o.r) return true;
  }
  return false;
}

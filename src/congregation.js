// congregation.js — Visible, scaling "the church is growing!" world dressing.
// As membership rises, more ambient parishioners wander the grounds, more cars
// park in the lot, and progressive landscaping (planters, gardens, banners,
// string lights, hedges, balloon arch, golden fountain wreath) appears around
// the property. Think Grow-a-Garden, but for the church campus.
//
// Public API:
//   initCongregation(scene, zones)   — call once after world + growth are ready
//   refreshCongregation()            — call after any addMember()
//   updateCongregation(delta, elap)  — call every frame from main loop

import * as THREE from "three";
import { addFace } from "./face.js";
import { getMemberCount } from "./growth.js";

let scene = null;
let zones = null;

// ---- Ambient wanderers ----
const wanderers = [];         // { group, parts, target, timer, speed, area }
const WANDER_AREAS = [
  // courtyard
  { x: 32, z: -5, rx: 6.5, rz: 7.5 },
  // front walkway / lawn in front of foyer
  { x:  0, z:  9, rx: 6,   rz: 2.5 },
  // path between sanctuary and parking lot
  { x:  0, z: 14, rx: 9,   rz: 1.5 },
  // strip in front of fellowship hall
  { x:-32, z:  2, rx: 8,   rz: 2   },
];

const SHIRT_COLORS = [
  0xFF6B6B, 0x4ECDC4, 0xFFD700, 0xA29BFE, 0x6BCB77, 0xFF9F40,
  0x3CB371, 0xFF7F50, 0x4169E1, 0xBB8FCE, 0xF7DC6F, 0xE74C3C,
  0x20B2AA, 0x9B59B6, 0xE67E22, 0x16A085, 0xC0392B, 0x2980B9,
];
const PANTS_COLORS = [0x1a0a2e, 0x2F2F2F, 0x4B2E2E, 0x2E4057, 0x654321, 0x1B1B2F];
const SKIN_COLORS  = [0xFFCBA4, 0xD4956A, 0xB07A50, 0x6E4A2E];

function pick(arr, i) { return arr[i % arr.length]; }

function makeWanderer(seed) {
  const mat = c => new THREE.MeshToonMaterial({ color: c });
  const shirt = pick(SHIRT_COLORS, seed * 7 + 3);
  const pants = pick(PANTS_COLORS, seed * 5 + 1);
  const skin  = pick(SKIN_COLORS,  seed * 3 + 2);
  const isKid = (seed % 5) === 0;
  const s = isKid ? 0.7 : 1.0;

  const g = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7 * s, 0.9 * s, 0.45 * s), mat(shirt));
  torso.position.y = 1.15 * s;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.6 * s, 0.6 * s, 0.55 * s), mat(skin));
  head.position.y = 1.9 * s;
  addFace(head, { skin });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.3 * s, 0.85 * s, 0.35 * s), mat(pants));
  legL.position.set(-0.2 * s, 0.42 * s, 0);
  const legR = legL.clone(); legR.position.x = 0.2 * s;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.25 * s, 0.8 * s, 0.35 * s), mat(shirt));
  armL.position.set(-0.55 * s, 1.15 * s, 0);
  const armR = armL.clone(); armR.position.x = 0.55 * s;
  [torso, head, legL, legR, armL, armR].forEach(m => { m.castShadow = true; g.add(m); });
  return { group: g, parts: { legL, legR, armL, armR }, scale: s };
}

function spawnWanderer(seed) {
  const area = WANDER_AREAS[seed % WANDER_AREAS.length];
  const w = makeWanderer(seed);
  w.area = area;
  w.target = pickTargetIn(area);
  w.timer  = 2 + Math.random() * 4;
  w.speed  = 0.9 + Math.random() * 0.6;
  w.group.position.set(
    area.x + (Math.random() * 2 - 1) * area.rx * 0.7,
    0,
    area.z + (Math.random() * 2 - 1) * area.rz * 0.7,
  );
  scene.add(w.group);
  wanderers.push(w);
}

function pickTargetIn(area) {
  return new THREE.Vector3(
    area.x + (Math.random() * 2 - 1) * area.rx,
    0,
    area.z + (Math.random() * 2 - 1) * area.rz,
  );
}

function targetWandererCount(members) {
  if (members <= 12) return 3;
  // Grows linearly with membership, capped so the scene stays readable.
  return Math.min(3 + Math.floor((members - 12) / 3), 28);
}

function syncWanderers() {
  const target = targetWandererCount(getMemberCount());
  while (wanderers.length < target) spawnWanderer(wanderers.length);
  // (We never despawn — the church only grows. If membership somehow dropped
  // we'd just leave the extras wandering.)
}

// ---- Decorative parked cars ----
const decoCars = [];
function makeParkedCar(x, z, color, rotY) {
  const mat = c => new THREE.MeshToonMaterial({ color: c });
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.6, 4), mat(color));
  body.position.y = 0.75; body.castShadow = true;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, 2), mat(0x222233));
  cabin.position.set(0, 1.4, -0.3); cabin.castShadow = true;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 1.8), mat(color));
  roof.position.set(0, 1.8, -0.3);
  const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 12);
  const wheelMat = mat(0x111111);
  [[-1.05, 0.4, 1.3], [1.05, 0.4, 1.3], [-1.05, 0.4, -1.3], [1.05, 0.4, -1.3]]
    .forEach(([wx, wy, wz]) => {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, wy, wz);
      g.add(w);
    });
  g.add(body, cabin, roof);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  scene.add(g);
  return g;
}

function syncDecoCars() {
  // Back row of the parking lot (drivable cars use the front row at z=22).
  const slots = [
    { x: -15, color: 0x37474F }, { x: -9, color: 0xBF360C },
    { x:  -3, color: 0x6A1B9A }, { x:  3, color: 0x00897B },
    { x:   9, color: 0x9E9D24 }, { x: 15, color: 0xD81B60 },
  ];
  const target = Math.min(Math.floor((getMemberCount() - 8) / 6), slots.length);
  while (decoCars.length < target) {
    const s = slots[decoCars.length];
    decoCars.push(makeParkedCar(s.x, 34, s.color, 0)); // facing north (out of lot)
  }
}

// ---- Landscaping milestones (additive — once placed, they stay forever) ----
const placedMilestones = new Set();

function flowerCluster(x, z, colors = [0xFF1493, 0xFFD700, 0xFF69B4, 0xFF6347]) {
  // A small bushy mound topped with bright "flower" dots.
  const g = new THREE.Group();
  const bush = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 8, 6),
    new THREE.MeshToonMaterial({ color: 0x2E8B57 })
  );
  bush.position.y = 0.4; bush.castShadow = true;
  g.add(bush);
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    const r = 0.3 + Math.random() * 0.15;
    const flower = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 6, 5),
      new THREE.MeshToonMaterial({ color: colors[i % colors.length] })
    );
    flower.position.set(Math.cos(ang) * r, 0.55 + Math.random() * 0.2, Math.sin(ang) * r);
    g.add(flower);
  }
  g.position.set(x, 0, z);
  scene.add(g);
  return g;
}

function planter(x, z, flowerColor = 0xFF69B4) {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.35, 0.5, 10),
    new THREE.MeshToonMaterial({ color: 0x8B5A2B })
  );
  pot.position.y = 0.25; pot.castShadow = true;
  g.add(pot);
  const soil = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.42, 0.05, 10),
    new THREE.MeshToonMaterial({ color: 0x3E2723 })
  );
  soil.position.y = 0.5;
  g.add(soil);
  // A small flower bouquet
  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2;
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.5, 5),
      new THREE.MeshToonMaterial({ color: 0x2E8B57 })
    );
    stem.position.set(Math.cos(ang) * 0.18, 0.75, Math.sin(ang) * 0.18);
    g.add(stem);
    const bloom = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 6, 5),
      new THREE.MeshToonMaterial({ color: flowerColor })
    );
    bloom.position.set(Math.cos(ang) * 0.18, 1.05, Math.sin(ang) * 0.18);
    g.add(bloom);
  }
  g.position.set(x, 0, z);
  scene.add(g);
  return g;
}

function welcomeBanner(x, z, text = "WELCOME!") {
  // A canvas-textured banner stretched across two poles.
  const canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 512, 0);
  grad.addColorStop(0, "#7C3AED"); grad.addColorStop(1, "#FFD700");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = "#fff"; ctx.font = "bold 64px sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 64);
  const tex = new THREE.CanvasTexture(canvas);
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 1.4),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })
  );
  banner.position.set(x, 4.5, z);
  scene.add(banner);
  // Flanking poles
  const poleMat = new THREE.MeshToonMaterial({ color: 0x4A2070 });
  [-3, 3].forEach(dx => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 5.5, 8), poleMat);
    pole.position.set(x + dx, 2.75, z);
    scene.add(pole);
  });
}

function gardenBed(cx, cz, w, d) {
  const bed = new THREE.Mesh(
    new THREE.BoxGeometry(w, 0.25, d),
    new THREE.MeshToonMaterial({ color: 0x3E2723 })
  );
  bed.position.set(cx, 0.13, cz);
  scene.add(bed);
  // Fill with random flower clusters
  const cols = [0xFF1493, 0xFFD700, 0xFF69B4, 0xFF6347, 0x9B59B6, 0xE74C3C, 0xF39C12];
  const cnt = Math.floor((w * d) / 1.2);
  for (let i = 0; i < cnt; i++) {
    const x = cx + (Math.random() - 0.5) * (w - 0.3);
    const z = cz + (Math.random() - 0.5) * (d - 0.3);
    flowerCluster(x, z, [cols[(i * 3) % cols.length], cols[(i * 5) % cols.length],
                         cols[(i * 7) % cols.length]]);
  }
}

function stringLights(points, color = 0xFFD58A) {
  // Connect a sequence of [x,y,z] anchor points with a sagging "wire" and dot
  // each anchor with a small glowing bulb.
  const wireMat = new THREE.LineBasicMaterial({ color: 0x222222 });
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const segs = 12;
    const geo = new THREE.BufferGeometry();
    const verts = [];
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const sag = Math.sin(t * Math.PI) * 0.4;
      verts.push(
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t - sag,
        a[2] + (b[2] - a[2]) * t,
      );
    }
    geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    scene.add(new THREE.Line(geo, wireMat));
    // Bulbs along the wire
    for (let s = 1; s < segs; s += 2) {
      const t = s / segs;
      const sag = Math.sin(t * Math.PI) * 0.4;
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 6, 5),
        new THREE.MeshBasicMaterial({ color })
      );
      bulb.position.set(
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t - sag,
        a[2] + (b[2] - a[2]) * t,
      );
      scene.add(bulb);
    }
  }
  // Anchor poles at each point
  points.forEach(p => {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, p[1] + 0.3, 8),
      new THREE.MeshToonMaterial({ color: 0x3D2A1A })
    );
    pole.position.set(p[0], (p[1] + 0.3) / 2, p[2]);
    scene.add(pole);
  });
}

function hedge(x, z, length, axis = "x") {
  const w = axis === "x" ? length : 0.6;
  const d = axis === "x" ? 0.6 : length;
  const h = new THREE.Mesh(
    new THREE.BoxGeometry(w, 0.7, d),
    new THREE.MeshToonMaterial({ color: 0x2E7D32 })
  );
  h.position.set(x, 0.35, z); h.castShadow = true;
  scene.add(h);
}

function balloonArch(cx, cz) {
  const COLORS = [0xFF4757, 0xFFA502, 0xFFD700, 0x2ED573, 0x1E90FF, 0x9B59B6];
  // Two anchor poles
  for (const dx of [-3, 3]) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 4, 8),
      new THREE.MeshToonMaterial({ color: 0xCCCCCC })
    );
    pole.position.set(cx + dx, 2, cz); scene.add(pole);
  }
  // Arch of balloons
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = cx + (t * 2 - 1) * 3;
    const y = 4 + Math.sin(t * Math.PI) * 1.4;
    const balloon = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 10, 8),
      new THREE.MeshToonMaterial({ color: COLORS[i % COLORS.length] })
    );
    balloon.position.set(x, y, cz);
    scene.add(balloon);
  }
}

function goldenFountainWreath(cx, cz) {
  // Ring of golden flowers + a warm point light around the fountain.
  const N = 18;
  for (let i = 0; i < N; i++) {
    const ang = (i / N) * Math.PI * 2;
    const r = 3.6;
    const x = cx + Math.cos(ang) * r;
    const z = cz + Math.sin(ang) * r;
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.6, 5),
      new THREE.MeshToonMaterial({ color: 0x2E8B57 })
    );
    stem.position.set(x, 0.3, z); scene.add(stem);
    const bloom = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 6),
      new THREE.MeshToonMaterial({ color: i % 2 ? 0xFFD700 : 0xFFF6A0 })
    );
    bloom.position.set(x, 0.7, z); scene.add(bloom);
  }
  const glow = new THREE.PointLight(0xFFD700, 1.2, 10);
  glow.position.set(cx, 2.5, cz);
  scene.add(glow);
}

// Each milestone definition is keyed by member count and runs once.
const MILESTONES = [
  { id: "planters_15", at: 15, build: () => {
      // Four corner planters in the courtyard
      planter(25.5, -12.5, 0xFF69B4);
      planter(38.5, -12.5, 0xFFD700);
      planter(25.5,   2.5, 0xFF6347);
      planter(38.5,   2.5, 0x9B59B6);
  }},
  { id: "front_garden_20", at: 20, build: () => {
      // Small flower bed flanking the foyer entrance
      gardenBed(-4, 12.8, 4, 1.2);
      gardenBed( 4, 12.8, 4, 1.2);
  }},
  { id: "welcome_banner_30", at: 30, build: () => {
      welcomeBanner(0, 12.5, "WELCOME!");
  }},
  { id: "courtyard_lights_40", at: 40, build: () => {
      // Diamond of string lights around the courtyard fountain
      stringLights([
        [25, 3.5, -13], [39, 3.5, -13],
        [39, 3.5,   3], [25, 3.5,   3],
        [25, 3.5, -13],
      ], 0xFFD58A);
  }},
  { id: "walkway_planters_50", at: 50, build: () => {
      // Planter rows along the front walkway
      for (let z = -1; z <= 9; z += 2.5) {
        planter(-3.2, z, 0xFFD700);
        planter( 3.2, z, 0xFF69B4);
      }
  }},
  { id: "hedges_60", at: 60, build: () => {
      // Manicured hedges along front of the church
      hedge(-7, 12.0, 4, "x");
      hedge( 7, 12.0, 4, "x");
      // And a row in front of the fellowship hall
      hedge(-32, 1.2, 14, "x");
  }},
  { id: "big_garden_75", at: 75, build: () => {
      // A large showcase garden in the front lawn
      gardenBed(-15, 8, 6, 4);
      gardenBed( 15, 8, 6, 4);
  }},
  { id: "balloon_arch_85", at: 85, build: () => {
      balloonArch(32, 2.5);   // at the courtyard entrance
  }},
  { id: "golden_wreath_100", at: 100, build: () => {
      goldenFountainWreath(32, -5);
  }},
];

function syncMilestones() {
  const count = getMemberCount();
  MILESTONES.forEach(m => {
    if (count >= m.at && !placedMilestones.has(m.id)) {
      placedMilestones.add(m.id);
      try { m.build(); } catch (e) { console.warn("Congregation milestone failed:", m.id, e); }
    }
  });
}

// ---- Public API ----
export function initCongregation(_scene, _zones) {
  scene = _scene;
  zones = _zones;
  syncMilestones();
  syncDecoCars();
  syncWanderers();
}

export function refreshCongregation() {
  if (!scene) return;
  syncMilestones();
  syncDecoCars();
  syncWanderers();
}

export function updateCongregation(delta, elapsed) {
  if (!scene || wanderers.length === 0) return;
  wanderers.forEach((w, idx) => {
    // Pick a new target periodically or once we've arrived
    w.timer -= delta;
    if (!w.target || w.timer <= 0 ||
        w.group.position.distanceTo(w.target) < 0.4) {
      w.target = pickTargetIn(w.area);
      w.timer = 3 + Math.random() * 5;
    }
    const dir = w.target.clone().sub(w.group.position);
    dir.y = 0;
    const dist = dir.length();
    if (dist > 0.01) {
      dir.normalize();
      w.group.position.x += dir.x * w.speed * delta;
      w.group.position.z += dir.z * w.speed * delta;
      // Face direction of travel. addFace places the face on the head's -Z
      // side, so the wanderer's "forward" is local -Z. atan2(-dx, -dz) gives
      // the Y rotation that aims local -Z at the target.
      w.group.rotation.y = Math.atan2(-dir.x, -dir.z);
      // Walk cycle
      const t = elapsed * 5 + idx;
      const swing = 0.5;
      w.parts.legL.rotation.x =  Math.sin(t) * swing;
      w.parts.legR.rotation.x = -Math.sin(t) * swing;
      w.parts.armL.rotation.x = -Math.sin(t) * swing * 0.7;
      w.parts.armR.rotation.x =  Math.sin(t) * swing * 0.7;
    }
    // Idle bob
    w.group.position.y = Math.sin(elapsed * 1.5 + idx) * 0.04;
  });
}

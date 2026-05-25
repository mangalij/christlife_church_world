// Seeds of Faith Garden — an interactive garden where the player must
// prepare soil, plant a seed, fetch water from the well, and tend the
// plant by watering it multiple times.  The more you water, the more
// you'll see it grow.  Each fully-mature seed type displays a unique
// bloom (cross-topped wheat for Faith, heart for Love, sunflower for
// Hope, daisy cluster for Joy, lily + dove for Peace).
//
// Lifecycle (state machine driven by player actions, NOT real time):
//   empty   → till soil (E on empty)            → tilled
//   tilled  → choose seed in modal (5 XP)       → planted   (waterings=0)
//   planted → water once (E with bucket charge) → sprouting (waterings≥1)
//   sprouting → water 2 more times              → growing   (waterings≥3)
//   growing → water 3 more times                → mature    (waterings≥6)
//   mature  → harvest (E on mature)             → empty
//
// Water comes from the well in the back corner.  Walk up to the well
// and press E to fill the bucket (3 charges).  Each watering consumes
// one charge.  A bucket HUD is shown while the player is inside the
// garden so they can see their charges at a glance.

import * as THREE from "three";
import { showToast, openMinigameModal } from "./ui.js";
import { addXP, spendXP, getXP, addMember } from "./growth.js";
import { playAction, isActing } from "./actions.js";
import { requestInteractButton } from "./player.js";

// ---- Configuration -------------------------------------------------
const GARDEN_CX = -55;
const GARDEN_CZ = -10;
const PLOT_COUNT = 6;
const PLOT_SPACING_X = 2.4;
const PLOT_SPACING_Z = 2.4;
const PLOT_GRID_COLS = 3;
const INTERACT_RANGE = 2.2;
const WELL_RANGE = 2.4;
const SEED_COST = 5;
const HARVEST_XP = 30;
const HARVEST_MEMBER_EVERY = 3;
const STORAGE_KEY = "clw_garden";
const HARVEST_COUNT_KEY = "clw_garden_harvests";
const BUCKET_KEY = "clw_garden_bucket";
const BUCKET_CAPACITY = 3;

// Watering thresholds (number of waterings since planting)
const WATER_SPROUT  = 1;
const WATER_GROWING = 3;
const WATER_MATURE  = 6;

// Well position (set during scenery build)
const WELL_X = GARDEN_CX + 4;
const WELL_Z = GARDEN_CZ - 3;

// Garden bounds (for showing the bucket HUD only when near the garden)
const GARDEN_HALF_X = 6;
const GARDEN_HALF_Z = 5;

// Fruit-of-the-Spirit seeds available to plant
const SEED_TYPES = {
  faith: { name: "Faith", emoji: "✝️", bloom: 0xFFD700, verse: "Now faith is the substance of things hoped for. — Heb 11:1" },
  love:  { name: "Love",  emoji: "❤️", bloom: 0xE94F37, verse: "Love your neighbor as yourself. — Mark 12:31" },
  hope:  { name: "Hope",  emoji: "🌅", bloom: 0xFF8C42, verse: "Hope does not put us to shame. — Rom 5:5" },
  joy:   { name: "Joy",   emoji: "😊", bloom: 0xFFC93C, verse: "The joy of the Lord is your strength. — Neh 8:10" },
  peace: { name: "Peace", emoji: "🕊️", bloom: 0xA0E7E5, verse: "Peace I leave with you. — John 14:27" },
};
const SEED_KEYS = Object.keys(SEED_TYPES);

// ---- Module state --------------------------------------------------
let _scene = null;
let _player = null;
let _plots = [];               // [{ pos, group, parts, type, stage, waterings }]
let _promptDiv = null;
let _bucketHud = null;
let _modalOpen = false;
let _bucket = 0;               // current water charges in player's bucket
let _bucketMesh = null;        // 3D bucket attached to the player when carrying water
let _bucketWater = null;       // water surface inside the bucket (scaled by charge level)

// ---- Persistence ---------------------------------------------------
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveState() {
  const data = _plots.map(p => ({
    type: p.type,
    stage: p.stage,
    waterings: p.waterings,
  }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadBucket() {
  const v = parseInt(localStorage.getItem(BUCKET_KEY) || "0");
  _bucket = Math.max(0, Math.min(BUCKET_CAPACITY, isNaN(v) ? 0 : v));
}
function saveBucket() {
  localStorage.setItem(BUCKET_KEY, String(_bucket));
}

function getHarvestCount() {
  return parseInt(localStorage.getItem(HARVEST_COUNT_KEY) || "0");
}
function bumpHarvestCount() {
  const next = getHarvestCount() + 1;
  localStorage.setItem(HARVEST_COUNT_KEY, next);
  return next;
}

// ---- Stage helpers -------------------------------------------------
// Stage is now explicitly stored on the plot. Helper recomputes the
// visual stage from waterings so a freshly-watered plot updates without
// the caller having to set both fields.
function deriveStage(plot) {
  if (plot.stage === "empty" || plot.stage === "tilled") return plot.stage;
  if (!plot.type) return "empty";
  const w = plot.waterings || 0;
  if (w >= WATER_MATURE)  return "mature";
  if (w >= WATER_GROWING) return "growing";
  if (w >= WATER_SPROUT)  return "sprout";
  return "seed";
}

// ---- Generic mesh helpers -----------------------------------------
function box(w, h, d, color, x, y, z) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshToonMaterial({ color })
  );
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cyl(rTop, rBot, h, color) {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(rTop, rBot, h, 8),
    new THREE.MeshToonMaterial({ color })
  );
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function sph(r, color, segs = 8) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(r, segs, Math.max(6, Math.floor(segs * 0.75))),
    new THREE.MeshToonMaterial({ color })
  );
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// ---- Unique mature blooms per seed type ---------------------------
function buildFaithBloom() {
  // Tall golden wheat with a small cross at the top
  const g = new THREE.Group();
  const stem = cyl(0.07, 0.09, 1.5, 0xB8860B); stem.position.y = 1.0; g.add(stem);
  // wheat kernels along the upper stem
  for (let i = 0; i < 5; i++) {
    const k = sph(0.08, 0xDAA520);
    k.scale.set(0.7, 1.3, 0.7);
    k.position.set(0, 1.4 + i * 0.13, 0);
    g.add(k);
  }
  // golden cross on top
  const vert = box(0.1, 0.5, 0.1, 0xFFD700, 0, 2.1, 0);
  const horiz = box(0.4, 0.1, 0.1, 0xFFD700, 0, 2.25, 0);
  g.add(vert, horiz);
  return g;
}

function buildLoveBloom() {
  // Heart-shaped bloom on a slender stem
  const g = new THREE.Group();
  const stem = cyl(0.07, 0.09, 1.2, 0x3F8A4F); stem.position.y = 0.85; g.add(stem);
  const lobeL = sph(0.25, 0xE94F37, 12); lobeL.position.set(-0.17, 1.7, 0); g.add(lobeL);
  const lobeR = sph(0.25, 0xE94F37, 12); lobeR.position.set(0.17, 1.7, 0); g.add(lobeR);
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.32, 0.55, 8),
    new THREE.MeshToonMaterial({ color: 0xE94F37 })
  );
  tip.position.set(0, 1.4, 0);
  tip.rotation.x = Math.PI;
  tip.castShadow = true;
  g.add(tip);
  // small leaf
  const leaf = sph(0.18, 0x4FB85A); leaf.position.set(-0.25, 1.05, 0); leaf.scale.set(1, 0.35, 0.6); g.add(leaf);
  return g;
}

function buildHopeBloom() {
  // Sunflower — big bloom with petal ring around a dark brown center
  const g = new THREE.Group();
  const stem = cyl(0.1, 0.12, 1.6, 0x2E6B33); stem.position.y = 1.05; g.add(stem);
  const center = sph(0.3, 0x6B3410, 14); center.position.y = 2.0; g.add(center);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const petal = sph(0.18, 0xFF8C42);
    petal.position.set(Math.cos(a) * 0.42, 2.0, Math.sin(a) * 0.42);
    petal.scale.set(1.2, 0.35, 0.5);
    petal.lookAt(0, 2.0, 0);
    g.add(petal);
  }
  // large droopy leaves
  for (const sx of [-1, 1]) {
    const leaf = sph(0.28, 0x4FB85A); leaf.position.set(sx * 0.3, 1.25, 0); leaf.scale.set(1.3, 0.4, 0.7); g.add(leaf);
  }
  return g;
}

function buildJoyBloom() {
  // Cluster of bright daisies
  const g = new THREE.Group();
  const stem = cyl(0.07, 0.09, 1.1, 0x4FB85A); stem.position.y = 0.8; g.add(stem);
  const positions = [[0, 1.7, 0], [-0.28, 1.5, 0.12], [0.26, 1.55, -0.1], [0.05, 1.9, 0.18], [-0.18, 1.78, -0.2]];
  for (const [x, y, z] of positions) {
    const c = sph(0.09, 0xFFD700); c.position.set(x, y, z); g.add(c);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const petal = sph(0.1, 0xFFFFFF);
      petal.position.set(x + Math.cos(a) * 0.13, y, z + Math.sin(a) * 0.13);
      petal.scale.set(0.9, 0.3, 0.55);
      g.add(petal);
    }
  }
  return g;
}

function buildPeaceBloom() {
  // Elegant white lily with a tiny dove perched on top
  const g = new THREE.Group();
  const stem = cyl(0.07, 0.09, 1.4, 0x3F8A4F); stem.position.y = 0.95; g.add(stem);
  // lily trumpet (open cone, pointing up)
  const trumpetGeo = new THREE.ConeGeometry(0.35, 0.55, 8, 1, true);
  const trumpet = new THREE.Mesh(trumpetGeo, new THREE.MeshToonMaterial({ color: 0xFFFFFF, side: THREE.DoubleSide }));
  trumpet.position.set(0, 1.85, 0);
  trumpet.rotation.x = Math.PI;
  trumpet.castShadow = true;
  g.add(trumpet);
  // pistil
  const pistil = cyl(0.04, 0.04, 0.25, 0xFFC93C); pistil.position.set(0, 1.85, 0); g.add(pistil);
  // dove
  const body = sph(0.18, 0xFFFFFF); body.position.set(0, 2.3, 0); body.scale.set(1.2, 0.9, 0.8); g.add(body);
  const head = sph(0.1, 0xFFFFFF); head.position.set(0.15, 2.42, 0); g.add(head);
  const wingL = sph(0.15, 0xF0F0F0); wingL.position.set(-0.05, 2.38, 0.15); wingL.scale.set(0.6, 0.3, 1.0); g.add(wingL);
  const wingR = sph(0.15, 0xF0F0F0); wingR.position.set(-0.05, 2.38, -0.15); wingR.scale.set(0.6, 0.3, 1.0); g.add(wingR);
  return g;
}

const BLOOM_BUILDERS = {
  faith: buildFaithBloom,
  love:  buildLoveBloom,
  hope:  buildHopeBloom,
  joy:   buildJoyBloom,
  peace: buildPeaceBloom,
};

// ---- Plot visuals --------------------------------------------------
function buildPlotVisual() {
  const group = new THREE.Group();

  // Raised dirt bed (top is the soil surface)
  const bed = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.4, 1.6),
    new THREE.MeshToonMaterial({ color: 0x5C3A1E })
  );
  bed.position.y = 0.2;
  bed.castShadow = true; bed.receiveShadow = true;
  group.add(bed);

  // Wooden bed frame
  for (const [w, d, x, z] of [[1.7, 0.15, 0, 0.8], [1.7, 0.15, 0, -0.8], [0.15, 1.7, 0.8, 0], [0.15, 1.7, -0.8, 0]]) {
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.42, d),
      new THREE.MeshToonMaterial({ color: 0x6B3410 })
    );
    plank.position.set(x, 0.21, z);
    plank.castShadow = true; plank.receiveShadow = true;
    group.add(plank);
  }

  // Tilled-soil overlay: 3 darker furrow strips on top of the bed
  const tilledGroup = new THREE.Group();
  for (let i = -1; i <= 1; i++) {
    const furrow = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.05, 0.25),
      new THREE.MeshToonMaterial({ color: 0x3A2410 })
    );
    furrow.position.set(0, 0.42, i * 0.45);
    furrow.receiveShadow = true;
    tilledGroup.add(furrow);
  }
  group.add(tilledGroup);

  // "Seed planted" mound
  const seedMound = sph(0.18, 0x3A2410, 8);
  seedMound.position.y = 0.45;

  // Sprout (small green spike)
  const sprout = new THREE.Mesh(
    new THREE.ConeGeometry(0.12, 0.5, 6),
    new THREE.MeshToonMaterial({ color: 0x6BCB77 })
  );
  sprout.position.y = 0.65;
  sprout.castShadow = true;

  // Growing (stem + leaves, no flower yet) — generic for all seed types
  const growStem = cyl(0.07, 0.09, 1.0, 0x3F8A4F); growStem.position.y = 0.9;
  const growLeafL = sph(0.22, 0x4FB85A); growLeafL.position.set(-0.18, 0.95, 0); growLeafL.scale.set(1, 0.4, 0.7);
  const growLeafR = sph(0.22, 0x4FB85A); growLeafR.position.set(0.18, 1.1, 0); growLeafR.scale.set(1, 0.4, 0.7);
  const growingGroup = new THREE.Group();
  growingGroup.add(growStem, growLeafL, growLeafR);

  // Container for the mature bloom (built/swapped when needed)
  const matureSlot = new THREE.Group();

  // "Watered" sparkle — a faint blue tint disc that appears briefly
  // after watering.  Stored so updateGarden can fade it out.
  const wetDisc = new THREE.Mesh(
    new THREE.CircleGeometry(0.7, 16),
    new THREE.MeshBasicMaterial({ color: 0x4A90E2, transparent: true, opacity: 0 })
  );
  wetDisc.rotation.x = -Math.PI / 2;
  wetDisc.position.y = 0.43;

  group.add(seedMound, sprout, growingGroup, matureSlot, wetDisc);

  return {
    group,
    parts: {
      bed,
      tilled: tilledGroup,
      seedMound,
      sprout,
      growing: growingGroup,
      matureSlot,
      wetDisc,
      _matureBuilt: null, // remember which type the current mature bloom was built for
    },
  };
}

function applyStageVisual(plot) {
  const s = deriveStage(plot);
  plot.stage = s; // keep state in sync with derived stage
  const p = plot.parts;
  // Tilled furrows show on tilled and onwards
  p.tilled.visible = (s !== "empty");
  p.seedMound.visible = (s === "seed");
  p.sprout.visible    = (s === "sprout");
  p.growing.visible   = (s === "growing");

  // Mature: build (or swap) the unique bloom for this seed type
  if (s === "mature" && plot.type) {
    if (p._matureBuilt !== plot.type) {
      // Rebuild the slot with the correct bloom
      while (p.matureSlot.children.length) p.matureSlot.remove(p.matureSlot.children[0]);
      const builder = BLOOM_BUILDERS[plot.type] || buildFaithBloom;
      p.matureSlot.add(builder());
      p._matureBuilt = plot.type;
    }
    p.matureSlot.visible = true;
  } else {
    p.matureSlot.visible = false;
  }

  // Darken bed slightly when seeded/growing to suggest moist soil
  const moist = (s === "seed" || s === "sprout" || s === "growing");
  p.bed.material.color.setHex(moist ? 0x4A2D15 : 0x5C3A1E);
}

// ---- Scenery -------------------------------------------------------
function buildScenery() {
  const root = new THREE.Group();

  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(11, 8),
    new THREE.MeshLambertMaterial({ color: 0x7BC96F })
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(GARDEN_CX, 0.03, GARDEN_CZ);
  grass.receiveShadow = true;
  root.add(grass);

  // Picket fence
  const fenceMat = new THREE.MeshToonMaterial({ color: 0xF5EFE0 });
  const railMat  = new THREE.MeshToonMaterial({ color: 0xE8DCC0 });
  function picket(x, z) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), fenceMat);
    post.position.set(x, 0.45, z);
    post.castShadow = true; post.receiveShadow = true;
    return post;
  }
  for (let i = -5; i <= 5; i++) {
    root.add(picket(GARDEN_CX + i, GARDEN_CZ - 4));
    root.add(picket(GARDEN_CX + i, GARDEN_CZ + 4));
  }
  for (let i = -3; i <= 3; i++) {
    root.add(picket(GARDEN_CX - 5, GARDEN_CZ + i));
    root.add(picket(GARDEN_CX + 5, GARDEN_CZ + i));
  }
  for (const z of [GARDEN_CZ - 4, GARDEN_CZ + 4]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.1, 0.08), railMat);
    rail.position.set(GARDEN_CX, 0.8, z);
    root.add(rail);
  }
  for (const x of [GARDEN_CX - 5, GARDEN_CX + 5]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 8.2), railMat);
    rail.position.set(x, 0.8, GARDEN_CZ);
    root.add(rail);
  }

  // Well — the source of water
  const well = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.7, 0.8, 12),
    new THREE.MeshToonMaterial({ color: 0x808080 })
  );
  well.position.set(WELL_X, 0.4, WELL_Z);
  well.castShadow = true;
  root.add(well);
  const wellWater = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 16),
    new THREE.MeshBasicMaterial({ color: 0x4A90E2 })
  );
  wellWater.rotation.x = -Math.PI / 2;
  wellWater.position.set(WELL_X, 0.81, WELL_Z);
  root.add(wellWater);
  for (const dx of [-0.7, 0.7]) {
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 1.4, 0.1),
      new THREE.MeshToonMaterial({ color: 0x6B3410 })
    );
    post.position.set(WELL_X + dx, 1.5, WELL_Z);
    root.add(post);
  }
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(1.1, 0.7, 4),
    new THREE.MeshToonMaterial({ color: 0x8B4513 })
  );
  roof.rotation.y = Math.PI / 4;
  roof.position.set(WELL_X, 2.5, WELL_Z);
  root.add(roof);

  // Wooden cross in the opposite back corner
  root.add(box(0.12, 1.6, 0.12, 0x6B3410, GARDEN_CX - 4, 0, GARDEN_CZ - 3));
  root.add(box(0.7, 0.12, 0.12, 0x6B3410, GARDEN_CX - 4, 1.05, GARDEN_CZ - 3));

  // Floating sign
  const canvas = document.createElement("canvas");
  canvas.width = 320; canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(20, 60, 25, 0.9)"; ctx.fillRect(0, 0, 320, 64);
  ctx.fillStyle = "#FFD700"; ctx.font = "bold 24px Arial";
  ctx.fillText("🌱 Seeds of Faith Garden", 12, 42);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvas), transparent: true,
  }));
  sprite.position.set(GARDEN_CX, 3.6, GARDEN_CZ + 4);
  sprite.scale.set(5.6, 1.1, 1);
  root.add(sprite);

  return root;
}

// ---- Plot positions ------------------------------------------------
function plotPosition(i) {
  const col = i % PLOT_GRID_COLS;
  const row = Math.floor(i / PLOT_GRID_COLS);
  const x = GARDEN_CX + (col - (PLOT_GRID_COLS - 1) / 2) * PLOT_SPACING_X;
  const z = GARDEN_CZ + (row - 0.5) * PLOT_SPACING_Z;
  return new THREE.Vector3(x, 0, z);
}

// ---- Proximity helpers --------------------------------------------
function nearestPlotIndex() {
  if (!_player) return -1;
  const pos = _player.group.position;
  let best = -1, bestD2 = INTERACT_RANGE * INTERACT_RANGE;
  for (let i = 0; i < _plots.length; i++) {
    const p = _plots[i].pos;
    const dx = p.x - pos.x, dz = p.z - pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) { bestD2 = d2; best = i; }
  }
  return best;
}

function nearWell() {
  if (!_player) return false;
  const pos = _player.group.position;
  const dx = pos.x - WELL_X, dz = pos.z - WELL_Z;
  return dx * dx + dz * dz < WELL_RANGE * WELL_RANGE;
}

function insideGarden() {
  if (!_player) return false;
  const pos = _player.group.position;
  return Math.abs(pos.x - GARDEN_CX) < GARDEN_HALF_X
      && Math.abs(pos.z - GARDEN_CZ) < GARDEN_HALF_Z;
}

// ---- HUD: prompt + bucket -----------------------------------------
function ensurePrompt() {
  if (_promptDiv) return _promptDiv;
  const div = document.createElement("div");
  div.id = "garden-prompt";
  div.style.cssText =
    "position:fixed;left:50%;bottom:200px;transform:translateX(-50%);" +
    "background:rgba(20,60,25,0.92);color:#FFD700;padding:8px 16px;border-radius:8px;" +
    "font-family:'Fredoka One',cursive;font-size:15px;pointer-events:none;display:none;" +
    "z-index:50;border:1px solid #FFD700;";
  document.body.appendChild(div);
  _promptDiv = div;
  return div;
}

function ensureBucketHud() {
  if (_bucketHud) return _bucketHud;
  const div = document.createElement("div");
  div.id = "garden-bucket-hud";
  div.style.cssText =
    "position:fixed;left:12px;top:120px;background:rgba(20,60,25,0.88);" +
    "color:#A0E7E5;padding:6px 12px;border-radius:8px;border:1px solid #4A90E2;" +
    "font-family:'Fredoka One',cursive;font-size:14px;display:none;z-index:50;" +
    "pointer-events:none;";
  document.body.appendChild(div);
  _bucketHud = div;
  return div;
}

function refreshBucketHud() {
  const hud = ensureBucketHud();
  if (!insideGarden()) { hud.style.display = "none"; return; }
  hud.style.display = "block";
  const drops = "💧".repeat(_bucket) + "▫️".repeat(BUCKET_CAPACITY - _bucket);
  hud.textContent = `🪣 ${drops}  (${_bucket}/${BUCKET_CAPACITY})`;
}

// ---- Held bucket (attached to the player) -------------------------
function buildHeldBucket() {
  const g = new THREE.Group();
  // Tapered bucket body (wider at top)
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.10, 0.22, 12, 1, true),
    new THREE.MeshToonMaterial({ color: 0x9C7A4A, side: THREE.DoubleSide })
  );
  body.castShadow = true;
  g.add(body);
  // Bottom disc
  const bottom = new THREE.Mesh(
    new THREE.CircleGeometry(0.10, 12),
    new THREE.MeshToonMaterial({ color: 0x6B5230 })
  );
  bottom.rotation.x = -Math.PI / 2;
  bottom.position.y = -0.11;
  g.add(bottom);
  // Two metal hoops
  for (const y of [-0.06, 0.08]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.13, 0.012, 6, 16),
      new THREE.MeshToonMaterial({ color: 0x555555 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    g.add(ring);
  }
  // Handle (semi-circle arch above)
  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.13, 0.012, 6, 12, Math.PI),
    new THREE.MeshToonMaterial({ color: 0x444444 })
  );
  handle.position.y = 0.11;
  handle.rotation.x = Math.PI / 2;
  g.add(handle);
  // Water surface inside (scaled vertically based on charge level)
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(0.115, 0.095, 0.18, 12),
    new THREE.MeshToonMaterial({ color: 0x4A90E2 })
  );
  water.position.y = -0.02;
  g.add(water);
  _bucketWater = water;
  return g;
}

function attachBucketToPlayer() {
  if (!_player || !_player.group || _bucketMesh) return;
  _bucketMesh = buildHeldBucket();
  // Right hip (Bible is at the left hip at x = -0.55)
  _bucketMesh.position.set(0.55, 0.95, 0.05);
  _bucketMesh.visible = false;
  _player.group.add(_bucketMesh);
}

function refreshHeldBucket() {
  if (!_bucketMesh) return;
  if (_bucket <= 0) {
    _bucketMesh.visible = false;
    return;
  }
  _bucketMesh.visible = true;
  // Scale water height by fill ratio (0..1 of inner volume)
  if (_bucketWater) {
    const ratio = _bucket / BUCKET_CAPACITY;
    _bucketWater.scale.y = Math.max(0.05, ratio);
    // Keep top of water flush with the rim regardless of scale
    // Geometry centred at y=-0.02 with height 0.18 → rim at y=0.07
    _bucketWater.position.y = 0.07 - (0.18 * ratio) / 2;
  }
}

// ---- Modal UI ------------------------------------------------------
function renderPlotModal(idx) {
  const plot = _plots[idx];
  const stage = deriveStage(plot);
  let body = "";

  if (stage === "empty") {
    body = `
      <h2 style="margin:0 0 8px 0;color:#FFD700;">🟫 Untended Plot</h2>
      <p style="margin:0 0 12px 0;color:#fff;">The soil is hard and overgrown. Prepare it before you can plant anything.</p>
      <button id="garden-till-btn" style="padding:12px 24px;background:#FFD700;color:#2E0854;
        border:none;border-radius:8px;cursor:pointer;font-family:inherit;font-size:16px;font-weight:bold;">
        🪓 Till Soil
      </button>
    `;
  } else if (stage === "tilled") {
    const xp = getXP();
    const cantAfford = xp < SEED_COST;
    body = `
      <h2 style="margin:0 0 8px 0;color:#FFD700;">🌱 Tilled Plot</h2>
      <p style="margin:0 0 12px 0;color:#fff;">The soil is ready. Choose a fruit-of-the-Spirit seed to plant.</p>
      <p style="margin:0 0 12px 0;color:#A0E7E5;font-size:13px;">
        Cost: ${SEED_COST} XP &nbsp;•&nbsp; You have: ${xp} XP
      </p>
      <div id="garden-seed-picker" style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;">
        ${SEED_KEYS.map(key => {
          const s = SEED_TYPES[key];
          return `<button data-seed="${key}" ${cantAfford ? "disabled" : ""}
            style="padding:10px 14px;background:#2E0854;color:#FFD700;border:2px solid #FFD700;
            border-radius:8px;cursor:${cantAfford ? "not-allowed" : "pointer"};
            opacity:${cantAfford ? "0.5" : "1"};font-family:inherit;font-size:14px;min-width:90px;">
              ${s.emoji} ${s.name}
            </button>`;
        }).join("")}
      </div>
      ${cantAfford ? `<p style="margin-top:12px;color:#FF6B6B;">Not enough XP yet — earn some by witnessing or worship!</p>` : ""}
    `;
  } else if (stage === "mature") {
    const s = SEED_TYPES[plot.type] || SEED_TYPES.faith;
    body = `
      <h2 style="margin:0 0 8px 0;color:#FFD700;">${s.emoji} ${s.name} in Full Bloom!</h2>
      <p style="margin:0 0 8px 0;color:#fff;font-style:italic;">"${s.verse}"</p>
      <p style="margin:0 0 16px 0;color:#A0E7E5;">
        Harvest this bloom for <b>+${HARVEST_XP} XP</b>.
        Every ${HARVEST_MEMBER_EVERY} harvests bring a new member to the church.
      </p>
      <button id="garden-harvest-btn" style="padding:12px 24px;background:#FFD700;color:#2E0854;
        border:none;border-radius:8px;cursor:pointer;font-family:inherit;font-size:16px;font-weight:bold;">
        🌾 Harvest
      </button>
    `;
  } else {
    // seed / sprout / growing — watering UI
    const s = SEED_TYPES[plot.type] || SEED_TYPES.faith;
    const stageLabel = { seed: "Seed planted", sprout: "Sprouting", growing: "Growing" }[stage] || stage;
    const w = plot.waterings || 0;
    const need = WATER_MATURE - w;
    const canWater = _bucket > 0;
    body = `
      <h2 style="margin:0 0 8px 0;color:#FFD700;">${s.emoji} ${s.name} — ${stageLabel}</h2>
      <p style="margin:0 0 8px 0;color:#fff;font-style:italic;">"${s.verse}"</p>
      <div style="margin:8px auto 12px auto;width:80%;height:14px;background:#1a1a1a;border-radius:7px;overflow:hidden;border:1px solid #4A90E2;">
        <div style="width:${Math.min(100, (w / WATER_MATURE) * 100)}%;height:100%;background:linear-gradient(90deg,#4A90E2,#A0E7E5);"></div>
      </div>
      <p style="margin:0 0 8px 0;color:#A0E7E5;">Waterings: <b>${w}/${WATER_MATURE}</b> &nbsp;•&nbsp; ${need} more to bloom</p>
      <p style="margin:0 0 12px 0;color:#A0E7E5;">Bucket: <b>${_bucket}/${BUCKET_CAPACITY}</b> ${canWater ? "" : "— fill at the well"}</p>
      <button id="garden-water-btn" ${canWater ? "" : "disabled"}
        style="padding:12px 24px;background:${canWater ? "#4A90E2" : "#444"};color:#fff;
        border:none;border-radius:8px;cursor:${canWater ? "pointer" : "not-allowed"};
        font-family:inherit;font-size:16px;font-weight:bold;opacity:${canWater ? "1" : "0.6"};">
        💧 Water Plant
      </button>
    `;
  }

  openMinigameModal(`
    <div style="text-align:center;padding:10px 4px;">
      ${body}
    </div>
  `);
  _modalOpen = true;
  wirePlotModalHandlers(idx);
}

function renderWellModal() {
  const full = _bucket >= BUCKET_CAPACITY;
  const body = `
    <div style="text-align:center;padding:10px 4px;">
      <h2 style="margin:0 0 8px 0;color:#A0E7E5;">🪣 The Well</h2>
      <p style="margin:0 0 12px 0;color:#fff;">"Whoever drinks of the water that I shall give him shall never thirst." — John 4:14</p>
      <p style="margin:0 0 12px 0;color:#A0E7E5;">Bucket: <b>${_bucket}/${BUCKET_CAPACITY}</b></p>
      <button id="garden-fill-btn" ${full ? "disabled" : ""}
        style="padding:12px 24px;background:${full ? "#444" : "#4A90E2"};color:#fff;
        border:none;border-radius:8px;cursor:${full ? "not-allowed" : "pointer"};
        font-family:inherit;font-size:16px;font-weight:bold;opacity:${full ? "0.6" : "1"};">
        ${full ? "Bucket Full" : "💧 Fill Bucket"}
      </button>
    </div>
  `;
  openMinigameModal(body);
  _modalOpen = true;
  const btn = document.getElementById("garden-fill-btn");
  if (btn) btn.addEventListener("click", fillBucket);
  const closeBtn = document.getElementById("minigame-close");
  if (closeBtn) {
    const onClose = () => { _modalOpen = false; closeBtn.removeEventListener("click", onClose); };
    closeBtn.addEventListener("click", onClose);
  }
}

function wirePlotModalHandlers(idx) {
  const plot = _plots[idx];
  const stage = deriveStage(plot);

  if (stage === "empty") {
    const btn = document.getElementById("garden-till-btn");
    if (btn) btn.addEventListener("click", () => tillPlot(idx));
  } else if (stage === "tilled") {
    document.querySelectorAll("#garden-seed-picker button[data-seed]").forEach(btn => {
      btn.addEventListener("click", () => {
        const seed = btn.getAttribute("data-seed");
        plantSeed(idx, seed);
      });
    });
  } else if (stage === "mature") {
    const btn = document.getElementById("garden-harvest-btn");
    if (btn) btn.addEventListener("click", () => harvestPlot(idx));
  } else {
    const btn = document.getElementById("garden-water-btn");
    if (btn) btn.addEventListener("click", () => waterPlot(idx));
  }

  const closeBtn = document.getElementById("minigame-close");
  if (closeBtn) {
    const onClose = () => { _modalOpen = false; closeBtn.removeEventListener("click", onClose); };
    closeBtn.addEventListener("click", onClose);
  }
}

// ---- Actions -------------------------------------------------------
// Face the player toward a world-space target (e.g. a plot or the well).
function facePlayerToward(targetX, targetZ) {
  if (!_player || !_player.group) return;
  const pos = _player.group.position;
  const dx = targetX - pos.x;
  const dz = targetZ - pos.z;
  if (dx * dx + dz * dz < 1e-4) return;
  _player.group.rotation.y = Math.atan2(dx, dz);
}

function closeModal() {
  const modal = document.getElementById("minigame-modal");
  if (modal) modal.style.display = "none";
  _modalOpen = false;
}

function tillPlot(idx) {
  const plot = _plots[idx];
  if (plot.stage !== "empty") return;
  if (isActing()) return;
  // Close the modal so the player can see the animation
  closeModal();
  facePlayerToward(plot.pos.x, plot.pos.z);
  playAction("till", () => {
    plot.stage = "tilled";
    plot.type = null;
    plot.waterings = 0;
    applyStageVisual(plot);
    saveState();
    showToast("🪓 Soil tilled. Now choose a seed to plant!");
    // Re-open the modal so the player can immediately pick a seed
    renderPlotModal(idx);
  });
}

function plantSeed(idx, seedKey) {
  if (!SEED_TYPES[seedKey]) return;
  const plot = _plots[idx];
  if (plot.stage !== "tilled") {
    showToast("Till the soil before planting!");
    return;
  }
  if (!spendXP(SEED_COST)) {
    showToast("Not enough XP to plant a seed.");
    return;
  }
  plot.type = seedKey;
  plot.stage = "seed";
  plot.waterings = 0;
  applyStageVisual(plot);
  saveState();
  showToast(`${SEED_TYPES[seedKey].emoji} ${SEED_TYPES[seedKey].name} seed planted! Now water it from the well.`);
  renderPlotModal(idx);
}

function waterPlot(idx) {
  const plot = _plots[idx];
  const stage = deriveStage(plot);
  if (stage === "empty" || stage === "tilled" || stage === "mature") return;
  if (_bucket <= 0) {
    showToast("Bucket is empty — refill at the well!");
    return;
  }
  if (isActing()) return;

  // Close modal so the player can see the watering animation
  closeModal();
  facePlayerToward(plot.pos.x, plot.pos.z);

  playAction("water", () => {
    _bucket -= 1;
    saveBucket();
    plot.waterings = (plot.waterings || 0) + 1;
    applyStageVisual(plot);
    saveState();
    // Brief wet-sparkle effect
    plot.parts.wetDisc.material.opacity = 0.55;
    plot._wetUntil = performance.now() + 1200;

    refreshBucketHud();
    refreshHeldBucket();
    const newStage = deriveStage(plot);
    if (newStage === "mature") {
      showToast(`${SEED_TYPES[plot.type].emoji} ${SEED_TYPES[plot.type].name} has fully bloomed! Harvest when ready.`);
    } else {
      const remaining = WATER_MATURE - plot.waterings;
      showToast(`💧 Watered! ${remaining} more watering${remaining === 1 ? "" : "s"} until full bloom.`);
    }
    renderPlotModal(idx);
  });
}

function fillBucket() {
  if (_bucket >= BUCKET_CAPACITY) {
    showToast("Bucket is already full.");
    return;
  }
  _bucket = BUCKET_CAPACITY;
  saveBucket();
  refreshBucketHud();
  refreshHeldBucket();
  showToast(`🪣 Bucket filled! (${_bucket}/${BUCKET_CAPACITY})`);
  renderWellModal();
}

function harvestPlot(idx) {
  const plot = _plots[idx];
  if (deriveStage(plot) !== "mature") return;
  const seed = SEED_TYPES[plot.type] || SEED_TYPES.faith;
  addXP(HARVEST_XP);
  const total = bumpHarvestCount();
  let extra = "";
  if (total % HARVEST_MEMBER_EVERY === 0) {
    addMember(1);
    extra = " A new soul joins the church!";
  }
  plot.type = null;
  plot.waterings = 0;
  plot.stage = "empty";
  applyStageVisual(plot);
  saveState();
  showToast(`${seed.emoji} Harvested ${seed.name}! +${HARVEST_XP} XP.${extra}`);
  renderPlotModal(idx);
}

// ---- Interaction entry point ---------------------------------------
function tryInteract() {
  if (_modalOpen) return;
  if (window.__nearNPC) return;
  if (document.getElementById("dialogue-box")?.style.display === "block") return;
  if (document.getElementById("minigame-modal")?.style.display === "flex") return;
  // Prefer well if standing next to it
  if (nearWell()) { renderWellModal(); return; }
  const idx = nearestPlotIndex();
  if (idx === -1) return;
  renderPlotModal(idx);
}

// ---- Public API ----------------------------------------------------
export function initGarden(scene, player /*, zones */) {
  _scene = scene;
  _player = player;

  scene.add(buildScenery());

  loadBucket();

  const savedPlots = loadState();
  for (let i = 0; i < PLOT_COUNT; i++) {
    const pos = plotPosition(i);
    const { group, parts } = buildPlotVisual();
    group.position.copy(pos);
    scene.add(group);
    const saved = savedPlots[i] || {};
    // Backwards compatibility: old saves had {type, plantedAt}. If we
    // see one, treat planted plants as already watered to maturity so
    // players don't lose progress on the new system.
    let stage = saved.stage;
    let waterings = typeof saved.waterings === "number" ? saved.waterings : null;
    if (!stage) {
      if (saved.type && saved.plantedAt) {
        stage = "seed";
        waterings = WATER_MATURE; // legacy plants auto-mature
      } else {
        stage = "empty";
        waterings = 0;
      }
    }
    if (waterings == null) waterings = 0;
    const plot = {
      pos,
      group,
      parts,
      type: saved.type || null,
      stage,
      waterings,
    };
    applyStageVisual(plot);
    _plots.push(plot);
  }

  ensurePrompt();
  ensureBucketHud();
  attachBucketToPlayer();
  refreshHeldBucket();

  // Keyboard interact (desktop)
  window.addEventListener("keydown", e => {
    if (e.code !== "KeyE") return;
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    if (nearWell() || nearestPlotIndex() !== -1) tryInteract();
  });

  // Mobile interact button — only consume the tap when we're at a plot
  // or the well so other modules still get their chance.
  const btn = document.getElementById("btn-interact");
  if (btn) {
    btn.addEventListener("click", () => {
      if (window.__nearNPC) return;
      if (nearWell() || nearestPlotIndex() !== -1) tryInteract();
    });
  }

  const closeBtn = document.getElementById("minigame-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => { _modalOpen = false; });
  }
}

// Per-frame: fade wet disc, update prompt + bucket HUD.
export function updateGarden(/* delta */) {
  if (!_player || _plots.length === 0) return;

  // Mobile: the shared interact button is vote-based — register our
  // claim whenever the player is at the well or at a plot so it shows
  // up even when no NPC is around.
  requestInteractButton("garden", !_modalOpen && !window.__nearNPC && (nearWell() || nearestPlotIndex() !== -1));

  const now = performance.now();

  // Fade wet-sparkle discs
  for (const plot of _plots) {
    if (plot._wetUntil) {
      const remaining = plot._wetUntil - now;
      if (remaining <= 0) {
        plot.parts.wetDisc.material.opacity = 0;
        plot._wetUntil = null;
      } else {
        plot.parts.wetDisc.material.opacity = Math.min(0.55, remaining / 1200 * 0.55);
      }
    }
  }

  refreshBucketHud();

  const prompt = ensurePrompt();
  if (_modalOpen || window.__nearNPC) { prompt.style.display = "none"; return; }

  if (nearWell()) {
    prompt.textContent = _bucket >= BUCKET_CAPACITY
      ? "🪣 Bucket full — head to a plot"
      : "💧 Press E to fill bucket";
    prompt.style.display = "block";
    return;
  }

  const idx = nearestPlotIndex();
  if (idx === -1) { prompt.style.display = "none"; return; }

  const plot = _plots[idx];
  const stage = deriveStage(plot);
  let text;
  if (stage === "empty")        text = "🪓 Press E to till the soil";
  else if (stage === "tilled")  text = "🌱 Press E to plant a seed";
  else if (stage === "mature")  text = "🌾 Press E to harvest";
  else if (_bucket > 0)         text = "💧 Press E to water";
  else                          text = "🪣 Press E (need water from well)";
  prompt.textContent = text;
  prompt.style.display = "block";
}

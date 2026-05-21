// Fellowship-hall food: places a snack on each round table. Walk up to a
// snack, press T (or tap the on-screen Interact button) to eat it. Plays a
// short eating animation (arm raised to mouth, head bobbing as if chewing),
// awards XP, and respawns the food a little later.
import * as THREE from "three";

const TABLES = [
  [-32, -15],
  [-32,  -5],
  [-27, -10],
  [-37, -10],
];

const ITEMS = [
  { name: "Pizza Slice",  build: buildPizza,    xp: 4, color: 0xC79A4A },
  { name: "Donut",        build: buildDonut,    xp: 4, color: 0xE6A8C7 },
  { name: "Sandwich",     build: buildSandwich, xp: 5, color: 0xF2D58E },
  { name: "Apple",        build: buildApple,    xp: 3, color: 0xE53E3E },
];

const EAT_RANGE   = 2.2;
const EAT_TIME    = 2.6;   // seconds
const RESPAWN_MS  = 12000;

let _player = null;
let _scene  = null;
let _foods  = [];          // { group, basePos, item, taken, respawnAt }
let _hint   = null;        // DOM overlay
let _eating = null;        // { food, held, t, savedPose }
let _nearest = null;       // current food in range (or null)

export function isEating() { return _eating !== null; }

export function initFood(scene, player) {
  _scene = scene;
  _player = player;

  TABLES.forEach(([x, z], i) => {
    const item = ITEMS[i % ITEMS.length];
    const group = item.build();
    // Plate underneath
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.45, 0.04, 16),
      new THREE.MeshToonMaterial({ color: 0xFFFFFF })
    );
    plate.position.y = -0.18;
    group.add(plate);
    group.position.set(x, 0.85, z);
    group.castShadow = true;
    scene.add(group);
    _foods.push({
      group, basePos: group.position.clone(),
      item, taken: false, respawnAt: 0,
    });
  });

  ensureHint();

  window.addEventListener("keydown", e => {
    if (e.code !== "KeyT") return;
    if (isBlocked()) return;
    if (_eating) return;
    if (_nearest) startEating(_nearest);
  });

  // Mobile: hook into the existing interact button as a fallback when the
  // nearest food is in range and no NPC is being highlighted.
  const btn = document.getElementById("btn-interact");
  if (btn) {
    btn.addEventListener("touchstart", () => {
      if (isBlocked() || _eating) return;
      if (_nearest && !window.__nearNPC) startEating(_nearest);
    }, { passive: true });
  }
}

function isBlocked() {
  if (document.getElementById("dialogue-box")?.style.display === "block") return true;
  if (document.getElementById("minigame-modal")?.style.display === "flex") return true;
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  return false;
}

function ensureHint() {
  if (_hint) return;
  const d = document.createElement("div");
  d.id = "food-hint";
  d.style.cssText =
    "position:fixed;left:50%;bottom:240px;transform:translateX(-50%);" +
    "background:rgba(20,10,40,0.88);color:#FFD700;padding:6px 14px;border-radius:14px;" +
    "font-family:'Fredoka One',cursive;font-size:13px;pointer-events:none;display:none;z-index:50;";
  document.body.appendChild(d);
  _hint = d;
}

export function updateFood(delta) {
  // Respawn ready food
  const now = Date.now();
  for (const f of _foods) {
    if (f.taken && !(_eating && _eating.food === f) && now >= f.respawnAt) {
      f.taken = false;
      f.group.visible = true;
    }
    // Gentle hover wobble so food reads as "interactable"
    if (!f.taken) {
      f.group.rotation.y += delta * 0.6;
      f.group.position.y = f.basePos.y + Math.sin(now * 0.003 + f.basePos.x) * 0.04;
    }
  }

  // Find the nearest available food within range
  const p = _player.group.position;
  let best = null, bestD = EAT_RANGE * EAT_RANGE;
  for (const f of _foods) {
    if (f.taken) continue;
    const dx = f.basePos.x - p.x, dz = f.basePos.z - p.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD) { bestD = d2; best = f; }
  }
  _nearest = best;

  // Show / hide hint
  if (_nearest && !_eating) {
    _hint.textContent = `Press T to eat ${_nearest.item.name}`;
    _hint.style.display = "block";
  } else if (!_eating) {
    _hint.style.display = "none";
  }

  // Drive the eating animation
  if (_eating) updateEatingAnim(delta);
}

function startEating(food) {
  food.taken = true;
  food.group.visible = false;

  // Make a held copy of the food and attach to the right arm so it follows the
  // arm-to-mouth animation. We use a small group anchored at "hand" offset.
  const held = food.item.build();
  held.position.set(0, -0.42, 0); // hand-end of the arm (arm height 0.85)
  held.scale.setScalar(0.85);
  _player.parts.armR.add(held);

  // Save pose
  const p = _player.parts;
  const saved = {
    head:  { pos: p.head.position.clone(),  rot: p.head.rotation.clone()  },
    armR:  { pos: p.armR.position.clone(),  rot: p.armR.rotation.clone()  },
  };

  _eating = { food, held, t: 0, savedPose: saved };

  _hint.textContent = `Eating ${food.item.name}…`;
  _hint.style.display = "block";
}

function updateEatingAnim(delta) {
  _eating.t += delta;
  const t = _eating.t;
  const dur = EAT_TIME;
  const u = Math.min(1, t / dur);

  const p = _player.parts;

  // Phases: 0.0–0.25 raise hand to mouth, 0.25–0.85 chew, 0.85–1.0 lower.
  const raise = Math.min(1, u / 0.25);
  const lower = Math.max(0, (u - 0.85) / 0.15);
  const armUp = raise * (1 - lower);

  // Arm pivots forward + up so the hand ends up in front of the face. The
  // player's face is on local -Z, so the arm needs a POSITIVE rotation.x to
  // swing the hand toward -Z (rotation about +X by +π/2 maps local -Y → -Z).
  p.armR.position.set(0.35, 1.4 + 0.3 * armUp, -0.15 * armUp);
  p.armR.rotation.set(1.55 * armUp, 0, -0.25 * armUp);

  // Chewing head bob while hand is at mouth (between 0.2 and 0.85 of duration)
  if (u > 0.2 && u < 0.85) {
    const c = (u - 0.2) / 0.65;
    p.head.rotation.x = Math.sin(t * 18) * 0.08 + 0.05;
    p.head.position.y = _eating.savedPose.head.pos.y + Math.abs(Math.sin(t * 18)) * 0.025;
    // Shrink the held food as it gets eaten
    const remain = Math.max(0.05, 1 - c);
    _eating.held.scale.setScalar(0.85 * remain);
  }

  if (u >= 1) finishEating();
}

function finishEating() {
  const p = _player.parts;
  // Restore pose
  p.armR.position.copy(_eating.savedPose.armR.pos);
  p.armR.rotation.copy(_eating.savedPose.armR.rot);
  p.head.position.copy(_eating.savedPose.head.pos);
  p.head.rotation.copy(_eating.savedPose.head.rot);

  // Remove held food
  p.armR.remove(_eating.held);

  // Award XP
  const food = _eating.food;
  const xp = parseInt(localStorage.getItem("clw_xp") || "0") + food.item.xp;
  localStorage.setItem("clw_xp", xp);
  const xpEl = document.getElementById("xp-count");
  if (xpEl) xpEl.textContent = xp;

  // Brief "yum" toast
  _hint.textContent = `+${food.item.xp} XP · Yum!`;
  setTimeout(() => { if (_hint && !_eating) _hint.style.display = "none"; }, 1100);

  // Schedule respawn
  food.respawnAt = Date.now() + RESPAWN_MS;

  _eating = null;
}

/* ---------- food meshes ---------- */
function toon(c) { return new THREE.MeshToonMaterial({ color: c }); }

function buildPizza() {
  const g = new THREE.Group();
  // Triangular slice approximated with a thin wedge box rotated
  const crust = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 0.15), toon(0xC79A4A));
  crust.position.set(0, 0, -0.28);
  const body  = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.5), toon(0xE74C3C));
  const cheese= new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.45), toon(0xF7DC6F));
  cheese.position.y = 0.04;
  g.add(crust, body, cheese);
  // Pepperoni dots
  for (const [x, z] of [[-0.1, -0.05], [0.12, 0.08], [-0.05, 0.12]]) {
    const pep = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 8), toon(0xB03A2E));
    pep.position.set(x, 0.06, z);
    g.add(pep);
  }
  return g;
}

function buildDonut() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.1, 10, 18), toon(0xC79A4A));
  ring.rotation.x = Math.PI / 2;
  const icing = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.08, 10, 18), toon(0xE6A8C7));
  icing.rotation.x = Math.PI / 2;
  icing.position.y = 0.04;
  g.add(ring, icing);
  // Sprinkles
  const colors = [0xFFFFFF, 0xF7DC6F, 0x82E0AA, 0x5DADE2];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.02), toon(colors[i % colors.length]));
    s.position.set(Math.cos(a) * 0.25, 0.09, Math.sin(a) * 0.25);
    s.rotation.y = a;
    g.add(s);
  }
  return g;
}

function buildSandwich() {
  const g = new THREE.Group();
  const top    = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 0.5), toon(0xF2D58E));
  const lettuce= new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.04, 0.53), toon(0x66BB6A));
  lettuce.position.y = -0.05;
  const meat   = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, 0.5), toon(0xB07A50));
  meat.position.y = -0.10;
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 0.5), toon(0xF2D58E));
  bottom.position.y = -0.16;
  top.position.y = 0.02;
  g.add(top, lettuce, meat, bottom);
  return g;
}

function buildApple() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 10), toon(0xE53E3E));
  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.04), toon(0x4A2C0A));
  stem.position.y = 0.28;
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.06), toon(0x66BB6A));
  leaf.position.set(0.08, 0.3, 0);
  leaf.rotation.z = -0.4;
  g.add(body, stem, leaf);
  return g;
}

// Tower of Babel — a timed cylindrical construction challenge.
//
// Phase 1 — BUILDING: find the brick pile east of the playground. Press E
// next to it to pick up a brick (the player visually carries it), then walk
// to the build site and press E to drop it on the tower. Each drop builds
// one full circular ring of bricks at the next height level, while three
// NPC builders animate a hammering motion. The tower rises tall into the
// sky as a tapered cylinder/ziggurat.
//
// Phase 2 — COMPLETE: instead of immediately destroying the tower, the
// finished tower stands proudly. A doorway at its south face becomes
// interactive. Press E at the door to climb the spiral staircase up to a
// viewing platform with a window looking down.
//
// Phase 3 — JUDGEMENT: at the window the player is asked whether God
// should confuse the languages and destroy the tower (big reward) or let
// it stand as a monument (smaller reward).

import * as THREE from "three";
import { showToast } from "./ui.js";
import { addXP, addMember } from "./growth.js";
import { playAction, isActing } from "./actions.js";
import { firebaseEnabled, db } from "./firebase.js";
import { ref, onValue, runTransaction, set, update, onDisconnect } from "firebase/database";
import { getRoomBase, getMyUid } from "./multiplayer.js";

// ---- Configuration ------------------------------------------------
// Build site stays on the east edge of the map. The brick pile, however,
// is deliberately placed on the FAR western side of the map so hauling a
// brick across the world is a real journey — challenging solo, and a
// natural co-op activity when multiple players are online.
const SITE_X = 70;
const SITE_Z = -32;
const PILE_X = -65;
const PILE_Z = -32;
const INTERACT_RANGE = 2.6;
const DOOR_RANGE     = 2.8;

const BRICKS_TOTAL  = 30;       // 30 tiers — each drop builds one circular ring
const TIMER_SECONDS = 360;      // 6 min — the pile is now a long haul away
const XP_DESTROY    = 100;
const MEMBERS_DESTROY = 4;
const XP_KEEP       = 35;

const BRICK_W = 0.8, BRICK_H = 0.5, BRICK_D = 0.5;

// Cylindrical tier dimensions. Each tier is a ring of bricks around the
// tower's axis. The radius shrinks very gently with height so the tower
// stays cylindrical-looking but still tapers slightly toward the top.
const TIER_HEIGHT  = 0.7;
const BASE_RADIUS  = 3.2;
const TIER_SHRINK  = 0.025;
const MIN_RADIUS   = 2.0;
const TOP_Y        = BRICKS_TOTAL * TIER_HEIGHT + TIER_HEIGHT / 2; // ~21.35m

// Doorway cutout — south-facing arch, two tiers high.
// We use angle θ measured so x = r*sin θ, z = r*cos θ, meaning θ=0 points
// toward +Z (north away from the player). The brick pile sits at +X / -Z
// (south-east of the tower), so the door faces θ ≈ π (south).
const DOOR_ANGLE   = Math.PI;          // south
const DOOR_HALF_ARC = 0.42;            // ~24° opening on each side of θ=π
const DOOR_TIERS   = 2;                // skip bricks in the lowest 2 tiers

// Top platform & window (north-facing window so the player looks across
// the church world from a great height).
const WINDOW_ANGLE = 0;                // looks toward +Z (back of map)

// ---- Module state -------------------------------------------------
let _scene = null;
let _player = null;
let _tower = null;
let _topPlatform = null;
let _doorMesh = null;
let _placedCount = 0;
let _carrying = false;
let _heldBrick = null;
let _builders = [];
let _timerSeconds = 0;
let _timerActive = false;
// idle | building | complete | atTop | destroying | kept | failed | cooldown
let _state = "idle";
let _animatingCollapse = false;
let _promptDiv = null;
let _hudDiv = null;

// Top-of-tower lock — when the player teleports up we snap their position
// each frame so they can't walk off the platform. Cleared when they
// descend or after the destroy choice plays out.
let _atTop = false;
let _topAnchor = new THREE.Vector3();
let _savedGround = new THREE.Vector3(); // where to drop them after descending

// ---- Multiplayer sync state --------------------------------------
// When Firebase is enabled we mirror the shared tower state at
//   <roomBase>/babel/{ placedCount, state, startedAt, judgement, contributors }
// so every player in the same world contributes to the SAME tower.
let _isMultiplayer = false;
let _babelRef = null;
let _myUid = null;
let _remoteStartedAt = 0;      // Date.now() when the timer began (server-published)
let _contributorCount = 0;
let _judgementHandled = false; // local guard so we only run destroy/keep once
let _lastRemoteCount = 0;      // for detecting brick-placed events from others

// ---- Geometry helpers --------------------------------------------
function makeBrick(color = 0xB85A3A) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(BRICK_W * 0.95, BRICK_H * 0.9, BRICK_D * 0.95),
    new THREE.MeshToonMaterial({ color })
  );
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function tierRadius(tierIndex) {
  return Math.max(MIN_RADIUS, BASE_RADIUS - tierIndex * TIER_SHRINK);
}

// Returns the local-space brick placements for one tier (relative to the
// tower's origin at the base of the build site). Each brick is rotated
// tangentially so its flat face follows the cylinder.
function layoutTier(tierIndex) {
  const r = tierRadius(tierIndex);
  const y = TIER_HEIGHT / 2 + tierIndex * TIER_HEIGHT;
  const circumference = 2 * Math.PI * r;
  // Tight packing: roughly one brick per BRICK_W of circumference.
  const n = Math.max(10, Math.round(circumference / BRICK_W));
  const out = [];
  for (let i = 0; i < n; i++) {
    const theta = (i / n) * Math.PI * 2;
    // Doorway cutout on the lowest tiers.
    if (tierIndex < DOOR_TIERS) {
      let d = Math.abs(theta - DOOR_ANGLE);
      if (d > Math.PI) d = Math.PI * 2 - d;
      if (d < DOOR_HALF_ARC) continue;
    }
    const x = r * Math.sin(theta);
    const z = r * Math.cos(theta);
    out.push({ x, y, z, rotY: -theta });
  }
  return out;
}

// ---- Top platform & door geometry --------------------------------
function buildTopPlatform() {
  const g = new THREE.Group();
  const r = Math.max(MIN_RADIUS, BASE_RADIUS - BRICKS_TOTAL * TIER_SHRINK);

  // Stone floor disc on top.
  const floor = new THREE.Mesh(
    new THREE.CylinderGeometry(r + 0.15, r + 0.15, 0.2, 24),
    new THREE.MeshToonMaterial({ color: 0xC9B07A })
  );
  floor.position.y = TOP_Y + 0.1;
  floor.castShadow = true; floor.receiveShadow = true;
  g.add(floor);

  // Railing — ring of small stone blocks around the perimeter, with a
  // window cutout on the WINDOW_ANGLE side.
  const railH = 0.9;
  const railN = 20;
  const winHalf = 0.45;
  for (let i = 0; i < railN; i++) {
    const t = (i / railN) * Math.PI * 2;
    let d = Math.abs(t - WINDOW_ANGLE);
    if (d > Math.PI) d = Math.PI * 2 - d;
    if (d < winHalf) continue; // skip the window slot
    const seg = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, railH, 0.35),
      new THREE.MeshToonMaterial({ color: 0xA88463 })
    );
    seg.position.set(r * Math.sin(t), TOP_Y + 0.2 + railH / 2, r * Math.cos(t));
    seg.rotation.y = -t;
    seg.castShadow = true;
    g.add(seg);
  }

  // Decorative window frame above the cutout (lintel + side jambs).
  const lintel = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.12, 0.18),
    new THREE.MeshToonMaterial({ color: 0x6B3410 })
  );
  lintel.position.set(r * Math.sin(WINDOW_ANGLE), TOP_Y + 0.2 + railH + 0.06,
                      r * Math.cos(WINDOW_ANGLE));
  lintel.rotation.y = -WINDOW_ANGLE;
  g.add(lintel);
  for (const off of [-0.5, 0.5]) {
    const jamb = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, railH, 0.18),
      new THREE.MeshToonMaterial({ color: 0x6B3410 })
    );
    const tx = WINDOW_ANGLE + off * 0.06;
    jamb.position.set(r * Math.sin(tx) + Math.cos(WINDOW_ANGLE) * off,
                      TOP_Y + 0.2 + railH / 2,
                      r * Math.cos(tx) - Math.sin(WINDOW_ANGLE) * off);
    jamb.rotation.y = -WINDOW_ANGLE;
    g.add(jamb);
  }

  // Central golden spire — the tower's crown.
  const spire = new THREE.Mesh(
    new THREE.ConeGeometry(0.3, 1.8, 6),
    new THREE.MeshToonMaterial({ color: 0xFFD700 })
  );
  spire.position.y = TOP_Y + 0.2 + 1.0;
  spire.castShadow = true;
  g.add(spire);

  g.position.set(SITE_X, 0, SITE_Z);
  g.visible = false; // shown only when the tower is finished
  return g;
}

function buildDoorMesh() {
  // Dark archway visible in the doorway cutout on tier 0/1.
  const r = BASE_RADIUS;
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, TIER_HEIGHT * DOOR_TIERS, 0.15),
    new THREE.MeshToonMaterial({ color: 0x2A1A0A })
  );
  door.position.set(SITE_X + r * Math.sin(DOOR_ANGLE),
                    TIER_HEIGHT * DOOR_TIERS / 2,
                    SITE_Z + r * Math.cos(DOOR_ANGLE));
  door.rotation.y = -DOOR_ANGLE;
  door.visible = false;
  return door;
}

// Decorative spiral staircase inside the tower — visible through the
// doorway. Just dressing; the player teleports.
function buildSpiralStaircase() {
  const g = new THREE.Group();
  const stepCount = Math.ceil(TOP_Y / 0.28);
  const innerR = MIN_RADIUS - 0.2;
  for (let i = 0; i < stepCount; i++) {
    const theta = (i / 14) * Math.PI * 2; // 14 steps per loop
    const y = i * 0.28;
    if (y > TOP_Y - 0.3) break;
    const step = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.12, 0.5),
      new THREE.MeshToonMaterial({ color: 0x8B6B4A })
    );
    step.position.set(innerR * Math.sin(theta), y + 0.06, innerR * Math.cos(theta));
    step.rotation.y = -theta;
    step.castShadow = true;
    g.add(step);
  }
  // Central column
  const col = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, TOP_Y, 8),
    new THREE.MeshToonMaterial({ color: 0x6B5036 })
  );
  col.position.y = TOP_Y / 2;
  g.add(col);
  g.position.set(SITE_X, 0, SITE_Z);
  g.visible = false; // only visible while building/complete
  return g;
}

let _staircase = null;

// ---- Scenery ------------------------------------------------------
function buildScene() {
  const root = new THREE.Group();

  // Dirt construction pad under the tower
  const pad = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.MeshLambertMaterial({ color: 0xA88463 })
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(SITE_X, 0.04, SITE_Z);
  pad.receiveShadow = true;
  root.add(pad);

  // Brick pile (visual decoration — the actual supply is unlimited)
  for (let i = 0; i < 10; i++) {
    const b = makeBrick(0x8B4A2C);
    const tier = Math.floor(i / 4);
    const inTier = i % 4;
    b.position.set(
      PILE_X + (inTier - 1.5) * 0.5,
      BRICK_H / 2 + tier * BRICK_H * 0.9,
      PILE_Z + ((i % 2) - 0.5) * 0.7,
    );
    b.rotation.y = (Math.random() - 0.5) * 0.3;
    root.add(b);
  }

  // Wooden sign by the pile
  const c = document.createElement("canvas");
  c.width = 320; c.height = 64;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "rgba(70,40,10,0.92)"; ctx.fillRect(0, 0, 320, 64);
  ctx.fillStyle = "#FFD700"; ctx.font = "bold 22px Arial";
  ctx.fillText("🗼 Tower of Babel", 65, 42);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(c), transparent: true,
  }));
  sprite.position.set(SITE_X, 4.0, SITE_Z + 4);
  sprite.scale.set(5.5, 1.1, 1);
  root.add(sprite);

  // —— Brick-pile marker ——
  // The pile now sits far across the map, so we plant a tall flagpole with
  // a bright banner and a floating label that is visible from a great
  // distance. This gives players (especially newcomers) a clear waypoint.
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 8.0, 8),
    new THREE.MeshToonMaterial({ color: 0x6B3410 })
  );
  pole.position.set(PILE_X, 4.0, PILE_Z);
  pole.castShadow = true;
  root.add(pole);
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 1.0),
    new THREE.MeshToonMaterial({ color: 0xC93030, side: THREE.DoubleSide })
  );
  banner.position.set(PILE_X + 0.85, 7.2, PILE_Z);
  root.add(banner);
  const pileLabel = document.createElement("canvas");
  pileLabel.width = 320; pileLabel.height = 64;
  const pctx = pileLabel.getContext("2d");
  pctx.fillStyle = "rgba(70,40,10,0.92)"; pctx.fillRect(0, 0, 320, 64);
  pctx.fillStyle = "#FFD700"; pctx.font = "bold 22px Arial";
  pctx.fillText("🧱 Brick Pile", 95, 42);
  const pileSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(pileLabel), transparent: true,
  }));
  pileSprite.position.set(PILE_X, 9.0, PILE_Z);
  pileSprite.scale.set(5.5, 1.1, 1);
  root.add(pileSprite);

  // Wooden scaffolding posts around the build site for atmosphere.
  // Pushed outside the tower's wide base footprint, taller so they
  // visually frame the lower section of the much taller tower.
  for (const [dx, dz] of [[-4.0, -4.0], [4.0, -4.0], [-4.0, 4.0], [4.0, 4.0]]) {
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 6.0, 0.2),
      new THREE.MeshToonMaterial({ color: 0x6B3410 })
    );
    post.position.set(SITE_X + dx, 3.0, SITE_Z + dz);
    post.castShadow = true;
    root.add(post);
  }
  for (const dz of [-4.0, 4.0]) {
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(8.1, 0.14, 0.14),
      new THREE.MeshToonMaterial({ color: 0x6B3410 })
    );
    beam.position.set(SITE_X, 5.8, SITE_Z + dz);
    root.add(beam);
  }

  // Tower container — bricks added as they're placed
  _tower = new THREE.Group();
  _tower.position.set(SITE_X, 0, SITE_Z);
  root.add(_tower);

  // Top platform (hidden until completion)
  _topPlatform = buildTopPlatform();
  root.add(_topPlatform);

  // Spiral staircase (hidden until tier ≥ 2 so it appears as the tower grows)
  _staircase = buildSpiralStaircase();
  root.add(_staircase);

  // Door (hidden until completion)
  _doorMesh = buildDoorMesh();
  root.add(_doorMesh);

  return root;
}

// ---- Builder NPCs -------------------------------------------------
function makeBuilder(x, z, shirtColor) {
  const g = new THREE.Group();
  const skinMat = new THREE.MeshToonMaterial({ color: 0xE0AC69 });
  const shirtMat = new THREE.MeshToonMaterial({ color: shirtColor });
  const pantsMat = new THREE.MeshToonMaterial({ color: 0x2E3F5A });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.5), shirtMat);
  torso.position.y = 1.1;

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skinMat);
  head.position.y = 1.85;

  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.75, 0.3), shirtMat);
  armL.position.set(-0.5, 1.15, 0);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.75, 0.3), shirtMat);
  armR.position.set(0.5, 1.15, 0);

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.35), pantsMat);
  legL.position.set(-0.2, 0.4, 0);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.35), pantsMat);
  legR.position.set(0.2, 0.4, 0);

  const hat = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshToonMaterial({ color: 0xFFD700 })
  );
  hat.position.y = 2.15;

  const hammerHandle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6),
    new THREE.MeshToonMaterial({ color: 0x6B3410 })
  );
  hammerHandle.position.set(0, -0.45, 0.18);
  const hammerHead = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.16, 0.14),
    new THREE.MeshToonMaterial({ color: 0x555555 })
  );
  hammerHead.position.set(0, -0.68, 0.18);
  armR.add(hammerHandle, hammerHead);

  [torso, head, armL, armR, legL, legR, hat].forEach(m => {
    m.castShadow = true; g.add(m);
  });
  hammerHandle.castShadow = true;
  hammerHead.castShadow = true;

  g.position.set(x, 0, z);
  const dx = SITE_X - x, dz = SITE_Z - z;
  g.rotation.y = Math.atan2(dx, dz);

  return {
    group: g,
    parts: { armR, armL },
    restArmR: armR.rotation.x,
    animActive: false,
    animT: 0,
    idlePhase: Math.random() * Math.PI * 2,
  };
}

function triggerBuildersHammer() {
  for (let i = 0; i < _builders.length; i++) {
    const b = _builders[i];
    b.animActive = true;
    b.animT = -i * 0.25;
  }
}

// ---- Tower update -------------------------------------------------
function refreshTowerVisual() {
  while (_tower.children.length) _tower.remove(_tower.children[0]);
  for (let i = 0; i < _placedCount; i++) {
    const positions = layoutTier(i);
    for (let k = 0; k < positions.length; k++) {
      const p = positions[k];
      const tint = 0xB85A3A + ((i + k) % 4) * 0x040000;
      const b = makeBrick(tint);
      b.position.set(p.x, p.y, p.z);
      b.rotation.y = p.rotY;
      _tower.add(b);
    }
  }
  // Staircase becomes visible once a few tiers are up
  if (_staircase) _staircase.visible = _placedCount >= 2;
  // Top platform & door appear when the tower is complete
  const done = _placedCount >= BRICKS_TOTAL;
  if (_topPlatform) _topPlatform.visible = done;
  if (_doorMesh) _doorMesh.visible = done;
}

// ---- Held brick ---------------------------------------------------
function attachHeldBrick() {
  if (_heldBrick || !_player || !_player.group) return;
  _heldBrick = makeBrick(0x9C5236);
  _heldBrick.scale.set(0.75, 0.75, 0.75);
  _heldBrick.position.set(0, 1.35, 0.55);
  _heldBrick.visible = false;
  _player.group.add(_heldBrick);
}

function refreshHeldBrick() {
  if (_heldBrick) _heldBrick.visible = _carrying;
}

// ---- Proximity ----------------------------------------------------
function nearPile() {
  if (!_player) return false;
  const p = _player.group.position;
  const dx = p.x - PILE_X, dz = p.z - PILE_Z;
  return dx * dx + dz * dz < INTERACT_RANGE * INTERACT_RANGE * 1.4;
}
function nearSite() {
  if (!_player) return false;
  const p = _player.group.position;
  const dx = p.x - SITE_X, dz = p.z - SITE_Z;
  return dx * dx + dz * dz < INTERACT_RANGE * INTERACT_RANGE * 1.8;
}
function nearDoor() {
  if (!_player) return false;
  if (_state !== "complete" && _state !== "kept") return false;
  const doorX = SITE_X + BASE_RADIUS * Math.sin(DOOR_ANGLE);
  const doorZ = SITE_Z + BASE_RADIUS * Math.cos(DOOR_ANGLE);
  const p = _player.group.position;
  const dx = p.x - doorX, dz = p.z - doorZ;
  return dx * dx + dz * dz < DOOR_RANGE * DOOR_RANGE;
}
function isNearArea() { return nearPile() || nearSite() || nearDoor(); }

function facePlayer(tx, tz) {
  if (!_player) return;
  const p = _player.group.position;
  const dx = tx - p.x, dz = tz - p.z;
  if (dx * dx + dz * dz < 1e-4) return;
  _player.group.rotation.y = Math.atan2(dx, dz);
}

// ---- HUD ----------------------------------------------------------
function ensureHud() {
  if (_hudDiv) return _hudDiv;
  const div = document.createElement("div");
  div.id = "babel-hud";
  div.style.cssText =
    "position:fixed;left:50%;top:80px;transform:translateX(-50%);" +
    "background:rgba(70,40,10,0.92);color:#FFD700;padding:8px 16px;border-radius:10px;" +
    "font-family:'Fredoka One',cursive;font-size:15px;display:none;z-index:50;" +
    "border:2px solid #FFD700;pointer-events:none;text-align:center;";
  document.body.appendChild(div);
  _hudDiv = div;
  return div;
}

function ensurePrompt() {
  if (_promptDiv) return _promptDiv;
  const div = document.createElement("div");
  div.id = "babel-prompt";
  div.style.cssText =
    "position:fixed;left:50%;bottom:200px;transform:translateX(-50%);" +
    "background:rgba(70,40,10,0.92);color:#FFD700;padding:8px 16px;border-radius:8px;" +
    "font-family:'Fredoka One',cursive;font-size:15px;pointer-events:none;display:none;" +
    "z-index:50;border:1px solid #FFD700;";
  document.body.appendChild(div);
  _promptDiv = div;
  return div;
}

// ---- Player actions -----------------------------------------------
function pickup() {
  if (_state === "destroying" || _state === "cooldown" || _state === "atTop") return;
  if (_carrying) { showToast("You're already carrying a brick!"); return; }
  if (_placedCount >= BRICKS_TOTAL) return;
  if (isActing()) return;
  facePlayer(PILE_X, PILE_Z);
  playAction("lift", () => {
    _carrying = true;
    refreshHeldBrick();
    showToast("🧱 Brick in hand — carry it to the build site!");
  });
}

function dropoff() {
  if (_state === "destroying" || _state === "cooldown" || _state === "atTop") return;
  if (!_carrying) { showToast("Grab a brick from the pile first!"); return; }
  if (_placedCount >= BRICKS_TOTAL) return;
  if (isActing()) return;
  facePlayer(SITE_X, SITE_Z);
  playAction("lift", () => {
    _carrying = false;
    refreshHeldBrick();
    if (_isMultiplayer) {
      // Atomically increment the SHARED tower height. The onValue listener
      // will then update visuals + builder hammer animation for everyone.
      commitBrickRemote();
    } else {
      _placedCount += 1;
      refreshTowerVisual();
      triggerBuildersHammer();
      if (!_timerActive) startTimer();
      if (_placedCount >= BRICKS_TOTAL) {
        towerComplete();
      } else {
        showToast(`🏗️ Tier ${_placedCount}/${BRICKS_TOTAL} raised.`);
      }
    }
  });
}

// ---- Multiplayer helpers -----------------------------------------
function commitBrickRemote() {
  if (!_babelRef) return;
  runTransaction(_babelRef, v => {
    v = v || { placedCount: 0, state: "idle", startedAt: null, contributors: {} };
    if (v.state === "destroying" || v.state === "cooldown") return; // abort
    if ((v.placedCount || 0) >= BRICKS_TOTAL) return; // already done
    v.placedCount = (v.placedCount || 0) + 1;
    if (v.state === "idle" || !v.startedAt) {
      v.state = "building";
      v.startedAt = Date.now();
    }
    if (v.placedCount >= BRICKS_TOTAL) v.state = "complete";
    v.contributors = v.contributors || {};
    if (_myUid) v.contributors[_myUid] = (v.contributors[_myUid] || 0) + 1;
    return v;
  }).catch(err => console.warn("[babel] brick commit failed", err));
}

function commitJudgementRemote(choice) {
  if (!_babelRef) return;
  update(_babelRef, { judgement: choice, judgedAt: Date.now() })
    .catch(err => console.warn("[babel] judgement write failed", err));
}

function commitResetRemote() {
  if (!_babelRef) return;
  set(_babelRef, {
    placedCount: 0, state: "idle", startedAt: null,
    judgement: null, contributors: {}
  }).catch(err => console.warn("[babel] reset failed", err));
}

function commitTimeoutRemote() {
  if (!_babelRef) return;
  update(_babelRef, { state: "failed" })
    .catch(err => console.warn("[babel] timeout write failed", err));
}

// Apply a remote snapshot to local state. Called from onValue.
function applyRemoteState(snap) {
  if (!snap) {
    // No record yet — treat as idle
    _placedCount = 0;
    _lastRemoteCount = 0;
    _state = "idle";
    _timerActive = false;
    _remoteStartedAt = 0;
    _contributorCount = 0;
    _judgementHandled = false;
    refreshTowerVisual();
    return;
  }
  const newCount = snap.placedCount || 0;
  const prevCount = _lastRemoteCount;
  _contributorCount = snap.contributors ? Object.keys(snap.contributors).length : 0;
  _remoteStartedAt = snap.startedAt || 0;

  if (newCount !== _placedCount) {
    _placedCount = newCount;
    refreshTowerVisual();
    // Hammer animation for bricks placed by OTHER players too
    if (newCount > prevCount) triggerBuildersHammer();
  }
  _lastRemoteCount = newCount;

  const remoteState = snap.state || "idle";
  // Pure visual states (atTop) are local-only; don't let the network erase them.
  if (_atTop && remoteState !== "destroying" && remoteState !== "failed") {
    // keep _atTop, but still mirror timer/contrib data above
  } else if (remoteState !== _state) {
    // Synchronise state transitions
    if (remoteState === "building") {
      _state = "building";
      _timerActive = true;
      _judgementHandled = false;
    } else if (remoteState === "complete") {
      if (_state !== "complete") {
        _state = "complete";
        _timerActive = false;
        showToast("🏛️ The tower stands complete! Find the door at its base to climb up.");
      }
    } else if (remoteState === "idle") {
      _state = "idle";
      _timerActive = false;
      _judgementHandled = false;
    } else if (remoteState === "failed") {
      if (_state !== "failed" && !_animatingCollapse) failEvent();
    } else if (remoteState === "kept") {
      _state = "kept";
      _timerActive = false;
    } else if (remoteState === "destroying") {
      // handled below via judgement
    }
  }

  // Apply judgement once — every connected client runs the cinematic
  if (snap.judgement && !_judgementHandled) {
    _judgementHandled = true;
    if (snap.judgement === "destroy") {
      runDestroyLocally();
    } else if (snap.judgement === "keep") {
      runKeepLocally();
    }
  }
}

function setupMultiplayerSync() {
  if (!firebaseEnabled || !db) return;
  const base = getRoomBase();
  _myUid = getMyUid();
  if (!base) return;
  _babelRef = ref(db, `${base}/babel`);
  _isMultiplayer = true;
  onValue(_babelRef, snap => applyRemoteState(snap.val()));
}

function startTimer() {
  if (_timerActive || _state !== "idle") return;
  _timerActive = true;
  _timerSeconds = TIMER_SECONDS;
  _state = "building";
  showToast(`⏱️ The clock is ticking! Finish the tower in ${TIMER_SECONDS}s!`);
}

// ---- Tower completion (no destruction yet) -----------------------
function towerComplete() {
  _state = "complete";
  _timerActive = false;
  showToast("🏛️ The tower stands complete! Find the door at its base to climb up.");
}

// ---- Climb up the tower ------------------------------------------
function climbUp() {
  if (_state !== "complete" && _state !== "kept") return;
  if (_atTop) return;
  // Remember where to drop the player on descent
  _savedGround.copy(_player.group.position);

  // Fade-to-black transition
  const fade = document.createElement("div");
  fade.style.cssText =
    "position:fixed;inset:0;background:#000;z-index:9998;pointer-events:none;" +
    "opacity:0;transition:opacity 0.45s;";
  document.body.appendChild(fade);
  requestAnimationFrame(() => { fade.style.opacity = "1"; });

  setTimeout(() => {
    // Teleport player onto the top platform, just inside the window
    const r = Math.max(MIN_RADIUS, BASE_RADIUS - BRICKS_TOTAL * TIER_SHRINK);
    const px = SITE_X + (r - 0.8) * Math.sin(WINDOW_ANGLE);
    const py = TOP_Y + 0.22;
    const pz = SITE_Z + (r - 0.8) * Math.cos(WINDOW_ANGLE);
    _player.group.position.set(px, py, pz);
    _player.group.rotation.y = WINDOW_ANGLE; // face the window
    _player.velocity.y = 0;
    _player.onGround = true;
    _topAnchor.set(px, py, pz);
    _atTop = true;
    _state = "atTop";

    // Fade back in
    setTimeout(() => {
      fade.style.opacity = "0";
      setTimeout(() => fade.remove(), 500);
      showToast("🪟 You stand high above the world. Press E at the window to look out.");
    }, 250);
  }, 500);
}

function descend() {
  // Restore player to the saved ground position
  const fade = document.createElement("div");
  fade.style.cssText =
    "position:fixed;inset:0;background:#000;z-index:9998;pointer-events:none;" +
    "opacity:0;transition:opacity 0.4s;";
  document.body.appendChild(fade);
  requestAnimationFrame(() => { fade.style.opacity = "1"; });
  setTimeout(() => {
    _atTop = false;
    // Drop player a short distance from the door so they don't insta-reclimb
    const doorX = SITE_X + (BASE_RADIUS + 1.6) * Math.sin(DOOR_ANGLE);
    const doorZ = SITE_Z + (BASE_RADIUS + 1.6) * Math.cos(DOOR_ANGLE);
    _player.group.position.set(doorX, 0, doorZ);
    _player.velocity.y = 0;
    _player.onGround = true;
    setTimeout(() => {
      fade.style.opacity = "0";
      setTimeout(() => fade.remove(), 500);
    }, 200);
  }, 450);
}

// ---- Judgement modal ----------------------------------------------
function openJudgementModal() {
  const modal = document.getElementById("minigame-modal");
  const content = document.getElementById("minigame-content");
  const closeBtn = document.getElementById("minigame-close");
  if (!modal || !content) return;
  // Hide the close-X so the player must make a choice
  if (closeBtn) closeBtn.style.display = "none";
  content.innerHTML = `
    <div style="text-align:center;padding:10px 4px;color:#FFD700;font-family:'Fredoka One',cursive;">
      <h2 style="margin:0 0 6px;font-size:24px;">🪟 The View from Babel</h2>
      <p style="margin:0 0 16px;color:#fff;font-size:15px;line-height:1.4;">
        You gaze down from the highest window. The world stretches out below — fields,
        houses, the steeple of your church. The builders below await your judgement.
      </p>
      <p style="margin:0 0 18px;color:#FFD700;font-style:italic;font-size:14px;">
        Shall the LORD confuse their languages and tear the tower down, or shall it
        stand as a monument?
      </p>
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
        <button id="babel-destroy"
          style="background:#8B1A1A;color:#FFD700;border:2px solid #FFD700;padding:10px 16px;
                 border-radius:8px;font-family:inherit;font-size:14px;cursor:pointer;min-width:200px;">
          🌩️ Let God destroy it<br>
          <small style="color:#fff;font-weight:normal;">+${XP_DESTROY} XP, +${MEMBERS_DESTROY} members</small>
        </button>
        <button id="babel-keep"
          style="background:#3A6B3A;color:#FFD700;border:2px solid #FFD700;padding:10px 16px;
                 border-radius:8px;font-family:inherit;font-size:14px;cursor:pointer;min-width:200px;">
          🏛️ Keep it standing<br>
          <small style="color:#fff;font-weight:normal;">+${XP_KEEP} XP — monument remains</small>
        </button>
      </div>
    </div>`;
  modal.style.display = "flex";

  document.getElementById("babel-destroy").onclick = () => {
    modal.style.display = "none";
    if (closeBtn) closeBtn.style.display = "";
    chooseDestroy();
  };
  document.getElementById("babel-keep").onclick = () => {
    modal.style.display = "none";
    if (closeBtn) closeBtn.style.display = "";
    chooseKeep();
  };
}

// ---- Choice outcomes ---------------------------------------------
function chooseDestroy() {
  if (_isMultiplayer) {
    commitJudgementRemote("destroy");
    // The onValue listener will run runDestroyLocally() on every client
    // (including this one) once the write lands.
    descend();
    return;
  }
  // Single-player fallback — original behaviour.
  descend();
  setTimeout(destroyEvent, 700);
}

function chooseKeep() {
  if (_isMultiplayer) {
    commitJudgementRemote("keep");
    descend();
    return;
  }
  _state = "kept";
  descend();
  addXP(XP_KEEP);
  setTimeout(() => {
    showToast(`🏛️ The tower stands as a monument. +${XP_KEEP} XP.`);
    showToast("The builders disperse peacefully. You can climb the tower any time.");
  }, 800);
}

// Cinematic helpers invoked from BOTH the local single-player path AND
// the multiplayer onValue listener so every client sees the same event.
function runDestroyLocally() {
  if (_atTop) {
    // Get off the top before the tower collapses underneath us.
    descend();
    setTimeout(destroyEvent, 700);
  } else {
    setTimeout(destroyEvent, 200);
  }
}
function runKeepLocally() {
  _state = "kept";
  if (_atTop) descend();
  addXP(XP_KEEP);
  setTimeout(() => {
    showToast(`🏛️ The tower stands as a monument. +${XP_KEEP} XP.`);
    showToast("The builders disperse peacefully. You can climb the tower any time.");
  }, 800);
}

function destroyEvent() {
  _state = "destroying";
  _timerActive = false;

  // Hide the platform & door — the tower is about to collapse
  if (_topPlatform) _topPlatform.visible = false;
  if (_doorMesh)   _doorMesh.visible = false;

  // Lightning flashes
  const flash = document.createElement("div");
  flash.style.cssText =
    "position:fixed;inset:0;background:white;z-index:9999;pointer-events:none;" +
    "opacity:0;transition:opacity 0.08s;";
  document.body.appendChild(flash);
  let n = 0;
  function pulse() {
    if (n >= 5) { setTimeout(() => flash.remove(), 200); return; }
    flash.style.opacity = "1";
    setTimeout(() => { flash.style.opacity = "0"; n++; setTimeout(pulse, 110); }, 70);
  }
  pulse();

  setTimeout(() => showToast("🌩️ THE LORD HAS CONFUSED THE LANGUAGES!"), 350);
  setTimeout(() => showToast("🗣️ Wabela snorf gimo zentik!"), 1700);
  setTimeout(() => showToast("🗣️ Krenta po flummox arn dukh!"), 2700);
  setTimeout(() => showToast("🏃 The builders scatter to the corners of the earth..."), 4000);

  addXP(XP_DESTROY);
  addMember(MEMBERS_DESTROY);

  // Tumbling collapse
  _animatingCollapse = true;
  for (const b of _tower.children) {
    b.userData.vy = 2.5 + Math.random() * 1.8;
    b.userData.vx = (Math.random() - 0.5) * 3.5;
    b.userData.vz = (Math.random() - 0.5) * 3.5;
    b.userData.spin = (Math.random() - 0.5) * 6;
  }

  for (const b of _builders) {
    const gx = b.group.position.x - SITE_X;
    const gz = b.group.position.z - SITE_Z;
    const mag = Math.max(0.1, Math.hypot(gx, gz));
    b.scatterDX = (gx / mag) * 4;
    b.scatterDZ = (gz / mag) * 4;
    b.scattering = true;
    b.scatterT = 0;
  }

  setTimeout(() => {
    _placedCount = 0;
    _animatingCollapse = false;
    while (_tower.children.length) _tower.remove(_tower.children[0]);
    for (const b of _builders) {
      b.scattering = false;
      b.scatterT = 0;
    }
    resetBuilderPositions();
    if (_staircase) _staircase.visible = false;
    _state = "cooldown";
    setTimeout(() => {
      _state = "idle";
      // In multiplayer, ONE client (the judgement-chooser) clears the
      // shared record so the site reopens for everyone simultaneously.
      if (_isMultiplayer && _judgementHandled) commitResetRemote();
      showToast("🏗️ The construction site is open again. Try again?");
    }, 5000);
  }, 5000);
}

function failEvent() {
  _state = "failed";
  _timerActive = false;
  showToast("⏰ The builders ran out of time. The tower crumbles...");
  _animatingCollapse = true;
  for (const b of _tower.children) {
    b.userData.vy = 1.2;
    b.userData.vx = (Math.random() - 0.5) * 2;
    b.userData.vz = (Math.random() - 0.5) * 2;
    b.userData.spin = (Math.random() - 0.5) * 3;
  }
  setTimeout(() => {
    _placedCount = 0;
    _carrying = false;
    refreshHeldBrick();
    _animatingCollapse = false;
    while (_tower.children.length) _tower.remove(_tower.children[0]);
    if (_staircase) _staircase.visible = false;
    _state = "idle";
    if (_isMultiplayer) commitResetRemote();
  }, 4500);
}

let _builderHome = [];
function resetBuilderPositions() {
  for (let i = 0; i < _builders.length; i++) {
    const [hx, hz] = _builderHome[i];
    _builders[i].group.position.set(hx, 0, hz);
    const dx = SITE_X - hx, dz = SITE_Z - hz;
    _builders[i].group.rotation.y = Math.atan2(dx, dz);
  }
}

// ---- Interact dispatch --------------------------------------------
function tryInteract() {
  if (document.getElementById("dialogue-box")?.style.display === "block") return;
  if (document.getElementById("minigame-modal")?.style.display === "flex") return;
  if (window.__nearNPC) return;
  // While up on the top platform, E opens the judgement modal
  if (_atTop) { openJudgementModal(); return; }
  // Door takes priority once the tower is built
  if (nearDoor()) { climbUp(); return; }
  if (nearPile()) { pickup(); return; }
  if (nearSite()) { dropoff(); return; }
}

// ---- Public API ---------------------------------------------------
export function initBabel(scene, player) {
  _scene = scene;
  _player = player;
  scene.add(buildScene());

  // Three builder NPCs positioned around the site (just outside the
  // tower's wider base footprint).
  const positions = [
    [SITE_X + 4.2, SITE_Z + 0.2],
    [SITE_X - 4.2, SITE_Z + 0.4],
    [SITE_X + 0.4, SITE_Z - 4.2],
  ];
  const colors = [0xE85C42, 0x4DA3FF, 0x8FD45F];
  for (let i = 0; i < positions.length; i++) {
    const b = makeBuilder(positions[i][0], positions[i][1], colors[i]);
    scene.add(b.group);
    _builders.push(b);
    _builderHome.push(positions[i]);
  }

  attachHeldBrick();
  ensureHud();
  ensurePrompt();

  // Hook up cooperative multiplayer if Firebase is available. We defer
  // briefly so multiplayer.js has time to publish the room base.
  setTimeout(setupMultiplayerSync, 250);

  window.addEventListener("keydown", e => {
    if (e.code !== "KeyE") return;
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    if (_atTop || isNearArea()) tryInteract();
  });

  const btn = document.getElementById("btn-interact");
  if (btn) {
    btn.addEventListener("click", () => {
      if (window.__nearNPC) return;
      if (_atTop || isNearArea()) tryInteract();
    });
  }
}

export function updateBabel(delta) {
  if (!_player) return;

  // Keep the player locked to the top of the tower while up there.
  // (Movement keys would otherwise drag them off the platform / gravity
  // would pull them down.) Position is snapped each frame.
  if (_atTop) {
    _player.group.position.copy(_topAnchor);
    _player.velocity.y = 0;
    _player.onGround = true;
  }

  // Countdown. In multiplayer the start time is published by the first
  // brick-dropper; every client derives remaining time from that.
  if (_timerActive) {
    if (_isMultiplayer && _remoteStartedAt) {
      _timerSeconds = Math.max(0, TIMER_SECONDS - (Date.now() - _remoteStartedAt) / 1000);
    } else {
      _timerSeconds -= delta;
    }
    if (_timerSeconds <= 0) {
      _timerSeconds = 0;
      if (_isMultiplayer) {
        // Let the network drive failEvent via state="failed". Only the
        // first client to notice writes the change.
        _timerActive = false;
        commitTimeoutRemote();
      } else {
        failEvent();
      }
    }
  }

  // Builder animations — gentle idle sway plus burst hammering after a drop
  for (const b of _builders) {
    b.idlePhase += delta * 1.5;
    const idleSway = Math.sin(b.idlePhase) * 0.08;
    if (b.animActive) {
      b.animT += delta;
      const dur = 2.8;
      if (b.animT < 0) {
        b.parts.armR.rotation.x = idleSway;
        b.parts.armL.rotation.x = -idleSway;
        continue;
      }
      if (b.animT >= dur) {
        b.animActive = false;
        b.parts.armR.rotation.x = 0;
      } else {
        const phase = b.animT * 7;
        const swing = (Math.sin(phase) + 1) * 0.5;
        b.parts.armR.rotation.x = -2.4 + swing * 2.9;
        b.parts.armL.rotation.x = 0.25 * Math.sin(phase + Math.PI);
      }
    } else {
      b.parts.armR.rotation.x = idleSway;
      b.parts.armL.rotation.x = -idleSway;
    }
    if (b.scattering) {
      b.scatterT += delta;
      if (b.scatterT < 2) {
        b.group.position.x += b.scatterDX * delta;
        b.group.position.z += b.scatterDZ * delta;
        b.group.rotation.y = Math.atan2(b.scatterDX, b.scatterDZ);
        b.group.position.y = Math.abs(Math.sin(b.scatterT * 12)) * 0.15;
      } else {
        b.group.position.y = 0;
      }
    }
  }

  // Tumbling collapsed bricks
  if (_animatingCollapse) {
    for (const b of _tower.children) {
      if (b.userData.vy === undefined) continue;
      b.userData.vy -= 9.8 * delta;
      b.position.x += b.userData.vx * delta;
      b.position.y += b.userData.vy * delta;
      b.position.z += b.userData.vz * delta;
      b.rotation.x += b.userData.spin * delta;
      b.rotation.z += b.userData.spin * delta * 0.7;
      if (b.position.y < BRICK_H / 2) {
        b.position.y = BRICK_H / 2;
        b.userData.vy = -b.userData.vy * 0.3;
        b.userData.vx *= 0.55;
        b.userData.vz *= 0.55;
        b.userData.spin *= 0.6;
      }
    }
  }

  // HUD
  const hud = ensureHud();
  if (_state === "building" || _state === "complete" || _state === "atTop" ||
      _state === "kept" || _state === "destroying" || _state === "failed" ||
      _placedCount > 0) {
    hud.style.display = "block";
    const sec = Math.ceil(_timerSeconds);
    let label = `🗼 Tower of Babel: ${_placedCount}/${BRICKS_TOTAL}`;
    if (_timerActive) label += `&nbsp;&nbsp;⏱️ ${sec}s`;
    else if (_state === "complete") label += "&nbsp;&nbsp;✅ Complete — climb the door!";
    else if (_state === "kept")     label += "&nbsp;&nbsp;🏛️ Monument";    if (_isMultiplayer && _contributorCount > 0) {
      label += `&nbsp;&nbsp;👥 ${_contributorCount} builder${_contributorCount > 1 ? "s" : ""}`;
    }    hud.innerHTML = label;
  } else {
    hud.style.display = "none";
  }

  // Proximity prompt
  const prompt = ensurePrompt();
  if (_state === "destroying" || _state === "cooldown" || _animatingCollapse) {
    prompt.style.display = "none";
    return;
  }
  if (_atTop) {
    prompt.textContent = "🪟 Press E to look out the window";
    prompt.style.display = "block";
    return;
  }
  if (nearDoor()) {
    prompt.textContent = "🚪 Press E to climb the tower";
    prompt.style.display = "block";
  } else if (nearPile()) {
    prompt.textContent = _placedCount >= BRICKS_TOTAL
      ? "🏛️ The tower is finished — climb up at the door"
      : (_carrying ? "🧱 You're already carrying a brick"
                   : "🧱 Press E to grab a brick");
    prompt.style.display = "block";
  } else if (nearSite()) {
    prompt.textContent = _placedCount >= BRICKS_TOTAL
      ? "🏛️ The tower is finished — climb up at the door"
      : (_carrying ? "🏗️ Press E to drop the brick on the tower"
                   : "🏗️ Bring a brick from the pile");
    prompt.style.display = "block";
  } else {
    prompt.style.display = "none";
  }
}

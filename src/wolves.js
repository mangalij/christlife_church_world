// Wolves in Sheep's Clothing — periodic events where a deceptive NPC
// sneaks into the sanctuary disguised as a humble white-clad visitor and
// starts stealing from the offering box. The player gets an alert,
// hunts them down, and sprinkles holy water (default key: H) to expose
// and convict them.
//
// On a successful sprinkle:
//   • The wolf is "exposed" — sheep's clothing pulses red, the disguise
//     drops to reveal grey wool.
//   • They kneel in repentance for ~2s.
//   • The stolen offering is restored AND the player is rewarded:
//       +1 member  (the wolf repents and joins the flock for real)
//       +75 XP     (Vigilant Shepherd bonus)
//   • Matthew 7:15 is shown as a verse toast.
//   • The wolves-caught counter is incremented in localStorage and shown
//     in a toast every time it crosses a milestone (5, 10, 25, …).
//
// If the wolf isn't caught within ~120 seconds they escape with the
// offering — the player loses 25 XP and is warned to stay vigilant.
//
// Reference verse:
//   "Beware of false prophets, which come to you in sheep's clothing,
//    but inwardly they are ravenous wolves."  — Matthew 7:15

import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { showToast, openMinigameModal } from "./ui.js";
import { addXP, addMember, spendXP, getXP } from "./growth.js";
import { setHolyButtonVisible } from "./player.js";

const KEY_CAUGHT = "clw_wolves_caught";

const FIRST_SPAWN_DELAY = 300;      // seconds after game start (5 minutes)
const RESPAWN_MIN = 300;            // seconds between events — fixed 5 min cadence
const RESPAWN_MAX = 300;            // seconds between events (max)
const STEAL_TIMEOUT = 120;          // wolf escapes if not caught in this many seconds
const SPRINKLE_RANGE = 3.5;         // metres
const SPRINKLE_COOLDOWN = 0.6;      // seconds between sprinkles (rate limit)
const TITHE_RANGE = 2.8;            // metres — how close to interact with the box

// Tithe tiers — cost in XP and the chance to draw a new member as a blessing.
// (Tithing in-game is symbolic: the player invests their XP "effort" into
// the church and may be rewarded with a new soul joining the flock.)
const TITHE_TIERS = [
  { id: "mite",       label: "Widow's Mite",   cost: 5,   memberChance: 0.10, verse: "\"She put in everything — all she had to live on.\" — Mark 12:44" },
  { id: "tithe",      label: "Faithful Tithe", cost: 25,  memberChance: 0.35, verse: "\"Bring the whole tithe into the storehouse...\" — Malachi 3:10" },
  { id: "sacrifice",  label: "Sacrificial Gift", cost: 100, memberChance: 0.85, verse: "\"God loves a cheerful giver.\" — 2 Corinthians 9:7" },
];

let _scene = null;
let _player = null;
let _zones = null;

let _wolf = null;                   // active wolf (null when none)
let _timeUntilSpawn = FIRST_SPAWN_DELAY;
let _lastSprinkleAt = 0;
let _sprinkleParticles = [];        // active sprinkle particle meshes
let _bannerDiv = null;
let _promptDiv = null;
let _offeringBox = null;
let _offeringCoinCount = 0;         // visual coins on the box
let _offeringCoins = [];            // refs to coin meshes (for visual top-ups)
let _tithePromptDiv = null;         // "Press E to tithe" hint near the box
let _titheMenuOpen = false;         // suppress re-opening while modal is shown
let _lastTitheAt = 0;               // rate limit
const TITHE_COOLDOWN = 0.4;

// ---- Offering box (target for theft) -------------------------------
// A small wooden box near the pulpit. Just decorative; we don't actually
// subtract from the player's XP unless the wolf escapes.
function buildOfferingBox() {
  const m = c => new THREE.MeshToonMaterial({ color: c });
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.6), m(0x8B4513));
  body.position.y = 0.3;
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.05, 0.65), m(0x6B3410));
  lid.position.y = 0.65;
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.02, 0.07), m(0x111111));
  slot.position.y = 0.68;
  // Small cross emblem on the front
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 0.04), m(0xFFD700));
  crossV.position.set(0, 0.3, 0.32);
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.04), m(0xFFD700));
  crossH.position.set(0, 0.34, 0.32);
  group.add(body, lid, slot, crossV, crossH);
  group.position.set(-3.5, 0, -22);   // beside the pulpit
  _scene.add(group);

  // A few coin discs on top as a "this has offerings in it" hint
  for (let i = 0; i < 4; i++) {
    const coin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.02, 12),
      new THREE.MeshToonMaterial({ color: 0xFFD700 })
    );
    coin.position.set(
      group.position.x + (Math.random() - 0.5) * 0.4,
      0.71,
      group.position.z + (Math.random() - 0.5) * 0.3
    );
    _scene.add(coin);
    _offeringCoins.push(coin);
    _offeringCoinCount++;
  }

  return group;
}

// Add a visible coin on top of the box as feedback when the player tithes.
function addOfferingCoin() {
  if (!_offeringBox) return;
  const coin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 0.02, 12),
    new THREE.MeshToonMaterial({ color: 0xFFD700 })
  );
  // Stack new coins a touch higher each time so they don't all z-fight.
  const stackY = 0.71 + Math.min(_offeringCoinCount - 4, 6) * 0.025;
  coin.position.set(
    _offeringBox.position.x + (Math.random() - 0.5) * 0.5,
    Math.max(0.71, stackY),
    _offeringBox.position.z + (Math.random() - 0.5) * 0.35
  );
  _scene.add(coin);
  _offeringCoins.push(coin);
  _offeringCoinCount++;
}

// ---- Wolf NPC mesh -------------------------------------------------
// A white-clad "sheep" with subtle tells: two glowing red pupils and a
// faint red disc on the ground beneath them. Looks innocent at a glance
// but reads suspicious if you get close.
function buildWolfMesh() {
  const m = c => new THREE.MeshToonMaterial({ color: c });
  const group = new THREE.Group();

  // Body in fleecy white (the "sheep's clothing")
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1, 0.5), m(0xF5F5F0));
  torso.position.y = 1.2;
  // Hood / head
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.6), m(0xE8DCC0));
  head.position.y = 2.05;
  // Glowing red eyes — the giveaway when you look closely
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xFF3030 });
  const eyeGeom = new THREE.SphereGeometry(0.07, 6, 6);
  const eyeL = new THREE.Mesh(eyeGeom, eyeMat); eyeL.position.set(-0.15, 2.1, 0.32);
  const eyeR = new THREE.Mesh(eyeGeom, eyeMat); eyeR.position.set( 0.15, 2.1, 0.32);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.9, 0.4), m(0x222222));
  legL.position.set(-0.22, 0.45, 0);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.9, 0.4), m(0x222222));
  legR.position.set(0.22, 0.45, 0);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.85, 0.4), m(0xF5F5F0));
  armL.position.set(-0.6, 1.2, 0);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.85, 0.4), m(0xF5F5F0));
  armR.position.set(0.6, 1.2, 0);

  [torso, head, legL, legR, armL, armR, eyeL, eyeR].forEach(part => {
    part.castShadow = true;
    group.add(part);
  });

  // Faint red aura disc under their feet — pulses while stealing
  const auraGeom = new THREE.RingGeometry(0.5, 1.1, 24);
  const aura = new THREE.Mesh(
    auraGeom,
    new THREE.MeshBasicMaterial({
      color: 0xFF3030, side: THREE.DoubleSide,
      transparent: true, opacity: 0.35
    })
  );
  aura.rotation.x = -Math.PI / 2;
  aura.position.y = 0.02;
  group.add(aura);

  // Label
  const div = document.createElement("div");
  div.style.cssText = "color:#fff;font-size:12px;font-family:'Nunito',sans-serif;" +
    "background:rgba(40,0,0,0.7);padding:2px 6px;border-radius:4px;pointer-events:none;";
  div.textContent = "Stranger · Visitor";
  const label = new CSS2DObject(div);
  label.position.set(0, 2.6, 0);
  group.add(label);

  // Spawn just inside the sanctuary entrance
  group.position.set(6 + (Math.random() - 0.5) * 4, 0, -2);
  _scene.add(group);

  return {
    group,
    parts: { legL, legR, armL, armR, torso, head, eyeL, eyeR, aura, label, labelDiv: div },
    state: "approaching",            // approaching | stealing | exposed | repenting | escaping
    stateTime: 0,
    timeAlive: 0,
    target: _offeringBox.position.clone(),
    stolen: 0,
  };
}// ---- HUD: alert banner + sprinkle prompt ---------------------------
function ensureBanner() {
  if (_bannerDiv) return _bannerDiv;
  const div = document.createElement("div");
  div.id = "wolf-alert";
  div.style.cssText =
    "position:fixed;top:14px;left:50%;transform:translateX(-50%);" +
    "background:linear-gradient(90deg,#7a0000,#c41010,#7a0000);" +
    "color:#fff;font-family:'Fredoka One',cursive;font-size:14px;" +
    "padding:8px 18px;border-radius:24px;border:2px solid #FFD700;" +
    "box-shadow:0 4px 18px rgba(196,16,16,0.5);z-index:55;display:none;" +
    "animation:wolf-pulse 1.4s infinite;";
  document.body.appendChild(div);

  if (!document.getElementById("wolf-alert-style")) {
    const style = document.createElement("style");
    style.id = "wolf-alert-style";
    style.textContent =
      "@keyframes wolf-pulse {" +
      "  0%,100% { box-shadow:0 4px 18px rgba(196,16,16,0.5); }" +
      "  50%     { box-shadow:0 4px 28px rgba(255,80,80,0.95); }" +
      "}";
    document.head.appendChild(style);
  }
  _bannerDiv = div;
  return div;
}

function ensurePrompt() {
  if (_promptDiv) return _promptDiv;
  const div = document.createElement("div");
  div.id = "wolf-prompt";
  div.style.cssText =
    "position:fixed;left:50%;bottom:180px;transform:translateX(-50%);" +
    "background:rgba(20,60,120,0.9);color:#A0E0FF;padding:8px 16px;border-radius:8px;" +
    "font-family:'Fredoka One',cursive;font-size:15px;pointer-events:none;display:none;" +
    "z-index:50;border:1px solid #6FB8FA;";
  document.body.appendChild(div);
  _promptDiv = div;
  return div;
}

function ensureTithePrompt() {
  if (_tithePromptDiv) return _tithePromptDiv;
  const div = document.createElement("div");
  div.id = "tithe-prompt";
  div.style.cssText =
    "position:fixed;left:50%;bottom:150px;transform:translateX(-50%);" +
    "background:rgba(60,40,10,0.9);color:#FFD700;padding:8px 16px;border-radius:8px;" +
    "font-family:'Fredoka One',cursive;font-size:15px;pointer-events:none;display:none;" +
    "z-index:50;border:1px solid #FFD700;";
  div.textContent = "💰 Press E to give a tithe";
  document.body.appendChild(div);
  _tithePromptDiv = div;
  return div;
}

// Is the player close enough to the offering box to interact with it?
function nearOfferingBox() {
  if (!_offeringBox || !_player) return false;
  return _player.group.position.distanceTo(_offeringBox.position) <= TITHE_RANGE;
}

// Refresh the "Press E to tithe" prompt visibility every frame.
function updateTithePrompt() {
  const div = ensureTithePrompt();
  const show =
    !_titheMenuOpen &&
    !window.__nearNPC &&
    document.getElementById("dialogue-box")?.style.display !== "block" &&
    document.getElementById("minigame-modal")?.style.display !== "flex" &&
    nearOfferingBox();
  div.style.display = show ? "block" : "none";
}

// ---- Tithe menu ----------------------------------------------------
function openTitheMenu() {
  if (_titheMenuOpen) return;
  const now = performance.now() / 1000;
  if (now - _lastTitheAt < TITHE_COOLDOWN) return;
  _lastTitheAt = now;

  const xp = getXP();
  const rows = TITHE_TIERS.map(t => {
    const can = xp >= t.cost;
    const pct = Math.round(t.memberChance * 100);
    return (
      `<button class="tithe-opt" data-tier="${t.id}" ${can ? "" : "disabled"} ` +
      `style="display:flex;justify-content:space-between;align-items:center;gap:12px;` +
      `padding:14px 18px;margin:8px 0;width:100%;border-radius:12px;cursor:${can?"pointer":"not-allowed"};` +
      `background:${can?"#3a2410":"#2a1a08"};color:${can?"#FFD700":"#7a6a3a"};` +
      `border:2px solid ${can?"#FFD700":"#5a4a1a"};font-family:'Fredoka One',cursive;font-size:15px;text-align:left;\">` +
      `<span>${t.label}</span>` +
      `<span style=\"font-size:13px;opacity:0.9;\">−${t.cost} XP · ${pct}% new soul</span>` +
      `</button>`
    );
  }).join("");

  const html =
    `<h2 style=\"color:#FFD700;font-family:'Fredoka One',cursive;margin:0 0 6px 0;\">💰 Offering Box</h2>` +
    `<p style=\"color:#ddd;margin:0 0 10px 0;font-size:14px;\">` +
    `\"Each of you should give what you have decided in your heart to give.\"<br>` +
    `<span style=\"color:#aaa;font-size:12px;\">— 2 Corinthians 9:7</span></p>` +
    `<p style=\"color:#bbb;font-size:13px;margin:0 0 10px 0;\">You have <b style=\"color:#FFD700;\">${xp} XP</b> to give.</p>` +
    rows +
    `<button id=\"tithe-cancel\" style=\"margin-top:10px;padding:10px 16px;width:100%;border-radius:10px;` +
    `background:#2a1a40;color:#ccc;border:1px solid #5a4a7a;cursor:pointer;font-family:'Fredoka One',cursive;\">Maybe later</button>`;

  openMinigameModal(html);
  _titheMenuOpen = true;

  // Wire up the buttons. The modal owns its own ✕ close handler in ui.js.
  document.querySelectorAll(".tithe-opt").forEach(btn => {
    btn.addEventListener("click", () => {
      const tier = TITHE_TIERS.find(t => t.id === btn.dataset.tier);
      if (tier) submitTithe(tier);
      closeTitheMenu();
    });
  });
  document.getElementById("tithe-cancel")?.addEventListener("click", closeTitheMenu);

  // Also clear our open flag if the user dismisses the modal with the ✕.
  const closeBtn = document.getElementById("minigame-close");
  if (closeBtn) {
    const onceClose = () => { _titheMenuOpen = false; closeBtn.removeEventListener("click", onceClose); };
    closeBtn.addEventListener("click", onceClose);
  }
}

function closeTitheMenu() {
  const modal = document.getElementById("minigame-modal");
  if (modal) modal.style.display = "none";
  _titheMenuOpen = false;
  if (!window.isMobile) document.body.requestPointerLock?.();
}

function submitTithe(tier) {
  if (!spendXP(tier.cost)) {
    showToast(`✋ Not enough XP for the ${tier.label} (need ${tier.cost}).`);
    return;
  }
  addOfferingCoin();
  showToast(`🙏 ${tier.label} given. ${tier.verse}`);
  if (Math.random() < tier.memberChance) {
    setTimeout(() => {
      addMember(1);
      showToast("✨ Your generosity drew a new soul to the church! +1 Member");
    }, 1200);
  }
}

// Compass-style direction hint relative to camera forward.
function compassHint(playerPos, targetPos) {
  const dx = targetPos.x - playerPos.x;
  const dz = targetPos.z - playerPos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  // Use simple cardinal hints rather than camera-relative to avoid pulling
  // the camera into this module.
  let dir = "";
  if (Math.abs(dx) > Math.abs(dz)) dir = dx > 0 ? "east" : "west";
  else                              dir = dz > 0 ? "south" : "north";
  return { dist: Math.round(dist), dir };
}

// ---- Holy water particle effect ------------------------------------
function spawnSprinkle(targetPos) {
  const mat = new THREE.MeshBasicMaterial({
    color: 0x9BD6FF, transparent: true, opacity: 0.9
  });
  for (let i = 0; i < 14; i++) {
    const drop = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), mat);
    drop.position.set(
      targetPos.x + (Math.random() - 0.5) * 0.8,
      targetPos.y + 2.6 + Math.random() * 0.4,
      targetPos.z + (Math.random() - 0.5) * 0.8
    );
    drop.userData.vy = -2 - Math.random() * 1.5;
    drop.userData.life = 1.0;
    _scene.add(drop);
    _sprinkleParticles.push(drop);
  }
}

function updateSprinkles(delta) {
  for (let i = _sprinkleParticles.length - 1; i >= 0; i--) {
    const p = _sprinkleParticles[i];
    p.position.y += p.userData.vy * delta;
    p.userData.life -= delta * 1.4;
    p.material.opacity = Math.max(0, p.userData.life);
    if (p.userData.life <= 0 || p.position.y < 0.05) {
      _scene.remove(p);
      _sprinkleParticles.splice(i, 1);
    }
  }
}

// ---- Spawn / despawn -----------------------------------------------
function spawnWolf() {
  if (_wolf) return;
  _wolf = buildWolfMesh();
  ensureBanner().style.display = "block";
  showToast("⚠️ Someone is stealing from the church! Find the wolf in sheep's clothing!");
}

function despawnWolf() {
  if (!_wolf) return;
  // CSS2DRenderer keeps the label's <div> attached to the DOM even after
  // its parent Object3D is removed from the scene — it only re-parents
  // elements on render, never removes orphaned ones. So the "Repentant
  // Soul" tag would linger on screen until the next CSS2DObject got
  // added. Detach the label from the group AND remove the <div> from
  // the DOM ourselves before dropping the wolf.
  const { label, labelDiv } = _wolf.parts;
  if (label && label.parent) label.parent.remove(label);
  if (labelDiv && labelDiv.parentNode) labelDiv.parentNode.removeChild(labelDiv);

  _scene.remove(_wolf.group);
  _wolf = null;
  ensureBanner().style.display = "none";
  ensurePrompt().style.display = "none";
  setHolyButtonVisible(false);
  _timeUntilSpawn = RESPAWN_MIN + Math.random() * (RESPAWN_MAX - RESPAWN_MIN);
}

// ---- Sprinkle (player interaction) ---------------------------------
function trySprinkle() {
  if (!_wolf || !_player) return;
  const now = performance.now() / 1000;
  if (now - _lastSprinkleAt < SPRINKLE_COOLDOWN) return;
  const dist = _player.group.position.distanceTo(_wolf.group.position);
  if (dist > SPRINKLE_RANGE) {
    showToast("💧 Get closer to sprinkle holy water.");
    return;
  }
  if (_wolf.state === "exposed" || _wolf.state === "repenting") return;
  _lastSprinkleAt = now;
  spawnSprinkle(_wolf.group.position);
  exposeWolf();
}

function exposeWolf() {
  if (!_wolf) return;
  _wolf.state = "exposed";
  _wolf.stateTime = 0;
  // Disguise drops — torso/arms turn dark grey wool, eyes flare
  _wolf.parts.torso.material.color.setHex(0x4a3a2a);
  _wolf.parts.armL.material.color.setHex(0x4a3a2a);
  _wolf.parts.armR.material.color.setHex(0x4a3a2a);
  _wolf.parts.head.material.color.setHex(0x3a2a1a);
  _wolf.parts.aura.material.color.setHex(0xFFFFFF);
  _wolf.parts.aura.material.opacity = 0.8;
  _wolf.parts.labelDiv.textContent = "Wolf · Exposed!";
  _wolf.parts.labelDiv.style.background = "rgba(120,20,20,0.9)";
}

function convictWolf() {
  if (!_wolf) return;
  _wolf.state = "repenting";
  _wolf.stateTime = 0;
  // Kneel pose
  _wolf.parts.legL.rotation.x = -Math.PI / 2;
  _wolf.parts.legR.rotation.x = -Math.PI / 2;
  _wolf.parts.armL.rotation.x = -Math.PI / 3;
  _wolf.parts.armR.rotation.x = -Math.PI / 3;
  _wolf.group.position.y = -0.4;
  _wolf.parts.labelDiv.textContent = "Repentant Soul";
  _wolf.parts.labelDiv.style.background = "rgba(20,80,30,0.85)";
}

function finishConviction() {
  const caught = (parseInt(localStorage.getItem(KEY_CAUGHT) || "0", 10) || 0) + 1;
  localStorage.setItem(KEY_CAUGHT, String(caught));

  addXP(75);
  addMember(1);
  showToast("🕊️ \"Beware of false prophets in sheep's clothing.\" — Matthew 7:15");
  setTimeout(() => {
    showToast(`✨ Wolf repented! +75 XP, +1 Member (Caught: ${caught})`);
  }, 1400);

  // Milestone shoutouts
  if (caught === 5 || caught === 10 || caught === 25 || caught === 50) {
    setTimeout(() => {
      showToast(`🛡️ Shepherd of the Flock — ${caught} wolves caught!`);
    }, 2800);
  }

  despawnWolf();
}

function escapeWolf() {
  showToast("😈 The wolf escaped with the offering! -25 XP");
  addXP(-25);
  despawnWolf();
}

// ---- Per-frame update ---------------------------------------------
function updateWolfBehavior(delta) {
  if (!_wolf) return;
  _wolf.timeAlive += delta;
  _wolf.stateTime += delta;

  // Subtle red aura pulse while still disguised
  if (_wolf.state === "approaching" || _wolf.state === "stealing") {
    const pulse = 0.25 + 0.25 * (0.5 + 0.5 * Math.sin(_wolf.timeAlive * 4));
    _wolf.parts.aura.material.opacity = pulse;
  }

  // Tiny eye flicker
  const flicker = 0.7 + 0.3 * Math.sin(_wolf.timeAlive * 8);
  _wolf.parts.eyeL.scale.setScalar(flicker);
  _wolf.parts.eyeR.scale.setScalar(flicker);

  if (_wolf.state === "approaching") {
    // Walk toward the offering box
    const to = _wolf.target.clone().sub(_wolf.group.position);
    to.y = 0;
    const d = to.length();
    if (d < 1.2) {
      _wolf.state = "stealing";
      _wolf.stateTime = 0;
    } else {
      to.normalize().multiplyScalar(1.4 * delta);
      _wolf.group.position.add(to);
      _wolf.group.lookAt(_wolf.target.x, 0, _wolf.target.z);
      // Walk cycle
      const t = _wolf.timeAlive * 4;
      _wolf.parts.legL.rotation.x = Math.sin(t) * 0.4;
      _wolf.parts.legR.rotation.x = Math.sin(t + Math.PI) * 0.4;
    }
  } else if (_wolf.state === "stealing") {
    // Sneaky "stealing" arm wiggle
    _wolf.parts.armR.rotation.x = -1.0 + Math.sin(_wolf.timeAlive * 6) * 0.3;
    _wolf.stolen += delta * 5;       // visual coin counter only
    if (_wolf.timeAlive > STEAL_TIMEOUT) {
      _wolf.state = "escaping";
      _wolf.stateTime = 0;
    }
  } else if (_wolf.state === "exposed") {
    // Wobble briefly then convict
    _wolf.group.rotation.z = Math.sin(_wolf.stateTime * 20) * 0.15;
    if (_wolf.stateTime > 0.9) {
      _wolf.group.rotation.z = 0;
      convictWolf();
    }
  } else if (_wolf.state === "repenting") {
    if (_wolf.stateTime > 2.2) {
      finishConviction();
    }
  } else if (_wolf.state === "escaping") {
    // Sprint toward the church exit at z=0
    const exit = new THREE.Vector3(0, 0, 6);
    const to = exit.clone().sub(_wolf.group.position);
    to.y = 0;
    const d = to.length();
    if (d < 1.0) { escapeWolf(); return; }
    to.normalize().multiplyScalar(4.0 * delta);
    _wolf.group.position.add(to);
    _wolf.group.lookAt(exit.x, 0, exit.z);
  }
}

function updateHUD() {
  if (!_wolf) return;
  const banner = ensureBanner();
  const { dist, dir } = compassHint(_player.group.position, _wolf.group.position);
  const timeLeft = Math.max(0, Math.ceil(STEAL_TIMEOUT - _wolf.timeAlive));
  banner.textContent = `🐺 Wolf in sheep's clothing! ~${dist}m to the ${dir} — ${timeLeft}s left`;

  // Sprinkle prompt — both desktop hint and the mobile contextual button.
  const prompt = ensurePrompt();
  const active = _wolf.state === "approaching" || _wolf.state === "stealing";
  const close  = active &&
    _player.group.position.distanceTo(_wolf.group.position) <= SPRINKLE_RANGE;
  if (close) {
    prompt.textContent = "💧 Press H to sprinkle holy water";
    prompt.style.display = "block";
  } else {
    prompt.style.display = "none";
  }
  // Mobile button shows whenever a wolf is in play so the player can
  // always find and tap it; it's a no-op out of range (toast).
  setHolyButtonVisible(active);
}

// ---- Public API ----------------------------------------------------
export function initWolves(scene, player, zones) {
  _scene = scene;
  _player = player;
  _zones = zones;
  _offeringBox = buildOfferingBox();
  ensureBanner();
  ensurePrompt();

  window.addEventListener("keydown", e => {
    if (e.code !== "KeyH") return;
    // Defer to other modals
    if (document.getElementById("dialogue-box")?.style.display === "block") return;
    if (document.getElementById("minigame-modal")?.style.display === "flex") return;
    trySprinkle();
  });

  // Tithe: press E near the offering box to open the giving menu.
  // Defer to NPC dialogue (E talks to NPCs) and any open modals/inputs.
  window.addEventListener("keydown", e => {
    if (e.code !== "KeyE") return;
    if (window.__nearNPC) return;
    if (document.getElementById("dialogue-box")?.style.display === "block") return;
    if (document.getElementById("minigame-modal")?.style.display === "flex") return;
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    if (!nearOfferingBox()) return;
    openTitheMenu();
  });

  // Mobile: the contextual interact button also opens the tithe menu
  // when the player is at the box and no NPC has claimed the button.
  const interactBtn = document.getElementById("btn-interact");
  if (interactBtn) {
    interactBtn.addEventListener("click", () => {
      if (window.__nearNPC) return;
      if (document.getElementById("minigame-modal")?.style.display === "flex") return;
      if (nearOfferingBox()) openTitheMenu();
    });
  }

  // Expose the count so the Who Panel can read it if it ever wants to.
  zones.wolvesCaughtKey = KEY_CAUGHT;
}

export function updateWolves(delta) {
  if (!_scene) return;
  updateSprinkles(delta);
  updateTithePrompt();
  if (_wolf) {
    updateWolfBehavior(delta);
    updateHUD();
  } else {
    _timeUntilSpawn -= delta;
    if (_timeUntilSpawn <= 0) spawnWolf();
  }
}

export function getWolvesCaught() {
  return parseInt(localStorage.getItem(KEY_CAUGHT) || "0", 10) || 0;
}

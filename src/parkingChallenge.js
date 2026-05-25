// Parking Challenge mini-game.
//
// A "Parking Challenge" sign sits at the parking lot. Press E next to it
// (or its mobile interact button) while inside a car to start. A sequence
// of house driveways glow yellow; the player must drive the active car
// into each highlighted driveway and stop. Each successful park advances
// to the next driveway. Park all of them before the timer runs out to win
// XP + members.
//
//   • ROUND_COUNT driveways to park at, picked randomly each game
//   • TIMER_SECONDS total to finish all rounds
//   • Glow ring pulses yellow on the target driveway; flashes green on
//     successful park; turns red briefly on timeout.

import * as THREE from "three";
import { requestInteractButton } from "./player.js";
import { showToast } from "./ui.js";
import { addXP, addMember } from "./growth.js";
import { isDriving, getActiveCar } from "./vehicle.js";

// ---- Configuration -----------------------------------------------
const SIGN_X = -28;            // just west of the church parking lot row
const SIGN_Z = 22;
const INTERACT_RANGE = 3.0;

const ROUND_COUNT    = 3;
const TIMER_SECONDS  = 90;
const PARK_VELOCITY  = 0.6;    // car must be at-or-below this to count as parked
const PARK_DWELL     = 0.6;    // seconds the car must stay parked to confirm

const XP_PER_ROUND   = 25;
const XP_BONUS_WIN   = 50;
const MEMBERS_WIN    = 2;

// ---- Module state -------------------------------------------------
let _scene = null;
let _zones = null;
let _player = null;
let _spots = [];

let _state = "idle";           // idle | active | success | failed | cooldown
let _roundIndex = 0;
let _activeSpot = null;
let _queue = [];               // remaining driveway spots for this game
let _timer = 0;
let _dwellT = 0;
let _glowRing = null;
let _glowPulse = 0;
let _glowColor = 0xFFD700;
let _hudDiv = null;
let _promptDiv = null;

// ---- Sign + glow geometry ----------------------------------------
function buildSign() {
  const g = new THREE.Group();

  // Wooden post + plaque
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.08, 1.8, 8),
    new THREE.MeshToonMaterial({ color: 0x6B3410 })
  );
  post.position.y = 0.9;
  post.castShadow = true;
  g.add(post);

  const plaque = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.7, 0.1),
    new THREE.MeshToonMaterial({ color: 0xC9B07A })
  );
  plaque.position.y = 1.9;
  g.add(plaque);

  // Floating label
  const c = document.createElement("canvas");
  c.width = 360; c.height = 96;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "rgba(20,10,40,0.92)"; ctx.fillRect(0, 0, 360, 96);
  ctx.fillStyle = "#FFD700"; ctx.font = "bold 24px Arial"; ctx.textAlign = "center";
  ctx.fillText("🅿️ Parking Challenge", 180, 38);
  ctx.font = "16px Arial";
  ctx.fillStyle = "#fff";
  ctx.fillText("Drive a car & press E here", 180, 66);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(c), transparent: true,
  }));
  sprite.position.set(0, 3.0, 0);
  sprite.scale.set(3.2, 0.85, 1);
  g.add(sprite);

  g.position.set(SIGN_X, 0, SIGN_Z);
  return g;
}

function buildGlowRing() {
  // A flat ring on the ground that pulses to show the active driveway.
  // We use an additive transparent material so it glows against the asphalt.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.0, 3.0, 32),
    new THREE.MeshBasicMaterial({
      color: 0xFFD700,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  ring.visible = false;
  return ring;
}

// ---- HUD ----------------------------------------------------------
function ensureHud() {
  if (_hudDiv) return _hudDiv;
  const div = document.createElement("div");
  div.id = "parking-hud";
  div.style.cssText =
    "position:fixed;left:50%;top:80px;transform:translateX(-50%);" +
    "background:rgba(20,10,40,0.92);color:#FFD700;padding:8px 16px;border-radius:10px;" +
    "font-family:'Fredoka One',cursive;font-size:15px;display:none;z-index:50;" +
    "border:2px solid #FFD700;pointer-events:none;text-align:center;";
  document.body.appendChild(div);
  _hudDiv = div;
  return div;
}
function ensurePrompt() {
  if (_promptDiv) return _promptDiv;
  const div = document.createElement("div");
  div.id = "parking-prompt";
  div.style.cssText =
    "position:fixed;left:50%;bottom:200px;transform:translateX(-50%);" +
    "background:rgba(20,10,40,0.92);color:#FFD700;padding:8px 16px;border-radius:8px;" +
    "font-family:'Fredoka One',cursive;font-size:15px;pointer-events:none;display:none;" +
    "z-index:50;border:1px solid #FFD700;";
  document.body.appendChild(div);
  _promptDiv = div;
  return div;
}

// ---- Proximity ----------------------------------------------------
function nearSign() {
  if (!_player) return false;
  // When driving, the player.group.position is frozen at the spot where
  // they entered the car. Use the car's position instead so the prompt /
  // E-key both work when the driver pulls up to the sign.
  let px, pz;
  const car = getActiveCar();
  if (car) {
    px = car.group.position.x;
    pz = car.group.position.z;
  } else {
    px = _player.group.position.x;
    pz = _player.group.position.z;
  }
  const dx = px - SIGN_X, dz = pz - SIGN_Z;
  // Use a larger radius when driving so a car (which has length ~4m) can
  // trigger from outside its centre.
  const r = car ? INTERACT_RANGE + 2.5 : INTERACT_RANGE;
  return dx * dx + dz * dz < r * r;
}

// ---- Game flow ----------------------------------------------------
function pickQueue() {
  const pool = _spots.slice();
  // Shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(ROUND_COUNT, pool.length));
}

function startGame() {
  if (_state !== "idle" && _state !== "cooldown") return;
  if (!isDriving()) {
    showToast("🚗 Get in a car first (press F next to one).");
    return;
  }
  if (_spots.length === 0) {
    showToast("No driveways found.");
    return;
  }
  _state = "active";
  _queue = pickQueue();
  _roundIndex = 0;
  _timer = TIMER_SECONDS;
  _dwellT = 0;
  nextRound();
  showToast(`🏁 Parking Challenge! Park in ${_queue.length} glowing driveways.`);
}

function nextRound() {
  _activeSpot = _queue[_roundIndex];
  if (!_activeSpot) { winGame(); return; }
  _glowColor = 0xFFD700;
  _glowRing.material.color.setHex(_glowColor);
  _glowRing.position.set(_activeSpot.cx, 0.06, _activeSpot.cz);
  _glowRing.visible = true;
  _dwellT = 0;
  showToast(`🅿️ Park at ${_activeSpot.name}!`);
}

function passRound() {
  // Flash green
  _glowColor = 0x55FF55;
  _glowRing.material.color.setHex(_glowColor);
  addXP(XP_PER_ROUND);
  showToast(`✅ Parked at ${_activeSpot.name}! +${XP_PER_ROUND} XP`);
  _roundIndex += 1;
  // Brief pause then next round / win
  setTimeout(() => {
    if (_state !== "active") return;
    nextRound();
  }, 800);
  _activeSpot = null;
}

function winGame() {
  _state = "success";
  _glowRing.visible = false;
  addXP(XP_BONUS_WIN);
  addMember(MEMBERS_WIN);
  showToast(`🏆 Parking Challenge complete! +${XP_BONUS_WIN} XP, +${MEMBERS_WIN} members.`);
  showCompletionModal();
  setTimeout(() => { _state = "idle"; }, 2500);
}

function showCompletionModal() {
  const modal = document.getElementById("minigame-modal");
  const content = document.getElementById("minigame-content");
  const closeBtn = document.getElementById("minigame-close");
  if (!modal || !content) return;
  const totalXP = XP_PER_ROUND * _queue.length + XP_BONUS_WIN;
  content.innerHTML = `
    <div style="text-align:center;padding:14px 8px;color:#FFD700;font-family:'Fredoka One',cursive;">
      <h2 style="margin:0 0 8px;font-size:28px;">🏆 Challenge Complete!</h2>
      <p style="margin:0 0 14px;color:#fff;font-size:15px;line-height:1.4;">
        You parked at all <b>${_queue.length}</b> driveways before the timer ran out.
        The neighborhood thanks you for the smooth deliveries!
      </p>
      <div style="background:rgba(255,215,0,0.12);border:1px solid #FFD700;border-radius:10px;
                  padding:10px 14px;display:inline-block;margin-bottom:14px;color:#fff;font-size:14px;">
        <div>🅿️ Rounds cleared: <b style="color:#FFD700;">${_queue.length}/${_queue.length}</b></div>
        <div>⭐ Total XP earned: <b style="color:#FFD700;">+${totalXP}</b></div>
        <div>🏛️ New members: <b style="color:#FFD700;">+${MEMBERS_WIN}</b></div>
      </div>
      <div>
        <button id="parking-modal-ok"
          style="background:#FFD700;color:#1a0a2e;border:none;padding:10px 22px;
                 border-radius:8px;font-family:inherit;font-size:15px;cursor:pointer;">
          Amen!
        </button>
      </div>
    </div>`;
  modal.style.display = "flex";
  if (closeBtn) closeBtn.style.display = "";
  const closeFn = () => { modal.style.display = "none"; };
  document.getElementById("parking-modal-ok").onclick = closeFn;
}

function failGame() {
  _state = "failed";
  _glowColor = 0xFF5555;
  if (_glowRing) _glowRing.material.color.setHex(_glowColor);
  showToast("⏰ Out of time! The drivers are still circling the block...");
  setTimeout(() => {
    if (_glowRing) _glowRing.visible = false;
    _state = "cooldown";
    setTimeout(() => { _state = "idle"; }, 3000);
  }, 1500);
  _activeSpot = null;
}

// ---- Per-frame ----------------------------------------------------
function checkParkedInSpot() {
  const car = getActiveCar();
  if (!car || !_activeSpot) return false;
  const cx = car.group.position.x, cz = car.group.position.z;
  const s = _activeSpot;
  const inside =
    Math.abs(cx - s.cx) <= s.halfW &&
    Math.abs(cz - s.cz) <= s.halfD;
  const stopped = Math.abs(car.velocity || 0) <= PARK_VELOCITY;
  return inside && stopped;
}

// ---- Interaction --------------------------------------------------
function tryInteract() {
  if (document.getElementById("dialogue-box")?.style.display === "block") return;
  if (document.getElementById("minigame-modal")?.style.display === "flex") return;
  if (window.__nearNPC) return;
  if (!nearSign()) return;
  if (_state === "active") {
    showToast("Challenge already running — finish it first!");
    return;
  }
  startGame();
}

// ---- Public API ---------------------------------------------------
export function initParkingChallenge(scene, player, zones) {
  _scene = scene;
  _player = player;
  _zones = zones;
  _spots = (zones && zones.parkingSpots) ? zones.parkingSpots.slice() : [];

  scene.add(buildSign());
  _glowRing = buildGlowRing();
  scene.add(_glowRing);

  ensureHud();
  ensurePrompt();

  window.addEventListener("keydown", e => {
    if (e.code !== "KeyE") return;
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    if (nearSign()) tryInteract();
  });

  const btn = document.getElementById("btn-interact");
  if (btn) {
    btn.addEventListener("click", () => {
      if (window.__nearNPC) return;
      if (nearSign()) tryInteract();
    });
  }
}

export function updateParkingChallenge(delta) {
  if (!_player) return;

  // Glow pulse
  if (_glowRing && _glowRing.visible) {
    _glowPulse += delta * 4.0;
    const base = (_state === "active" && _glowColor === 0xFFD700) ? 0.55 : 0.85;
    const amp  = (_state === "active" && _glowColor === 0xFFD700) ? 0.3  : 0.1;
    _glowRing.material.opacity = base + Math.sin(_glowPulse) * amp;
    // Gently rotate so it feels alive
    _glowRing.rotation.z += delta * 0.5;
  }

  if (_state === "active") {
    _timer -= delta;
    if (_timer <= 0) {
      _timer = 0;
      failGame();
    } else if (checkParkedInSpot()) {
      _dwellT += delta;
      if (_dwellT >= PARK_DWELL) {
        passRound();
      }
    } else {
      _dwellT = 0;
    }
  }

  // HUD
  const hud = ensureHud();
  if (_state === "active" || _state === "success" || _state === "failed") {
    hud.style.display = "block";
    if (_state === "active") {
      const sec = Math.ceil(_timer);
      const target = _activeSpot ? _activeSpot.name : "—";
      hud.innerHTML =
        `🅿️ Park at: <b>${target}</b> &nbsp;|&nbsp; ` +
        `${_roundIndex + 1}/${_queue.length} &nbsp;|&nbsp; ⏱️ ${sec}s`;
    } else if (_state === "success") {
      hud.innerHTML = "🏆 Parking Challenge complete!";
    } else {
      hud.innerHTML = "⏰ Time's up!";
    }
  } else {
    hud.style.display = "none";
  }

  // Prompt
  const prompt = ensurePrompt();
  // Mobile: register a vote for the interact button so a tap can start
  // (or — if already running — interact with) the challenge.
  requestInteractButton("parking", nearSign() && _state !== "active" && !window.__nearNPC);
  if (nearSign() && _state !== "active") {
    prompt.textContent = isDriving()
      ? "🅿️ Press E to start the Parking Challenge"
      : "🅿️ Get in a car (F) then press E here to start";
    prompt.style.display = "block";
  } else {
    prompt.style.display = "none";
  }
}

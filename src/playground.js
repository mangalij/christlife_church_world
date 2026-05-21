// Playground interactions — lets the player ride the slide and swing on
// the swing set near the courtyard "park" area.
//
// Press E near the slide's stairs to climb up and slide down the chute.
// Press E near a swing seat to hop on; press E again to dismount.
//
// While riding either, the player's normal movement is frozen via the
// exported isOnPlayground() check (consumed by player.js, same pattern
// used by sitting.js / isResting()).

import * as THREE from "three";
import { showToast } from "./ui.js";
import { addXP } from "./growth.js";

let _player = null;
let _zones = null;

let _mode = null;                  // null | "slide" | "swing"
let _saved = null;                 // saved player transform to restore on exit
let _promptDiv = null;

// Slide state
let _slideT = 0;                   // 0 → 1 progress along the chute
const SLIDE_CLIMB_TIME = 0.6;      // seconds to "climb" to the top
const SLIDE_RIDE_TIME  = 1.1;      // seconds to slide down the chute
let _slidePhase = "climb";         // "climb" | "ride"
let _slideClimbT = 0;

// Swing state
let _swingIndex = 0;               // which swing pivot
let _swingPhase = 0;               // angle phase
const SWING_OMEGA = 2.4;           // rad/s
const SWING_AMPLITUDE = 0.85;      // rad (~49°)
let _swingAmpScale = 0;            // 0 → 1 over the first second so it ramps up

const MOUNT_RANGE = 2.6;           // metres
const SWING_MOUNT_RANGE = 1.6;

export function isOnPlayground() { return _mode !== null; }

// --------- Prompt ---------------------------------------------------
function ensurePrompt() {
  if (_promptDiv) return _promptDiv;
  const div = document.createElement("div");
  div.id = "playground-prompt";
  div.style.cssText =
    "position:fixed;left:50%;bottom:170px;transform:translateX(-50%);" +
    "background:rgba(40,20,60,0.9);color:#FFD700;padding:8px 16px;border-radius:8px;" +
    "font-family:'Fredoka One',cursive;font-size:15px;pointer-events:none;display:none;" +
    "z-index:50;border:1px solid #FFD700;";
  document.body.appendChild(div);
  _promptDiv = div;
  return div;
}

// --------- Proximity helpers ---------------------------------------
function nearestSwingIndex(pos) {
  const swings = _zones.playground?.swings || [];
  let best = -1, bestD = Infinity;
  for (let i = 0; i < swings.length; i++) {
    const a = swings[i].anchorPos;
    const dx = a.x - pos.x, dz = a.z - pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD) { bestD = d2; best = i; }
  }
  return bestD <= SWING_MOUNT_RANGE * SWING_MOUNT_RANGE ? best : -1;
}

function nearSlideMount(pos) {
  const s = _zones.playground?.slide;
  if (!s) return false;
  const dx = s.mountPos.x - pos.x;
  const dz = s.mountPos.z - pos.z;
  return dx * dx + dz * dz <= MOUNT_RANGE * MOUNT_RANGE;
}

// --------- Mount / dismount ----------------------------------------
function saveTransform() {
  _saved = {
    pos:  _player.group.position.clone(),
    rotX: _player.group.rotation.x,
    rotY: _player.group.rotation.y,
    rotZ: _player.group.rotation.z,
    legLX: _player.parts.legL.rotation.x,
    legRX: _player.parts.legR.rotation.x,
    armLX: _player.parts.armL.rotation.x,
    armRX: _player.parts.armR.rotation.x,
  };
}

function restoreLimbs() {
  if (!_saved) return;
  const { legL, legR, armL, armR } = _player.parts;
  legL.rotation.x = _saved.legLX;
  legR.rotation.x = _saved.legRX;
  armL.rotation.x = _saved.armLX;
  armR.rotation.x = _saved.armRX;
  _player.group.rotation.x = 0;
  _player.group.rotation.z = 0;
}

function startSlide() {
  _mode = "slide";
  _slidePhase = "climb";
  _slideClimbT = 0;
  _slideT = 0;
  saveTransform();
  // Face the slide direction (sliding toward -x along the chute)
  _player.group.rotation.y = -Math.PI / 2;  // face -x
  // Bend the legs forward as if seated
  const { legL, legR, armL, armR } = _player.parts;
  legL.rotation.x = -Math.PI / 2;
  legR.rotation.x = -Math.PI / 2;
  armL.rotation.x = -0.4;
  armR.rotation.x = -0.4;
  showToast("🛝 Wheee!");
}

function finishSlide() {
  const s = _zones.playground.slide;
  _mode = null;
  restoreLimbs();
  // Step off forward (-x) so the prompt doesn't immediately re-trigger.
  _player.group.position.set(s.bottomPos.x - 1.6, 0, s.bottomPos.z);
  _player.velocity && (_player.velocity.y = 0);
  _player.onGround = true;
  _saved = null;
  addXP(2);
}

function startSwing(idx) {
  _mode = "swing";
  _swingIndex = idx;
  _swingPhase = 0;
  _swingAmpScale = 0;
  saveTransform();
  // Bend the legs forward as if seated
  const { legL, legR, armL, armR } = _player.parts;
  legL.rotation.x = -Math.PI / 2;
  legR.rotation.x = -Math.PI / 2;
  armL.rotation.x = -1.2;   // hands forward to grip the chains
  armR.rotation.x = -1.2;
  showToast("🪜 Hop on — press E to dismount");
}

function dismountSwing() {
  const sw = _zones.playground.swings[_swingIndex];
  // Reset the visible swing rig to rest.
  if (sw.pivot) sw.pivot.rotation.x = 0;
  _mode = null;
  restoreLimbs();
  // Step forward off the seat.
  _player.group.position.set(sw.anchorPos.x, 0, sw.anchorPos.z + 1.6);
  _player.velocity && (_player.velocity.y = 0);
  _player.onGround = true;
  _saved = null;
  addXP(1);
}

// --------- Per-frame animation -------------------------------------
function updateSlide(delta) {
  const s = _zones.playground.slide;
  if (_slidePhase === "climb") {
    _slideClimbT += delta;
    const t = Math.min(1, _slideClimbT / SLIDE_CLIMB_TIME);
    // Lerp from the mount spot up to the slide top.
    const from = s.mountPos;
    const to   = s.topPos;
    _player.group.position.set(
      from.x + (to.x - from.x) * t,
      from.y + (to.y - from.y) * t,
      from.z + (to.z - from.z) * t
    );
    // Stand upright while climbing.
    _player.group.rotation.x = 0;
    if (t >= 1) _slidePhase = "ride";
    return;
  }
  // Ride: lerp from slide top down to bottom along the chute.
  _slideT += delta / SLIDE_RIDE_TIME;
  const t = Math.min(1, _slideT);
  const from = s.topPos;
  const to   = s.bottomPos;
  _player.group.position.set(
    from.x + (to.x - from.x) * t,
    from.y + (to.y - from.y) * t,
    from.z + (to.z - from.z) * t
  );
  // Tilt back so the body lies along the chute slope (chute tilt rotates
  // around z; we're sliding in the x direction, so a rotation.z lean
  // matches it).
  _player.group.rotation.z = -s.tilt;
  if (t >= 1) finishSlide();
}

function updateSwing(delta) {
  const sw = _zones.playground.swings[_swingIndex];
  _swingPhase += delta * SWING_OMEGA;
  _swingAmpScale = Math.min(1, _swingAmpScale + delta * 0.8);
  const angle = Math.sin(_swingPhase) * SWING_AMPLITUDE * _swingAmpScale;
  // Visible swing rig
  if (sw.pivot) sw.pivot.rotation.x = angle;
  // Player snaps to the seat — compute world position from the swung pivot.
  // Pivot is at anchor; seat hangs straight down at -chainLen along the
  // pivot's local Y. After rotating around X by `angle`, the seat moves
  // in the YZ plane: dz = chainLen * sin(angle), dy = -chainLen * cos(angle).
  const a = sw.anchorPos;
  _player.group.position.set(
    a.x,
    a.y - sw.chainLen * Math.cos(angle) + sw.seatY * 0,   // seat top
    a.z + sw.chainLen * Math.sin(angle)
  );
  // Face along the bar (perpendicular to motion). Keep yaw fixed and lean
  // the body so it follows the swing.
  _player.group.rotation.y = 0;
  _player.group.rotation.x = -angle;
  _player.group.rotation.z = 0;
}

// --------- Interact entry point ------------------------------------
function tryInteract() {
  // Defer to NPC dialogue / modals / inputs.
  if (window.__nearNPC) return;
  if (document.getElementById("dialogue-box")?.style.display === "block") return;
  if (document.getElementById("minigame-modal")?.style.display === "flex") return;
  if (_mode === "swing") { dismountSwing(); return; }
  if (_mode === "slide") return;          // slide auto-finishes
  // Not currently riding — try to mount something nearby.
  const pos = _player.group.position;
  const swIdx = nearestSwingIndex(pos);
  if (swIdx !== -1) { startSwing(swIdx); return; }
  if (nearSlideMount(pos)) { startSlide(); return; }
}

// --------- Public API ----------------------------------------------
export function initPlayground(player, zones) {
  _player = player;
  _zones = zones;
  if (!_zones.playground) return;
  ensurePrompt();

  window.addEventListener("keydown", e => {
    if (e.code !== "KeyE") return;
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    tryInteract();
  });

  const btn = document.getElementById("btn-interact");
  if (btn) {
    btn.addEventListener("click", () => {
      // Only consume the mobile interact button when we'd actually act on it.
      if (window.__nearNPC) return;
      const pos = _player.group.position;
      if (_mode || nearestSwingIndex(pos) !== -1 || nearSlideMount(pos)) {
        tryInteract();
      }
    });
  }
}

export function updatePlayground(delta) {
  if (!_player || !_zones?.playground) return;

  if (_mode === "slide") { updateSlide(delta); }
  else if (_mode === "swing") { updateSwing(delta); }

  // Prompt management
  const prompt = ensurePrompt();
  if (_mode === "swing") {
    prompt.textContent = "Press E to hop off the swing";
    prompt.style.display = "block";
    return;
  }
  if (_mode === "slide") {
    prompt.style.display = "none";
    return;
  }
  if (window.__nearNPC) { prompt.style.display = "none"; return; }
  const pos = _player.group.position;
  if (nearestSwingIndex(pos) !== -1) {
    prompt.textContent = "🪜 Press E to swing";
    prompt.style.display = "block";
  } else if (nearSlideMount(pos)) {
    prompt.textContent = "🛝 Press E to ride the slide";
    prompt.style.display = "block";
  } else {
    prompt.style.display = "none";
  }
}

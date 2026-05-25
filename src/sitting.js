// Lets the player rest:
//   • Sit on any empty pew seat in the sanctuary.
//   • Sit on a sofa in their house.
//   • Lie down on a bed in their house — "God said man shall rest on the Sabbath."
//
// Modes:
//   _mode = null      → standing / walking normally
//   _mode = "pew"     → seated on a pew (legs bent, facing the pulpit)
//   _mode = "sofa"    → seated on a sofa (legs bent, facing the coffee table)
//   _mode = "bed"     → lying on a bed (whole body rotated horizontal)
import { getOccupiedSeats } from "./growth.js";
import { showToast } from "./ui.js";
import { requestInteractButton } from "./player.js";

let _mode = null;                // null | "pew" | "sofa" | "bed"
let _player = null;
let _zones = null;
let _promptDiv = null;
let _saved = null;               // saved transform so we can restore on stand
let _lastSabbathToastAt = 0;

const SIT_RANGE = 2.5;           // pew interact radius
const FURNITURE_RANGE = 2.5;     // sofa / bed interact radius
const TAKEN_EPS = 0.6;           // a seat is "taken" if a member is within this many units

export function isResting() { return _mode !== null; }
export function isSitting() { return _mode === "pew" || _mode === "sofa"; }
export function isLaying()  { return _mode === "bed"; }

// ---- Slot gathering -------------------------------------------------
function gatherPewSlots() {
  const allPews = [
    ...(_zones.pewsBasic || []),
    ...(_zones.extraPews || []),
    ...(_zones.upgradedPews || []),
  ].filter(p => p.visible);
  const SEAT_OFFSETS = [-0.95, 0, 0.95];
  const slots = [];
  allPews.forEach(pew => {
    SEAT_OFFSETS.forEach(ox => {
      slots.push({
        type: "pew",
        x: pew.position.x + ox,
        z: pew.position.z,
        y: 0.5,
        rotY: 0,
        snapZ: pew.position.z + 0.05,
      });
    });
  });
  return slots;
}

function gatherHouseFurnitureSlots() {
  const slots = [];
  for (const h of (_zones.houses || [])) {
    for (const s of (h.sofaSeats || [])) {
      slots.push({
        type: "sofa",
        x: s.x, z: s.z, y: s.y, rotY: s.rotY,
        snapZ: s.z,
      });
    }
    if (h.bed) {
      slots.push({
        type: "bed",
        x: h.bed.x, z: h.bed.z, y: h.bed.y, rotY: 0,
        bed: h.bed,
      });
    }
  }
  return slots;
}

// Returns the best slot near `pos`. Pew slots filter out ones already
// occupied by an NPC; house furniture is single-player so no filter.
function nearestSlot(pos) {
  const taken = getOccupiedSeats();
  const pewSlots = gatherPewSlots().filter(s =>
    !taken.some(t => Math.abs(t.x - s.x) < TAKEN_EPS && Math.abs(t.z - s.z) < TAKEN_EPS)
  );
  const houseSlots = gatherHouseFurnitureSlots();

  let best = null, bestD = Infinity;
  function consider(s, range) {
    const dx = s.x - pos.x, dz = s.z - pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 <= range * range && d2 < bestD) { bestD = d2; best = s; }
  }
  for (const s of pewSlots)   consider(s, SIT_RANGE);
  for (const s of houseSlots) consider(s, FURNITURE_RANGE);
  return best;
}

// ---- Prompt UI ------------------------------------------------------
function ensurePrompt() {
  if (_promptDiv) return _promptDiv;
  const div = document.createElement("div");
  div.id = "sit-prompt";
  div.style.cssText =
    "position:fixed;left:50%;bottom:140px;transform:translateX(-50%);" +
    "background:rgba(20,10,40,0.85);color:#FFD700;padding:8px 16px;border-radius:8px;" +
    "font-family:'Fredoka One',cursive;font-size:16px;pointer-events:none;display:none;z-index:50;";
  document.body.appendChild(div);
  _promptDiv = div;
  return div;
}

function promptText(slot) {
  if (!slot) return "";
  if (slot.type === "bed")  return "Press E to lie down";
  if (slot.type === "sofa") return "Press E to sit on the sofa";
  return "Press E to sit";
}

function standPromptText() {
  if (_mode === "bed") return "Press E to get up";
  return "Press E to stand";
}

// ---- Pose helpers ---------------------------------------------------
function saveTransform() {
  _saved = {
    pos: _player.group.position.clone(),
    rotX: _player.group.rotation.x,
    rotY: _player.group.rotation.y,
    rotZ: _player.group.rotation.z,
    legLX: _player.parts.legL.rotation.x,
    legRX: _player.parts.legR.rotation.x,
  };
}

function restoreTransform() {
  if (!_saved) return;
  const { legL, legR } = _player.parts;
  legL.rotation.x = _saved.legLX;
  legR.rotation.x = _saved.legRX;
  _player.group.rotation.x = _saved.rotX;
  _player.group.rotation.z = _saved.rotZ;
  // y rotation gets re-driven by the look controls; leave it alone.
}

// ---- Sit / Lay ------------------------------------------------------
function sitPew(slot) {
  _mode = "pew";
  saveTransform();
  _player.group.position.set(slot.x, slot.y, slot.snapZ);
  _player.group.rotation.x = 0;
  _player.group.rotation.z = 0;
  _player.group.rotation.y = slot.rotY;
  const { legL, legR } = _player.parts;
  legL.rotation.x = -Math.PI / 2;
  legR.rotation.x = -Math.PI / 2;
}

function sitSofa(slot) {
  _mode = "sofa";
  saveTransform();
  _player.group.position.set(slot.x, slot.y, slot.snapZ);
  _player.group.rotation.x = 0;
  _player.group.rotation.z = 0;
  _player.group.rotation.y = slot.rotY;
  const { legL, legR } = _player.parts;
  legL.rotation.x = -Math.PI / 2;
  legR.rotation.x = -Math.PI / 2;
}

function layOnBed(slot) {
  _mode = "bed";
  saveTransform();
  const bed = slot.bed;
  // Place the player's feet so their body lies along the bed (head toward
  // the pillow at low z). After rotating the group -PI/2 around X, the
  // body extends from the group origin toward -Z, so the origin sits at
  // the foot of the bed.
  const footZ = bed.z + (bed.z - bed.headZ); // mirror of head about center
  _player.group.position.set(bed.x, bed.y + 0.05, footZ);
  _player.group.rotation.x = -Math.PI / 2;
  _player.group.rotation.z = 0;
  _player.group.rotation.y = 0;
  // Straighten the legs so the body looks flat on the mattress.
  const { legL, legR } = _player.parts;
  legL.rotation.x = 0;
  legR.rotation.x = 0;

  // Sabbath flavor — show a verse the first time (and again at most every
  // 30s so spamming E doesn't flood the toast).
  if (Date.now() - _lastSabbathToastAt > 30000) {
    _lastSabbathToastAt = Date.now();
    showToast("🛌 \"Remember the Sabbath day, to keep it holy.\" — Exodus 20:8");
  }
}

function standUp() {
  const wasMode = _mode;
  _mode = null;
  restoreTransform();
  // Step away a bit so we don't immediately re-trigger the prompt.
  if (wasMode === "pew") {
    _player.group.position.z += 1.4;
  } else if (wasMode === "sofa") {
    _player.group.position.z -= 1.4;
  } else if (wasMode === "bed") {
    _player.group.position.x += 1.6;
    _player.group.position.y = 0;
  }
  _saved = null;
}

// ---- Init / loop ----------------------------------------------------
export function initSitting(player, scene, zones) {
  _player = player; _zones = zones;
  ensurePrompt();

  function tryInteract() {
    if (document.getElementById("dialogue-box")?.style.display === "block") return;
    if (document.getElementById("minigame-modal")?.style.display === "flex") return;
    if (window.__nearNPC) return;
    if (_mode) { standUp(); return; }
    const slot = nearestSlot(_player.group.position);
    if (!slot) return;
    if (slot.type === "pew")  sitPew(slot);
    if (slot.type === "sofa") sitSofa(slot);
    if (slot.type === "bed")  layOnBed(slot);
  }

  window.addEventListener("keydown", e => {
    if (e.code !== "KeyE") return;
    tryInteract();
  });

  // Mobile interact button also triggers rest when no NPC is nearby.
  const btn = document.getElementById("btn-interact");
  if (btn) {
    btn.addEventListener("touchstart", e => {
      if (window.__nearNPC) return;
      if (document.getElementById("minigame-modal")?.style.display === "flex") return;
      e.preventDefault();
      tryInteract();
    }, { passive: false });
  }
}

export function updateSitting() {
  if (!_player || !_zones || !_promptDiv) return;
  // Mobile: claim the interact button whenever we have something to do
  // here — sitting down on a nearby seat, or standing back up.
  const seatNear = !window.__nearNPC && (_mode || nearestSlot(_player.group.position));
  requestInteractButton("sitting", !!seatNear);
  if (_mode) {
    _promptDiv.textContent = standPromptText();
    _promptDiv.style.display = "block";
    return;
  }
  if (window.__nearNPC) { _promptDiv.style.display = "none"; return; }
  const slot = nearestSlot(_player.group.position);
  if (slot) {
    _promptDiv.textContent = promptText(slot);
    _promptDiv.style.display = "block";
  } else {
    _promptDiv.style.display = "none";
  }
}

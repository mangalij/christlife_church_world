// Fountain interaction — pressing E near the courtyard fountain opens the
// Noah's Ark storm-survival minigame.
import { openNoahsArk } from "./minigames/noahsArk.js";
import { setInteractButtonVisible } from "./player.js";
import { showToast } from "./ui.js";

const PROMPT_RADIUS = 2.6;

let _player = null;
let _zone   = null;
let _wasNear = false;
let _btn = null;
let _btnLabel = null;
let _origLabel = null;
let _btnHandler = null;

export function initFountain(scene, player, zones) {
  if (!zones?.fountain) return;
  _zone = zones.fountain;
  _player = player;

  _btn = document.getElementById("btn-interact");
  if (_btn) {
    _btnLabel = _btn.querySelector(".interact-label") || _btn;
    _origLabel = _btnLabel.textContent;
    _btnHandler = () => { if (atFountain()) openFlow(); };
    _btn.addEventListener("click", _btnHandler);
  }

  window.addEventListener("keydown", e => {
    if (e.code !== "KeyE") return;
    if (window.__nearNPC) return;       // NPC dialogue takes priority
    if (!atFountain()) return;
    openFlow();
  });
}

function atFountain() {
  if (!_zone || !_player) return false;
  const a = _player.group.position, b = _zone.center;
  const dx = a.x - b.x, dz = a.z - b.z;
  return dx * dx + dz * dz < PROMPT_RADIUS * PROMPT_RADIUS;
}

function openFlow() {
  showToast("🌧️ The fountain ripples — Noah's storm awaits…");
  openNoahsArk();
}

export function updateFountain() {
  const near = atFountain();
  if (near === _wasNear) return;
  _wasNear = near;
  if (near) {
    setInteractButtonVisible(true);
    if (_btnLabel) _btnLabel.textContent = "Board the Ark (E)";
  } else if (_btnLabel && _btnLabel.textContent === "Board the Ark (E)") {
    _btnLabel.textContent = _origLabel || "Interact (E)";
  }
}

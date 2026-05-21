// Floaty reward popups — "+30 XP" / "+1 Member" text that drifts up the
// screen and fades, attached to the player's on-screen position. Pure
// CSS/DOM animation; no Three.js dependency needed because we compute
// the screen point from the player ourselves.
//
// Usage: `spawnFloater("+30 XP", "#43E97B")`
// If a player + camera are bound via `initFloaters`, the text appears
// over the player's head; otherwise it falls back to the centre of the
// viewport (still useful for menu rewards like the Wheel of Blessings).

import * as THREE from "three";

let _player = null;
let _camera = null;
let _layer  = null;

function ensureLayer() {
  if (_layer) return _layer;
  const div = document.createElement("div");
  div.id = "floater-layer";
  div.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:32;overflow:hidden;";
  document.body.appendChild(div);
  // CSS keyframes for the rise + fade animation
  if (!document.getElementById("floater-style")) {
    const style = document.createElement("style");
    style.id = "floater-style";
    style.textContent = `
      @keyframes floater-rise {
        0%   { opacity: 0; transform: translate(-50%, 0) scale(0.6); }
        15%  { opacity: 1; transform: translate(-50%, -10px) scale(1.15); }
        30%  { transform: translate(-50%, -28px) scale(1); }
        100% { opacity: 0; transform: translate(-50%, -110px) scale(0.95); }
      }
      .floater-text {
        position: absolute; left: 0; top: 0;
        font-family: 'Fredoka One', cursive;
        font-size: 22px; font-weight: 700;
        text-shadow: 0 2px 4px rgba(0,0,0,0.7), 0 0 12px currentColor;
        animation: floater-rise 1.5s ease-out forwards;
        white-space: nowrap;
      }
    `;
    document.head.appendChild(style);
  }
  _layer = div;
  return div;
}

export function initFloaters(player, camera) {
  _player = player;
  _camera = camera;
  ensureLayer();
}

// Computes screen-space position from the player's world position.
// Returns { x, y } in CSS pixels or null if we can't project.
function projectPlayerToScreen() {
  if (!_player || !_camera) return null;
  const pos = _player.group.position.clone();
  pos.y += 2.4;                                  // a bit above the head
  pos.project(_camera);
  if (pos.z > 1) return null;                    // behind the camera
  const x = (pos.x + 1) * 0.5 * window.innerWidth;
  const y = (1 - (pos.y + 1) * 0.5) * window.innerHeight;
  return { x, y };
}

export function spawnFloater(text, color = "#FFD700") {
  const layer = ensureLayer();
  const el = document.createElement("div");
  el.className = "floater-text";
  el.style.color = color;
  el.textContent = text;

  let pt = projectPlayerToScreen();
  if (!pt) pt = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  // Small random horizontal jitter so multiple rewards don't stack
  // exactly on top of each other.
  pt.x += (Math.random() - 0.5) * 60;
  el.style.left = `${pt.x}px`;
  el.style.top  = `${pt.y}px`;

  layer.appendChild(el);
  setTimeout(() => el.remove(), 1600);
}

// Convenience wrappers used by growth.js.
export function floatXP(amount) {
  if (!amount) return;
  if (amount > 0) spawnFloater(`+${amount} XP`, "#43E97B");
  else            spawnFloater(`${amount} XP`,  "#FF6B6B");
}

export function floatMember(n = 1) {
  if (n > 0) spawnFloater(`+${n} Member${n > 1 ? "s" : ""}`, "#FFD700");
  else if (n < 0) spawnFloater(`${n} Member${n < -1 ? "s" : ""}`, "#FF6B6B");
}

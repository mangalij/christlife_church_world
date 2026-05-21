import * as THREE from "three";
import { showToast } from "./ui.js";
import { addXP } from "./growth.js";
import { setInteractButtonVisible } from "./player.js";

// 3D basketball: walk up, press E to pick up. While held, the ball floats
// above the player's right shoulder and a "Shoot" prompt appears. Press E
// again to launch a parabolic arc toward whichever rim the player is
// facing. If the ball passes through the rim circle near its apex, it's a
// bucket; otherwise it bounces and resets on the court.

let _ball = null;          // { mesh, radius, restPos, hoops }
let _player = null;
let _heldBy  = null;       // player ref when held (otherwise null)
let _state   = "rest";     // "rest" | "held" | "flying" | "bouncing" | "aiHeld"
let _flight  = null;       // { start, target, t0, dur, hoop, made, by }
let _bouncePos = null;     // settle position after a flight
let _bounceVel = null;
let _shotsTaken = 0;
let _shotsMade  = 0;
let _interactButton = null;
let _interactLabel  = null;
let _origInteractText = null;
let _btnHandler = null;
let _proximityForButton = false;

// Hooks used by the 1v1 match mode.
let _pickupLocked = false;          // when true, player can't pick up the ball
let _playerTargetHoop = null;       // override auto-aim with a specific hoop
let _aiCarrier = null;              // { group } currently carrying the ball
const _shotListeners = [];          // notified after a shot resolves

const PICKUP_RADIUS = 1.8;

export function addShotListener(fn) { _shotListeners.push(fn); }
export function removeShotListener(fn) {
  const i = _shotListeners.indexOf(fn);
  if (i !== -1) _shotListeners.splice(i, 1);
}
function emitShot(payload) {
  for (const fn of _shotListeners) {
    try { fn(payload); } catch (e) { console.warn("shot listener error", e); }
  }
}

export function setPickupLocked(v) { _pickupLocked = !!v; }
export function setPlayerTargetHoop(h) { _playerTargetHoop = h || null; }
export function getBall() { return _ball; }
export function getBallState() { return _state; }
export function isBallFree() { return _state === "rest"; }
export function forceDropBall() {
  if (_state === "held" || _state === "aiHeld") {
    _heldBy = null; _aiCarrier = null; _state = "rest";
    if (_ball) _ball.mesh.position.copy(_ball.restPos);
  }
}
export function attachBallToAI(ai) {
  if (!_ball) return;
  _aiCarrier = ai;
  _heldBy = null;
  _state = "aiHeld";
}
export function detachBallFromAI() {
  _aiCarrier = null;
  if (_state === "aiHeld") _state = "rest";
}
// Launch an AI shot from a world position toward the given hoop.
// `made` is decided by the caller so the match mode controls difficulty.
export function aiShoot(startPos, hoop, made) {
  if (!_ball || !hoop) return;
  const start = startPos.clone(); start.y = 1.6;
  const end = hoop.position.clone();
  if (!made) {
    end.add(new THREE.Vector3(
      (Math.random() - 0.5) * 1.5,
      -0.4 + Math.random() * 0.2,
      (Math.random() - 0.5) * 1.5,
    ));
  }
  const dist = start.distanceTo(hoop.position);
  _flight = {
    start, end, rim: hoop.position.clone(),
    t0: performance.now(), dur: 650 + dist * 35,
    apex: Math.max(hoop.position.y + 0.6, start.y + 1.2 + dist * 0.05),
    made, by: "coach",
  };
  _state = "flying";
  _aiCarrier = null;
  _heldBy = null;
}

export function initBasketball(scene, player, zones) {
  if (!zones?.basketball) return;
  _ball   = zones.basketball;
  _player = player;
  // Try to remember the existing interact button so we can repurpose its label.
  _interactButton = document.getElementById("btn-interact");
  if (_interactButton) {
    _interactLabel = _interactButton.querySelector(".interact-label")
                  || _interactButton;
    _origInteractText = _interactLabel.textContent;
    _btnHandler = () => tryInteract();
    _interactButton.addEventListener("click", _btnHandler);
  }
  window.addEventListener("keydown", e => {
    if (e.code !== "KeyE") return;
    // If an NPC is in range, let the NPC handler take E.
    if (window.__nearNPC) return;
    tryInteract();
  });
}

function tryInteract() {
  if (_state === "held") return shoot();
  if (_state === "rest" && !_pickupLocked && nearBall()) return pickUp();
}

function nearBall() {
  if (!_ball || !_player) return false;
  const dx = _player.group.position.x - _ball.mesh.position.x;
  const dz = _player.group.position.z - _ball.mesh.position.z;
  return dx * dx + dz * dz < PICKUP_RADIUS * PICKUP_RADIUS;
}

function pickUp() {
  _state = "held";
  _heldBy = _player;
  showToast("🏀 You picked up the ball — press E to shoot");
}

function shoot() {
  if (!_ball || !_player) return;
  // Aim at whichever hoop is closer along the player's facing direction.
  // Score each hoop by (distance, alignment with facing) and pick the best.
  const pPos = _player.group.position;
  // The player's local forward is -Z (group.rotation.y = yaw, and W moves
  // them in the -dir direction). Transform that into world space.
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(_player.group.quaternion);
  let bestHoop = null;
  if (_playerTargetHoop) {
    bestHoop = _playerTargetHoop;
  } else {
    let bestScore = -Infinity;
    for (const h of _ball.hoops) {
      const to = h.position.clone().sub(pPos);
      const dist = to.length();
      if (dist > 18) continue;             // out of range
      const align = to.clone().normalize().dot(forward);  // -1..1
      // Prefer hoops in front, but allow shooting at the nearest one even if
      // you're slightly off-axis.
      const score = align * 2 - dist * 0.05;
      if (score > bestScore) { bestScore = score; bestHoop = h; }
    }
  }
  if (!bestHoop) {
    showToast("🏀 No hoop in range — get closer!");
    return;
  }

  const startPos = pPos.clone();
  startPos.y = 1.6;
  const targetPos = bestHoop.position.clone();
  const dist = startPos.distanceTo(targetPos);

  // Probability of making it: short shots are easier; alignment with facing
  // helps; the threshold is forgiving to keep the game fun.
  const toHoop = targetPos.clone().sub(startPos).normalize();
  const align  = Math.max(0, toHoop.dot(forward));
  const closeness = Math.max(0, 1 - dist / 14);   // 1 at 0 dist, 0 at 14+
  const skill = 0.25 + 0.55 * closeness + 0.2 * align;  // ~0.25..1.0
  const made = Math.random() < skill;

  // If missing, nudge the apex/landing so the ball clearly bricks.
  const endPos = targetPos.clone();
  if (!made) {
    const jitter = new THREE.Vector3(
      (Math.random() - 0.5) * 1.5,
      -0.4 + Math.random() * 0.2,         // short / off the front of the rim
      (Math.random() - 0.5) * 1.5,
    );
    // Bias the jitter so the ball lands on the court side
    jitter.add(toHoop.clone().multiplyScalar(-0.3 - Math.random() * 0.6));
    endPos.add(jitter);
  }

  _flight = {
    start: startPos,
    end:   endPos,
    rim:   targetPos,
    t0:    performance.now(),
    dur:   650 + dist * 35,           // longer shots take longer
    apex:  Math.max(targetPos.y + 0.6, startPos.y + 1.2 + dist * 0.05),
    made,
    by:    "player",
  };
  _state = "flying";
  _heldBy = null;
}

function landAfterMake() {
  // Settle the ball on the court just below the rim, then auto-reset to rest.
  const p = _flight.rim.clone();
  p.y = _ball.radius;
  _ball.mesh.position.copy(p);
  _bouncePos = p;
  _bounceVel = new THREE.Vector3(0, 0, 0);
  _state = "bouncing";
  const by = _flight.by || "player";
  const hoop = _flight.rim.clone();
  if (by === "player") {
    _shotsTaken++; _shotsMade++;
    const accuracy = Math.round((_shotsMade / _shotsTaken) * 100);
    showToast(`🏀 SWISH! ${_shotsMade}/${_shotsTaken} (${accuracy}%) · +5 XP`);
    addXP(5);
  }
  emitShot({ by, made: true, hoop });
  setTimeout(resetBallToCourt, 1400);
}

function landAfterMiss() {
  _bouncePos = _ball.mesh.position.clone();
  _bouncePos.y = _ball.radius;
  _bounceVel = new THREE.Vector3(
    (Math.random() - 0.5) * 2,
    4 + Math.random() * 1.5,
    (Math.random() - 0.5) * 2,
  );
  _state = "bouncing";
  const by = _flight.by || "player";
  const hoop = _flight.rim.clone();
  if (by === "player") {
    _shotsTaken++;
    showToast(`🏀 Brick! ${_shotsMade}/${_shotsTaken}`);
  }
  emitShot({ by, made: false, hoop });
  setTimeout(resetBallToCourt, 1800);
}

function resetBallToCourt() {
  if (!_ball) return;
  if (_state !== "bouncing") return;
  _ball.mesh.position.copy(_ball.restPos);
  _state = "rest";
}

export function updateBasketball(delta) {
  if (!_ball || !_player) return;
  const ball = _ball.mesh;

  if (_state === "held" && _heldBy) {
    // Float the ball just in front of the player's right shoulder. Local
    // forward is -Z, so "in front" is negative Z in local space.
    const p = _heldBy.group.position;
    const offset = new THREE.Vector3(0.45, 0.0, -0.45).applyQuaternion(_heldBy.group.quaternion);
    ball.position.set(p.x + offset.x, p.y + 1.6, p.z + offset.z);
    ball.rotation.y += delta * 2;
  } else if (_state === "aiHeld" && _aiCarrier) {
    const p = _aiCarrier.group.position;
    const offset = new THREE.Vector3(0.45, 0.0, -0.45).applyQuaternion(_aiCarrier.group.quaternion);
    ball.position.set(p.x + offset.x, p.y + 1.6, p.z + offset.z);
    ball.rotation.y += delta * 2;
  } else if (_state === "flying" && _flight) {
    const now = performance.now();
    const t = Math.min(1, (now - _flight.t0) / _flight.dur);
    // Quadratic Bezier-ish arc: lerp x/z linearly, parabolic y peaking at apex.
    const x = _flight.start.x + (_flight.end.x - _flight.start.x) * t;
    const z = _flight.start.z + (_flight.end.z - _flight.start.z) * t;
    const baseY = _flight.start.y + (_flight.end.y - _flight.start.y) * t;
    const arc = 4 * t * (1 - t) * (_flight.apex - (_flight.start.y + _flight.end.y) / 2);
    ball.position.set(x, baseY + arc, z);
    ball.rotation.x += delta * 8;
    if (t >= 1) {
      if (_flight.made) landAfterMake(); else landAfterMiss();
      _flight = null;
    }
  } else if (_state === "bouncing") {
    // Simple bounce physics that settles quickly.
    if (_bounceVel.lengthSq() > 0.01 || _bouncePos.y > _ball.radius + 0.01) {
      _bounceVel.y += -18 * delta;
      _bouncePos.x += _bounceVel.x * delta;
      _bouncePos.y += _bounceVel.y * delta;
      _bouncePos.z += _bounceVel.z * delta;
      if (_bouncePos.y < _ball.radius) {
        _bouncePos.y = _ball.radius;
        _bounceVel.y *= -0.45;
        _bounceVel.x *= 0.7;
        _bounceVel.z *= 0.7;
      }
      ball.position.copy(_bouncePos);
      ball.rotation.x += delta * 6;
    }
  }

  // Update the on-screen interact button label when relevant.
  const showButton = _state === "held" || (_state === "rest" && nearBall() && !window.__nearNPC);
  if (showButton !== _proximityForButton) {
    _proximityForButton = showButton;
    if (showButton) setInteractButtonVisible(true);
  }
  if (_interactLabel) {
    if (_state === "held") {
      _interactLabel.textContent = "Shoot (E)";
    } else if (showButton) {
      _interactLabel.textContent = "Pick up Ball (E)";
    } else if (_origInteractText && _interactLabel.textContent !== _origInteractText) {
      // Restore once we're no longer in basketball context (the NPC system
      // will overwrite it again when needed).
      _interactLabel.textContent = _origInteractText;
    }
  }
}

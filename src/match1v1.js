// On-court 3D 1v1 vs Coach Marcus.
//
// When the player accepts the challenge, the player is teleported onto the
// south end of the court, a Coach AI is spawned at the north end, and a HUD
// shows the score and clock. Both sides shoot at opposite hoops:
//   - Player attacks the NORTH hoop (smaller z)
//   - Coach  attacks the SOUTH hoop (larger z)
// The existing basketball3d module handles the player's pickup/shoot input
// and ball physics. This module drives the coach AI, the score, and the
// match flow. When the ball is loose at rest, whichever side reaches it
// first takes possession (the other side is locked out via setPickupLocked).
import * as THREE from "three";
import { addFace } from "./face.js";
import { showToast } from "./ui.js";
import { addXP, addMember } from "./growth.js";
import {
  addShotListener, removeShotListener,
  setPickupLocked, setPlayerTargetHoop,
  attachBallToAI, detachBallFromAI,
  aiShoot, getBall, getBallState, forceDropBall,
} from "./basketball3d.js";
import { clearNPCsFromRegion, restoreClearedNPCs } from "./npc.js";

const MATCH_DURATION = 75;     // seconds
const TARGET_SCORE   = 11;     // first-to wins (also ends on clock)
const COACH_SPEED    = 4.2;    // m/s
const COACH_PICKUP_R = 1.4;
const PLAYER_REACH   = 1.6;    // how close coach must get to "contest" player

let _scene = null;
let _player = null;
let _zones  = null;
let _active = false;
let _state  = "idle";          // "idle" | "intro" | "playing" | "ended"
let _shotListener = null;

let _coach = null;             // { group, headBob, target, ... }
let _coachState = "chase";     // "chase" | "carry" | "shooting" | "defend" | "reset"
let _coachTimer = 0;           // generic per-state timer
let _possession = "free";      // "free" | "player" | "coach"
let _grabCooldownUntil = 0;    // ms epoch, suppress pickups briefly after shots

let _scoreP = 0, _scoreC = 0;
let _clock = MATCH_DURATION;

let _hud = null;               // root HUD element
let _hudScoreP = null, _hudScoreC = null, _hudClock = null, _hudPoss = null;
let _hudBanner = null;

let _playerHoop = null, _coachHoop = null;
let _courtBounds = null;            // { minX, maxX, minZ, maxZ } for NPC clearing

// Defense tunables
const STEAL_RANGE        = 1.7;     // how close player must be to attempt a steal
const STEAL_CHANCE       = 0.45;
const STEAL_COOLDOWN_MS  = 1200;
const BLOCK_RANGE        = 1.9;     // contesting a shot at release
let _keyHandler          = null;
let _lastStealAttempt    = 0;

export function isMatchActive() { return _active; }

export function start1v1Match(scene, player, zones) {
  if (_active) return;
  _scene = scene; _player = player; _zones = zones;
  if (!zones?.basketball?.hoops || zones.basketball.hoops.length < 2) {
    showToast("Court isn't set up yet.");
    return;
  }
  // Pick hoops by Z: smaller z = north (player), larger z = south (coach).
  const sorted = [...zones.basketball.hoops].sort((a, b) => a.position.z - b.position.z);
  _playerHoop = sorted[0];
  _coachHoop  = sorted[sorted.length - 1];

  _scoreP = 0; _scoreC = 0; _clock = MATCH_DURATION;
  _possession = "free";
  _grabCooldownUntil = 0;

  // Make sure no one is holding the ball, then drop it at center court.
  forceDropBall();
  const ball = getBall();
  const center = zones.basketballCourt?.center
              || new THREE.Vector3(ball.mesh.position.x, 0, ball.mesh.position.z);
  ball.mesh.position.set(center.x, ball.radius, center.z);
  ball.restPos.set(center.x, ball.radius, center.z);

  // Court footprint is 14 wide x 22 deep (see world.js). Add a small margin
  // so NPCs loitering on the sidelines (incl. Coach Marcus at x=47) are also
  // cleared out for the duration of the match.
  _courtBounds = {
    minX: center.x - 9, maxX: center.x + 9,
    minZ: center.z - 13, maxZ: center.z + 13,
  };
  clearNPCsFromRegion(_courtBounds);

  // Teleport player to south end of court facing the player's (north) hoop.
  // Player local forward is -Z, so rotation.y = 0 means facing the smaller-z
  // baseline, which is exactly where the player's hoop sits.
  const sx = center.x, sz = center.z + 5;
  player.group.position.set(sx, 0, sz);
  player.group.rotation.y = 0;

  // Spawn the coach AI at the north end facing south.
  _coach = buildCoachAI(scene);
  _coach.group.position.set(center.x + 1.5, 0, center.z - 5);
  _coach.group.rotation.y = Math.PI;

  // Force the player's shots to always target the player's hoop.
  setPlayerTargetHoop(_playerHoop);

  // Listen for shot outcomes so we can update the score.
  _shotListener = (evt) => onShotResolved(evt);
  addShotListener(_shotListener);

  // Steal: press E while standing next to the coach when he has the ball.
  // We attach a handler in addition to basketball3d's E listener; that one
  // is a no-op when the player isn't near a loose ball, so there's no
  // conflict with shoot/pickup.
  _keyHandler = (e) => {
    if (e.code !== "KeyE" || !_active) return;
    tryStealBall();
  };
  window.addEventListener("keydown", _keyHandler);

  buildHUD();
  showBanner("🏀 TIP-OFF! First to 11 or beat the clock");

  _coachState = "chase";
  _coachTimer = 0;
  _state = "intro";
  _active = true;
  setTimeout(() => { if (_active) _state = "playing"; }, 1400);
}

function endMatch(reason) {
  if (!_active) return;
  _state = "ended";

  // Clean up listeners and overrides.
  if (_shotListener) { removeShotListener(_shotListener); _shotListener = null; }
  if (_keyHandler)   { window.removeEventListener("keydown", _keyHandler); _keyHandler = null; }
  setPlayerTargetHoop(null);
  setPickupLocked(false);
  detachBallFromAI();
  forceDropBall();
  restoreClearedNPCs();
  _courtBounds = null;

  const playerWon = _scoreP > _scoreC;
  const tied = _scoreP === _scoreC;
  let title, xp = 0, members = 0;
  if (playerWon) {
    title = "🏆 YOU WON THE 1v1!";
    // Bonus scales with the margin.
    const margin = _scoreP - _scoreC;
    xp = 50 + margin * 8;
    members = 2 + Math.min(3, Math.floor(margin / 3));
  } else if (tied) {
    title = "🤝 OVERTIME-WORTHY TIE";
    xp = 20;
    members = 1;
  } else {
    title = "😤 Coach Marcus wins this round";
    xp = 15;
  }

  showBanner(`${title}  Final: ${_scoreP}–${_scoreC}${reason ? "  (" + reason + ")" : ""}`);
  if (xp)      addXP(xp);
  if (members) addMember(members);
  if (xp || members) {
    showToast(`Reward: +${xp} XP${members ? " · +" + members + " member" + (members > 1 ? "s" : "") : ""}`);
  }

  // Remove coach + HUD after a beat so the player can read the result.
  setTimeout(() => {
    if (_coach) { _scene.remove(_coach.group); _coach = null; }
    removeHUD();
    _active = false;
    _state = "idle";
    // Restore the ball to its rest position so free-roam shooting works.
    const ball = getBall();
    if (ball) ball.mesh.position.copy(ball.restPos);
  }, 3500);
}

function onShotResolved(evt) {
  if (!_active || _state !== "playing") return;
  // _playerHoop is the basket the PLAYER attacks, _coachHoop is the COACH'S.
  // Attribute the make based on which hoop the ball actually went through.
  const distPlayer = evt.hoop.distanceTo(_playerHoop.position);
  const distCoach  = evt.hoop.distanceTo(_coachHoop.position);
  const onPlayerBasket = distPlayer < distCoach;   // shot at the player's basket

  if (evt.made) {
    if (evt.by === "player" && onPlayerBasket) {
      _scoreP += 2;
      showBanner(`🏀 ${_scoreP}–${_scoreC}  Bucket!`);
    } else if (evt.by === "coach" && !onPlayerBasket) {
      _scoreC += 2;
      showBanner(`🏀 ${_scoreP}–${_scoreC}  Coach scores!`);
    }
    // After a make, the OTHER team gets the ball.
    _possession = (evt.by === "player") ? "coach" : "player";
  } else {
    // Live ball off the rim — anybody can grab it.
    _possession = "free";
  }
  _grabCooldownUntil = performance.now() + 600;
  updateHUD();
  if (_scoreP >= TARGET_SCORE || _scoreC >= TARGET_SCORE) {
    endMatch(`first to ${TARGET_SCORE}`);
  }
}

// ---- Per-frame update --------------------------------------------------

export function updateMatch(delta) {
  if (!_active) return;
  if (_state === "playing") {
    _clock -= delta;
    if (_clock <= 0) { _clock = 0; updateHUD(); endMatch("time"); return; }
    updateHUD();
    // Keep the court clear in case a wanderer drifts back in.
    if (_courtBounds) clearNPCsFromRegion(_courtBounds);
  }
  if (!_coach) return;

  const ball = getBall();
  const ballState = getBallState();
  const now = performance.now();

  // Reflect possession from the actual ball state.
  if (ballState === "held")        _possession = "player";
  else if (ballState === "aiHeld") _possession = "coach";

  // Lock pickups during the brief moment after a shot lands so the bounce
  // doesn't snap straight back into someone's hands.
  if (now < _grabCooldownUntil) {
    setPickupLocked(true);
  } else if (_possession === "coach") {
    setPickupLocked(true);
  } else {
    setPickupLocked(false);
  }

  // ---- Coach AI state machine ----
  switch (_coachState) {
    case "chase": {
      // Chase the loose ball. If the player is holding it, defend instead.
      if (ballState === "held") {
        _coachState = "defend";
        break;
      }
      if (ballState === "aiHeld") {
        _coachState = "carry";
        break;
      }
      if (ballState !== "rest" && ballState !== "bouncing") break;
      moveToward(_coach, ball.mesh.position, delta, COACH_SPEED);
      const d = horizDist(_coach.group.position, ball.mesh.position);
      if (d < COACH_PICKUP_R && _possession !== "player" && now >= _grabCooldownUntil) {
        attachBallToAI(_coach);
        _possession = "coach";
        _coachState = "carry";
        _coachTimer = 0;
      }
      break;
    }
    case "carry": {
      // If the ball got stolen out from under us, go chase it again.
      if (ballState !== "aiHeld") { _coachState = "chase"; _coachTimer = 0; break; }
      // Move toward a comfortable shooting spot near the coach's hoop.
      const aim = _coachHoop.position.clone();
      // Stop a few meters short along the +z side (coach's offensive half).
      aim.z += 3.5;
      aim.x += (_coach.group.position.x - aim.x) * 0.2;   // slight lane variation
      moveToward(_coach, aim, delta, COACH_SPEED * 0.95);
      _coachTimer += delta;
      const d = horizDist(_coach.group.position, _coachHoop.position);
      if (d < 5.5 || _coachTimer > 4.5) {
        // Take the shot. If the player is right on the coach at release,
        // the shot is contested → forced miss + "BLOCKED!" banner.
        const dist = d;
        const playerDist = horizDist(_player.group.position, _coach.group.position);
        const contested = playerDist < BLOCK_RANGE;
        let made = Math.random() < Math.min(0.72, 0.35 + (5.5 - Math.min(dist, 5.5)) * 0.08);
        if (contested) {
          made = false;
          showBanner("🚫 BLOCKED!");
        }
        aiShoot(_coach.group.position.clone(), _coachHoop, made);
        _coachState = "reset";
        _coachTimer = 0;
      }
      break;
    }
    case "defend": {
      // Stand between the player and the coach's defensive hoop (playerHoop).
      const pPos = _player.group.position;
      const guard = pPos.clone().lerp(_playerHoop.position, 0.35);
      moveToward(_coach, guard, delta, COACH_SPEED * 0.85);
      if (ballState !== "held") _coachState = "chase";
      break;
    }
    case "reset": {
      // Brief idle while the shot resolves; the shot listener changes
      // possession, then we go back to chasing or carrying.
      _coachTimer += delta;
      if (_coachTimer > 0.8) _coachState = "chase";
      break;
    }
  }

  // Subtle bob so the coach feels alive.
  _coach.headBob += delta * 6;
  _coach.group.children[0].position.y = 1.2 + Math.sin(_coach.headBob) * 0.04;
}

// ---- Helpers -----------------------------------------------------------

function horizDist(a, b) {
  const dx = a.x - b.x, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function tryStealBall() {
  if (!_coach || !_player) return;
  if (getBallState() !== "aiHeld") return;
  const now = performance.now();
  if (now - _lastStealAttempt < STEAL_COOLDOWN_MS) return;
  if (horizDist(_player.group.position, _coach.group.position) > STEAL_RANGE) return;
  _lastStealAttempt = now;
  if (Math.random() < STEAL_CHANCE) {
    // Pop the ball loose and drop it at the player's feet so they can
    // immediately press E to scoop it up.
    detachBallFromAI();
    const ball = getBall();
    const pp = _player.group.position;
    ball.mesh.position.set(pp.x, ball.radius, pp.z);
    _possession = "free";
    _grabCooldownUntil = 0;
    setPickupLocked(false);
    _coachState = "chase";
    _coachTimer = 0;
    showBanner("🛡️ STEAL!");
  } else {
    showBanner("Whiff! (E to try again)");
  }
}

function moveToward(ai, targetPos, delta, speed) {
  const g = ai.group;
  const dx = targetPos.x - g.position.x;
  const dz = targetPos.z - g.position.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d < 0.05) return;
  const step = Math.min(d, speed * delta);
  g.position.x += (dx / d) * step;
  g.position.z += (dz / d) * step;
  // Face direction of travel. Local forward is -Z, so we want -Z to align
  // with the (dx,dz) vector → rotation.y = atan2(-dx, -dz)... but standard
  // convention here is atan2(dx, dz) flipping sign so the face (placed on
  // head's -Z side) points forward.
  g.rotation.y = Math.atan2(-dx, -dz);
}

function buildCoachAI(scene) {
  const group = new THREE.Group();
  const mat = c => new THREE.MeshToonMaterial({ color: c });
  // Order matters: torso is children[0] so we can bob it in update.
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.05, 0.55), mat(0xE65A2A));
  torso.position.y = 1.2;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.72, 0.62), mat(0x6E4A2E));
  head.position.y = 2.05;
  addFace(head, { skin: 0x6E4A2E });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.95, 0.42), mat(0x1B1B2F));
  legL.position.set(-0.22, 0.45, 0);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.95, 0.42), mat(0x1B1B2F));
  legR.position.set(0.22, 0.45, 0);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, 0.4), mat(0xE65A2A));
  armL.position.set(-0.62, 1.2, 0);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, 0.4), mat(0xE65A2A));
  armR.position.set(0.62, 1.2, 0);
  [torso, head, legL, legR, armL, armR].forEach(m => { m.castShadow = true; group.add(m); });
  scene.add(group);
  return { group, headBob: 0 };
}

// ---- HUD ---------------------------------------------------------------

function buildHUD() {
  removeHUD();
  _hud = document.createElement("div");
  _hud.id = "match-hud";
  _hud.style.cssText = [
    "position:fixed", "top:14px", "left:50%", "transform:translateX(-50%)",
    "background:rgba(10,10,30,0.85)", "color:#fff", "padding:10px 18px",
    "border-radius:10px", "font-family:'Fredoka One',cursive",
    "font-size:18px", "z-index:9000", "box-shadow:0 4px 16px rgba(0,0,0,0.5)",
    "border:2px solid #FFD700", "text-align:center",
    "pointer-events:none", "min-width:280px",
  ].join(";");
  _hud.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:18px">
      <div style="text-align:center"><div style="font-size:11px;opacity:0.7">YOU</div>
        <div id="hud-score-p" style="font-size:28px;color:#7CFC00">0</div></div>
      <div style="text-align:center"><div style="font-size:11px;opacity:0.7">⏱ TIME</div>
        <div id="hud-clock" style="font-size:24px">1:15</div>
        <div id="hud-poss" style="font-size:11px;color:#FFD700">JUMP BALL</div></div>
      <div style="text-align:center"><div style="font-size:11px;opacity:0.7">COACH</div>
        <div id="hud-score-c" style="font-size:28px;color:#FF6347">0</div></div>
    </div>
  `;
  document.body.appendChild(_hud);
  _hudScoreP = _hud.querySelector("#hud-score-p");
  _hudScoreC = _hud.querySelector("#hud-score-c");
  _hudClock  = _hud.querySelector("#hud-clock");
  _hudPoss   = _hud.querySelector("#hud-poss");
  updateHUD();
}

function removeHUD() {
  if (_hud) { _hud.remove(); _hud = null; }
  if (_hudBanner) { _hudBanner.remove(); _hudBanner = null; }
}

function updateHUD() {
  if (!_hud) return;
  _hudScoreP.textContent = _scoreP;
  _hudScoreC.textContent = _scoreC;
  const m = Math.floor(_clock / 60);
  const s = Math.floor(_clock % 60).toString().padStart(2, "0");
  _hudClock.textContent = `${m}:${s}`;
  _hudPoss.textContent =
    _possession === "player" ? "YOUR BALL" :
    _possession === "coach"  ? "COACH BALL" : "LOOSE BALL";
}

function showBanner(text) {
  if (_hudBanner) _hudBanner.remove();
  _hudBanner = document.createElement("div");
  _hudBanner.style.cssText = [
    "position:fixed", "top:90px", "left:50%", "transform:translateX(-50%)",
    "background:rgba(0,0,0,0.8)", "color:#FFD700",
    "padding:8px 20px", "border-radius:8px",
    "font-family:'Fredoka One',cursive", "font-size:20px",
    "z-index:9001", "pointer-events:none", "border:1px solid #FFD700",
    "transition:opacity 0.4s ease",
  ].join(";");
  _hudBanner.textContent = text;
  document.body.appendChild(_hudBanner);
  const banner = _hudBanner;
  setTimeout(() => { if (banner === _hudBanner) { banner.style.opacity = "0"; } }, 1800);
  setTimeout(() => { banner.remove(); if (banner === _hudBanner) _hudBanner = null; }, 2400);
}

// Hook for the player picking up the ball: called from basketball3d through
// possession changes. We watch state changes in updateMatch instead, but
// expose this in case we want manual hand-off later.
export function notePlayerPickedUp() {
  if (!_active) return;
  _possession = "player";
}

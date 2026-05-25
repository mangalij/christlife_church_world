// Quick emote/action system. Press a key to play a short pose; the character
// returns to walking/idle automatically afterward.
//
//   G — Wave        (greeting)
//   H — Praise      (hands up briefly)
//   P — Pray        (head bowed, hands clasped)
//   R — Read Bible  (Bible raised in front, head tilted down)

let _player = null;
let _active = null;     // { id, t, duration, restore }
let _saved = null;
let _bible = null;      // ref to player.parts.bible (if present)
let _statusDiv = null;

const ACTIONS = {
  KeyG: { id: "wave",   label: "👋 Waving",         duration: 1.8 },
  KeyH: { id: "praise", label: "🙌 Praise",         duration: 2.2 },
  KeyP: { id: "pray",   label: "🙏 Praying",        duration: 3.0 },
  KeyR: { id: "read",   label: "📖 Reading Bible",  duration: 3.5 },
};

// Programmatic-only actions (no key binding) — triggered by other systems
// such as the garden.  Keyed by id so playAction(id) can look them up.
const INTERNAL_ACTIONS = {
  till:  { id: "till",  label: "🪓 Tilling soil",  duration: 1.6 },
  water: { id: "water", label: "💧 Watering",      duration: 1.5 },
  lift:  { id: "lift",  label: "🧱 Lifting",       duration: 0.9 },
};

export function isActing() { return _active !== null; }
export function currentAction() { return _active?.id || null; }

// Programmatically play one of the named actions. `onComplete` is invoked
// once the pose finishes (used by the garden so the till/water visual
// change happens AFTER the animation has played).
export function playAction(id, onComplete) {
  const spec = INTERNAL_ACTIONS[id] || Object.values(ACTIONS).find(a => a.id === id);
  if (!spec || !_player) { if (onComplete) onComplete(); return; }
  startAction({ ...spec, onComplete: onComplete || null });
}

function ensureStatus() {
  if (_statusDiv) return _statusDiv;
  const d = document.createElement("div");
  d.id = "action-status";
  d.style.cssText =
    "position:fixed;left:50%;bottom:200px;transform:translateX(-50%);" +
    "background:rgba(20,10,40,0.85);color:#FFD700;padding:6px 14px;border-radius:14px;" +
    "font-family:'Fredoka One',cursive;font-size:13px;pointer-events:none;display:none;z-index:50;";
  document.body.appendChild(d);
  _statusDiv = d;
  return d;
}

function saveRestPose() {
  const { head, torso, legL, legR, armL, armR } = _player.parts;
  _saved = {
    head:  { pos: head.position.clone(),  rot: head.rotation.clone()  },
    torso: { pos: torso.position.clone(), rot: torso.rotation.clone() },
    legL:  { pos: legL.position.clone(),  rot: legL.rotation.clone()  },
    legR:  { pos: legR.position.clone(),  rot: legR.rotation.clone()  },
    armL:  { pos: armL.position.clone(),  rot: armL.rotation.clone()  },
    armR:  { pos: armR.position.clone(),  rot: armR.rotation.clone()  },
  };
  if (_bible) _saved.bible = { pos: _bible.position.clone(), rot: _bible.rotation.clone() };
}

function restoreRestPose() {
  if (!_saved) return;
  const p = _player.parts;
  for (const k of ["head","torso","legL","legR","armL","armR"]) {
    p[k].position.copy(_saved[k].pos);
    p[k].rotation.copy(_saved[k].rot);
  }
  if (_bible && _saved.bible) {
    _bible.position.copy(_saved.bible.pos);
    _bible.rotation.copy(_saved.bible.rot);
  }
  _saved = null;
}

function startAction(spec) {
  if (_active) restoreRestPose();
  saveRestPose();
  _active = { ...spec, t: 0 };
  _statusDiv.textContent = spec.label;
  _statusDiv.style.display = "block";
}

function stopAction() {
  if (!_active) return;
  const cb = _active.onComplete;
  restoreRestPose();
  _active = null;
  _statusDiv.style.display = "none";
  if (cb) { try { cb(); } catch (e) { console.error(e); } }
}

export function initActions(player) {
  _player = player;
  _bible = player.parts.bible || null;
  ensureStatus();
  window.addEventListener("keydown", e => {
    // Don't interfere with modals/dialogues/inputs
    if (document.getElementById("dialogue-box")?.style.display === "block") return;
    if (document.getElementById("minigame-modal")?.style.display === "flex") return;
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    const spec = ACTIONS[e.code];
    if (!spec) return;
    startAction(spec);
  });
}

export function updateActions(delta) {
  if (!_active) return;
  _active.t += delta;
  if (_active.t >= _active.duration) { stopAction(); return; }

  const p = _player.parts;
  const t = _active.t;
  // Normalized 0→1→0 envelope so the pose eases in and out.
  const env = Math.sin(Math.PI * Math.min(1, t / _active.duration));

  if (_active.id === "wave") {
    // Right arm raised waving, left arm relaxed
    p.armR.position.set(0.65, 1.65, 0);
    p.armR.rotation.set(0, 0, -1.4 * env);
    // Add a side-to-side wave motion at the wrist (rotation.x oscillation)
    p.armR.rotation.x = Math.sin(t * 10) * 0.6 * env;
    p.head.rotation.y = 0.15 * env;
  }
  else if (_active.id === "praise") {
    // Both arms straight up, head tilted up
    p.armL.position.set(-0.5, 2.0, 0);
    p.armR.position.set( 0.5, 2.0, 0);
    p.armL.rotation.set(0, 0,  0.2 * env);
    p.armR.rotation.set(0, 0, -0.2 * env);
    p.head.rotation.x = -0.22 * env;
  }
  else if (_active.id === "pray") {
    // Hands clasped in front, head bowed
    p.armL.position.set(-0.15, 1.2, 0.28);
    p.armR.position.set( 0.15, 1.2, 0.28);
    p.armL.rotation.set(-1.1 * env, 0,  0.7 * env);
    p.armR.rotation.set(-1.1 * env, 0, -0.7 * env);
    p.head.rotation.x = 0.28 * env;
    // Bible tucked away (move slightly back)
    if (_bible) {
      _bible.position.set(-0.55, 0.8, -0.05);
      _bible.rotation.set(0, 0, 0);
    }
  }
  else if (_active.id === "read") {
    // Bible raised in front of chest, both hands cradling it, head tilted down
    if (_bible) {
      _bible.position.set(0, 1.35, 0.4);
      _bible.rotation.set(-0.4, 0, 0);
    }
    p.armL.position.set(-0.3, 1.3, 0.35);
    p.armR.position.set( 0.3, 1.3, 0.35);
    p.armL.rotation.set(-0.9 * env, 0,  0.4 * env);
    p.armR.rotation.set(-0.9 * env, 0, -0.4 * env);
    p.head.rotation.x = 0.3 * env;
  }
  else if (_active.id === "till") {
    // Two-handed hoeing motion: arms raise overhead, then swing down to
    // the ground in front of the player, repeated ~2 times across the
    // duration.  Slight forward torso lean.
    const swing = Math.sin(t * Math.PI * 2.4); // -1..1
    const armDown = (1 - swing) * 0.5; // 0 at top, 1 at ground
    // Pivot both arms forward (rotation.x negative = forward in this rig)
    const ang = -2.2 * armDown + 0.6 * (1 - armDown); // overhead → forward-down
    p.armL.position.set(-0.3, 1.6, 0.15);
    p.armR.position.set( 0.3, 1.6, 0.15);
    p.armL.rotation.set(ang * env, 0,  0.15 * env);
    p.armR.rotation.set(ang * env, 0, -0.15 * env);
    p.torso.rotation.x = 0.18 * env * (0.4 + armDown * 0.6);
    p.head.rotation.x  = 0.25 * env;
    // Tuck Bible behind
    if (_bible) { _bible.position.set(-0.55, 0.8, -0.1); _bible.rotation.set(0, 0, 0); }
  }
  else if (_active.id === "water") {
    // Two-handed pouring motion: arms extended forward holding an
    // invisible bucket, gradually tipped forward to pour.
    const pour = Math.min(1, t / _active.duration * 1.4); // 0..1 then clamp
    // Arms forward and slightly down (rotation.x negative = forward)
    p.armL.position.set(-0.25, 1.45, 0.35);
    p.armR.position.set( 0.25, 1.45, 0.35);
    p.armL.rotation.set(-1.1 * env - 0.4 * pour * env, 0,  0.25 * env);
    p.armR.rotation.set(-1.1 * env - 0.4 * pour * env, 0, -0.25 * env);
    p.torso.rotation.x = 0.12 * env;
    p.head.rotation.x  = 0.2 * env + 0.15 * pour * env;
    if (_bible) { _bible.position.set(-0.55, 0.8, -0.1); _bible.rotation.set(0, 0, 0); }
  }
  else if (_active.id === "lift") {
    // Bend down to grab (first half), then straighten while holding the
    // item in front of the chest (second half).
    const phase = Math.min(1, t / _active.duration); // 0..1
    // Reach-down weight: 1.0 at start (deep bend), 0.0 at end (upright with item)
    const reach = 1 - phase;
    // Arm pitch goes from -1.9 (reaching down/forward) to -0.9 (cradling at chest)
    const armX = -0.9 - reach * 1.0;
    p.armL.position.set(-0.25, 1.35 - reach * 0.15, 0.35);
    p.armR.position.set( 0.25, 1.35 - reach * 0.15, 0.35);
    p.armL.rotation.set(armX * env, 0,  0.25 * env);
    p.armR.rotation.set(armX * env, 0, -0.25 * env);
    p.torso.rotation.x = reach * 0.45 * env;
    p.head.rotation.x  = reach * 0.35 * env;
    if (_bible) { _bible.position.set(-0.55, 0.8, -0.1); _bible.rotation.set(0, 0, 0); }
  }
}

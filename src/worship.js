// Stage-area worship interaction. When the player stands on the sanctuary stage
// (the wooden platform near the Worship Leader), they can press Q to pick a
// worship style and the character animates accordingly.
import { addXP, addMember } from "./growth.js";
import { openMinigameModal, showToast } from "./ui.js";

let _player = null;
let _promptDiv = null;
let _statusDiv = null;
let _saved = null;       // saved rest pose to restore on stop
let _active = null;      // current style id, or null
let _t = 0;              // animation timer

// Stage bounds (matches the wooden platform in world.js: makeBox(12,0.5,6,...,0,0,-28))
const STAGE = { x: 0, z: -28, halfW: 6, halfD: 3 };

export function isWorshipping() { return _active !== null; }

function onStage(pos) {
  return Math.abs(pos.x - STAGE.x) <= STAGE.halfW &&
         Math.abs(pos.z - STAGE.z) <= STAGE.halfD;
}

function ensurePromptDiv() {
  if (_promptDiv) return _promptDiv;
  const d = document.createElement("div");
  d.id = "worship-prompt";
  d.style.cssText =
    "position:fixed;left:50%;bottom:170px;transform:translateX(-50%);" +
    "background:rgba(20,10,40,0.85);color:#FFD700;padding:8px 16px;border-radius:8px;" +
    "font-family:'Fredoka One',cursive;font-size:16px;pointer-events:none;display:none;z-index:50;";
  document.body.appendChild(d);
  _promptDiv = d;
  return d;
}

function ensureStatusDiv() {
  if (_statusDiv) return _statusDiv;
  const d = document.createElement("div");
  d.id = "worship-status";
  d.style.cssText =
    "position:fixed;left:50%;top:90px;transform:translateX(-50%);" +
    "background:linear-gradient(90deg,#7C3AED,#FFD700);color:#1a0a2e;" +
    "padding:8px 18px;border-radius:20px;font-family:'Fredoka One',cursive;" +
    "font-size:15px;pointer-events:none;display:none;z-index:50;" +
    "box-shadow:0 0 20px rgba(255,215,0,0.5);";
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
    groupY: _player.group.position.y,
  };
}

function restoreRestPose() {
  if (!_saved) return;
  const p = _player.parts;
  for (const k of ["head","torso","legL","legR","armL","armR"]) {
    p[k].position.copy(_saved[k].pos);
    p[k].rotation.copy(_saved[k].rot);
  }
  _player.group.position.y = _saved.groupY;
  _saved = null;
}

function openWorshipPicker() {
  openMinigameModal(`
    <h2 style="color:#FFD700;font-family:'Fredoka One',cursive;margin-bottom:6px;text-align:center;">
      🎶 Step Into Worship</h2>
    <p style="color:#ccc;margin:0 0 16px;font-size:13px;text-align:center;">
      How does your spirit move tonight?</p>
    <div style="display:flex;flex-direction:column;gap:10px;">
      <button class="w-pick" data-s="charismatic"
        style="padding:16px;background:#7C3AED;color:#fff;border:none;border-radius:10px;
        font-family:'Fredoka One',cursive;font-size:16px;cursor:pointer;text-align:left;">
        🙌 Charismatic
        <div style="font-size:12px;font-weight:normal;color:#e9d5ff;margin-top:4px;
          font-family:'Nunito',sans-serif;">Lift your hands. Sway in the Spirit.</div>
      </button>
      <button class="w-pick" data-s="pentecostal"
        style="padding:16px;background:#FF6B35;color:#fff;border:none;border-radius:10px;
        font-family:'Fredoka One',cursive;font-size:16px;cursor:pointer;text-align:left;">
        💃 Pentecostal
        <div style="font-size:12px;font-weight:normal;color:#ffe4d6;margin-top:4px;
          font-family:'Nunito',sans-serif;">Dance unto the Lord — feet won't stay still.</div>
      </button>
      <button class="w-pick" data-s="reformed"
        style="padding:16px;background:#2E4057;color:#fff;border:none;border-radius:10px;
        font-family:'Fredoka One',cursive;font-size:16px;cursor:pointer;text-align:left;">
        📖 Reformed
        <div style="font-size:12px;font-weight:normal;color:#cfd8e3;margin-top:4px;
          font-family:'Nunito',sans-serif;">Sing solemnly, hands folded, head bowed.</div>
      </button>
      <button id="w-cancel" style="padding:10px;background:#2a1a2a;color:#aaa;
        border:1px solid #555;border-radius:8px;font-size:13px;cursor:pointer;">Not now</button>
    </div>`);
  document.querySelectorAll(".w-pick").forEach(b => {
    b.addEventListener("click", () => {
      document.getElementById("minigame-modal").style.display = "none";
      startWorship(b.dataset.s);
    });
  });
  document.getElementById("w-cancel").addEventListener("click", () => {
    document.getElementById("minigame-modal").style.display = "none";
  });
}

function startWorship(style) {
  if (!onStage(_player.group.position)) {
    showToast("Step onto the stage to worship.");
    return;
  }
  saveRestPose();
  _active = style;
  _t = 0;
  const label = {
    charismatic: "🙌 Worshipping (Charismatic) — Q to stop",
    pentecostal: "💃 Dancing (Pentecostal) — Q to stop",
    reformed:    "📖 Singing (Reformed) — Q to stop",
  }[style];
  _statusDiv.textContent = label;
  _statusDiv.style.display = "block";
}

function stopWorship() {
  if (!_active) return;
  const style = _active;
  _active = null;
  restoreRestPose();
  _statusDiv.style.display = "none";
  // Reward for spending time in worship; scale by how long they stayed
  const xp = Math.min(40, Math.round(_t * 1.5));
  // Long, sustained worship draws people in — grant a member every 25s on stage.
  const memberGain = Math.floor(_t / 25);
  if (xp > 0) {
    addXP(xp);
    if (memberGain > 0) addMember(memberGain);
    const extra = memberGain > 0 ? ` · \uD83C\uDFDB\uFE0F +${memberGain} member` : "";
    const msg = {
      charismatic: `\uD83D\uDE4C Hands lifted — +${xp} XP${extra}`,
      pentecostal: `\uD83D\uDC83 Joyful dance — +${xp} XP${extra}`,
      reformed:    `\uD83D\uDCD6 Reverent worship — +${xp} XP${extra}`,
    }[style];
    showToast(msg);
  }
  _t = 0;
}

export function initWorship(player) {
  _player = player;
  ensurePromptDiv();
  ensureStatusDiv();

  window.addEventListener("keydown", e => {
    if (e.code !== "KeyQ") return;
    // Don't interfere with open modals / dialogues
    if (document.getElementById("dialogue-box")?.style.display === "block") return;
    if (document.getElementById("minigame-modal")?.style.display === "flex") return;
    if (_active) { stopWorship(); return; }
    if (!onStage(_player.group.position)) return;
    openWorshipPicker();
  });
}

// Animate the player each frame based on the active worship style.
export function updateWorship(delta) {
  if (!_player || !_promptDiv) return;

  if (_active) {
    _t += delta;
    const p = _player.parts;
    const g = _player.group;

    if (_active === "charismatic") {
      // Hands lifted high, gently swaying side-to-side, head tilted up
      const sway = Math.sin(_t * 1.6) * 0.15;
      p.armL.position.set(-0.5 + sway, 2.1, 0);
      p.armR.position.set( 0.5 + sway, 2.1, 0);
      p.armL.rotation.set(0, 0,  0.25);
      p.armR.rotation.set(0, 0, -0.25);
      p.head.rotation.x = -0.18;
      p.head.rotation.z = sway * 0.4;
      // Slight standing bob
      g.position.y = (_saved?.groupY || 0) + Math.sin(_t * 2) * 0.04;
      // Legs reset (no walking)
      p.legL.rotation.x = p.legR.rotation.x = 0;
    }
    else if (_active === "pentecostal") {
      // Dance: alternating leg lifts, arms swinging, jumping bob
      const t = _t * 4;
      p.legL.rotation.x =  Math.sin(t) * 0.6;
      p.legR.rotation.x = -Math.sin(t) * 0.6;
      p.armL.rotation.x = -Math.sin(t) * 0.9;
      p.armR.rotation.x =  Math.sin(t) * 0.9;
      p.armL.rotation.z =  0.3 + Math.sin(t * 0.5) * 0.2;
      p.armR.rotation.z = -0.3 - Math.sin(t * 0.5) * 0.2;
      p.armL.position.set(-0.6, 1.4, 0);
      p.armR.position.set( 0.6, 1.4, 0);
      p.head.rotation.z = Math.sin(t * 0.5) * 0.15;
      p.head.rotation.x = 0;
      g.position.y = (_saved?.groupY || 0) + Math.abs(Math.sin(t)) * 0.25;
      // Slight torso twist
      p.torso.rotation.y = Math.sin(t * 0.5) * 0.15;
    }
    else if (_active === "reformed") {
      // Hands folded at chest, head bowed slightly, gentle bob
      p.armL.position.set(-0.18, 1.15, 0.28);
      p.armR.position.set( 0.18, 1.15, 0.28);
      p.armL.rotation.set(-1.0, 0,  0.6);
      p.armR.rotation.set(-1.0, 0, -0.6);
      p.head.rotation.x = 0.22;        // bowed
      p.head.rotation.z = Math.sin(_t * 1.2) * 0.04;
      p.legL.rotation.x = p.legR.rotation.x = 0;
      p.torso.rotation.y = 0;
      g.position.y = (_saved?.groupY || 0) + Math.sin(_t * 1.2) * 0.02;
    }

    // If player walked off the stage, end worship gracefully
    if (!onStage(g.position)) stopWorship();
    return;
  }

  // Idle: show/hide the stage prompt
  if (onStage(_player.group.position)) {
    _promptDiv.textContent = "Press Q to Worship";
    _promptDiv.style.display = "block";
  } else {
    _promptDiv.style.display = "none";
  }
}

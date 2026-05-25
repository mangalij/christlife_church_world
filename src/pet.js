// Pet companion — adopt a sheep or puppy at the garden and it follows
// you everywhere. It earns XP alongside you (1 pet-XP per +5 player XP)
// and levels up, unlocking simple tricks: "sit" (idle bow), "speak"
// (baa/woof toast). State persists across sessions.
//
// Press E at the garden's "🐾 Adopt-a-Pet" sign (a wooden post next to
// the cross) to open the adoption modal. Once adopted, press G near
// the pet to play with it; the pet panel in the HUD shows its name +
// level. Press C in-world to summon it to your side if it gets stuck.

import * as THREE from "three";
import { showToast, openMinigameModal } from "./ui.js";
import { addXP } from "./growth.js";
import { requestInteractButton } from "./player.js";

const STORAGE = "clw_pet";
const POST_POS = new THREE.Vector3(-58, 0, -7); // near the garden's NW corner
const POST_INTERACT_R = 2.2;
const FOLLOW_TARGET = 2.6;                       // distance behind player
const SUMMON_KEY = "KeyC";
const PLAY_KEY   = "KeyG";

// Pet XP needed for level N+1 (curve mirrors faith.js but flatter).
function petXPForLevel(n) {
  if (n <= 1) return 0;
  return 30 * (n - 1) * n / 2;        // 30, 90, 180, 300, 450...
}

const PET_TYPES = {
  sheep:  { name: "Sheep", emoji: "🐑", body: 0xF5F5F5, feet: 0x222222, sound: "Baa!" },
  puppy:  { name: "Puppy", emoji: "🐶", body: 0xD9A66B, feet: 0x6B3410, sound: "Woof!" },
  dove:   { name: "Dove",  emoji: "🕊️", body: 0xFFFFFF, feet: 0xE94F37, sound: "Coo!" },
};

// ---- Module state --------------------------------------------------
let _scene = null;
let _player = null;
let _post = null;
let _postPromptDiv = null;

let _state = null;          // { adopted, type, name, level, xp }
let _mesh = null;           // THREE.Group following the player
let _meshParts = {};        // body, head, ear, tail
let _bobPhase = 0;
let _trickPhase = "follow"; // "follow" | "sit" | "wave"
let _trickTimer = 0;
let _summonCooldown = 0;

// ---- Persistence ---------------------------------------------------
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return { adopted: false };
    const data = JSON.parse(raw);
    return { adopted: !!data.adopted, type: data.type || "sheep",
             name: data.name || "Buddy", level: data.level || 1, xp: data.xp || 0 };
  } catch { return { adopted: false }; }
}
function saveState() {
  localStorage.setItem(STORAGE, JSON.stringify(_state));
}

// ---- Pet mesh builder ----------------------------------------------
function buildPetMesh(type) {
  const cfg = PET_TYPES[type] || PET_TYPES.sheep;
  const mat = c => new THREE.MeshToonMaterial({ color: c });
  const g = new THREE.Group();

  // Body (fluffy cube)
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 1.0), mat(cfg.body));
  body.position.y = 0.45;
  body.castShadow = true;
  g.add(body);

  // Head — slightly smaller cube poking forward
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), mat(cfg.body));
  head.position.set(0, 0.65, -0.55);
  head.castShadow = true;
  g.add(head);

  // Eyes (tiny dark dots on the face)
  for (const dx of [-0.1, 0.1]) {
    const eye = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.05, 0.04),
      mat(0x111111)
    );
    eye.position.set(dx, 0.72, -0.78);
    g.add(eye);
  }

  // Ears (different per pet — but simple boxes)
  for (const dx of [-0.18, 0.18]) {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.08), mat(cfg.body));
    ear.position.set(dx, 0.92, -0.55);
    g.add(ear);
  }

  // Legs — 4 small dark boxes
  for (const [dx, dz] of [[-0.22, -0.3], [0.22, -0.3], [-0.22, 0.3], [0.22, 0.3]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.45, 0.14), mat(cfg.feet));
    leg.position.set(dx, 0.0, dz);
    leg.castShadow = true;
    g.add(leg);
  }

  // Tail — a wagging stub on the back
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.22), mat(cfg.body));
  tail.position.set(0, 0.55, 0.55);
  g.add(tail);

  return { group: g, parts: { body, head, tail } };
}

// ---- Adoption-post visual -------------------------------------------
function buildPost(scene) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 1.6, 0.2),
    new THREE.MeshToonMaterial({ color: 0x6B3410 })
  );
  post.position.y = 0.8;
  post.castShadow = true;
  g.add(post);

  // Floating canvas sign
  const canvas = document.createElement("canvas");
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(20,60,25,0.92)"; ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = "#FFD700"; ctx.font = "bold 22px Arial";
  ctx.fillText("🐾 Adopt-a-Pet", 30, 42);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvas), transparent: true,
  }));
  sprite.position.set(0, 2.2, 0);
  sprite.scale.set(2.4, 0.6, 1);
  g.add(sprite);

  g.position.copy(POST_POS);
  scene.add(g);
  return g;
}

function ensurePostPrompt() {
  if (_postPromptDiv) return _postPromptDiv;
  const div = document.createElement("div");
  div.id = "pet-post-prompt";
  div.style.cssText =
    "position:fixed;left:50%;bottom:230px;transform:translateX(-50%);" +
    "background:rgba(20,60,25,0.92);color:#FFD700;padding:8px 16px;border-radius:8px;" +
    "font-family:'Fredoka One',cursive;font-size:15px;pointer-events:none;display:none;" +
    "z-index:50;border:1px solid #FFD700;";
  document.body.appendChild(div);
  _postPromptDiv = div;
  return div;
}

// ---- Adoption modal -------------------------------------------------
function openAdoptionModal() {
  if (_state.adopted) {
    openPetPanel();
    return;
  }
  const cards = Object.keys(PET_TYPES).map(key => {
    const t = PET_TYPES[key];
    return `<button data-pet="${key}" style="display:flex;flex-direction:column;align-items:center;
      gap:6px;padding:14px;background:#2E0854;color:#fff;border:2px solid #7C3AED;
      border-radius:10px;cursor:pointer;font-family:inherit;min-width:110px;">
        <span style="font-size:36px;">${t.emoji}</span>
        <span style="font-family:'Fredoka One',cursive;color:#FFD700;">${t.name}</span>
      </button>`;
  }).join("");
  openMinigameModal(`
    <div style="text-align:center;padding:8px 4px;">
      <h2 style="margin:0 0 6px 0;color:#FFD700;">🐾 Choose your Companion</h2>
      <p style="margin:0 0 14px 0;color:#ddd;">A faithful friend who'll travel with you on your journey.</p>
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-bottom:14px;"
        id="pet-cards">${cards}</div>
      <label style="color:#FFD700;display:block;margin-bottom:6px;">Name your pet:</label>
      <input id="pet-name-input" type="text" maxlength="16" value="Buddy"
        style="padding:8px 12px;background:#1a0a2e;border:1px solid #7C3AED;border-radius:8px;
        color:#fff;font-size:15px;text-align:center;width:200px;outline:none;" />
      <div style="margin-top:14px;">
        <button id="pet-confirm" disabled style="padding:10px 24px;background:#7C3AED;color:#fff;
          border:none;border-radius:10px;font-family:'Fredoka One',cursive;font-size:16px;cursor:pointer;
          opacity:0.5;">Adopt</button>
      </div>
    </div>
  `);

  let chosen = null;
  document.querySelectorAll("#pet-cards button[data-pet]").forEach(btn => {
    btn.addEventListener("click", () => {
      chosen = btn.getAttribute("data-pet");
      document.querySelectorAll("#pet-cards button").forEach(b => {
        b.style.borderColor = b === btn ? "#FFD700" : "#7C3AED";
      });
      const confirm = document.getElementById("pet-confirm");
      confirm.disabled = false;
      confirm.style.opacity = "1";
    });
  });
  document.getElementById("pet-confirm")?.addEventListener("click", () => {
    if (!chosen) return;
    const name = (document.getElementById("pet-name-input").value || "Buddy").trim().slice(0, 16);
    adoptPet(chosen, name);
  });
}

function openPetPanel() {
  if (!_state.adopted) { openAdoptionModal(); return; }
  const cfg = PET_TYPES[_state.type] || PET_TYPES.sheep;
  const nextXP = petXPForLevel(_state.level + 1);
  const baseXP = petXPForLevel(_state.level);
  const pct = Math.min(100, ((_state.xp - baseXP) / Math.max(1, nextXP - baseXP)) * 100);

  const tricks = [];
  if (_state.level >= 2) tricks.push(`<button data-trick="sit"
    style="padding:8px 16px;background:#2E0854;color:#FFD700;border:1px solid #FFD700;
    border-radius:8px;margin:4px;font-family:inherit;cursor:pointer;">Sit</button>`);
  if (_state.level >= 3) tricks.push(`<button data-trick="speak"
    style="padding:8px 16px;background:#2E0854;color:#FFD700;border:1px solid #FFD700;
    border-radius:8px;margin:4px;font-family:inherit;cursor:pointer;">Speak</button>`);
  if (_state.level >= 5) tricks.push(`<button data-trick="dance"
    style="padding:8px 16px;background:#2E0854;color:#FFD700;border:1px solid #FFD700;
    border-radius:8px;margin:4px;font-family:inherit;cursor:pointer;">Dance</button>`);

  openMinigameModal(`
    <div style="text-align:center;padding:8px 4px;">
      <h2 style="margin:0 0 4px 0;color:#FFD700;">${cfg.emoji} ${_state.name}</h2>
      <p style="margin:0 0 12px 0;color:#ddd;">Level ${_state.level} ${cfg.name}</p>
      <div style="height:10px;background:#1a0a2e;border:1px solid #7C3AED;border-radius:6px;
        margin:0 auto 6px auto;width:240px;overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#7C3AED,#FFD700);"></div>
      </div>
      <p style="color:#A0E7E5;font-size:12px;margin:0 0 14px 0;">
        Pet XP: ${_state.xp} / ${nextXP}
      </p>
      ${tricks.length
        ? `<p style="color:#fff;margin:0 0 6px 0;">Tricks unlocked:</p><div id="pet-tricks">${tricks.join("")}</div>`
        : `<p style="color:#888;">Tricks unlock as ${_state.name} levels up.</p>`}
      <p style="color:#888;font-size:11px;margin-top:14px;">
        Press <b style="color:#FFD700;">G</b> near ${_state.name} to play (gain pet XP).
        Press <b style="color:#FFD700;">C</b> anywhere to summon to your side.
      </p>
    </div>
  `);

  document.querySelectorAll("#pet-tricks button[data-trick]").forEach(btn => {
    btn.addEventListener("click", () => doTrick(btn.getAttribute("data-trick")));
  });
}

function adoptPet(type, name) {
  _state = { adopted: true, type, name, level: 1, xp: 0 };
  saveState();
  spawnPetMesh();
  document.getElementById("minigame-modal").style.display = "none";
  showToast(`${PET_TYPES[type].emoji} ${name} is now your companion!`);
  refreshHudBadge();
}

function spawnPetMesh() {
  if (_mesh) { _scene.remove(_mesh); _mesh = null; }
  const built = buildPetMesh(_state.type);
  _mesh = built.group;
  _meshParts = built.parts;
  // Spawn near the player
  const p = _player.group.position;
  _mesh.position.set(p.x - 1.5, 0, p.z + 1.0);
  _scene.add(_mesh);
}

// ---- Tricks --------------------------------------------------------
function doTrick(name) {
  const cfg = PET_TYPES[_state.type] || PET_TYPES.sheep;
  if (name === "sit") {
    _trickPhase = "sit";
    _trickTimer = 3.0;
    showToast(`${_state.name} sits 🪑`);
  } else if (name === "speak") {
    showToast(`${_state.name} says "${cfg.sound}"`);
    addPetXP(2);
  } else if (name === "dance") {
    _trickPhase = "wave";
    _trickTimer = 2.5;
    showToast(`${_state.name} spins joyfully 💃`);
    addPetXP(3);
  }
}

// Public helpers --------------------------------------------------
export function addPetXP(amount) {
  if (!_state || !_state.adopted) return;
  _state.xp += amount;
  // Level-up check (could span multiple levels)
  while (_state.xp >= petXPForLevel(_state.level + 1)) {
    _state.level++;
    showToast(`🐾 ${_state.name} reached Level ${_state.level}!`);
  }
  saveState();
  refreshHudBadge();
}

// Called from growth.js? No — easier: poll in update loop comparing
// player XP between frames. See updatePet below.
let _lastPlayerXP = null;

// ---- HUD badge (tiny pet indicator in corner) ----------------------
let _hudBadge = null;
function ensureHudBadge() {
  if (_hudBadge) return _hudBadge;
  const div = document.createElement("div");
  div.id = "pet-badge";
  div.style.cssText =
    "position:absolute;top:120px;left:10px;width:200px;z-index:10;" +
    "background:rgba(20,10,40,0.78);border:1px solid #7C3AED;border-radius:8px;" +
    "padding:6px 10px;font-family:'Nunito',sans-serif;color:#fff;font-size:12px;" +
    "cursor:pointer;display:none;";
  div.addEventListener("click", openPetPanel);
  document.body.appendChild(div);
  _hudBadge = div;
  return div;
}
function refreshHudBadge() {
  const div = ensureHudBadge();
  if (!_state || !_state.adopted) { div.style.display = "none"; return; }
  const cfg = PET_TYPES[_state.type] || PET_TYPES.sheep;
  div.style.display = "block";
  div.innerHTML = `<span style="color:#FFD700;font-family:'Fredoka One',cursive;">
    ${cfg.emoji} ${_state.name}</span>
    <span style="float:right;color:#A0E7E5;">Lv.${_state.level}</span>`;
}

// ---- Update loop ---------------------------------------------------
function nearPost(pos) {
  const dx = POST_POS.x - pos.x, dz = POST_POS.z - pos.z;
  return dx * dx + dz * dz <= POST_INTERACT_R * POST_INTERACT_R;
}

function updatePetFollow(delta) {
  if (!_mesh || !_state || !_state.adopted) return;
  const target = _player.group.position;
  const dx = target.x - _mesh.position.x;
  const dz = target.z - _mesh.position.z;
  const dist = Math.hypot(dx, dz);

  // While sitting, stay put and bow slightly
  if (_trickPhase === "sit") {
    _trickTimer -= delta;
    _mesh.rotation.x = 0.5;
    if (_trickTimer <= 0) { _trickPhase = "follow"; _mesh.rotation.x = 0; }
    return;
  }
  if (_trickPhase === "wave") {
    _trickTimer -= delta;
    _mesh.rotation.y += delta * 6;
    if (_trickTimer <= 0) { _trickPhase = "follow"; }
    return;
  }

  // Catch up if too far; idle if close enough
  if (dist > FOLLOW_TARGET) {
    const speed = Math.min(3.5, 1.5 + (dist - FOLLOW_TARGET) * 0.8);
    const step = Math.min(dist - FOLLOW_TARGET * 0.5, speed * delta);
    _mesh.position.x += (dx / dist) * step;
    _mesh.position.z += (dz / dist) * step;
    _mesh.rotation.y = Math.atan2(dx, dz);
    // Bob while moving
    _bobPhase += delta * 9;
    _mesh.position.y = Math.abs(Math.sin(_bobPhase)) * 0.12;
    if (_meshParts.tail) _meshParts.tail.rotation.x = Math.sin(_bobPhase * 1.4) * 0.6;
  } else {
    _mesh.position.y *= 0.85;
    if (_meshParts.tail) _meshParts.tail.rotation.x *= 0.9;
  }
}

// ---- Public API ----------------------------------------------------
export function initPet(scene, player) {
  _scene = scene;
  _player = player;
  _state = loadState();
  _post = buildPost(scene);
  ensurePostPrompt();
  ensureHudBadge();

  if (_state.adopted) {
    spawnPetMesh();
    refreshHudBadge();
  }
  _lastPlayerXP = parseInt(localStorage.getItem("clw_xp") || "0");

  window.addEventListener("keydown", e => {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    if (e.code === "KeyE") {
      // Open adoption / pet panel only if standing at the post
      if (nearPost(_player.group.position)) openAdoptionModal();
      return;
    }
    if (e.code === SUMMON_KEY && _state?.adopted && _mesh && _summonCooldown <= 0) {
      const p = _player.group.position;
      _mesh.position.set(p.x - 1.5, 0, p.z + 1.0);
      _summonCooldown = 1.5;
      addPetXP(1);
    }
    if (e.code === PLAY_KEY && _state?.adopted && _mesh) {
      const dx = _mesh.position.x - _player.group.position.x;
      const dz = _mesh.position.z - _player.group.position.z;
      if (dx * dx + dz * dz < 9) {
        const cfg = PET_TYPES[_state.type] || PET_TYPES.sheep;
        showToast(`${cfg.emoji} ${_state.name} loves playing! (${cfg.sound})`);
        addPetXP(4);
        _trickPhase = "wave";
        _trickTimer = 1.0;
      }
    }
  });
}

export function updatePet(delta) {
  if (!_player) return;
  // Award pet XP whenever the player's XP increases.
  const cur = parseInt(localStorage.getItem("clw_xp") || "0");
  if (cur > _lastPlayerXP && _state?.adopted) {
    const gained = cur - _lastPlayerXP;
    addPetXP(Math.max(1, Math.floor(gained / 5)));
  }
  _lastPlayerXP = cur;

  if (_summonCooldown > 0) _summonCooldown -= delta;

  updatePetFollow(delta);

  // Prompt management
  const prompt = ensurePostPrompt();
  const isOpenModal = document.getElementById("minigame-modal")?.style.display === "flex";
  const showPost = !isOpenModal && !window.__nearNPC && nearPost(_player.group.position);
  // Mobile: register a vote for the interact button so phone players can
  // open the adoption / pet panel by tapping E.
  requestInteractButton("pet", showPost);
  if (showPost) {
    prompt.textContent = _state?.adopted
      ? `🐾 Press E for ${_state.name}`
      : "🐾 Press E to adopt a pet";
    prompt.style.display = "block";
  } else {
    prompt.style.display = "none";
  }
}

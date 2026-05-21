// Seeds of Faith Garden — a small fenced garden tucked between the
// fellowship hall and the foyer where the player can plant seeds, watch
// them grow in real time, and harvest mature blooms for XP.
//
// Each of the six raised plots has 5 lifecycle stages driven by wall
// clock time, so plants keep growing while the player is exploring (or
// even between play sessions).  State is persisted under `clw_garden`
// in localStorage so the garden survives reloads.
//
//   empty  → seed   (just planted)
//   seed   → sprout    after  30s
//   sprout → growing   after  90s
//   growing→ mature    after 180s
//
// Press E next to a plot to open the planter UI.  Costs 5 XP to plant a
// fruit-of-the-Spirit seed; harvesting a mature plant rewards 30 XP and
// every 3rd harvest adds a new church member (their testimony reaches
// someone new).

import * as THREE from "three";
import { showToast, openMinigameModal } from "./ui.js";
import { addXP, spendXP, getXP, addMember } from "./growth.js";

// ---- Configuration -------------------------------------------------
// Open lawn well west of the fellowship hall (which spans x[-43,-21]) and
// nowhere near the parking lot (which sits up at z≈16-40). Quiet spot
// closer to the prayer side of the property.
const GARDEN_CX = -55;       // garden centre X
const GARDEN_CZ = -10;       // garden centre Z
const PLOT_COUNT = 6;        // 3 cols x 2 rows
const PLOT_SPACING_X = 2.4;
const PLOT_SPACING_Z = 2.4;
const PLOT_GRID_COLS = 3;
const INTERACT_RANGE = 2.2;
const SEED_COST = 5;
const HARVEST_XP = 30;
const HARVEST_MEMBER_EVERY = 3;
const STORAGE_KEY = "clw_garden";
const HARVEST_COUNT_KEY = "clw_garden_harvests";

// Stage durations in seconds (real time)
const STAGE_SPROUT_AT  = 30;
const STAGE_GROWING_AT = 90;
const STAGE_MATURE_AT  = 180;

// Fruit-of-the-Spirit seeds available to plant
const SEED_TYPES = {
  faith: { name: "Faith",    emoji: "✝️", bloom: 0xFFD700, verse: "Now faith is the substance of things hoped for. — Heb 11:1" },
  love:  { name: "Love",     emoji: "❤️", bloom: 0xE94F37, verse: "Love your neighbor as yourself. — Mark 12:31" },
  hope:  { name: "Hope",     emoji: "🌅", bloom: 0xFF8C42, verse: "Hope does not put us to shame. — Rom 5:5" },
  joy:   { name: "Joy",      emoji: "😊", bloom: 0xFFC93C, verse: "The joy of the Lord is your strength. — Neh 8:10" },
  peace: { name: "Peace",    emoji: "🕊️", bloom: 0xA0E7E5, verse: "Peace I leave with you. — John 14:27" },
};
const SEED_KEYS = Object.keys(SEED_TYPES);

// ---- Module state --------------------------------------------------
let _scene = null;
let _player = null;
let _plots = [];               // [{ pos:Vector3, group:Group, parts:{...}, type:string|null, plantedAt:number|null }]
let _promptDiv = null;
let _modalOpen = false;

// ---- Persistence ---------------------------------------------------
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveState() {
  const data = _plots.map(p => ({ type: p.type, plantedAt: p.plantedAt }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function getHarvestCount() {
  return parseInt(localStorage.getItem(HARVEST_COUNT_KEY) || "0");
}
function bumpHarvestCount() {
  const next = getHarvestCount() + 1;
  localStorage.setItem(HARVEST_COUNT_KEY, next);
  return next;
}

// ---- Stage helpers -------------------------------------------------
function stageOf(plot) {
  if (!plot.type || !plot.plantedAt) return "empty";
  const age = (Date.now() - plot.plantedAt) / 1000;
  if (age >= STAGE_MATURE_AT)  return "mature";
  if (age >= STAGE_GROWING_AT) return "growing";
  if (age >= STAGE_SPROUT_AT)  return "sprout";
  return "seed";
}

function timeUntilNextStage(plot) {
  if (!plot.type || !plot.plantedAt) return 0;
  const age = (Date.now() - plot.plantedAt) / 1000;
  if (age < STAGE_SPROUT_AT)  return STAGE_SPROUT_AT  - age;
  if (age < STAGE_GROWING_AT) return STAGE_GROWING_AT - age;
  if (age < STAGE_MATURE_AT)  return STAGE_MATURE_AT  - age;
  return 0;
}

function formatTime(seconds) {
  seconds = Math.max(0, Math.ceil(seconds));
  if (seconds < 60) return seconds + "s";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m + "m " + (s < 10 ? "0" : "") + s + "s";
}

// ---- Scenery builders ----------------------------------------------
function box(w, h, d, color, x, y, z) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshToonMaterial({ color })
  );
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildPlotVisual() {
  // Returns a group containing all stage meshes; only the meshes matching
  // the current stage are visible. The caller positions the group.
  const group = new THREE.Group();

  // Always-visible raised dirt bed (top is the soil surface)
  const bed = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.4, 1.6),
    new THREE.MeshToonMaterial({ color: 0x5C3A1E })
  );
  bed.position.y = 0.2;
  bed.castShadow = true; bed.receiveShadow = true;
  group.add(bed);

  // Wooden bed frame (4 thin planks around the rim)
  for (const [w, d, x, z] of [[1.7, 0.15, 0, 0.8], [1.7, 0.15, 0, -0.8], [0.15, 1.7, 0.8, 0], [0.15, 1.7, -0.8, 0]]) {
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.42, d),
      new THREE.MeshToonMaterial({ color: 0x6B3410 })
    );
    plank.position.set(x, 0.21, z);
    plank.castShadow = true; plank.receiveShadow = true;
    group.add(plank);
  }

  // Stage: seed (tiny mound)
  const seedMound = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 8, 6),
    new THREE.MeshToonMaterial({ color: 0x3A2410 })
  );
  seedMound.position.y = 0.42;
  group.add(seedMound);

  // Stage: sprout (small green spike)
  const sprout = new THREE.Mesh(
    new THREE.ConeGeometry(0.12, 0.5, 6),
    new THREE.MeshToonMaterial({ color: 0x6BCB77 })
  );
  sprout.position.y = 0.65;
  group.add(sprout);

  // Stage: growing (stem + two leaves, no flower yet)
  const growStem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.09, 1.1, 6),
    new THREE.MeshToonMaterial({ color: 0x3F8A4F })
  );
  growStem.position.y = 0.95;
  const growLeafL = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 6),
    new THREE.MeshToonMaterial({ color: 0x4FB85A })
  );
  growLeafL.position.set(-0.18, 1.0, 0);
  growLeafL.scale.set(1, 0.4, 0.7);
  const growLeafR = growLeafL.clone();
  growLeafR.position.set(0.18, 1.15, 0);
  const growingGroup = new THREE.Group();
  growingGroup.add(growStem, growLeafL, growLeafR);
  group.add(growingGroup);

  // Stage: mature (taller stem + bloom; bloom color set when planted)
  const matStem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.1, 1.4, 6),
    new THREE.MeshToonMaterial({ color: 0x3F8A4F })
  );
  matStem.position.y = 1.1;
  const matLeafL = growLeafL.clone();
  matLeafL.position.set(-0.22, 1.15, 0);
  const matLeafR = growLeafR.clone();
  matLeafR.position.set(0.22, 1.3, 0);
  const bloomCore = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 12, 10),
    new THREE.MeshToonMaterial({ color: 0xFFD700 })
  );
  bloomCore.position.y = 1.85;
  // 6 petals around the core
  const petals = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const petal = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 6),
      new THREE.MeshToonMaterial({ color: 0xFFD700 })
    );
    petal.position.set(Math.cos(angle) * 0.3, 1.85, Math.sin(angle) * 0.3);
    petal.scale.set(0.7, 0.5, 0.7);
    petals.push(petal);
  }
  const matureGroup = new THREE.Group();
  matureGroup.add(matStem, matLeafL, matLeafR, bloomCore, ...petals);
  group.add(matureGroup);

  return {
    group,
    parts: {
      seedMound,
      sprout,
      growing: growingGroup,
      mature:  matureGroup,
      bloomCore,
      petals,
    },
  };
}

function applyStageVisual(plot) {
  const s = stageOf(plot);
  const p = plot.parts;
  p.seedMound.visible = (s === "seed");
  p.sprout.visible    = (s === "sprout");
  p.growing.visible   = (s === "growing");
  p.mature.visible    = (s === "mature");
  // Tint the mature bloom to match the seed type
  if (s === "mature" && plot.type && SEED_TYPES[plot.type]) {
    const c = SEED_TYPES[plot.type].bloom;
    p.bloomCore.material.color.setHex(c);
    for (const petal of p.petals) petal.material.color.setHex(c);
  }
}

function buildScenery() {
  const root = new THREE.Group();

  // Grass patch under the garden
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(11, 8),
    new THREE.MeshLambertMaterial({ color: 0x7BC96F })
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(GARDEN_CX, 0.03, GARDEN_CZ);
  grass.receiveShadow = true;
  root.add(grass);

  // Picket fence around the perimeter (decorative; non-colliding so the
  // player can walk in from any side to tend their plants).
  const fenceMat = new THREE.MeshToonMaterial({ color: 0xF5EFE0 });
  const railMat  = new THREE.MeshToonMaterial({ color: 0xE8DCC0 });
  function picket(x, z) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), fenceMat);
    post.position.set(x, 0.45, z);
    post.castShadow = true; post.receiveShadow = true;
    return post;
  }
  // North + south edges (along x)
  for (let i = -5; i <= 5; i++) {
    root.add(picket(GARDEN_CX + i, GARDEN_CZ - 4));
    root.add(picket(GARDEN_CX + i, GARDEN_CZ + 4));
  }
  // East + west edges (along z) — skip corners (already placed)
  for (let i = -3; i <= 3; i++) {
    root.add(picket(GARDEN_CX - 5, GARDEN_CZ + i));
    root.add(picket(GARDEN_CX + 5, GARDEN_CZ + i));
  }
  // Top rails
  for (const z of [GARDEN_CZ - 4, GARDEN_CZ + 4]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.1, 0.08), railMat);
    rail.position.set(GARDEN_CX, 0.8, z);
    root.add(rail);
  }
  for (const x of [GARDEN_CX - 5, GARDEN_CX + 5]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 8.2), railMat);
    rail.position.set(x, 0.8, GARDEN_CZ);
    root.add(rail);
  }

  // Watering well in the back corner
  const well = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.7, 0.8, 12),
    new THREE.MeshToonMaterial({ color: 0x808080 })
  );
  well.position.set(GARDEN_CX + 4, 0.4, GARDEN_CZ - 3);
  well.castShadow = true;
  root.add(well);
  const wellWater = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 16),
    new THREE.MeshBasicMaterial({ color: 0x4A90E2 })
  );
  wellWater.rotation.x = -Math.PI / 2;
  wellWater.position.set(GARDEN_CX + 4, 0.81, GARDEN_CZ - 3);
  root.add(wellWater);
  // Well roof posts + peaked cover
  for (const dx of [-0.7, 0.7]) {
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 1.4, 0.1),
      new THREE.MeshToonMaterial({ color: 0x6B3410 })
    );
    post.position.set(GARDEN_CX + 4 + dx, 1.5, GARDEN_CZ - 3);
    root.add(post);
  }
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(1.1, 0.7, 4),
    new THREE.MeshToonMaterial({ color: 0x8B4513 })
  );
  roof.rotation.y = Math.PI / 4;
  roof.position.set(GARDEN_CX + 4, 2.5, GARDEN_CZ - 3);
  root.add(roof);

  // Wooden cross on the opposite back corner — a quiet reminder of who
  // makes the seed grow.
  root.add(box(0.12, 1.6, 0.12, 0x6B3410, GARDEN_CX - 4, 0, GARDEN_CZ - 3));
  root.add(box(0.7, 0.12, 0.12, 0x6B3410, GARDEN_CX - 4, 1.05, GARDEN_CZ - 3));

  // Floating sign
  const canvas = document.createElement("canvas");
  canvas.width = 320; canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(20, 60, 25, 0.9)"; ctx.fillRect(0, 0, 320, 64);
  ctx.fillStyle = "#FFD700"; ctx.font = "bold 24px Arial";
  ctx.fillText("🌱 Seeds of Faith Garden", 12, 42);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvas), transparent: true,
  }));
  sprite.position.set(GARDEN_CX, 3.6, GARDEN_CZ + 4);
  sprite.scale.set(5.6, 1.1, 1);
  root.add(sprite);

  return root;
}

// ---- Plot creation -------------------------------------------------
function plotPosition(i) {
  const col = i % PLOT_GRID_COLS;
  const row = Math.floor(i / PLOT_GRID_COLS);
  const x = GARDEN_CX + (col - (PLOT_GRID_COLS - 1) / 2) * PLOT_SPACING_X;
  const z = GARDEN_CZ + (row - 0.5) * PLOT_SPACING_Z;
  return new THREE.Vector3(x, 0, z);
}

// ---- Proximity / prompts -------------------------------------------
function nearestPlotIndex() {
  if (!_player) return -1;
  const pos = _player.group.position;
  let best = -1, bestD2 = INTERACT_RANGE * INTERACT_RANGE;
  for (let i = 0; i < _plots.length; i++) {
    const p = _plots[i].pos;
    const dx = p.x - pos.x, dz = p.z - pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) { bestD2 = d2; best = i; }
  }
  return best;
}

function ensurePrompt() {
  if (_promptDiv) return _promptDiv;
  const div = document.createElement("div");
  div.id = "garden-prompt";
  div.style.cssText =
    "position:fixed;left:50%;bottom:200px;transform:translateX(-50%);" +
    "background:rgba(20,60,25,0.92);color:#FFD700;padding:8px 16px;border-radius:8px;" +
    "font-family:'Fredoka One',cursive;font-size:15px;pointer-events:none;display:none;" +
    "z-index:50;border:1px solid #FFD700;";
  document.body.appendChild(div);
  _promptDiv = div;
  return div;
}

// ---- Modal UI ------------------------------------------------------
function renderPlotModal(idx) {
  const plot = _plots[idx];
  const stage = stageOf(plot);
  let body = "";

  if (stage === "empty") {
    const xp = getXP();
    const cantAfford = xp < SEED_COST;
    body = `
      <h2 style="margin:0 0 8px 0;color:#FFD700;">🌱 Empty Plot</h2>
      <p style="margin:0 0 12px 0;color:#fff;">Plant a seed of faith and watch it grow over time.</p>
      <p style="margin:0 0 12px 0;color:#A0E7E5;font-size:13px;">
        Cost: ${SEED_COST} XP &nbsp;•&nbsp; You have: ${xp} XP
      </p>
      <p style="margin:0 0 8px 0;color:#fff;font-weight:bold;">Choose a seed:</p>
      <div id="garden-seed-picker" style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;">
        ${SEED_KEYS.map(key => {
          const s = SEED_TYPES[key];
          return `<button data-seed="${key}" ${cantAfford ? "disabled" : ""}
            style="padding:10px 14px;background:#2E0854;color:#FFD700;border:2px solid #FFD700;
            border-radius:8px;cursor:${cantAfford ? "not-allowed" : "pointer"};
            opacity:${cantAfford ? "0.5" : "1"};font-family:inherit;font-size:14px;min-width:90px;">
              ${s.emoji} ${s.name}
            </button>`;
        }).join("")}
      </div>
      ${cantAfford ? `<p style="margin-top:12px;color:#FF6B6B;">Not enough XP yet — earn some by witnessing or worship!</p>` : ""}
    `;
  } else if (stage === "mature") {
    const s = SEED_TYPES[plot.type] || SEED_TYPES.faith;
    body = `
      <h2 style="margin:0 0 8px 0;color:#FFD700;">${s.emoji} ${s.name} in Full Bloom!</h2>
      <p style="margin:0 0 8px 0;color:#fff;font-style:italic;">"${s.verse}"</p>
      <p style="margin:0 0 16px 0;color:#A0E7E5;">
        Harvest this bloom for <b>+${HARVEST_XP} XP</b>.
        Every ${HARVEST_MEMBER_EVERY} harvests bring a new member to the church.
      </p>
      <button id="garden-harvest-btn" style="padding:12px 24px;background:#FFD700;color:#2E0854;
        border:none;border-radius:8px;cursor:pointer;font-family:inherit;font-size:16px;font-weight:bold;">
        🌾 Harvest
      </button>
    `;
  } else {
    const s = SEED_TYPES[plot.type] || SEED_TYPES.faith;
    const stageLabel = { seed: "Seed planted", sprout: "Sprouting", growing: "Growing" }[stage] || stage;
    const wait = timeUntilNextStage(plot);
    const totalLeft = Math.max(0, STAGE_MATURE_AT - (Date.now() - plot.plantedAt) / 1000);
    body = `
      <h2 style="margin:0 0 8px 0;color:#FFD700;">${s.emoji} ${s.name} — ${stageLabel}</h2>
      <p style="margin:0 0 8px 0;color:#fff;font-style:italic;">"${s.verse}"</p>
      <p style="margin:0 0 6px 0;color:#A0E7E5;">Next stage in: <b>${formatTime(wait)}</b></p>
      <p style="margin:0 0 16px 0;color:#A0E7E5;">Ready to harvest in: <b>${formatTime(totalLeft)}</b></p>
      <p style="margin:0;color:#ccc;font-size:13px;">"He who has begun a good work in you will complete it." — Phil 1:6</p>
    `;
  }

  openMinigameModal(`
    <div style="text-align:center;padding:10px 4px;">
      ${body}
    </div>
  `);
  _modalOpen = true;
  wirePlotModalHandlers(idx);
}

function wirePlotModalHandlers(idx) {
  const plot = _plots[idx];
  const stage = stageOf(plot);

  if (stage === "empty") {
    document.querySelectorAll("#garden-seed-picker button[data-seed]").forEach(btn => {
      btn.addEventListener("click", () => {
        const seed = btn.getAttribute("data-seed");
        plantSeed(idx, seed);
      });
    });
  } else if (stage === "mature") {
    const btn = document.getElementById("garden-harvest-btn");
    if (btn) btn.addEventListener("click", () => harvestPlot(idx));
  }

  // Track when the modal closes so the prompt logic can re-engage.
  const closeBtn = document.getElementById("minigame-close");
  if (closeBtn) {
    const onClose = () => { _modalOpen = false; closeBtn.removeEventListener("click", onClose); };
    closeBtn.addEventListener("click", onClose);
  }
}

function plantSeed(idx, seedKey) {
  if (!SEED_TYPES[seedKey]) return;
  if (!spendXP(SEED_COST)) {
    showToast("Not enough XP to plant a seed.");
    return;
  }
  const plot = _plots[idx];
  plot.type = seedKey;
  plot.plantedAt = Date.now();
  applyStageVisual(plot);
  saveState();
  showToast(`${SEED_TYPES[seedKey].emoji} ${SEED_TYPES[seedKey].name} seed planted!`);
  renderPlotModal(idx);
}

function harvestPlot(idx) {
  const plot = _plots[idx];
  if (stageOf(plot) !== "mature") return;
  const seed = SEED_TYPES[plot.type] || SEED_TYPES.faith;
  addXP(HARVEST_XP);
  const total = bumpHarvestCount();
  let extra = "";
  if (total % HARVEST_MEMBER_EVERY === 0) {
    addMember(1);
    extra = " A new soul joins the church!";
  }
  plot.type = null;
  plot.plantedAt = null;
  applyStageVisual(plot);
  saveState();
  showToast(`${seed.emoji} Harvested ${seed.name}! +${HARVEST_XP} XP.${extra}`);
  renderPlotModal(idx);
}

// ---- Interaction entry point ---------------------------------------
function tryInteract() {
  if (_modalOpen) return;
  if (window.__nearNPC) return;
  if (document.getElementById("dialogue-box")?.style.display === "block") return;
  if (document.getElementById("minigame-modal")?.style.display === "flex") return;
  const idx = nearestPlotIndex();
  if (idx === -1) return;
  renderPlotModal(idx);
}

// ---- Public API ----------------------------------------------------
export function initGarden(scene, player /*, zones */) {
  _scene = scene;
  _player = player;

  // Build scenery + 6 plots
  scene.add(buildScenery());

  const savedPlots = loadState();
  for (let i = 0; i < PLOT_COUNT; i++) {
    const pos = plotPosition(i);
    const { group, parts } = buildPlotVisual();
    group.position.copy(pos);
    scene.add(group);
    const saved = savedPlots[i] || {};
    const plot = {
      pos,
      group,
      parts,
      type: saved.type || null,
      plantedAt: typeof saved.plantedAt === "number" ? saved.plantedAt : null,
    };
    applyStageVisual(plot);
    _plots.push(plot);
  }

  ensurePrompt();

  // Keyboard interact (desktop)
  window.addEventListener("keydown", e => {
    if (e.code !== "KeyE") return;
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    if (nearestPlotIndex() !== -1) tryInteract();
  });

  // Mobile interact button — only consume the tap when we're at a plot
  // so the other modules (NPC dialogue, fountain, etc.) still get their
  // chance.
  const btn = document.getElementById("btn-interact");
  if (btn) {
    btn.addEventListener("click", () => {
      if (window.__nearNPC) return;
      if (nearestPlotIndex() !== -1) tryInteract();
    });
  }

  // Detect modal close (✕ button or backdrop) to clear our open flag.
  const closeBtn = document.getElementById("minigame-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => { _modalOpen = false; });
  }
}

// Per-frame: refresh visuals when stages change, update the proximity prompt.
let _lastStageCheck = 0;
export function updateGarden(/* delta */) {
  if (!_player || _plots.length === 0) return;

  const now = performance.now();
  // Re-check stages a few times a second — way cheaper than every frame
  // and plants only change stage every 30s+.
  if (now - _lastStageCheck > 500) {
    _lastStageCheck = now;
    for (const plot of _plots) applyStageVisual(plot);
  }

  const prompt = ensurePrompt();
  if (_modalOpen || window.__nearNPC) { prompt.style.display = "none"; return; }
  const idx = nearestPlotIndex();
  if (idx === -1) { prompt.style.display = "none"; return; }

  const plot = _plots[idx];
  const stage = stageOf(plot);
  if (stage === "empty")        prompt.textContent = "🌱 Press E to plant a seed";
  else if (stage === "mature")  prompt.textContent = "🌾 Press E to harvest";
  else                          prompt.textContent = "🌿 Press E to tend the plant";
  prompt.style.display = "block";
}

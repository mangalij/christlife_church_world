import * as THREE from "three";
import { openMinigameModal } from "./ui.js";
import { addXP } from "./growth.js";
import { addFace } from "./face.js";

// Tracks newly converted believers and lets the player baptize them at the
// pool behind the sanctuary. State lives in localStorage so it survives a
// reload alongside the rest of the church-growth save data.
//
// localStorage keys:
//   clw_unbaptized_names  — JSON array of names waiting to be baptized
//   clw_baptized_count    — total baptisms performed (cumulative)

const KEY_NAMES = "clw_unbaptized_names";
const KEY_COUNT = "clw_baptized_count";
const PROMPT_RADIUS = 3.0;

let _pool   = null;
let _player = null;
let _scene  = null;
let _elapsed = 0;
let _shimmerBase = 0.18;
let _inFlow = false;

// Active cutscene state (one at a time).
let _cutscene = null;

function readQueue() {
  try { return JSON.parse(localStorage.getItem(KEY_NAMES) || "[]"); }
  catch { return []; }
}
function writeQueue(arr) {
  localStorage.setItem(KEY_NAMES, JSON.stringify(arr));
}

// Called by witnessing.js when a visitor prays the sinner's prayer.
export function notifyConverted(name) {
  const q = readQueue();
  q.push(name || "A new believer");
  writeQueue(q);
}

export function getBaptizedCount() {
  return parseInt(localStorage.getItem(KEY_COUNT) || "0", 10);
}

export function initBaptism(scene, player, zones) {
  if (!zones?.baptismPool) return;
  _pool = zones.baptismPool;
  _player = player;
  _scene = scene;
  window.addEventListener("keydown", e => {
    if (e.code !== "KeyE") return;
    if (window.__nearNPC) return;       // NPC dialogue takes priority
    if (_inFlow) return;
    if (!atPool()) return;
    openBaptismFlow();
  });
}

function atPool() {
  if (!_pool || !_player) return false;
  const a = _player.group.position, b = _pool.center;
  const dx = a.x - b.x, dz = a.z - b.z;
  return dx * dx + dz * dz < PROMPT_RADIUS * PROMPT_RADIUS;
}

function openBaptismFlow() {
  const queue = readQueue();
  _inFlow = true;

  if (queue.length === 0) {
    openMinigameModal(`
      <h2 style="color:#FFD700;font-family:'Fredoka One',cursive;text-align:center;">
        💧 Baptismal Pool</h2>
      <p style="color:#ccc;margin:14px 0;font-size:14px;line-height:1.6;text-align:center;">
        The water is still. There's no one waiting to be baptized right now.</p>
      <p style="color:#888;font-size:13px;margin-bottom:14px;text-align:center;font-style:italic;">
        "Therefore go and make disciples of all nations, baptizing them…"<br>— Matthew 28:19</p>
      <p style="color:#aaa;font-size:13px;margin-bottom:18px;text-align:center;">
        Share the Gospel with visitors in the courtyard. Anyone who prays the
        sinner's prayer will be waiting here next time.</p>
      <button id="bp-close" style="width:100%;padding:12px;background:#7C3AED;color:#fff;
        border:none;border-radius:8px;font-size:14px;cursor:pointer;font-weight:bold;">
        Amen</button>`);
    document.getElementById("bp-close").addEventListener("click", closeFlow);
    return;
  }

  renderCandidateList(queue);
}

function renderCandidateList(queue) {
  const items = queue.map((name, i) => `
    <li style="display:flex;justify-content:space-between;align-items:center;
        padding:10px 12px;margin-bottom:6px;background:#1a0a2e;border:1px solid #553388;
        border-radius:8px;">
      <span style="color:#fff;">✨ ${escapeHtml(name)}</span>
      <button data-i="${i}" class="bp-pick" style="padding:6px 12px;background:#7C3AED;
        color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;">
        Baptize</button>
    </li>`).join("");

  openMinigameModal(`
    <h2 style="color:#FFD700;font-family:'Fredoka One',cursive;text-align:center;">
      💧 Baptismal Pool</h2>
    <p style="color:#ccc;margin:8px 0 14px;font-size:13px;text-align:center;">
      ${queue.length} ${queue.length === 1 ? "new believer is" : "new believers are"} waiting
      to publicly profess their faith.</p>
    <ul style="list-style:none;padding:0;margin:0 0 12px;max-height:240px;overflow-y:auto;">
      ${items}
    </ul>
    <button id="bp-cancel" style="width:100%;padding:10px;background:#2a1a2a;color:#aaa;
      border:1px solid #555;border-radius:8px;font-size:13px;cursor:pointer;">
      Maybe Later</button>`);
  document.querySelectorAll(".bp-pick").forEach(btn => {
    btn.addEventListener("click", () => beginBaptism(parseInt(btn.dataset.i, 10)));
  });
  document.getElementById("bp-cancel").addEventListener("click", closeFlow);
}

function beginBaptism(idx) {
  const queue = readQueue();
  if (idx < 0 || idx >= queue.length) { closeFlow(); return; }
  const name = queue[idx];

  // Close the menu modal and play the 3D dunking cutscene in-world. The
  // success modal opens when the cutscene finishes.
  document.getElementById("minigame-modal").style.display = "none";
  startBaptismCutscene(name, () => finishBaptism(name, idx));
}

// ---- 3D dunking cutscene ----
// Builds two simple humanoid figures (pastor + candidate) at the pool,
// walks the candidate down the steps, lays the pastor's hand on their head,
// dips them backward into the water with a splash, then raises them with
// arms lifted. Runs entirely off requestAnimationFrame; updateBaptism()
// drives the per-frame tick so we share the existing animation loop.
function startBaptismCutscene(name, onDone) {
  if (!_scene || !_pool) { onDone?.(); return; }
  // If somehow another cutscene is still up, tear it down first.
  if (_cutscene) disposeCutscene();

  const center = _pool.center;            // pool basin center
  const water  = _pool.water;
  const waterY = water ? water.position.y : 0.18;

  // Floating overlay text (top-of-screen banner) while the cutscene runs.
  const banner = document.createElement("div");
  banner.style.cssText = [
    "position:fixed", "top:14px", "left:50%", "transform:translateX(-50%)",
    "background:rgba(10,10,30,0.85)", "color:#FFD700",
    "padding:10px 22px", "border-radius:10px",
    "font-family:'Fredoka One',cursive", "font-size:18px",
    "z-index:9000", "box-shadow:0 4px 16px rgba(0,0,0,0.55)",
    "border:2px solid #FFD700", "pointer-events:none", "text-align:center",
  ].join(";");
  banner.textContent = `💧 Baptizing ${name}…`;
  document.body.appendChild(banner);

  const pastor    = buildFigure({ shirt: 0x2E4057, pants: 0x1a0a2e, skin: 0xFFCBA4 });
  const candidate = buildFigure({ shirt: 0xE2F0FF, pants: 0xB8D0F0, skin: 0xFFCBA4 });

  // Pastor stands at the north end of the pool, facing south.
  pastor.group.position.set(center.x - 0.6, waterY - 0.25, center.z - 0.4);
  pastor.group.rotation.y = 0;            // local forward is -Z; face -Z = north. We want south.
  pastor.group.rotation.y = Math.PI;      // face south (toward the candidate / steps)

  // Candidate starts on the top step south of the pool, facing the pastor (north).
  candidate.group.position.set(center.x, 0, center.z + 3.1);
  candidate.group.rotation.y = 0;         // already facing -Z (north)

  _scene.add(pastor.group);
  _scene.add(candidate.group);

  // Splash sprites pool (a few small spheres we reuse).
  const splash = [];
  const splashMat = new THREE.MeshBasicMaterial({
    color: 0xCFE9FB, transparent: true, opacity: 0.85,
  });
  for (let i = 0; i < 14; i++) {
    const drop = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), splashMat.clone());
    drop.visible = false;
    _scene.add(drop);
    splash.push({ mesh: drop, vx: 0, vy: 0, vz: 0, life: 0 });
  }

  // Brighten the water for the duration of the cutscene.
  _shimmerBase = 0.42;

  _cutscene = {
    name, onDone,
    pastor, candidate, splash, banner,
    waterY, center,
    t: 0,
    phase: 0,
    finished: false,
  };
}

function buildFigure({ shirt, pants, skin }) {
  const group = new THREE.Group();
  const mat = c => new THREE.MeshToonMaterial({ color: c });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.95, 0.45), mat(shirt));
  torso.position.y = 1.15;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.55), mat(skin));
  head.position.y = 1.95;
  addFace(head, { skin });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.85, 0.38), mat(pants));
  legL.position.set(-0.2, 0.42, 0);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.85, 0.38), mat(pants));
  legR.position.set(0.2, 0.42, 0);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.8, 0.36), mat(shirt));
  armL.position.set(-0.55, 1.15, 0);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.8, 0.36), mat(shirt));
  armR.position.set(0.55, 1.15, 0);
  [torso, head, legL, legR, armL, armR].forEach(m => { m.castShadow = true; group.add(m); });
  // Lay rotation pivots at the shoulders so we can swing the arms up/down.
  // (Default cube origin is its center, fine for our short clip.)
  return { group, torso, head, legL, legR, armL, armR };
}

function spawnSplash(cutscene) {
  const cx = cutscene.center.x, cz = cutscene.center.z;
  const y = cutscene.waterY;
  for (const s of cutscene.splash) {
    s.mesh.visible = true;
    s.mesh.material.opacity = 0.9;
    s.mesh.position.set(
      cx + (Math.random() - 0.5) * 0.8,
      y + 0.05,
      cz + (Math.random() - 0.5) * 0.8,
    );
    s.vx = (Math.random() - 0.5) * 2.2;
    s.vy = 2.6 + Math.random() * 1.4;
    s.vz = (Math.random() - 0.5) * 2.2;
    s.life = 0.8 + Math.random() * 0.4;
  }
}

function tickCutscene(delta) {
  const c = _cutscene;
  if (!c || c.finished) return;
  c.t += delta;
  const { pastor, candidate, waterY, center } = c;

  // ---- Phase timeline ----
  //  0.0 - 1.6s : candidate walks down the steps to the pastor's side
  //  1.6 - 2.2s : pastor raises hand to candidate's head
  //  2.2 - 3.4s : pastor dips candidate backward into the water (+ splash)
  //  3.4 - 4.6s : pastor raises candidate, candidate lifts arms in praise
  //  4.6 - 5.4s : pastor lowers arms, finish
  const WALK_END   = 1.6;
  const RAISE_END  = 2.2;
  const DIP_END    = 3.4;
  const LIFT_END   = 4.6;
  const HOLD_END   = 5.4;

  // Helper for smooth ramps.
  const smooth = (a, b, t) => {
    const u = Math.max(0, Math.min(1, (t - a) / (b - a)));
    return u * u * (3 - 2 * u);
  };

  // Pastor position is fixed; arms rest pose plus animated raise.
  const t = c.t;

  // Candidate walk: from steps (z = center.z + 3.1, y = 0) to next to pastor
  // (z = center.z + 0.4, y = waterY - 0.25).
  if (t < WALK_END) {
    const u = smooth(0, WALK_END, t);
    candidate.group.position.set(
      center.x + 0.6 * u,                            // shift slightly so they end up beside the pastor
      (1 - u) * 0 + u * (waterY - 0.25),
      (1 - u) * (center.z + 3.1) + u * (center.z + 0.4),
    );
    // Subtle walk bob
    candidate.legL.rotation.x = Math.sin(t * 9) * 0.4;
    candidate.legR.rotation.x = Math.sin(t * 9 + Math.PI) * 0.4;
  } else {
    candidate.legL.rotation.x = 0;
    candidate.legR.rotation.x = 0;
    candidate.group.position.set(center.x + 0.6, waterY - 0.25, center.z + 0.4);
  }

  // Pastor faces the candidate the whole time. Raise the near arm during
  // the RAISE phase (hand on head).
  if (t >= WALK_END && t < DIP_END) {
    const u = smooth(WALK_END, RAISE_END, t);
    pastor.armR.rotation.x = -u * 1.2;       // swing forward
    pastor.armL.rotation.x = -u * 0.6;
  }

  // Dip: rotate the candidate backward around their feet, sink head under water.
  if (t >= RAISE_END && t < DIP_END) {
    const u = smooth(RAISE_END, DIP_END, t);
    // Tip backward (rotation about local X). The candidate's group origin
    // is at the feet, so this naturally pivots from the steps.
    candidate.group.rotation.x = -u * (Math.PI / 2 - 0.05);
    // Slight downward sink so the head clearly clears the water plane.
    candidate.group.position.y = (waterY - 0.25) - u * 0.55;
    // Candidate's arms cross over the chest (a common baptism pose).
    candidate.armL.rotation.z =  u * 1.2;
    candidate.armR.rotation.z = -u * 1.2;
    // Splash at the moment the head goes under.
    if (!c._splashed && u > 0.75) {
      c._splashed = true;
      spawnSplash(c);
    }
  }

  // Lift: rotate the candidate back upright, hands raised in praise.
  if (t >= DIP_END && t < LIFT_END) {
    const u = smooth(DIP_END, LIFT_END, t);
    candidate.group.rotation.x = -(1 - u) * (Math.PI / 2 - 0.05);
    candidate.group.position.y = (waterY - 0.25) - (1 - u) * 0.55;
    // Pastor begins to release the arm
    pastor.armR.rotation.x = -(1 - u) * 0.6 - 0.6;
    // Candidate raises both arms overhead (rotation backward around X).
    candidate.armL.rotation.x = -u * 1.7;
    candidate.armR.rotation.x = -u * 1.7;
    candidate.armL.rotation.z = (1 - u) * 1.2;
    candidate.armR.rotation.z = -(1 - u) * 1.2;
  }

  // Hold: both stand tall briefly, then end.
  if (t >= LIFT_END) {
    const u = smooth(LIFT_END, HOLD_END, t);
    pastor.armR.rotation.x = -1.2 * (1 - u);
    pastor.armL.rotation.x = -0.6 * (1 - u);
    if (t >= HOLD_END) {
      c.finished = true;
      const onDone = c.onDone;
      // Brief delay before opening the success modal so the player can
      // breathe in the moment.
      setTimeout(() => {
        disposeCutscene();
        onDone?.();
      }, 350);
    }
  }

  // ---- Splash droplet physics ----
  for (const s of c.splash) {
    if (s.life <= 0) { s.mesh.visible = false; continue; }
    s.life -= delta;
    s.vy -= 9.8 * delta;
    s.mesh.position.x += s.vx * delta;
    s.mesh.position.y += s.vy * delta;
    s.mesh.position.z += s.vz * delta;
    s.mesh.material.opacity = Math.max(0, s.life * 1.1);
    if (s.mesh.position.y < waterY) {
      s.life = 0;
      s.mesh.visible = false;
    }
  }
}

function disposeCutscene() {
  const c = _cutscene;
  _cutscene = null;
  _shimmerBase = 0.18;
  if (!c) return;
  if (c.banner) c.banner.remove();
  if (_scene) {
    [c.pastor.group, c.candidate.group].forEach(g => _scene.remove(g));
    for (const s of c.splash) _scene.remove(s.mesh);
  }
}

function finishBaptism(name, idx) {
  // Remove from queue, bump count, award XP.
  const queue = readQueue();
  queue.splice(idx, 1);
  writeQueue(queue);
  const total = getBaptizedCount() + 1;
  localStorage.setItem(KEY_COUNT, String(total));
  addXP(40);
  _shimmerBase = 0.45;     // brighten the water briefly
  setTimeout(() => { _shimmerBase = 0.18; }, 2500);

  // Milestone toasts
  let milestone = "";
  if (total === 1)  milestone = "🎉 Your first baptism!";
  if (total === 10) milestone = "🌟 10 souls baptized — Heaven celebrates!";
  if (total === 25) milestone = "🔥 25 baptisms — a revival is rising!";

  openMinigameModal(`
    <div style="text-align:center;padding:8px;">
      <div style="font-size:54px;">🎉</div>
      <h2 style="color:#FFD700;font-family:'Fredoka One',cursive;margin:8px 0 6px;">
        ${escapeHtml(name)} has been baptized!</h2>
      <p style="color:#ccc;font-size:14px;margin:6px 0 12px;">+40 XP</p>
      <div style="background:#1a0a2e;padding:14px;border-left:3px solid #FFD700;
        color:#e0d4f7;font-style:italic;text-align:center;margin:0 0 14px;">
        "There will be more rejoicing in heaven over one sinner who repents…"<br>— Luke 15:7</div>
      <p style="color:#aaa;font-size:13px;margin:0 0 12px;">
        Total baptisms: <strong style="color:#FFD700;">${total}</strong>
        · Waiting: <strong style="color:#FFD700;">${queue.length}</strong></p>
      ${milestone ? `<p style="color:#FFD700;font-size:14px;margin:0 0 14px;font-weight:bold;">${milestone}</p>` : ""}
      <div style="display:flex;gap:10px;">
        ${queue.length > 0
          ? `<button id="bp-next" style="flex:1;padding:12px;background:#7C3AED;color:#fff;
              border:none;border-radius:8px;font-size:14px;cursor:pointer;font-weight:bold;">
              Baptize Next</button>` : ""}
        <button id="bp-done" style="${queue.length > 0 ? "padding:12px 18px;" : "flex:1;padding:12px;"}
          background:#2a1a2a;color:#aaa;border:1px solid #555;border-radius:8px;
          font-size:13px;cursor:pointer;">Amen</button>
      </div>
    </div>`);
  document.getElementById("bp-done").addEventListener("click", closeFlow);
  const nextBtn = document.getElementById("bp-next");
  if (nextBtn) nextBtn.addEventListener("click", () => renderCandidateList(readQueue()));
}

function closeFlow() {
  document.getElementById("minigame-modal").style.display = "none";
  _inFlow = false;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

export function updateBaptism(delta) {
  if (!_pool) return;
  _elapsed += delta;
  // Gentle shimmer animation on the water layers
  const wobble = (Math.sin(_elapsed * 1.8) + 1) * 0.5;       // 0..1
  if (_pool.water)   _pool.water.material.opacity   = 0.50 + wobble * 0.10;
  if (_pool.shimmer) _pool.shimmer.material.opacity = _shimmerBase + wobble * 0.10;
  // Run the active dunking cutscene, if any.
  if (_cutscene) tickCutscene(delta);
  // Suppress unused-var warning if THREE only used transitively above.
  void THREE;
}

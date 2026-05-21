// Visual church progression — at member milestones, the church physically
// grows in the world. Each tier adds non-collider decoration meshes
// layered on top of the existing world.js geometry, so it never breaks
// the underlying gameplay or zone logic.
//
// Tiers:
//   0   — Small chapel (base, what world.js builds)
//   25  — Gold roof trim + larger cross
//   50  — Taller steeple with bell
//   100 — Cathedral side wings (cosmetic)
//   200 — Stained-glass rose window + spire pinnacles
//
// The tier is recomputed every time member count changes; only newly
// unlocked decorations are spawned (idempotent).

import * as THREE from "three";

const TIERS = [25, 50, 100, 200];

let _scene = null;
let _added = new Set();    // tracks which tier numbers we've spawned

function mat(color, opts = {}) {
  return new THREE.MeshToonMaterial({ color, ...opts });
}

function buildTier25() {
  const g = new THREE.Group();
  // Gold roof trim — a thin gold band around the sanctuary roof.
  const trim = new THREE.Mesh(
    new THREE.BoxGeometry(14, 0.25, 18),
    new THREE.MeshStandardMaterial({ color: 0xFFD700, metalness: 0.6, roughness: 0.3 })
  );
  trim.position.set(0, 5.0, -16);
  g.add(trim);

  // Larger cross atop the front
  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.5, 0.3), mat(0xFFFFFF));
  stem.position.set(0, 8.0, -7);
  g.add(stem);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.3, 0.3), mat(0xFFFFFF));
  arm.position.set(0, 8.5, -7);
  g.add(arm);
  return g;
}

function buildTier50() {
  const g = new THREE.Group();
  // Tall steeple rising from the back roof
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(3, 1, 3),
    mat(0xE8DDC4)
  );
  base.position.set(0, 6.0, -24);
  g.add(base);

  const tower = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 4.5, 2.4),
    mat(0xE8DDC4)
  );
  tower.position.set(0, 8.7, -24);
  g.add(tower);

  // Window opening on the tower (dark hole)
  const window = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 1.2, 0.1),
    new THREE.MeshBasicMaterial({ color: 0x1a1030 })
  );
  window.position.set(0, 8.9, -22.8);
  g.add(window);

  // Spire
  const spire = new THREE.Mesh(
    new THREE.ConeGeometry(1.6, 3.2, 6),
    mat(0x5A3010)
  );
  spire.position.set(0, 12.5, -24);
  g.add(spire);

  // Bell (small gold sphere inside the tower opening)
  const bell = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xFFD700, metalness: 0.7, roughness: 0.4 })
  );
  bell.position.set(0, 8.9, -23.5);
  g.add(bell);

  // Cross on top of the spire
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.2, 0.18), mat(0xFFD700));
  top.position.set(0, 14.6, -24);
  g.add(top);
  return g;
}

function buildTier100() {
  const g = new THREE.Group();
  // Two short cathedral wings flanking the sanctuary, cosmetic only
  for (const sign of [-1, 1]) {
    const wing = new THREE.Mesh(
      new THREE.BoxGeometry(5, 4, 10),
      mat(0xE8DDC4)
    );
    wing.position.set(sign * 9.5, 2.0, -16);
    g.add(wing);

    // Sloped roof
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(5.4, 0.4, 10.4),
      mat(0x5A3010)
    );
    roof.position.set(sign * 9.5, 4.2, -16);
    g.add(roof);

    // Small arched window
    const win = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 2, 1.2),
      new THREE.MeshBasicMaterial({ color: 0x4A88FF })
    );
    win.position.set(sign * 12.05, 2.0, -16);
    g.add(win);
  }
  return g;
}

function buildTier200() {
  const g = new THREE.Group();
  // Large stained-glass rose window on the front facade
  const rose = new THREE.Mesh(
    new THREE.CircleGeometry(1.6, 16),
    new THREE.MeshBasicMaterial({ color: 0xC640FF })
  );
  rose.position.set(0, 5.4, -7.05);
  g.add(rose);

  // Surrounding ring
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.6, 0.18, 8, 32),
    new THREE.MeshStandardMaterial({ color: 0xFFD700, metalness: 0.6, roughness: 0.3 })
  );
  ring.position.set(0, 5.4, -7.05);
  g.add(ring);

  // Four spire pinnacles at the corners of the sanctuary roof
  const cornerPos = [
    [-6.5, -7.5], [6.5, -7.5], [-6.5, -24.5], [6.5, -24.5],
  ];
  for (const [x, z] of cornerPos) {
    const p = new THREE.Mesh(
      new THREE.ConeGeometry(0.5, 2.2, 6),
      mat(0x5A3010)
    );
    p.position.set(x, 6.0, z);
    g.add(p);
    const gold = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xFFD700, metalness: 0.7, roughness: 0.3 })
    );
    gold.position.set(x, 7.3, z);
    g.add(gold);
  }
  return g;
}

const BUILDERS = {
  25:  buildTier25,
  50:  buildTier50,
  100: buildTier100,
  200: buildTier200,
};

const TIER_TOAST = {
  25:  "✨ Your church has gold trim and a larger cross!",
  50:  "🔔 A tall steeple with a bell rises above the church!",
  100: "🏛️ Two cathedral wings expand the sanctuary!",
  200: "🌹 A stained-glass rose window crowns your cathedral!",
};

function getMemberCount() {
  return parseInt(localStorage.getItem("clw_members") || "0");
}

function applyProgression(announce) {
  const count = getMemberCount();
  for (const tier of TIERS) {
    if (count >= tier && !_added.has(tier)) {
      const g = BUILDERS[tier]();
      _scene.add(g);
      _added.add(tier);
      if (announce) {
        // Lazy import to avoid circular deps
        import("./ui.js").then(m => m.showToast?.(TIER_TOAST[tier]));
      }
    }
  }
}

export function initProgression(scene) {
  _scene = scene;
  applyProgression(false);
  window.addEventListener("clw-members-changed", () => applyProgression(true));
}

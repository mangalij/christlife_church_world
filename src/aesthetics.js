// ============================================================================
//  AESTHETICS / "BEAUTIFY" — purchasable visual upgrades for the church.
//  Each upgrade has an XP cost, a build() function that adds meshes to the
//  scene, and is persisted in localStorage so it survives reloads.
//
//  Open the panel via the ✨ HUD button (or `B` key) → window.toggleAestheticsPanel().
// ============================================================================
import * as THREE from "three";
import { showToast, openMinigameModal } from "./ui.js";
import { spendXP, getXP } from "./growth.js";
import { addFace } from "./face.js";

let _scene = null;
let _zones = null;
const _owned = new Set();
const STORAGE_KEY = "clw_aesthetics";

// ---------- helpers ----------
function mat(color) { return new THREE.MeshToonMaterial({ color }); }

function box(w, h, d, color, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y + h / 2, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function cyl(rTop, rBot, h, color, x, y, z) {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(rTop, rBot, h, 16),
    mat(color),
  );
  m.position.set(x, y + h / 2, z); m.castShadow = true;
  return m;
}

function loadOwned() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) arr.forEach(id => _owned.add(id));
  } catch { /* ignore */ }
}

function saveOwned() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([..._owned]));
}

// ---------- builders ----------
function buildSteeple() {
  // Sits on top of the sanctuary roof (roof slab is at y≈6, centered at z=-16).
  const g = new THREE.Group();
  // White base block
  g.add(box(4, 1.2, 4, 0xFFFFFF, 0, 0, 0));
  // Tapered tower
  g.add(cyl(0.9, 1.6, 5, 0xFFFFFF, 0, 1.2, 0));
  // Pointed white spire
  const spire = new THREE.Mesh(
    new THREE.ConeGeometry(0.9, 3, 8),
    mat(0xF5F5F5),
  );
  spire.position.set(0, 7.7, 0); spire.castShadow = true;
  g.add(spire);
  // Gold cross on top
  const cv = box(0.18, 1.6, 0.18, 0xFFD700, 0, 9.4, 0);
  const ch = box(0.9, 0.18, 0.18, 0xFFD700, 0, 10.0, 0);
  g.add(cv, ch);
  // Small louvered window on each tower face
  for (let i = 0; i < 4; i++) {
    const louver = box(1.4, 1.4, 0.1, 0x2A1A40, 0, 2.2, 1.55);
    louver.rotation.y = i * Math.PI / 2;
    louver.position.set(Math.sin(i * Math.PI / 2) * 1.55, 2.2 + 0.7, Math.cos(i * Math.PI / 2) * 1.55);
    g.add(louver);
  }
  // Place the whole group on top of the sanctuary roof
  g.position.set(0, 6.5, -16);
  _scene.add(g);
}

function buildRoseWindow() {
  // Circular stained-glass window on the back wall (z=-31.75, above the cross).
  const g = new THREE.Group();
  // Stone frame (dark)
  const frame = new THREE.Mesh(
    new THREE.TorusGeometry(1.6, 0.18, 8, 24),
    mat(0x2A1A40),
  );
  g.add(frame);
  // Inner disc — colorful stained glass
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1.55, 24),
    new THREE.MeshBasicMaterial({ color: 0x8E44AD, side: THREE.DoubleSide }),
  );
  g.add(disc);
  // Petal segments
  const colors = [0xFFD700, 0xE74C3C, 0x3498DB, 0x27AE60, 0xF39C12, 0x9B59B6, 0xE67E22, 0x1ABC9C];
  colors.forEach((c, i) => {
    const petal = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 16),
      new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }),
    );
    const a = i * Math.PI * 2 / colors.length;
    petal.position.set(Math.cos(a) * 0.85, Math.sin(a) * 0.85, 0.01);
    g.add(petal);
  });
  // Central yellow rosette
  const center = new THREE.Mesh(
    new THREE.CircleGeometry(0.45, 16),
    new THREE.MeshBasicMaterial({ color: 0xFFE066, side: THREE.DoubleSide }),
  );
  center.position.z = 0.02;
  g.add(center);
  // Spoke ribs
  for (let i = 0; i < 8; i++) {
    const rib = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 1.5, 0.05),
      mat(0x2A1A40),
    );
    rib.rotation.z = i * Math.PI / 8;
    rib.position.z = 0.03;
    g.add(rib);
  }
  g.position.set(0, 7.5, -31.75);
  _scene.add(g);
}

function buildModernPulpit() {
  // Hide the old wooden lectern.
  if (_zones.basicPulpit) _zones.basicPulpit.visible = false;
  const g = new THREE.Group();
  // Curved acrylic front (just two slim glass panels for that frosted look)
  const front = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 1.4),
    new THREE.MeshBasicMaterial({ color: 0xB0E0FF, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
  );
  front.position.set(0, 0.7, 0.05);
  g.add(front);
  // Dark wood top
  g.add(box(1.7, 0.12, 0.7, 0x1B1B1B, 0, 1.4, 0));
  // Slanted reading surface
  const slant = box(1.5, 0.06, 0.5, 0x2C2C2C, 0, 1.52, 0);
  slant.rotation.x = -0.25;
  slant.position.y = 1.6;
  g.add(slant);
  // Side metallic supports
  g.add(box(0.08, 1.45, 0.55, 0xCFCFCF, -0.75, 0, 0));
  g.add(box(0.08, 1.45, 0.55, 0xCFCFCF,  0.75, 0, 0));
  // Microphone on a gooseneck
  const stand = box(0.04, 0.35, 0.04, 0x222222, 0.55, 1.66, 0);
  g.add(stand);
  const mic = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 8, 6),
    mat(0x111111),
  );
  mic.position.set(0.55, 2.05, 0.05);
  g.add(mic);
  // Small church logo glow on the front (gold cross)
  g.add(box(0.06, 0.4, 0.02, 0xFFD700, 0, 0.65, 0.08));
  g.add(box(0.22, 0.06, 0.02, 0xFFD700, 0, 0.78, 0.08));
  g.position.set(0, 0, -26.5);
  _scene.add(g);
}

function recolorPews(seatColor, backColor, legColor) {
  const groups = [
    ...(_zones.pewsBasic || []),
    ...(_zones.extraPews || []),
    ...(_zones.upgradedPews || []),
  ];
  groups.forEach(g => {
    // children[0]=seat, [1]=back, [2]=legL, [3]=legR (see makePew in world.js)
    if (g.children[0]) g.children[0].material.color.setHex(seatColor);
    if (g.children[1]) g.children[1].material.color.setHex(backColor);
    if (g.children[2]) g.children[2].material.color.setHex(legColor);
    if (g.children[3]) g.children[3].material.color.setHex(legColor);
  });
}

function buildCushionedPews() {
  // Burgundy seats, dark wood backs, gold-trim legs — and a small cushion strip on top.
  recolorPews(0x7B1E1E, 0x3A1A0A, 0xB8860B);
  const groups = [
    ...(_zones.pewsBasic || []),
    ...(_zones.extraPews || []),
    ...(_zones.upgradedPews || []),
  ];
  groups.forEach(g => {
    if (g.userData.cushioned) return;
    g.userData.cushioned = true;
    // Plush cushion strip on the seat
    const cushion = box(2.9, 0.08, 0.7, 0xA52A2A, 0, 0.78, 0);
    g.add(cushion);
    // Gold trim along the top of the backrest
    const trim = box(3, 0.06, 0.06, 0xFFD700, 0, 1.22, 0.35);
    g.add(trim);
  });
}

function makeMusicianMesh(shirtColor) {
  const g = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.4), mat(shirtColor));
  torso.position.y = 1.2; torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.45), mat(0xFFCBA4));
  head.position.y = 1.95; head.castShadow = true;
  addFace(head, { skin: 0xFFCBA4 });
  // Legs
  const legL = box(0.22, 0.85, 0.22, 0x1B1B3A, -0.15, 0, 0);
  const legR = box(0.22, 0.85, 0.22, 0x1B1B3A,  0.15, 0, 0);
  g.add(torso, head, legL, legR);
  return g;
}

function buildWorshipTeam() {
  // Stage runs from x=-6..6 at z≈-30..-25 (stage slab at z=-28, 12 wide × 6 deep).
  const g = new THREE.Group();

  // ----- Drum kit (back-left of stage) -----
  const drumKit = new THREE.Group();
  const kick = cyl(0.7, 0.7, 0.9, 0xF8F8FF, 0, 0, 0);
  kick.rotation.z = Math.PI / 2;
  drumKit.add(kick);
  const snare = cyl(0.35, 0.35, 0.3, 0xE8E8F0, -0.7, 0.6, 0.2);
  drumKit.add(snare);
  const tomL = cyl(0.3, 0.3, 0.35, 0x101040, 0.4, 0.95, -0.3);
  const tomR = cyl(0.3, 0.3, 0.35, 0x101040, -0.1, 0.95, -0.3);
  drumKit.add(tomL, tomR);
  // Cymbals (thin gold discs)
  const cymL = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.03, 16), mat(0xD4A017));
  cymL.position.set(-0.95, 1.4, -0.4); cymL.rotation.z = 0.2;
  const cymR = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.03, 16), mat(0xD4A017));
  cymR.position.set(0.85, 1.5, -0.5); cymR.rotation.z = -0.15;
  drumKit.add(cymL, cymR);
  // Stick supports
  drumKit.add(box(0.03, 0.95, 0.03, 0x222222, -0.95, 0.45, -0.4));
  drumKit.add(box(0.03, 1.05, 0.03, 0x222222, 0.85, 0.5, -0.5));
  drumKit.position.set(-3.5, 0.55, -29.5);
  g.add(drumKit);

  // ----- Keyboard (back-right of stage) -----
  const kbStand = new THREE.Group();
  const keyboard = box(2.0, 0.18, 0.6, 0x111111, 0, 1, 0);
  const whiteKeys = box(1.85, 0.06, 0.5, 0xF5F5F5, 0, 1.1, 0.05);
  kbStand.add(keyboard, whiteKeys);
  // X-frame stand legs
  kbStand.add(box(0.06, 1.0, 0.06, 0x222222, -0.8, 0, 0));
  kbStand.add(box(0.06, 1.0, 0.06, 0x222222,  0.8, 0, 0));
  kbStand.position.set(3.5, 0, -29.5);
  g.add(kbStand);

  // ----- Electric guitar on stand (front-left) -----
  const guitar = new THREE.Group();
  // Stand
  guitar.add(box(0.05, 1.0, 0.05, 0x222222, 0, 0, 0));
  guitar.add(box(0.5, 0.05, 0.05, 0x222222, 0, 0, 0));
  // Body (red)
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.1), mat(0xCC0000));
  body.position.set(0, 0.4, 0.05);
  guitar.add(body);
  // Neck
  const neck = box(0.1, 1.1, 0.07, 0x4A2C0A, 0, 0.85, 0.05);
  guitar.add(neck);
  // Headstock
  guitar.add(box(0.18, 0.22, 0.07, 0x222222, 0, 2.05, 0.05));
  guitar.position.set(-2, 0.05, -26.5);
  guitar.rotation.y = -0.3;
  g.add(guitar);

  // ----- Bass amp next to the guitar -----
  const amp = box(1.0, 1.1, 0.8, 0x1A1A1A, -1.0, 0, -26.5);
  g.add(amp);
  // Grille mesh
  const grille = box(0.85, 0.6, 0.05, 0x444444, -1.0, 0.25, -26.07);
  g.add(grille);
  // Amp logo
  g.add(box(0.3, 0.08, 0.02, 0xFFD700, -1.0, 0.9, -26.05));

  // ----- Three mic stands across the front of the stage -----
  [-1.2, 0.5, 2.2].forEach(x => {
    const stand = new THREE.Group();
    stand.add(box(0.05, 1.6, 0.05, 0x222222, 0, 0, 0));
    stand.add(box(0.3, 0.04, 0.3, 0x222222, 0, -0.05, 0));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), mat(0x111111));
    head.position.set(0, 1.65, 0);
    stand.add(head);
    stand.position.set(x, 0.05, -25);
    g.add(stand);
  });

  // ----- Worship band members -----
  // Drummer (behind the kit, sitting low)
  const drummer = makeMusicianMesh(0x6A0DAD);
  drummer.position.set(-3.5, 0.05, -30.5);
  drummer.scale.y = 0.85;
  g.add(drummer);
  // Keyboardist
  const keyist = makeMusicianMesh(0x4ECDC4);
  keyist.position.set(3.5, 0.05, -30.3);
  g.add(keyist);
  // Guitarist
  const guitarist = makeMusicianMesh(0xE74C3C);
  guitarist.position.set(-1.5, 0.05, -25.8);
  g.add(guitarist);
  // Lead vocalist (center)
  const vocalist = makeMusicianMesh(0xFFD700);
  vocalist.position.set(0.5, 0.05, -25.8);
  g.add(vocalist);

  _scene.add(g);
}

function buildCoffeeBar() {
  // Sits along the west wall of the fellowship hall (hall center ~ (-32, 0, -10),
  // 22 wide × 20 deep). We place the bar near the back wall at z=-18.
  const g = new THREE.Group();
  // Main counter (dark wood + chrome top)
  const counter = box(8, 1.1, 1.2, 0x3D2417, 0, 0, 0);
  g.add(counter);
  const counterTop = box(8, 0.08, 1.3, 0xD4D4D4, 0, 1.1, 0);
  g.add(counterTop);
  // Decorative wood front panel with stripe
  g.add(box(8, 0.15, 0.06, 0xB8860B, 0, 0.3, 0.62));
  // Espresso machine (chrome with portafilters)
  const machine = box(1.6, 0.7, 0.6, 0xC0C0C0, -2.2, 1.18, -0.1);
  g.add(machine);
  // Two group heads (portafilters)
  g.add(cyl(0.08, 0.08, 0.18, 0x333333, -2.5, 1.05, 0.2));
  g.add(cyl(0.08, 0.08, 0.18, 0x333333, -1.9, 1.05, 0.2));
  // Steam wand
  g.add(box(0.04, 0.4, 0.04, 0xAAAAAA, -1.4, 1.2, 0));
  // Bean grinder
  const grinder = cyl(0.18, 0.22, 0.55, 0x222222, -0.6, 1.18, -0.1);
  g.add(grinder);
  g.add(cyl(0.16, 0.16, 0.18, 0x111111, -0.6, 1.73, -0.1));

  // Pastry display case (glass with colorful pastries inside)
  const caseFrame = box(2, 0.9, 0.8, 0x111111, 1.7, 1.18, 0);
  g.add(caseFrame);
  const glassFront = new THREE.Mesh(
    new THREE.PlaneGeometry(1.95, 0.85),
    new THREE.MeshBasicMaterial({ color: 0xBFE6FF, transparent: true, opacity: 0.4, side: THREE.DoubleSide }),
  );
  glassFront.position.set(1.7, 1.62, 0.41);
  g.add(glassFront);
  // Pastries on shelves
  [[1.1, 0xE8B978], [1.7, 0xD2691E], [2.3, 0xF5DEB3]].forEach(([x, c]) => {
    g.add(box(0.35, 0.18, 0.35, c, x, 1.18, 0.05));
  });
  [[1.2, 0xFF6B6B], [2.1, 0xFFB6C1]].forEach(([x, c]) => {
    g.add(cyl(0.18, 0.18, 0.16, c, x, 1.5, 0.05));
  });

  // Menu chalkboard on the wall behind the bar
  const board = box(3.5, 1.8, 0.08, 0x1B1B1B, 0, 2.2, -0.6);
  g.add(board);
  // Chalk title (yellow strip)
  g.add(box(2.5, 0.12, 0.02, 0xFFD700, 0, 3.4, -0.55));
  // Menu items as small chalk strips
  for (let i = 0; i < 4; i++) {
    g.add(box(2.4, 0.05, 0.02, 0xFFFFFF, 0, 3.05 - i * 0.32, -0.55));
  }

  // A couple of takeaway cups on the counter
  [[-3.3, 0xFFFFFF], [-3.0, 0x8B4513]].forEach(([x, c]) => {
    g.add(cyl(0.1, 0.12, 0.28, c, x, 1.18, 0.3));
  });
  // Tip jar
  const jar = cyl(0.13, 0.13, 0.32, 0xCFE9FF, 3.4, 1.18, 0.3);
  g.add(jar);

  // Hanging pendant lights above the bar
  for (let i = -2; i <= 2; i += 2) {
    g.add(box(0.04, 1.0, 0.04, 0x222222, i * 1.2, 3.7, 0));
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xFFD27F }),
    );
    bulb.position.set(i * 1.2, 3.65, 0);
    g.add(bulb);
  }

  g.position.set(-32, 0.05, -18.5);
  _scene.add(g);
}

function buildStageLights() {
  // Spotlights mounted on a truss above the stage.
  const g = new THREE.Group();
  // Horizontal truss bar
  const truss = box(12, 0.2, 0.2, 0x222222, 0, 5.5, -28);
  g.add(truss);
  // Vertical supports at the ends
  g.add(box(0.2, 5.5, 0.2, 0x222222, -6, 0, -28));
  g.add(box(0.2, 5.5, 0.2, 0x222222,  6, 0, -28));
  // Cone spotlights at intervals
  const colors = [0xFF3366, 0x33CCFF, 0xFFD700, 0x33FF99, 0xBB66FF];
  colors.forEach((c, i) => {
    const x = -4 + i * 2;
    // Light housing
    const housing = box(0.4, 0.4, 0.4, 0x111111, x, 5.0, -28);
    g.add(housing);
    // Colored cone of light pointing down toward the stage
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(1.1, 4.5, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.18, side: THREE.DoubleSide }),
    );
    cone.position.set(x, 2.5, -28);
    g.add(cone);
    // Add a real point light too (cheap — 5 small ones)
    const pl = new THREE.PointLight(c, 0.6, 8);
    pl.position.set(x, 4.5, -28);
    g.add(pl);
  });
  _scene.add(g);
}

// ===========================================================================
//  DELUXE TIER builders — unlock after all 7 initial upgrades are installed.
// ===========================================================================

function buildSideStainedGlass() {
  // Four tall narrow stained-glass panels — two on each side wall of the
  // sanctuary, evenly spaced down its length. The sanctuary roughly runs
  // x = -10..10 along the side walls between z = -8 and z = -28.
  const g = new THREE.Group();
  const PALETTES = [
    [0xE74C3C, 0xF1C40F, 0x2980B9, 0x27AE60], // warm
    [0x9B59B6, 0x3498DB, 0xE67E22, 0x1ABC9C], // jewel
    [0xC0392B, 0xF39C12, 0x16A085, 0x8E44AD], // bold
    [0x2980B9, 0x27AE60, 0xF1C40F, 0xE74C3C], // primary
  ];
  const positions = [
    { x: -9.85, z: -12, rotY:  Math.PI / 2, palette: 0 }, // west wall, front
    { x: -9.85, z: -22, rotY:  Math.PI / 2, palette: 1 }, // west wall, back
    { x:  9.85, z: -12, rotY: -Math.PI / 2, palette: 2 }, // east wall, front
    { x:  9.85, z: -22, rotY: -Math.PI / 2, palette: 3 }, // east wall, back
  ];
  positions.forEach(p => {
    const panel = new THREE.Group();
    // Dark stone arched frame
    panel.add(box(1.8, 3.6, 0.18, 0x2A1A40, 0, 1.8, 0));
    // Four colored glass quadrants stacked vertically
    PALETTES[p.palette].forEach((c, i) => {
      const quad = new THREE.Mesh(
        new THREE.PlaneGeometry(1.5, 0.75),
        new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }),
      );
      quad.position.set(0, 0.6 + i * 0.78, 0.1);
      panel.add(quad);
    });
    // Arch cap (semi-circle of colored glass)
    const arch = new THREE.Mesh(
      new THREE.CircleGeometry(0.75, 16, 0, Math.PI),
      new THREE.MeshBasicMaterial({ color: 0xFFE066, side: THREE.DoubleSide }),
    );
    arch.position.set(0, 3.7, 0.1);
    panel.add(arch);
    // Lead-came cross divider
    panel.add(box(0.06, 3.0, 0.05, 0x111111, 0, 1.9, 0.12));
    panel.add(box(1.5, 0.06, 0.05, 0x111111, 0, 1.9, 0.12));
    panel.position.set(p.x, 0, p.z);
    panel.rotation.y = p.rotY;
    g.add(panel);
  });
  _scene.add(g);
}

function buildChandelier() {
  // Gold chandelier suspended over the centre of the sanctuary aisle.
  const g = new THREE.Group();
  // Chain from ceiling
  for (let i = 0; i < 6; i++) {
    g.add(box(0.06, 0.18, 0.06, 0xB8860B, 0, 7.4 - i * 0.22, 0));
  }
  // Central hub
  g.add(cyl(0.18, 0.28, 0.4, 0xFFD700, 0, 5.8, 0));
  // Two tiers of arms with bulbs
  const tiers = [
    { y: 5.9, r: 1.4, count: 8 },
    { y: 5.4, r: 0.9, count: 6 },
  ];
  tiers.forEach(t => {
    // Decorative gold ring
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(t.r, 0.05, 6, 24),
      mat(0xFFD700),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, t.y, 0);
    g.add(ring);
    // Arms + candle bulbs around the ring
    for (let i = 0; i < t.count; i++) {
      const a = (i / t.count) * Math.PI * 2;
      const bx = Math.cos(a) * t.r;
      const bz = Math.sin(a) * t.r;
      // Arm dangling outward + up
      g.add(box(0.05, 0.05, 0.05, 0xFFD700, bx, t.y, bz));
      // Candle bulb
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xFFE7A0 }),
      );
      bulb.position.set(bx, t.y + 0.18, bz);
      g.add(bulb);
      // Tiny "flame" cone for warmth
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.07, 0.2, 6),
        new THREE.MeshBasicMaterial({ color: 0xFFC04D }),
      );
      flame.position.set(bx, t.y + 0.4, bz);
      g.add(flame);
    }
  });
  // Crystal teardrops hanging from the bottom ring
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const cx = Math.cos(a) * 0.85;
    const cz = Math.sin(a) * 0.85;
    const drop = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.12),
      new THREE.MeshBasicMaterial({ color: 0xE0F4FF, transparent: true, opacity: 0.8 }),
    );
    drop.position.set(cx, 5.0, cz);
    g.add(drop);
  }
  // Warm point light so it actually lights the room
  const pl = new THREE.PointLight(0xFFE7A0, 1.1, 14);
  pl.position.set(0, 5.6, 0);
  g.add(pl);
  // Hang over the centre aisle, a bit forward of the cross
  g.position.set(0, 0, -16);
  _scene.add(g);
}

function buildMarbleFloors() {
  // Lay a glossy white-veined "marble" slab over the sanctuary floor
  // (slightly above so it doesn't z-fight with the original wood).
  // Sanctuary occupies roughly x = -10..10, z = -4..-30.
  const g = new THREE.Group();
  // Base marble slab
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0xF5F2EE, roughness: 0.25, metalness: 0.1,
  });
  const base = new THREE.Mesh(new THREE.PlaneGeometry(20, 28), baseMat);
  base.rotation.x = -Math.PI / 2;
  base.position.set(0, 0.04, -17);
  base.receiveShadow = true;
  g.add(base);
  // Subtle gold-vein streaks (long thin boxes laid flat)
  const veinMat = new THREE.MeshStandardMaterial({
    color: 0xC9A86A, roughness: 0.4, metalness: 0.6,
  });
  for (let i = 0; i < 14; i++) {
    const vein = new THREE.Mesh(
      new THREE.BoxGeometry(0.04 + Math.random() * 0.06, 0.005, 2 + Math.random() * 4),
      veinMat,
    );
    vein.position.set(-9 + Math.random() * 18, 0.045, -5 - Math.random() * 24);
    vein.rotation.y = Math.random() * Math.PI;
    g.add(vein);
  }
  // Decorative inlaid gold cross at the front of the sanctuary
  const cv = box(0.4, 0.01, 2.4, 0xD4AF37, 0, 0.045, -25);
  const ch = box(1.4, 0.01, 0.4, 0xD4AF37, 0, 0.045, -25.6);
  g.add(cv, ch);
  // Ornate inlay border around the perimeter
  [[20, -3], [20, -31], [-10, -17], [10, -17]].forEach(([w, z], i) => {
    const isEnd = i < 2;
    const trim = box(isEnd ? w : 0.15, 0.01, isEnd ? 0.15 : 28, 0xD4AF37,
      isEnd ? 0 : z, 0.045, isEnd ? z : -17);
    g.add(trim);
  });
  _scene.add(g);
}

function buildLiturgicalBanners() {
  // Six tall fabric banners in liturgical colours hanging along the
  // sanctuary side walls. Colour cycle = purple (Advent/Lent), red
  // (Pentecost), green (Ordinary Time), white/gold (Easter).
  const g = new THREE.Group();
  const COLORS = [0x6A1B9A, 0xC62828, 0x2E7D32, 0xFDD835, 0x6A1B9A, 0xC62828];
  const SYMBOLS = ["✝", "🔥", "🌿", "👑", "✝", "🔥"];
  const zs = [-7, -13, -19, -25, -28, -10];
  for (let i = 0; i < 6; i++) {
    const banner = new THREE.Group();
    // Pole at the top
    banner.add(box(2.0, 0.08, 0.08, 0xD4AF37, 0, 5.4, 0));
    // Hanging strings
    banner.add(box(0.03, 0.4, 0.03, 0x111111, -0.95, 5.1, 0));
    banner.add(box(0.03, 0.4, 0.03, 0x111111,  0.95, 5.1, 0));
    // Fabric panel
    banner.add(box(1.8, 3.2, 0.04, COLORS[i], 0, 3.4, 0));
    // Gold trim border
    banner.add(box(1.85, 0.08, 0.05, 0xFFD700, 0, 4.95, 0.01));
    banner.add(box(1.85, 0.08, 0.05, 0xFFD700, 0, 1.85, 0.01));
    // Tasseled bottom
    banner.add(box(1.8, 0.18, 0.05, 0xFFD700, 0, 1.78, 0.01));
    for (let t = -3; t <= 3; t++) {
      banner.add(box(0.06, 0.22, 0.03, 0xFFD700, t * 0.25, 1.55, 0.02));
    }
    // Symbol patch (canvas sprite)
    const cv = document.createElement("canvas");
    cv.width = 128; cv.height = 128;
    const cx = cv.getContext("2d");
    cx.fillStyle = "rgba(0,0,0,0)"; cx.fillRect(0, 0, 128, 128);
    cx.fillStyle = "#FFD700"; cx.font = "bold 96px serif";
    cx.textAlign = "center"; cx.textBaseline = "middle";
    cx.fillText(SYMBOLS[i], 64, 70);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(cv), transparent: true,
    }));
    sprite.position.set(0, 3.4, 0.05);
    sprite.scale.set(1.1, 1.1, 1);
    banner.add(sprite);
    // Alternate sides of the sanctuary
    const onWest = i % 2 === 0;
    banner.position.set(onWest ? -9.7 : 9.7, 0, zs[i]);
    banner.rotation.y = onWest ? Math.PI / 2 : -Math.PI / 2;
    g.add(banner);
  }
  _scene.add(g);
}

function buildBellTower() {
  // Stone bell tower alongside the steeple. Sits to the east of the
  // sanctuary, on the same footprint as the roof slab.
  const g = new THREE.Group();
  // Four-storey stone shaft
  for (let i = 0; i < 4; i++) {
    g.add(box(2.4, 2.2, 2.4, i % 2 === 0 ? 0xC9C2B6 : 0xB8B0A2, 0, i * 2.2, 0));
  }
  // Open belfry on top — four corner pillars + roof slab
  const BY = 8.8; // top of shaft
  [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([sx, sz]) => {
    g.add(box(0.35, 2.4, 0.35, 0xA89E8A, sx * 1.0, BY, sz * 1.0));
  });
  // Belfry roof
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(2.0, 1.8, 4),
    mat(0x6B3410),
  );
  roof.position.set(0, BY + 3.3, 0);
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  // Tiny gold cross on the roof point
  g.add(box(0.1, 0.55, 0.1, 0xFFD700, 0, BY + 4.5, 0));
  g.add(box(0.45, 0.1, 0.1, 0xFFD700, 0, BY + 4.65, 0));
  // Crossbar inside the belfry
  g.add(box(2.0, 0.1, 0.1, 0x444444, 0, BY + 1.9, 0));
  // The bell itself (brass cone hanging from the crossbar)
  const bellMat = new THREE.MeshStandardMaterial({
    color: 0xC68E17, roughness: 0.45, metalness: 0.8,
  });
  const bell = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.0, 14, 1, true), bellMat);
  bell.position.set(0, BY + 1.35, 0);
  g.add(bell);
  // Bell yoke
  g.add(box(0.7, 0.1, 0.15, 0x4A2C0A, 0, BY + 1.85, 0));
  // Clapper
  const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mat(0x333333));
  clapper.position.set(0, BY + 0.95, 0);
  g.add(clapper);
  // Arched openings (dark inset on each face of the belfry)
  for (let i = 0; i < 4; i++) {
    const arch = box(1.5, 1.8, 0.05, 0x1a0a2e, 0, BY + 1.0, 1.05);
    arch.rotation.y = i * Math.PI / 2;
    arch.position.set(Math.sin(i * Math.PI / 2) * 1.05, BY + 1.0, Math.cos(i * Math.PI / 2) * 1.05);
    g.add(arch);
  }
  // Plant the tower beside (and behind) the steeple
  g.position.set(7, 5.0, -16);
  _scene.add(g);
}

function buildPrayerGarden() {
  // Landscaped memorial / prayer garden out on the front lawn east of the
  // entrance. Stone path, hedges, flowers, two benches, and a praying-hands
  // statue in the centre.
  const g = new THREE.Group();
  // Border hedge (a square frame of low green boxes)
  const hedge = mat(0x2E7D32);
  for (let i = -4; i <= 4; i++) {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), hedge)).position.set(i, 0.4, -4.5);
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), hedge)).position.set(i, 0.4,  4.5);
    if (i !== 0) {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), hedge)).position.set(-4.5, 0.4, i);
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), hedge)).position.set( 4.5, 0.4, i);
    }
  }
  // Cobblestone path running north-south through the centre
  for (let z = -4; z <= 4; z += 1) {
    g.add(box(2.0, 0.04, 0.9, 0xB0A89A, 0, 0, z));
  }
  // Praying-hands statue in the centre on a pedestal
  // Pedestal
  g.add(box(1.6, 1.0, 1.6, 0x9E9E9E, 0, 0, 0));
  g.add(box(1.8, 0.15, 1.8, 0xBDBDBD, 0, 1.0, 0));
  // Two grey "praying hands" (slanted boxes meeting at the top)
  const handMat = mat(0xE0E0E0);
  const handL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.6, 0.6), handMat);
  handL.position.set(-0.16, 2.0, 0);
  handL.rotation.z = 0.18;
  handL.castShadow = true;
  g.add(handL);
  const handR = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.6, 0.6), handMat);
  handR.position.set(0.16, 2.0, 0);
  handR.rotation.z = -0.18;
  handR.castShadow = true;
  g.add(handR);
  // Small inscription plaque on the pedestal
  g.add(box(1.2, 0.4, 0.05, 0x222222, 0, 0.5, 0.81));
  g.add(box(1.1, 0.06, 0.02, 0xFFD700, 0, 0.6, 0.84));
  g.add(box(1.1, 0.06, 0.02, 0xFFD700, 0, 0.45, 0.84));
  // Two wooden benches facing the statue (one to each side)
  [[-3.2,  Math.PI / 2], [3.2, -Math.PI / 2]].forEach(([x, rotY]) => {
    const bench = new THREE.Group();
    bench.add(box(2.0, 0.1, 0.5, 0x6B3410, 0, 0.5, 0));   // seat
    bench.add(box(2.0, 0.8, 0.1, 0x6B3410, 0, 0.9, -0.2)); // back
    bench.add(box(0.1, 0.55, 0.5, 0x222222, -0.9, 0, 0)); // leg L
    bench.add(box(0.1, 0.55, 0.5, 0x222222,  0.9, 0, 0)); // leg R
    bench.position.set(x, 0, 0);
    bench.rotation.y = rotY;
    g.add(bench);
  });
  // Flower clusters in the four corners (small bright spheres on green pads)
  const FLOWERS = [0xE91E63, 0xFDD835, 0x9C27B0, 0xFF7043];
  [[-3, -3], [3, -3], [-3, 3], [3, 3]].forEach(([x, z], i) => {
    g.add(box(1.2, 0.12, 1.2, 0x4E3422, x, 0, z)); // soil bed
    for (let k = 0; k < 6; k++) {
      const f = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 8, 6),
        mat(FLOWERS[(i + k) % FLOWERS.length]),
      );
      f.position.set(x + (Math.random() - 0.5) * 0.9, 0.35, z + (Math.random() - 0.5) * 0.9);
      g.add(f);
    }
  });
  // Two slender lamp posts at the garden entry
  [[-1.0, 4.4], [1.0, 4.4]].forEach(([x, z]) => {
    g.add(box(0.12, 1.8, 0.12, 0x222222, x, 0, z));
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xFFEFA0 }),
    );
    lamp.position.set(x, 2.0, z);
    g.add(lamp);
  });
  // Park it on the front lawn, east of the church entrance.
  g.position.set(16, 0, 14);
  _scene.add(g);
}

// ---------- catalog ----------
// Each upgrade has a tier: "initial" (always visible) or "deluxe" (locked
// until every initial upgrade is installed). Deluxe items are pricier and
// represent the next phase of beautifying the church.
const UPGRADES = [
  {
    id: "steeple",
    name: "Steeple & Cross",
    emoji: "⛪",
    cost: 40,
    tier: "initial",
    desc: "Add a tall white steeple with a gold cross on top of the sanctuary roof.",
    build: buildSteeple,
  },
  {
    id: "rose",
    name: "Rose Stained-Glass Window",
    emoji: "🪟",
    cost: 60,
    tier: "initial",
    desc: "Install a colorful circular rose window high on the back wall above the cross.",
    build: buildRoseWindow,
  },
  {
    id: "lights",
    name: "Stage Spotlights & Truss",
    emoji: "💡",
    cost: 50,
    tier: "initial",
    desc: "Mount a lighting truss with five colored spotlights over the stage.",
    build: buildStageLights,
  },
  {
    id: "pulpit",
    name: "Modern Pulpit",
    emoji: "🎤",
    cost: 80,
    tier: "initial",
    desc: "Swap the old wooden lectern for a sleek acrylic-and-dark-wood pulpit with a mic.",
    build: buildModernPulpit,
  },
  {
    id: "pews",
    name: "Cushioned Burgundy Pews",
    emoji: "🪑",
    cost: 100,
    tier: "initial",
    desc: "Reupholster every pew in burgundy with plush cushions and gold trim.",
    build: buildCushionedPews,
  },
  {
    id: "coffeebar",
    name: "Coffee Bar Deluxe",
    emoji: "☕",
    cost: 120,
    tier: "initial",
    desc: "Build a proper coffee bar in the fellowship hall: espresso machine, pastry case, menu, pendant lights.",
    build: buildCoffeeBar,
  },
  {
    id: "worshipteam",
    name: "Worship Team & Instruments",
    emoji: "🎸",
    cost: 150,
    tier: "initial",
    desc: "Stock the stage with a drum kit, keyboard, electric guitar, amp, mic stands, and a 4-piece band.",
    build: buildWorshipTeam,
  },

  // ---- DELUXE tier (unlocks after all initial items are owned) ----
  {
    id: "sidewindows",
    name: "Side Stained-Glass Windows",
    emoji: "🌈",
    cost: 200,
    tier: "deluxe",
    desc: "Four tall arched stained-glass panels down both side walls of the sanctuary.",
    build: buildSideStainedGlass,
  },
  {
    id: "chandelier",
    name: "Crystal Chandelier",
    emoji: "✨",
    cost: 250,
    tier: "deluxe",
    desc: "A two-tier gold chandelier with candle bulbs and crystal teardrops over the centre aisle.",
    build: buildChandelier,
  },
  {
    id: "banners",
    name: "Liturgical Banners",
    emoji: "🚩",
    cost: 350,
    tier: "deluxe",
    desc: "Six fabric banners in the liturgical colors hanging from the side walls.",
    build: buildLiturgicalBanners,
  },
  {
    id: "marble",
    name: "Marble Floors",
    emoji: "🟫",
    cost: 400,
    tier: "deluxe",
    desc: "Resurface the sanctuary in polished white marble with gold veining and an inlaid cross.",
    build: buildMarbleFloors,
  },
  {
    id: "belltower",
    name: "Stone Bell Tower",
    emoji: "🔔",
    cost: 500,
    tier: "deluxe",
    desc: "Erect a four-storey stone bell tower with an open belfry and a brass bell beside the steeple.",
    build: buildBellTower,
  },
  {
    id: "garden",
    name: "Memorial Prayer Garden",
    emoji: "🌷",
    cost: 750,
    tier: "deluxe",
    desc: "Landscape a hedged garden on the front lawn with a praying-hands statue, benches, flower beds, and lamp posts.",
    build: buildPrayerGarden,
  },
];

// True once the player owns every "initial" tier upgrade. Deluxe items are
// hidden behind a lock until this is true.
function deluxeUnlocked() {
  return UPGRADES.filter(u => u.tier === "initial").every(u => _owned.has(u.id));
}

// ---------- public API ----------
export function initAesthetics(scene, zones) {
  _scene = scene; _zones = zones;
  loadOwned();
  // Silently rebuild any upgrades they already purchased in a previous session.
  UPGRADES.forEach(u => {
    if (_owned.has(u.id)) {
      try { u.build(); } catch (e) { console.warn("Aesthetic rebuild failed:", u.id, e); }
    }
  });
  // Expose the toggle so the HUD button (and B key) can open the panel.
  window.toggleAestheticsPanel = openPanel;
  // Hotkey: B for Beautify
  window.addEventListener("keydown", e => {
    if (e.code === "KeyB" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.getElementById("minigame-modal").style.display !== "flex" &&
        document.getElementById("dialogue-box").style.display !== "block") {
      openPanel();
    }
  });
}

function openPanel() {
  const xp = getXP();
  const unlocked = deluxeUnlocked();

  // Render one card for an upgrade. Deluxe items render as a "locked"
  // card (no buy button, dimmed) until the initial tier is complete.
  function renderCard(u) {
    const owned    = _owned.has(u.id);
    const isLocked = u.tier === "deluxe" && !unlocked;
    const canAfford = xp >= u.cost;

    let badge, btn, dim = "";
    if (owned) {
      badge = `<span style="color:#6BCB77;font-weight:bold;">✓ INSTALLED</span>`;
      btn = "";
      dim = "opacity:0.7;";
    } else if (isLocked) {
      badge = `<span style="color:#888;font-weight:bold;">🔒 LOCKED</span>`;
      btn = "";
      dim = "opacity:0.55;";
    } else {
      badge = `<span style="color:${canAfford ? "#FFD700" : "#888"};font-weight:bold;">${u.cost} XP</span>`;
      btn = `<button data-id="${u.id}" class="aes-buy" ${canAfford ? "" : "disabled"}
          style="margin-top:8px;padding:8px 14px;background:${canAfford ? "#7C3AED" : "#3a2a4a"};
            color:${canAfford ? "#fff" : "#777"};border:none;border-radius:6px;
            font-size:13px;font-weight:bold;cursor:${canAfford ? "pointer" : "not-allowed"};">
            ${canAfford ? "✨ Install" : "Not enough XP"}</button>`;
    }

    return `
      <div style="background:#1a0a2e;border:1px solid #3a2a4a;border-radius:8px;
        padding:12px 14px;margin-bottom:10px;${dim}">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div style="font-size:16px;color:#fff;font-weight:bold;">
            <span style="font-size:20px;">${u.emoji}</span> ${u.name}</div>
          ${badge}
        </div>
        <div style="color:#bbb;font-size:13px;margin-top:6px;line-height:1.4;">${u.desc}</div>
        ${btn}
      </div>`;
  }

  const initialRows = UPGRADES.filter(u => u.tier === "initial").map(renderCard).join("");
  const deluxeRows  = UPGRADES.filter(u => u.tier === "deluxe").map(renderCard).join("");

  const deluxeHeader = unlocked
    ? `<h3 style="color:#FFD700;font-family:'Fredoka One',cursive;margin:18px 0 8px;font-size:17px;">
         💎 Deluxe Upgrades
         <span style="font-size:12px;color:#aaa;font-weight:normal;">— unlocked!</span>
       </h3>`
    : `<h3 style="color:#888;font-family:'Fredoka One',cursive;margin:18px 0 4px;font-size:17px;">
         🔒 Deluxe Upgrades
       </h3>
       <p style="color:#888;font-size:12px;margin:0 0 8px;">
         Install every upgrade above to unlock six premium beautification items.
       </p>`;

  openMinigameModal(`
    <h2 style="color:#FFD700;font-family:'Fredoka One',cursive;margin:0 0 4px;">
      ✨ Beautify the Church</h2>
    <p style="color:#aaa;font-size:13px;margin:0 0 14px;">
      Spend XP to upgrade your church's look. You have
      <strong style="color:#FFD700;">${xp} XP</strong>.</p>
    <div style="max-height:60vh;overflow-y:auto;padding-right:4px;">
      ${initialRows}
      ${deluxeHeader}
      ${deluxeRows}
    </div>
    <div style="text-align:right;margin-top:10px;">
      <button id="aes-close" style="padding:10px 18px;background:#2a1a2a;color:#aaa;
        border:1px solid #555;border-radius:8px;font-size:13px;cursor:pointer;">Close</button>
    </div>`);

  document.getElementById("aes-close").addEventListener("click", () => {
    document.getElementById("minigame-modal").style.display = "none";
  });
  document.querySelectorAll(".aes-buy").forEach(btn => {
    btn.addEventListener("click", () => purchase(btn.dataset.id));
  });
}

function purchase(id) {
  const u = UPGRADES.find(x => x.id === id);
  if (!u || _owned.has(u.id)) return;
  // Hard-stop deluxe purchases until the initial tier is complete, even if
  // someone fishes the id out of the DOM.
  if (u.tier === "deluxe" && !deluxeUnlocked()) {
    showToast("🔒 Finish the initial upgrades first.");
    return;
  }
  if (!spendXP(u.cost)) {
    showToast("Not enough XP for this upgrade.");
    return;
  }
  _owned.add(u.id);
  saveOwned();
  try { u.build(); }
  catch (e) { console.error("Build failed:", e); }
  showToast(`${u.emoji} ${u.name} installed!`);
  // If that purchase just completed the initial tier, congratulate.
  if (u.tier === "initial" && deluxeUnlocked()) {
    setTimeout(() => showToast("💎 Deluxe Upgrades unlocked!"), 1200);
  }
  // Refresh the panel so the "Installed" badge appears immediately.
  openPanel();
}

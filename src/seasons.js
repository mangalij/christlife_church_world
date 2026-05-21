// Seasons & Weather — gives the world a sense of rhythm and time
// passing. A new "season" cycles every 5 real minutes (so each
// session can see all 4); inside each season weather can randomly
// shift between Clear / Rain / Snow (only Snow in winter).
//
// Effects:
//   - Rain  : light particle drizzle, plants grow ~30% faster
//             (read via window.__rainGrowthBonus from garden.js if desired)
//   - Snow  : winter-only flurries, ground tint cools
//   - Spring: hue tint slightly greener
//   - Summer: warm tint, no special weather modifier
//   - Fall  : amber tint
//   - Winter: bluish tint, snow possible, Christmas tree appears in foyer
//
// Modules can read window.__season (string) and window.__weather (string)
// to react.

import * as THREE from "three";
import { showToast } from "./ui.js";

const SEASONS = ["spring", "summer", "fall", "winter"];
const SEASON_DURATION = 300;          // 5 min per season
const WEATHER_REROLL  = 90;           // every 90s re-pick weather

// Visual tint applied to ambient/hemisphere light
const SEASON_TINT = {
  spring: { hemi: 0xC8FFD9, ground: 0x88AA66, fog: 0xC8E8FF },
  summer: { hemi: 0xFFE9B0, ground: 0x6FA055, fog: 0xFFEFC9 },
  fall:   { hemi: 0xFFC288, ground: 0xA86E2B, fog: 0xFFD9A8 },
  winter: { hemi: 0xCCE5FF, ground: 0xB0BFC9, fog: 0xDDE9F0 },
};

let _scene = null;
let _seasonTimer = 0;
let _weatherTimer = 0;
let _rainGroup = null;
let _snowGroup = null;
let _christmasGroup = null;
let _hudDiv = null;
let _hemi = null;
let _ground = null;
let _fog = null;

// Interior axis-aligned bounding boxes — particles are hidden while the
// player is standing inside any of these. Pulled from world.js floor sizes.
const INDOOR_AABBS = [
  { minX: -12, maxX:  12, minZ: -32, maxZ:   0 },   // sanctuary 24x32 @ (0,-16)
  { minX: -10, maxX:  10, minZ:  -1, maxZ:  11 },   // foyer      20x12 @ (0, 5)
  { minX: -43, maxX: -21, minZ: -20, maxZ:   0 },   // fellowship 22x20 @ (-32,-10)
  { minX: -13, maxX:  -3, minZ: -51, maxZ: -41 },   // prayer rm  10x10 @ (-8,-46)
  { minX:   3, maxX:  13, minZ: -51, maxZ: -41 },   // pastor off 10x10 @ ( 8,-46)
];

function isIndoors(pos) {
  if (!pos) return false;
  for (const b of INDOOR_AABBS) {
    if (pos.x >= b.minX && pos.x <= b.maxX && pos.z >= b.minZ && pos.z <= b.maxZ) return true;
  }
  return false;
}

// --- Helpers --------------------------------------------------------
function pickSeasonByClock() {
  // Cycle through the four seasons, ~5 min each, deterministic per page-load slot
  const minutes = Math.floor(Date.now() / 60000);
  return SEASONS[Math.floor(minutes / (SEASON_DURATION / 60)) % SEASONS.length];
}

function pickWeather(season) {
  const roll = Math.random();
  if (season === "winter") {
    if (roll < 0.45) return "snow";
    if (roll < 0.6)  return "rain";
    return "clear";
  }
  if (season === "spring") {
    if (roll < 0.45) return "rain";
    return "clear";
  }
  if (season === "fall") {
    if (roll < 0.3) return "rain";
    return "clear";
  }
  return "clear";          // summer mostly clear
}

// --- Particle builders ----------------------------------------------
function buildRain() {
  const COUNT = 800;
  const geom = new THREE.BufferGeometry();
  const positions = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    positions[i*3+0] = (Math.random() - 0.5) * 200;
    positions[i*3+1] =  Math.random() * 40;
    positions[i*3+2] = (Math.random() - 0.5) * 200;
  }
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0x99CCFF, size: 0.18, transparent: true, opacity: 0.65,
  });
  return new THREE.Points(geom, mat);
}

function buildSnow() {
  const COUNT = 600;
  const geom = new THREE.BufferGeometry();
  const positions = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    positions[i*3+0] = (Math.random() - 0.5) * 200;
    positions[i*3+1] =  Math.random() * 40;
    positions[i*3+2] = (Math.random() - 0.5) * 200;
  }
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xFFFFFF, size: 0.28, transparent: true, opacity: 0.85,
  });
  return new THREE.Points(geom, mat);
}

function buildChristmasTree() {
  // A simple festive cone tree near the church foyer
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.22, 0.8),
    new THREE.MeshToonMaterial({ color: 0x6B3410 })
  );
  trunk.position.y = 0.4;
  g.add(trunk);

  const foliage = new THREE.Mesh(
    new THREE.ConeGeometry(1.0, 2.4, 8),
    new THREE.MeshToonMaterial({ color: 0x1F6B2A })
  );
  foliage.position.y = 2.0;
  g.add(foliage);

  // Lights as small colored points
  const colors = [0xFF3030, 0x30FF30, 0xFFD700, 0x30A0FF, 0xFF8040];
  for (let i = 0; i < 18; i++) {
    const c = colors[i % colors.length];
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 6, 6),
      new THREE.MeshBasicMaterial({ color: c })
    );
    const y = 1.0 + Math.random() * 2.4;
    const r = (3.0 - y) / 3.0 * 0.95;       // narrower near top
    const ang = Math.random() * Math.PI * 2;
    bulb.position.set(Math.cos(ang) * r, y, Math.sin(ang) * r);
    g.add(bulb);
  }

  // Star on top
  const star = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.18),
    new THREE.MeshBasicMaterial({ color: 0xFFE34D })
  );
  star.position.y = 3.3;
  g.add(star);

  // Place in front-left of sanctuary
  g.position.set(-5, 0, -10);
  return g;
}

// --- Apply functions ------------------------------------------------
function applySeason(season) {
  const tint = SEASON_TINT[season];
  if (_hemi)   _hemi.color.setHex(tint.hemi);
  if (_ground) _hemi.groundColor?.setHex?.(tint.ground);
  if (_fog)    _fog.color.setHex(tint.fog);

  // Christmas decorations only in winter
  if (season === "winter") {
    if (!_christmasGroup) {
      _christmasGroup = buildChristmasTree();
      _scene.add(_christmasGroup);
    }
  } else if (_christmasGroup) {
    _scene.remove(_christmasGroup);
    _christmasGroup = null;
  }

  window.__season = season;
  refreshHud();
}

function applyWeather(weather) {
  // Tear down existing
  if (_rainGroup) { _scene.remove(_rainGroup); _rainGroup.geometry.dispose(); _rainGroup.material.dispose(); _rainGroup = null; }
  if (_snowGroup) { _scene.remove(_snowGroup); _snowGroup.geometry.dispose(); _snowGroup.material.dispose(); _snowGroup = null; }

  if (weather === "rain") {
    _rainGroup = buildRain();
    _scene.add(_rainGroup);
    window.__rainGrowthBonus = 1.3;
  } else if (weather === "snow") {
    _snowGroup = buildSnow();
    _scene.add(_snowGroup);
    window.__rainGrowthBonus = 1.0;
  } else {
    window.__rainGrowthBonus = 1.0;
  }

  window.__weather = weather;
  refreshHud();
}

// --- HUD ------------------------------------------------------------
function ensureHud() {
  if (_hudDiv) return _hudDiv;
  const div = document.createElement("div");
  div.id = "season-hud";
  div.style.cssText =
    "position:absolute;top:50px;right:10px;z-index:10;" +
    "background:rgba(20,10,40,0.78);border:1px solid #7C3AED;border-radius:8px;" +
    "padding:6px 10px;font-family:'Nunito',sans-serif;color:#fff;font-size:13px;";
  document.body.appendChild(div);
  _hudDiv = div;
  return div;
}

function emojiFor(season, weather) {
  const s = { spring: "🌸", summer: "☀️", fall: "🍂", winter: "❄️" }[season] || "🌍";
  const w = { rain: "🌧️", snow: "🌨️", clear: "" }[weather] || "";
  return `${s}${w ? " " + w : ""}`;
}

function refreshHud() {
  const div = ensureHud();
  const s = window.__season || "spring";
  const w = window.__weather || "clear";
  div.textContent = `${emojiFor(s, w)} ${s[0].toUpperCase() + s.slice(1)}`;
}

// --- Public API -----------------------------------------------------
export function initSeasons(scene, lights) {
  _scene = scene;
  // lights is optional — try to find a HemisphereLight + Fog ourselves
  _hemi = lights?.hemi || scene.children.find(c => c.isHemisphereLight) || null;
  _ground = null;
  _fog = scene.fog || null;
  ensureHud();
  const season = pickSeasonByClock();
  applySeason(season);
  applyWeather(pickWeather(season));
  _seasonTimer = 0;
  _weatherTimer = 0;
}

export function updateSeasons(delta, playerPos) {
  if (!_scene) return;

  // Suppress weather particles while the player is inside a building so
  // rain/snow doesn't appear to fall through the roof.
  const indoors = isIndoors(playerPos);
  if (_rainGroup) _rainGroup.visible = !indoors;
  if (_snowGroup) _snowGroup.visible = !indoors;

  // Advance rain particles
  if (_rainGroup && _rainGroup.visible) {
    const arr = _rainGroup.geometry.attributes.position.array;
    for (let i = 1; i < arr.length; i += 3) {
      arr[i] -= delta * 30;
      if (arr[i] < 0) arr[i] = 40;
    }
    _rainGroup.geometry.attributes.position.needsUpdate = true;
    if (playerPos) _rainGroup.position.set(playerPos.x, 0, playerPos.z);
  }
  if (_snowGroup && _snowGroup.visible) {
    const arr = _snowGroup.geometry.attributes.position.array;
    for (let i = 1; i < arr.length; i += 3) {
      arr[i] -= delta * 5;
      arr[i - 1] += Math.sin(performance.now() * 0.001 + i) * delta * 0.5;
      if (arr[i] < 0) arr[i] = 40;
    }
    _snowGroup.geometry.attributes.position.needsUpdate = true;
    if (playerPos) _snowGroup.position.set(playerPos.x, 0, playerPos.z);
  }

  // Season rotation
  _seasonTimer += delta;
  if (_seasonTimer >= SEASON_DURATION) {
    _seasonTimer = 0;
    const idx = SEASONS.indexOf(window.__season || "spring");
    const next = SEASONS[(idx + 1) % SEASONS.length];
    applySeason(next);
    applyWeather(pickWeather(next));
    showToast(`${emojiFor(next, window.__weather)} ${next[0].toUpperCase() + next.slice(1)} has arrived.`);
  }

  // Weather reroll
  _weatherTimer += delta;
  if (_weatherTimer >= WEATHER_REROLL) {
    _weatherTimer = 0;
    const prev = window.__weather;
    const next = pickWeather(window.__season || "spring");
    if (next !== prev) {
      applyWeather(next);
      if (next === "rain")      showToast("🌧️ Rain begins to fall — plants will love it.");
      else if (next === "snow") showToast("❄️ Snow drifts down on the church.");
      else                       showToast("☀️ The weather clears.");
    }
  }
}

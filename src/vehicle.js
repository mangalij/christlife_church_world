import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { showToast } from "./ui.js";
import { addMember } from "./growth.js";
import { mobileInput, setDrivingControlsVisible } from "./player.js";

const cars = [];
let activeCar = null;
let playerRef = null;
let labelRef = null;
let parkingSpots = [];
let parkOverlay = null;
const visitedHouses = new Set();
const carKeys = {};

window.addEventListener("keydown", e => { carKeys[e.code] = true; });
window.addEventListener("keyup",   e => { carKeys[e.code] = false; });

// F key: enter / exit nearest car
window.addEventListener("keydown", e => {
  if (e.code !== "KeyF") return;
  if (activeCar) { exitCar(); return; }
  if (window.__nearNPC) return; // don't hijack NPC dialogue triggers
  tryEnterNearestCar();
});

export function initVehicles(_player, _zones) {
  playerRef = _player;
  parkingSpots = _zones?.parkingSpots || [];
}

export function spawnCars(scene) {
  // A varied row of parked vehicles facing the church. Each entry is a
  // [typeKey, hexColor] pair so we get visual + stat diversity across
  // the lot. Types are defined in VEHICLE_TYPES below.
  const lineup = [
    ["sportsCar", 0xE53935],   // bright red two-seater
    ["sedan",     0x1E88E5],   // family blue
    ["pickup",    0x37474F],   // dark steel work truck
    ["suv",       0x43A047],   // forest-green family SUV
    ["hatchback", 0xFDD835],   // bright yellow city car
    ["van",       0xF4F4F4],   // white church van
    ["sportsCar", 0x111111],   // matte black sports car
    ["pickup",    0xC62828],   // red farm truck
  ];
  const lotX = [-21, -15, -9, -3, 3, 9, 15, 21];
  lineup.forEach(([type, color], i) => {
    buildCar(scene, lotX[i], 22, color, Math.PI, type);
  });
  return cars;
}

// ---- Vehicle catalog ---------------------------------------------------
// Each vehicle type defines its geometry (dimensions + which extras to
// draw) and its driving feel (top speed, acceleration, braking). Adding a
// new type is just a matter of adding another entry here — buildCar()
// reads everything from this table.
export const VEHICLE_TYPES = {
  sedan: {
    label: "Sedan",
    body:   { w: 2.0, h: 0.6, d: 4.2, y: 0.75 },
    cabin:  { w: 1.7, h: 0.7, d: 2.0, x: 0, y: 1.40, z: -0.3, color: 0x222233 },
    roof:   { w: 1.6, h: 0.05, d: 1.8, y: 1.80, z: -0.3 },
    wheels: { radius: 0.40, axle: 1.05, frontZ:  1.35, rearZ: -1.35 },
    lights: { frontZ:  2.15, backZ: -2.15, y: 0.85, offsetX: 0.65 },
    stats:  { accel: 14, maxFwd: 22, maxRev: 9,  brake: 28, steer: 1.8 },
  },
  sportsCar: {
    label: "Sports Car",
    // Lower, wider, and longer hood; tiny cabin shifted backward.
    body:   { w: 2.0, h: 0.45, d: 4.4, y: 0.55 },
    cabin:  { w: 1.55, h: 0.50, d: 1.3, x: 0, y: 1.05, z: -0.5, color: 0x111122 },
    roof:   { w: 1.5, h: 0.04, d: 1.1, y: 1.32, z: -0.5 },
    // Rear spoiler is part of the "extras" hook below.
    extras: ["spoiler"],
    wheels: { radius: 0.42, axle: 1.05, frontZ:  1.5, rearZ: -1.5 },
    lights: { frontZ:  2.25, backZ: -2.25, y: 0.70, offsetX: 0.70 },
    stats:  { accel: 22, maxFwd: 32, maxRev: 10, brake: 34, steer: 2.2 },
  },
  pickup: {
    label: "Pickup Truck",
    // Cab forward, open bed in the rear. Drawn via extras.
    body:   { w: 2.2, h: 0.7, d: 4.6, y: 0.85 },
    cabin:  { w: 1.95, h: 0.95, d: 1.7, x: 0, y: 1.70, z: 0.6, color: 0x223344 },
    roof:   { w: 1.85, h: 0.05, d: 1.55, y: 2.20, z: 0.6 },
    extras: ["bed"],
    wheels: { radius: 0.55, axle: 1.15, frontZ:  1.4, rearZ: -1.4 },
    lights: { frontZ:  2.35, backZ: -2.35, y: 1.00, offsetX: 0.75 },
    stats:  { accel: 11, maxFwd: 18, maxRev: 7,  brake: 24, steer: 1.6 },
  },
  suv: {
    label: "SUV",
    body:   { w: 2.1, h: 0.75, d: 4.4, y: 0.85 },
    cabin:  { w: 1.95, h: 1.05, d: 2.7, x: 0, y: 1.78, z: -0.15, color: 0x1a2233 },
    roof:   { w: 1.85, h: 0.05, d: 2.55, y: 2.33, z: -0.15 },
    extras: ["roofRack"],
    wheels: { radius: 0.50, axle: 1.10, frontZ:  1.45, rearZ: -1.45 },
    lights: { frontZ:  2.25, backZ: -2.25, y: 1.00, offsetX: 0.70 },
    stats:  { accel: 13, maxFwd: 20, maxRev: 8,  brake: 26, steer: 1.7 },
  },
  hatchback: {
    label: "Hatchback",
    // Short and tall — almost square in profile.
    body:   { w: 1.85, h: 0.55, d: 3.4, y: 0.70 },
    cabin:  { w: 1.65, h: 0.95, d: 2.0, x: 0, y: 1.50, z: -0.15, color: 0x223040 },
    roof:   { w: 1.55, h: 0.05, d: 1.8, y: 2.00, z: -0.15 },
    wheels: { radius: 0.38, axle: 1.00, frontZ:  1.10, rearZ: -1.10 },
    lights: { frontZ:  1.75, backZ: -1.75, y: 0.80, offsetX: 0.60 },
    stats:  { accel: 16, maxFwd: 21, maxRev: 9,  brake: 28, steer: 2.0 },
  },
  van: {
    label: "Church Van",
    // Long, boxy, tall — passenger van silhouette.
    body:   { w: 2.2, h: 0.85, d: 5.2, y: 0.95 },
    cabin:  { w: 2.05, h: 1.15, d: 4.2, x: 0, y: 1.95, z: -0.2, color: 0x90A4AE },
    roof:   { w: 1.95, h: 0.06, d: 4.0, y: 2.56, z: -0.2 },
    wheels: { radius: 0.48, axle: 1.15, frontZ:  1.75, rearZ: -1.75 },
    lights: { frontZ:  2.65, backZ: -2.65, y: 1.10, offsetX: 0.75 },
    stats:  { accel: 10, maxFwd: 17, maxRev: 7,  brake: 22, steer: 1.5 },
  },
};

function buildCar(scene, x, z, color, rotY = 0, typeKey = "sedan") {
  const def = VEHICLE_TYPES[typeKey] || VEHICLE_TYPES.sedan;
  const group = new THREE.Group();
  const mat = c => new THREE.MeshToonMaterial({ color: c });

  // RoundedBoxGeometry helper — bevels the corners so the chassis pieces
  // don't look like flat-faced cardboard boxes. Bevel radius is auto-capped
  // so it can't exceed half the smallest dimension.
  const rb = (w, h, d, r = 0.14, seg = 3) => {
    const maxR = Math.min(w, h, d) / 2 - 0.001;
    return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, maxR));
  };

  // --- Body --- (chamfered so the hood/trunk taper visually)
  const body = new THREE.Mesh(rb(def.body.w, def.body.h, def.body.d, 0.22), mat(color));
  body.position.y = def.body.y;
  body.castShadow = true;

  // --- Cabin (greenhouse / passenger volume) --- with a touch of
  // transparency so it reads as tinted glass instead of solid plastic.
  const cabinMat = new THREE.MeshToonMaterial({
    color: def.cabin.color,
    transparent: true,
    opacity: 0.82,
  });
  const cabin = new THREE.Mesh(rb(def.cabin.w, def.cabin.h, def.cabin.d, 0.16), cabinMat);
  cabin.position.set(def.cabin.x, def.cabin.y, def.cabin.z);
  cabin.castShadow = true;

  // --- Roof accent strip in body color (rounded) ---
  const roof = new THREE.Mesh(rb(def.roof.w, def.roof.h, def.roof.d, 0.05), mat(color));
  roof.position.set(0, def.roof.y, def.roof.z);

  group.add(body, cabin, roof);

  // --- Front + rear bumpers (slim, rounded, dark plastic) ---
  const bumperMat = mat(0x1a1a1a);
  const bumperGeo = rb(def.body.w * 0.98, 0.18, 0.25, 0.08);
  const fBumper = new THREE.Mesh(bumperGeo, bumperMat);
  fBumper.position.set(0, def.body.y - def.body.h / 2 + 0.12, def.body.d / 2 - 0.05);
  const rBumper = new THREE.Mesh(bumperGeo, bumperMat);
  rBumper.position.set(0, def.body.y - def.body.h / 2 + 0.12, -def.body.d / 2 + 0.05);
  group.add(fBumper, rBumper);

  // --- Front grille (horizontal slats look) ---
  const grille = new THREE.Mesh(
    rb(def.body.w * 0.55, 0.22, 0.08, 0.04),
    mat(0x222222)
  );
  grille.position.set(0, def.body.y, def.body.d / 2 + 0.02);
  group.add(grille);

  // --- Side window strips on the cabin (narrow dark band along the sides)
  // — adds visual definition that boxes alone don't convey.
  const winStripGeo = rb(0.04, def.cabin.h * 0.55, def.cabin.d * 0.9, 0.02);
  const winStripMat = new THREE.MeshToonMaterial({ color: 0x111122, transparent: true, opacity: 0.85 });
  const winL = new THREE.Mesh(winStripGeo, winStripMat);
  winL.position.set(-def.cabin.w / 2 + 0.02, def.cabin.y + 0.05, def.cabin.z);
  const winR = winL.clone(); winR.position.x = def.cabin.w / 2 - 0.02;
  group.add(winL, winR);

  // --- Type-specific extras ---
  if (def.extras?.includes("spoiler")) {
    // Rear wing on a small stalk
    const stalkL = new THREE.Mesh(rb(0.08, 0.25, 0.08, 0.03), mat(0x222222));
    stalkL.position.set(-0.7, def.body.y + def.body.h / 2 + 0.18, -def.body.d / 2 + 0.15);
    const stalkR = stalkL.clone(); stalkR.position.x = 0.7;
    const wing = new THREE.Mesh(rb(1.7, 0.08, 0.35, 0.04), mat(color));
    wing.position.set(0, def.body.y + def.body.h / 2 + 0.35, -def.body.d / 2 + 0.15);
    group.add(stalkL, stalkR, wing);
  }
  if (def.extras?.includes("bed")) {
    // Pickup bed: low walls forming an open box behind the cabin.
    const bedY = def.body.y + def.body.h / 2 + 0.25;
    const bedZ = -def.body.d / 2 + 0.9;
    const wallH = 0.5, wallT = 0.08;
    const bedW = def.body.w - 0.05;
    const bedD = 1.6;
    const sideL = new THREE.Mesh(rb(wallT, wallH, bedD, 0.03), mat(color));
    sideL.position.set(-bedW / 2 + wallT / 2, bedY, bedZ);
    const sideR = sideL.clone(); sideR.position.x =  bedW / 2 - wallT / 2;
    const tail = new THREE.Mesh(rb(bedW, wallH, wallT, 0.03), mat(color));
    tail.position.set(0, bedY, bedZ - bedD / 2 + wallT / 2);
    group.add(sideL, sideR, tail);
  }
  if (def.extras?.includes("roofRack")) {
    const rackBarGeo = rb(def.roof.w - 0.2, 0.05, 0.08, 0.02);
    const rackY = def.roof.y + 0.08;
    const bar1 = new THREE.Mesh(rackBarGeo, mat(0x222222));
    bar1.position.set(0, rackY, def.roof.z + def.roof.d / 2 - 0.3);
    const bar2 = new THREE.Mesh(rackBarGeo, mat(0x222222));
    bar2.position.set(0, rackY, def.roof.z - def.roof.d / 2 + 0.3);
    group.add(bar1, bar2);
  }

  // --- Wheels --- (tire + silver rim + center hub for a much less
  // "plastic disc" look)
  const r = def.wheels.radius;
  const tireGeo = new THREE.CylinderGeometry(r, r, 0.32, 20);
  const tireMat = mat(0x141414);
  const rimGeo  = new THREE.CylinderGeometry(r * 0.6, r * 0.6, 0.34, 14);
  const rimMat  = mat(0xBFC1C2);
  const hubGeo  = new THREE.SphereGeometry(r * 0.18, 10, 8);
  const hubMat  = mat(0x555555);
  const wheels = [];
  [[-def.wheels.axle, r, def.wheels.frontZ], [def.wheels.axle, r, def.wheels.frontZ],
   [-def.wheels.axle, r, def.wheels.rearZ ], [def.wheels.axle, r, def.wheels.rearZ ]]
   .forEach(([wx, wy, wz]) => {
    const wheelGroup = new THREE.Group();
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.z = Math.PI / 2;
    const hub = new THREE.Mesh(hubGeo, hubMat);
    wheelGroup.add(tire, rim, hub);
    wheelGroup.position.set(wx, wy, wz);
    group.add(wheelGroup);
    // Reuse the tire mesh for the rotation animation (it spins, the rim
    // is parented to it via the group so we rotate the whole group).
    wheels.push(wheelGroup);
  });

  // --- Headlights (front = local +Z) ---
  const lz = def.lights.frontZ, ly = def.lights.y, lx = def.lights.offsetX;
  [[-lx, ly, lz], [lx, ly, lz]].forEach(([hx, hy, hz]) => {
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xFFFACD }));
    h.position.set(hx, hy, hz);
    group.add(h);
  });
  // --- Tail lights ---
  const bz = def.lights.backZ;
  [[-lx, ly, bz], [lx, ly, bz]].forEach(([hx, hy, hz]) => {
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    h.position.set(hx, hy, hz);
    group.add(h);
  });

  group.position.set(x, 0, z);
  group.rotation.y = rotY;
  scene.add(group);

  // "Press F" label that shows when player is close
  const tag = document.createElement("div");
  tag.style.cssText = "color:#FFD700;font-family:'Fredoka One',cursive;font-size:13px;" +
    "background:rgba(20,10,40,0.75);padding:3px 8px;border-radius:6px;pointer-events:none;display:none;";
  tag.textContent = `Press F to drive (${def.label})`;
  const label = new CSS2DObject(tag);
  label.position.set(0, def.cabin.y + def.cabin.h + 0.5, 0);
  group.add(label);

  const car = {
    group, body, wheels, velocity: 0, yaw: rotY, tag,
    type: typeKey, def,
    stats: def.stats,
    // Half-extents used for collision AABB & exit offset.
    halfW: def.body.w / 2 + 0.1,
    halfD: def.body.d / 2 + 0.2,
    height: Math.max(def.roof.y, def.cabin.y + def.cabin.h / 2) + 0.2,
  };
  cars.push(car);
  return car;
}

function tryEnterNearestCar() {
  if (!playerRef) return;
  let nearest = null, minD = 3.5;
  cars.forEach(c => {
    const d = c.group.position.distanceTo(playerRef.group.position);
    if (d < minD) { minD = d; nearest = c; }
  });
  if (!nearest) return;
  activeCar = nearest;
  playerRef.group.visible = false;
  setDrivingControlsVisible(true);
  showToast("🚗 Driving — WASD / joystick to steer, 🛑 brake, 🚪 exit");
}

function exitCar() {
  if (!activeCar) return;
  // Place player beside the driver's door, scaled to this car's width.
  const sideOffset = -(activeCar.halfW ?? 1.2) - 0.7;
  const offset = new THREE.Vector3(sideOffset, 0, 0)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), activeCar.yaw);
  playerRef.group.position.copy(activeCar.group.position.clone().add(offset));
  playerRef.group.position.y = 0;
  playerRef.velocity.set(0, 0, 0);
  playerRef.group.visible = true;
  activeCar.velocity = 0;
  activeCar = null;
  setDrivingControlsVisible(false);
  if (parkOverlay) parkOverlay.style.display = "none";
  showToast("🚶 Back on foot");
}

export function isDriving() { return !!activeCar; }
export function getActiveCar() { return activeCar; }

export function updateVehicles(camera, delta, colliders) {
  // Update prompt labels for parked cars
  if (playerRef) {
    cars.forEach(c => {
      if (c === activeCar) { c.tag.style.display = "none"; return; }
      const d = c.group.position.distanceTo(playerRef.group.position);
      c.tag.style.display = d < 3.5 ? "block" : "none";
    });
  }

  if (!activeCar) return;
  const c = activeCar;

  // Per-vehicle handling — sports cars rip, vans / trucks lumber along.
  const s = c.stats || { accel: 14, maxFwd: 22, maxRev: 9, brake: 28, steer: 1.8 };
  const ACCEL = s.accel;
  const MAX_FWD = s.maxFwd;
  const MAX_REV = s.maxRev;
  const BRAKE = s.brake;
  const STEER_RATE = s.steer;
  const FRICTION = 3;

  let throttle = 0;
  if (carKeys["KeyW"] || carKeys["ArrowUp"])   throttle = 1;
  if (carKeys["KeyS"] || carKeys["ArrowDown"]) throttle = -0.7;
  let steer = 0;
  if (carKeys["KeyA"] || carKeys["ArrowLeft"])  steer = 1;
  if (carKeys["KeyD"] || carKeys["ArrowRight"]) steer = -1;
  // Mobile joystick fallback — pushing up drives forward, down reverses,
  // left/right steer. Only used when keys aren't already providing input.
  if (throttle === 0 && mobileInput) {
    const my = -mobileInput.moveY; // joystick up is negative Y
    if (Math.abs(my) > 0.15) throttle = my > 0 ? Math.min(1, my) : Math.max(-0.7, my * 0.7);
  }
  if (steer === 0 && mobileInput) {
    const mx = mobileInput.moveX;
    if (Math.abs(mx) > 0.15) steer = -mx; // car steer convention: left = +1
  }
  const braking = carKeys["Space"];
  const boost = (carKeys["ShiftLeft"] || carKeys["ShiftRight"]) ? 1.5 : 1;

  // Accel / brake
  if (throttle !== 0) {
    c.velocity += throttle * ACCEL * delta;
  } else {
    const sign = Math.sign(c.velocity);
    c.velocity -= sign * FRICTION * delta;
    if (Math.abs(c.velocity) < 0.05) c.velocity = 0;
  }
  if (braking) {
    const sign = Math.sign(c.velocity);
    c.velocity -= sign * BRAKE * delta;
    if (sign !== 0 && Math.sign(c.velocity) !== sign) c.velocity = 0;
  }
  c.velocity = Math.max(-MAX_REV, Math.min(MAX_FWD * boost, c.velocity));

  // Steering scales with speed; reverses sign when going backwards
  const speedFactor = Math.min(1, Math.abs(c.velocity) / 4);
  const dirSign = c.velocity >= 0 ? 1 : -1;
  c.yaw += steer * STEER_RATE * speedFactor * dirSign * delta;
  c.group.rotation.y = c.yaw;

  // Move forward (car's local +Z), with per-type collision footprint.
  const forward = new THREE.Vector3(Math.sin(c.yaw), 0, Math.cos(c.yaw));
  const step = forward.clone().multiplyScalar(c.velocity * delta);
  const next = c.group.position.clone().add(step);

  const hw = c.halfW ?? 1.2;
  const hd = c.halfD ?? 2.2;
  const ht = c.height ?? 1.8;
  const carBox = new THREE.Box3(
    new THREE.Vector3(next.x - hw, next.y,      next.z - hd),
    new THREE.Vector3(next.x + hw, next.y + ht, next.z + hd)
  );
  if (!colliders.some(col => carBox.intersectsBox(col))) {
    c.group.position.copy(next);
  } else {
    c.velocity *= -0.25; // soft bounce
  }

  // Wheel spin animation
  c.wheels.forEach(w => { w.rotation.x += c.velocity * delta * 1.8; });

  // Parking detection: if the car is roughly stopped and fully inside a
  // driveway zone, show a "Parked at ..." overlay. First visit awards XP.
  updateParkingStatus(c);

  // Chase camera
  const back = new THREE.Vector3(-Math.sin(c.yaw) * 8, 4.5, -Math.cos(c.yaw) * 8);
  camera.position.lerp(c.group.position.clone().add(back), 0.15);
  camera.lookAt(c.group.position.clone().add(new THREE.Vector3(0, 1, 0)));
}

function ensureParkOverlay() {
  if (parkOverlay) return parkOverlay;
  const d = document.createElement("div");
  d.id = "park-overlay";
  d.style.cssText =
    "position:fixed;left:50%;bottom:160px;transform:translateX(-50%);" +
    "background:rgba(20,10,40,0.88);color:#FFD700;padding:8px 18px;border-radius:16px;" +
    "font-family:'Fredoka One',cursive;font-size:15px;pointer-events:none;display:none;z-index:50;";
  document.body.appendChild(d);
  parkOverlay = d;
  return d;
}

function updateParkingStatus(c) {
  ensureParkOverlay();
  const stopped = Math.abs(c.velocity) < 0.3;
  const cx = c.group.position.x, cz = c.group.position.z;
  let spot = null;
  for (const s of parkingSpots) {
    if (Math.abs(cx - s.cx) <= s.halfW && Math.abs(cz - s.cz) <= s.halfD) {
      spot = s; break;
    }
  }
  if (spot && stopped) {
    parkOverlay.textContent = `\uD83C\uDD7F\uFE0F Parked at ${spot.name}`;
    parkOverlay.style.display = "block";
    if (!visitedHouses.has(spot.name)) {
      visitedHouses.add(spot.name);
      const xp = parseInt(localStorage.getItem("clw_xp") || "0") + 10;
      localStorage.setItem("clw_xp", xp);
      const xpEl = document.getElementById("xp-count");
      if (xpEl) xpEl.textContent = xp;
      // Door-to-door outreach — invite the family to church.
      addMember(2);
      showToast(`Visited ${spot.name} (+10 XP · \uD83C\uDFDB\uFE0F +2 members)`);
    }
  } else {
    parkOverlay.style.display = "none";
  }
}

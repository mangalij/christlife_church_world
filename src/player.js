import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import nipplejs from "nipplejs";
import { isMobile } from "./main.js";
import { openDialogue } from "./ui.js";
import { buildAppearance } from "./appearance.js";
import { isResting, isSitting } from "./sitting.js";
import { isOnPlayground } from "./playground.js";
import { isWorshipping } from "./worship.js";
import { isActing } from "./actions.js";
import { isEating } from "./food.js";

const SPEED = 8;
const SPRINT_MULT = 1.6;
const JUMP_FORCE = 8;
const GRAVITY = -20;

const keys = {};
const CAMERA_MODES = ["third", "front", "first"];
function cycleCamera() {
  const i = CAMERA_MODES.indexOf(cameraMode);
  cameraMode = CAMERA_MODES[(i + 1) % CAMERA_MODES.length];
}
window.addEventListener("keydown", e => {
  keys[e.code] = true;
  if (e.code === "KeyV") cycleCamera();
  if (e.code === "Tab") { e.preventDefault(); window.toggleWhoPanel?.(); }
});
window.addEventListener("keyup", e => { keys[e.code] = false; });

let cameraMode = "third";
let yaw = 0, pitch = 0;

let isPointerLocked = false;
document.addEventListener("pointerlockchange", () => {
  isPointerLocked = !!document.pointerLockElement;
});
document.addEventListener("mousemove", e => {
  if (!isPointerLocked) return;
  yaw   -= e.movementX * 0.002;
  pitch -= e.movementY * 0.002;
  pitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 4, pitch));
});

let activeTouchId = null, touchStartX = 0, touchStartY = 0;
window.addEventListener("touchstart", e => {
  for (const t of e.changedTouches) {
    if (t.clientX > window.innerWidth / 2 && activeTouchId === null) {
      activeTouchId = t.identifier;
      touchStartX = t.clientX; touchStartY = t.clientY;
    }
  }
}, { passive: true });
window.addEventListener("touchmove", e => {
  for (const t of e.changedTouches) {
    if (t.identifier !== activeTouchId) continue;
    yaw   -= (t.clientX - touchStartX) * 0.005;
    pitch -= (t.clientY - touchStartY) * 0.005;
    pitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 4, pitch));
    touchStartX = t.clientX; touchStartY = t.clientY;
  }
}, { passive: true });
window.addEventListener("touchend", e => {
  for (const t of e.changedTouches) {
    if (t.identifier === activeTouchId) activeTouchId = null;
  }
}, { passive: true });

export const mobileInput = { moveX: 0, moveY: 0, jump: false, sprint: false };

export function initMobileControls() {
  if (!isMobile) {
    document.getElementById("mobile-controls").style.display = "none";
    return;
  }
  document.getElementById("mobile-controls").style.display = "block";
  document.getElementById("controls-hint").style.display = "none";
  document.getElementById("chat-panel").style.display = "none";

  const joystick = nipplejs.create({
    zone: document.getElementById("joystick-zone"),
    mode: "dynamic", color: "#7C3AED", size: 100, restOpacity: 0.5
  });
  joystick.on("move", (_, data) => {
    const a = data.angle.radian, f = Math.min(data.force, 1);
    mobileInput.moveX =  Math.cos(a) * f;
    mobileInput.moveY = -Math.sin(a) * f;
  });
  joystick.on("end", () => { mobileInput.moveX = 0; mobileInput.moveY = 0; });

  const btnJump = document.getElementById("btn-jump");
  btnJump.addEventListener("touchstart", e => {
    e.preventDefault(); mobileInput.jump = true;
  }, { passive: false });
  btnJump.addEventListener("touchend", () => { mobileInput.jump = false; });

  let sprintOn = false;
  document.getElementById("btn-sprint").addEventListener("touchstart", e => {
    e.preventDefault();
    sprintOn = !sprintOn; mobileInput.sprint = sprintOn;
    document.getElementById("btn-sprint").style.background =
      sprintOn ? "rgba(255,215,0,0.8)" : "rgba(124,58,237,0.75)";
  }, { passive: false });

  document.getElementById("btn-camera").addEventListener("touchstart", e => {
    e.preventDefault();
    cycleCamera();
  }, { passive: false });

  document.getElementById("btn-players").addEventListener("touchstart", e => {
    e.preventDefault(); window.toggleWhoPanel?.();
  }, { passive: false });

  let chatOpen = false;
  document.getElementById("btn-chat").addEventListener("touchstart", e => {
    e.preventDefault();
    chatOpen = !chatOpen;
    document.getElementById("chat-panel").style.display = chatOpen ? "block" : "none";
  }, { passive: false });

  document.getElementById("btn-interact").addEventListener("touchstart", e => {
    e.preventDefault();
    // Dispatch a synthetic KeyE so every E-listening system reacts
    // identically: NPCs (npc.js), tithe box (wolves.js), sitting,
    // fountain, baptism, garden, pet, playground, basketball, etc.
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyE", key: "e" }));
    window.dispatchEvent(new KeyboardEvent("keyup",   { code: "KeyE", key: "e" }));
  }, { passive: false });

  // Actions popup — toggles a grid of gesture buttons.
  const popup = document.getElementById("actions-popup");
  document.getElementById("btn-actions").addEventListener("touchstart", e => {
    e.preventDefault();
    popup.style.display = popup.style.display === "grid" ? "none" : "grid";
  }, { passive: false });

  // Each gesture button dispatches a synthetic keydown so all existing
  // keyboard-based handlers (actions.js, worship.js, food.js, vehicle.js,
  // aesthetics.js, wolves.js) react identically.
  const sendKey = code => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code, key: code }));
    window.dispatchEvent(new KeyboardEvent("keyup",   { code, key: code }));
  };
  popup.querySelectorAll("[data-key]").forEach(btn => {
    btn.addEventListener("touchstart", e => {
      e.preventDefault();
      sendKey(btn.dataset.key);
      popup.style.display = "none";
    }, { passive: false });
  });

  // Contextual Holy Water button — visibility controlled by wolves.js via
  // setHolyButtonVisible(); tapping fires the same KeyH the wolves handler
  // listens for.
  document.getElementById("btn-holy").addEventListener("touchstart", e => {
    e.preventDefault();
    sendKey("KeyH");
  }, { passive: false });

  // Driving controls — visibility toggled by vehicle.js on enter/exit.
  // Brake fires Space (continuous while held); Exit fires F.
  const btnBrake = document.getElementById("btn-brake");
  btnBrake.addEventListener("touchstart", e => {
    e.preventDefault();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", key: " " }));
  }, { passive: false });
  btnBrake.addEventListener("touchend", e => {
    e.preventDefault();
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "Space", key: " " }));
  }, { passive: false });
  document.getElementById("btn-exit-car").addEventListener("touchstart", e => {
    e.preventDefault();
    sendKey("KeyF");
  }, { passive: false });
}

export function setDrivingControlsVisible(visible) {
  const brake = document.getElementById("btn-brake");
  const exit  = document.getElementById("btn-exit-car");
  const jump  = document.getElementById("btn-jump");
  if (brake) brake.style.display = visible ? "flex" : "none";
  if (exit)  exit.style.display  = visible ? "flex" : "none";
  // Hide jump while driving — it's meaningless in a car.
  if (jump)  jump.style.display  = visible ? "none" : "flex";
}

// ---- Mobile interact-button visibility (vote-based) -------------------
// Many systems (NPC, garden, playground, pet, sitting, baptism, fountain,
// basketball, wolves, parking, babel, food) want to show the same mobile
// "E" button when the player is near something they own. If only one of
// them controls the button (the old behavior — npc.js setting it to
// false every frame when no NPC was nearby), all the others silently
// lost their mobile entry point. We now keep a Set of active "voters":
// the button is visible whenever ANY system is requesting it.
const _interactRequesters = new Set();
function _applyInteractVisibility() {
  const btn = document.getElementById("btn-interact");
  if (!btn) return;
  btn.style.display = _interactRequesters.size > 0 ? "flex" : "none";
}

/**
 * Request that the mobile interact button be shown for a given source.
 * Pass `visible=false` (or call with the same sourceId next frame with
 * `false`) to release the request. Multiple sources can request at once.
 */
export function requestInteractButton(sourceId, visible) {
  if (visible) _interactRequesters.add(sourceId);
  else         _interactRequesters.delete(sourceId);
  _applyInteractVisibility();
}

/**
 * Legacy single-source toggle. Kept so older callers still work, but
 * routed through the vote system under a dedicated "_default" key so it
 * can't stomp other systems' requests.
 */
export function setInteractButtonVisible(visible) {
  requestInteractButton("_default", visible);
}

export function setHolyButtonVisible(visible) {
  const btn = document.getElementById("btn-holy");
  if (btn) btn.style.display = visible ? "flex" : "none";
}

// ---- Hand-held item factory ----
// Builds a small Group representing the chosen hand-held item. The
// returned group should be added as a child of armR by the caller.
// Returns null when the player chose "none".
function buildHandItem(kind) {
  const toon = c => new THREE.MeshToonMaterial({ color: c });
  switch ((kind || "").toLowerCase()) {
    case "none": return null;

    case "cross": {
      const g = new THREE.Group();
      const wood = toon(0x6B3410);
      const vert = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.08), wood);
      const horiz = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.08), wood);
      horiz.position.y = 0.12;
      g.add(vert, horiz);
      g.castShadow = true;
      return g;
    }

    case "holywater": {
      const g = new THREE.Group();
      const glass = new THREE.MeshToonMaterial({
        color: 0x9AD8FF, transparent: true, opacity: 0.7
      });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.32, 12), glass);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.08, 10), glass);
      neck.position.y = 0.20;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10), toon(0xC0A04A));
      cap.position.y = 0.26;
      const label = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.10, 0.10), toon(0xFFFFFF));
      label.position.set(0, -0.02, 0.01);
      // tiny cross on the label
      const lc1 = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.06, 0.011), toon(0x7C3AED));
      const lc2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.015, 0.011), toon(0x7C3AED));
      lc1.position.set(0, 0, 0.06); lc2.position.set(0, 0.012, 0.06);
      label.add(lc1, lc2);
      g.add(body, neck, cap, label);
      g.castShadow = true;
      return g;
    }

    case "candle": {
      const g = new THREE.Group();
      const stick = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 0.36, 12), toon(0xF5E6C8)
      );
      const wick = new THREE.Mesh(
        new THREE.CylinderGeometry(0.008, 0.008, 0.04, 6), toon(0x222222)
      );
      wick.position.y = 0.20;
      // Flame — small cone with emissive look (toon material can't truly
      // self-illuminate but we tint it bright orange).
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.05, 0.14, 10),
        new THREE.MeshBasicMaterial({ color: 0xFFB347 })
      );
      flame.position.y = 0.28;
      // Wax drip ring
      const ring = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.07, 0.03, 12), toon(0xE8D8B0)
      );
      ring.position.y = -0.17;
      g.add(stick, wick, flame, ring);
      g.castShadow = true;
      return g;
    }

    case "staff": {
      const g = new THREE.Group();
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.055, 0.95, 10), toon(0x8B6B4A)
      );
      // Curved crook at the top — three small angled cylinders forming a hook
      const hookMat = toon(0xA0825E);
      for (let i = 0; i < 4; i++) {
        const seg = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.05, 0.12, 8), hookMat
        );
        const a = (i / 4) * Math.PI; // 0 .. PI
        seg.position.set(0.10 * Math.sin(a), 0.50 + 0.10 * (1 - Math.cos(a)), 0);
        seg.rotation.z = -a;
        g.add(seg);
      }
      g.add(shaft);
      g.castShadow = true;
      return g;
    }

    case "bible":
    default: {
      const g = new THREE.Group();
      const cover = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.36, 0.09), toon(0x4A2C0A)
      );
      const pages = new THREE.Mesh(
        new THREE.BoxGeometry(0.26, 0.34, 0.10), toon(0xE8DCC0)
      );
      pages.position.x = 0.011;
      const cr = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.10, 0.011), toon(0xC0A04A));
      cr.position.z = -0.05;
      const crb = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.025, 0.011), toon(0xC0A04A));
      crb.position.set(0, 0.018, -0.05);
      g.add(cover, pages, cr, crb);
      g.castShadow = true;
      return g;
    }
  }
}

export async function createPlayer(scene, pData, camera) {
  const group = new THREE.Group();
  const { head, torso, legL, legR, armL, armR } = buildAppearance(group, pData);

  // Bible carried at the left hip. Stays attached to the player group so it
  // travels with movement but doesn't swing with the arm animation.
  const bibleMat   = new THREE.MeshToonMaterial({ color: 0x4A2C0A });
  const pagesMat   = new THREE.MeshToonMaterial({ color: 0xE8DCC0 });
  const ribbonMat  = new THREE.MeshToonMaterial({ color: 0xC22020 });
  const bible = new THREE.Group();
  const cover = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.42, 0.10), bibleMat);
  const pages = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.40, 0.11), pagesMat);
  pages.position.x = 0.012;
  const cross = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.011), pagesMat);
  cross.position.z = -0.056;
  const crossBar = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.03, 0.011), pagesMat);
  crossBar.position.set(0, 0.02, -0.056);
  const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.18, 0.012), ribbonMat);
  ribbon.position.set(-0.08, -0.18, 0.05);
  bible.add(cover, pages, cross, crossBar, ribbon);
  bible.position.set(-0.55, 1.0, 0.15);
  bible.castShadow = true;
  group.add(bible);

  // ---- Hand-held item (player's choice on the start screen) ----
  // Attached to the RIGHT arm so it sways naturally with arm animation.
  // The arm's local origin is at its center, so y ≈ -0.55 places the
  // item just past the bottom of the forearm (i.e. in the hand).
  const chosenItem = (pData.handItem || "bible").toLowerCase();
  const handItem = buildHandItem(chosenItem);
  if (handItem) {
    handItem.position.set(0, -0.55, 0.12);
    armR.add(handItem);
  }
  // Hide the legacy hip-Bible whenever the player picked something other
  // than a Bible — otherwise both items would appear on the avatar.
  // We keep the mesh in the scene graph (just invisible) so existing
  // animation code in actions.js that grabs `parts.bible` still works.
  if (chosenItem !== "bible") bible.visible = false;

  group.position.set(0, 0, -8);
  scene.add(group);

  const div = document.createElement("div");
  div.style.cssText = "color:#FFD700;font-family:'Fredoka One',cursive;font-size:14px;" +
    "background:rgba(20,10,40,0.7);padding:2px 8px;border-radius:6px;pointer-events:none;";
  div.textContent = pData.name;
  const label = new CSS2DObject(div);
  label.position.set(0, 2.6, 0);
  group.add(label);

  return {
    group, velocity: new THREE.Vector3(), onGround: true,
    parts: { head, torso, legL, legR, armL, armR, bible }, yaw: 0,

    // Rebuild the avatar's clothing/hair without disturbing attached
    // gear (bible) or the floating name label. Used by outfits.js when
    // the player equips a different outfit.
    refreshOutfit(newPData) {
      const preserved = [];
      for (const child of [...group.children]) {
        if (child === bible || child === label) continue;
        preserved.push(child);
        group.remove(child);
      }
      // buildAppearance strips group.children, but bible & label are
      // still attached — detach them temporarily so buildAppearance
      // doesn't wipe them.
      group.remove(bible);
      group.remove(label);
      const built = buildAppearance(group, newPData);
      group.add(bible);
      group.add(label);
      // Update references so animations (actions.js, baptism.js) target
      // the new meshes.
      this.parts.head  = built.head;
      this.parts.torso = built.torso;
      this.parts.legL  = built.legL;
      this.parts.legR  = built.legR;
      this.parts.armL  = built.armL;
      this.parts.armR  = built.armR;
    },
  };
}

export function updatePlayer(player, camera, delta, colliders) {
  const { group, velocity, parts } = player;
  player.yaw = yaw;

  // If the player is resting (sitting on a pew/sofa or lying in bed),
  // freeze movement/physics but keep the camera responsive so they can
  // look around. Only re-assert the seated leg pose when actually
  // sitting — lying in bed uses a different (flat) pose that sitting.js
  // sets up itself, and overriding the legs here would break it.
  if (isResting()) {
    if (isSitting()) {
      parts.legL.rotation.x = parts.legR.rotation.x = -Math.PI / 2;
      parts.armL.rotation.x = parts.armR.rotation.x = 0;
    }
    const target = group.position.clone();
    applyCamera(camera, target, yaw, pitch);
    document.getElementById("xp-count").textContent =
      parseInt(localStorage.getItem("clw_xp") || 0);
    return;
  }

  // Riding the slide / swinging on the swing — freeze movement & physics
  // and let playground.js drive the body. Still update the camera.
  if (isOnPlayground()) {
    const target = group.position.clone();
    applyCamera(camera, target, yaw, pitch);
    document.getElementById("xp-count").textContent =
      parseInt(localStorage.getItem("clw_xp") || 0);
    return;
  }

  const dir   = new THREE.Vector3( Math.sin(yaw), 0,  Math.cos(yaw));
  const right = new THREE.Vector3( Math.cos(yaw), 0, -Math.sin(yaw));
  // Coffee-stand speed boost: clw_boost holds an expiry timestamp; clw_boost_mult
  // is the multiplier set by the chosen drink (defaults to 1.25 when unset).
  const boostUntil = parseInt(localStorage.getItem("clw_boost") || "0");
  const boostActive = boostUntil > Date.now();
  const boostMult = boostActive
    ? parseFloat(localStorage.getItem("clw_boost_mult") || "1.25")
    : 1;
  const speed = ((keys["ShiftLeft"] || keys["ShiftRight"] || mobileInput.sprint)
    ? SPEED * SPRINT_MULT : SPEED) * boostMult;

  const move = new THREE.Vector3();
  let moving = false;

  if (isMobile) {
    if (Math.abs(mobileInput.moveX) > 0.1 || Math.abs(mobileInput.moveY) > 0.1) {
      move.addScaledVector(dir,   mobileInput.moveY * speed * delta);
      move.addScaledVector(right, mobileInput.moveX * speed * delta);
      moving = true;
    }
  } else {
    if (keys["KeyW"] || keys["ArrowUp"])    { move.addScaledVector(dir,  -speed * delta); moving = true; }
    if (keys["KeyS"] || keys["ArrowDown"])  { move.addScaledVector(dir,   speed * delta); moving = true; }
    if (keys["KeyA"] || keys["ArrowLeft"])  { move.addScaledVector(right,-speed * delta); moving = true; }
    if (keys["KeyD"] || keys["ArrowRight"]) { move.addScaledVector(right, speed * delta); moving = true; }
  }

  if ((keys["Space"] || mobileInput.jump) && player.onGround) {
    velocity.y = JUMP_FORCE;
    player.onGround = false;
    mobileInput.jump = false;
  }

  velocity.y += GRAVITY * delta;
  group.position.y += velocity.y * delta;
  if (group.position.y <= 0) { group.position.y = 0; velocity.y = 0; player.onGround = true; }

  const nextPos = group.position.clone().add(move);
  const playerBox = new THREE.Box3(
    new THREE.Vector3(nextPos.x - 0.4, nextPos.y,       nextPos.z - 0.4),
    new THREE.Vector3(nextPos.x + 0.4, nextPos.y + 2.2, nextPos.z + 0.4)
  );
  if (!colliders.some(c => playerBox.intersectsBox(c))) group.position.add(move);
  group.rotation.y = yaw;

  if (moving) {
    const t = Date.now() * 0.006;
    parts.legL.rotation.x =  Math.sin(t) * 0.5;
    parts.legR.rotation.x =  Math.sin(t + Math.PI) * 0.5;
    parts.armL.rotation.x =  Math.sin(t + Math.PI) * 0.4;
    parts.armR.rotation.x =  Math.sin(t) * 0.4;
  } else if (!isWorshipping() && !isActing() && !isEating()) {
    parts.legL.rotation.x = parts.legR.rotation.x =
    parts.armL.rotation.x = parts.armR.rotation.x = 0;
  }

  const target = group.position.clone();
  applyCamera(camera, target, yaw, pitch);

  document.getElementById("xp-count").textContent =
    parseInt(localStorage.getItem("clw_xp") || 0);
}

// Positions the camera based on the current cameraMode.
//   third — behind the player (default)
//   front — selfie view in front of the player, looking back at the face
//   first — first-person, behind the eyes
function applyCamera(camera, target, yaw, pitch) {
  if (cameraMode === "third") {
    const offset = new THREE.Vector3(
      Math.sin(yaw) * 5 * Math.cos(pitch),
      3 + 5 * Math.sin(pitch),
      Math.cos(yaw) * 5 * Math.cos(pitch)
    );
    camera.position.lerp(target.clone().add(offset), 0.12);
    camera.lookAt(target.clone().add(new THREE.Vector3(0, 1.5, 0)));
  } else if (cameraMode === "front") {
    // Selfie view: camera sits in front of the player (the side the face is on)
    // and looks back at the head so you can actually see your character.
    // The player walks in the -dir direction on W, so "forward" = (-sin(yaw), 0, -cos(yaw)).
    const dist = 3.2;
    const offset = new THREE.Vector3(
      -Math.sin(yaw) * dist * Math.cos(pitch),
      2.2 + dist * Math.sin(pitch) * 0.5,
      -Math.cos(yaw) * dist * Math.cos(pitch)
    );
    // Snap (not lerp) so the camera can't briefly pass through the head when
    // switching modes — that was making the face look "wrong-sided".
    camera.position.copy(target.clone().add(offset));
    camera.lookAt(target.clone().add(new THREE.Vector3(0, 2.0, 0)));
  } else {
    camera.position.copy(target.clone().add(new THREE.Vector3(0, 1.8, 0)));
    camera.rotation.order = "YXZ";
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
  }
}

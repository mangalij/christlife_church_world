// IMPORTANT: realism.js must be imported FIRST. It monkey-patches
// THREE.MeshToonMaterial / MeshLambertMaterial into PBR MeshStandardMaterial
// before any other module's factory functions run.
import { upgradeRenderer, buildRealisticLighting } from "./realism.js";
import * as THREE from "three";
import { CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { buildWorld, updateHouses } from "./world.js";
import { createPlayer, updatePlayer, initMobileControls } from "./player.js";
import { spawnNPCs, updateNPCs } from "./npc.js";
import { initMultiplayer, updateMultiplayer } from "./multiplayer.js";
import { initUI, showToast } from "./ui.js";
import { initAudio } from "./audio.js";
import { initGrowth } from "./growth.js";
import { initCongregation, updateCongregation } from "./congregation.js";
import { initVehicles, spawnCars, updateVehicles, isDriving } from "./vehicle.js";
import { initSitting, updateSitting } from "./sitting.js";
import { initWorship, updateWorship } from "./worship.js";
import { initActions, updateActions } from "./actions.js";
import { initFood, updateFood } from "./food.js";
import { initAesthetics } from "./aesthetics.js";
import { initBasketball, updateBasketball } from "./basketball3d.js";
import { updateMatch } from "./match1v1.js";
import { initFountain, updateFountain } from "./fountain.js";
import { initBaptism, updateBaptism } from "./baptism.js";
import { initWolves, updateWolves } from "./wolves.js";
import { initPlayground, updatePlayground } from "./playground.js";
import { initGarden, updateGarden } from "./garden.js";
import { initFaith } from "./faith.js";
import { initFloaters } from "./floaters.js";
import { initEvents, updateEvents } from "./events.js";
import { initPet, updatePet } from "./pet.js";
import { initSeasons, updateSeasons } from "./seasons.js";
import { initLeaderboards } from "./leaderboards.js";
import { initProgression } from "./progression.js";
import { initOutfits } from "./outfits.js";
import { buildAppearance, SKIN_TONES } from "./appearance.js";
import { firebaseSignIn } from "./firebase.js";

// ---- Device detection ----
// Detect real phones/tablets only. Many Windows laptops report touch points
// even though the user is on a keyboard+mouse, so we require BOTH a coarse
// pointer AND a small viewport before falling back to a UA sniff.
const _uaMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i
  .test(navigator.userAgent);
const _coarseAndSmall =
  window.matchMedia &&
  window.matchMedia("(pointer: coarse)").matches &&
  Math.min(window.innerWidth, window.innerHeight) < 800;
export const isMobile = _uaMobile || _coarseAndSmall;

// Expose so other modules referencing window.isMobile keep working.
window.isMobile = isMobile;

// ---- PWA Install prompt ----
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  deferredPrompt = e;
  setTimeout(() => {
    const banner = document.getElementById("pwa-banner");
    if (banner && deferredPrompt) banner.style.display = "flex";
  }, 30000);
});

document.getElementById("pwa-install-btn")?.addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  document.getElementById("pwa-banner").style.display = "none";
  if (outcome === "accepted") showToast("✝️ ChristLife World installed!");
});

document.getElementById("pwa-dismiss-btn")?.addEventListener("click", () => {
  document.getElementById("pwa-banner").style.display = "none";
});

window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  showToast("✅ App installed! Find it on your home screen.");
});

// ---- Orientation check ----
function checkOrientation() {
  const prompt = document.getElementById("rotate-prompt");
  if (!isMobile || !prompt) return;
  prompt.style.display = window.innerHeight > window.innerWidth ? "flex" : "none";
}
window.addEventListener("resize", checkOrientation);
checkOrientation();

// ---- Character creation gate ----
const saved = localStorage.getItem("clw_character");
let playerData = saved ? JSON.parse(saved) : null;

if (!playerData) {
  const previewCanvas = document.getElementById("char-preview");
  const previewRenderer = new THREE.WebGLRenderer({ canvas: previewCanvas, alpha: true });
  previewRenderer.setSize(316, 160);
  const previewScene = new THREE.Scene();
  const previewCamera = new THREE.PerspectiveCamera(50, 316 / 160, 0.1, 100);
  previewCamera.position.set(0, 1.6, 4.2);
  previewCamera.lookAt(0, 1.1, 0);
  previewScene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const previewLight = new THREE.DirectionalLight(0xffffff, 0.6);
  previewLight.position.set(3, 5, 3);
  previewScene.add(previewLight);

  const previewChar = new THREE.Group();
  previewScene.add(previewChar);

  // Build skin-tone swatches from the shared palette
  const skinHolder = document.getElementById("skin-swatches");
  let selectedSkin = SKIN_TONES[0].hex;
  SKIN_TONES.forEach((t, i) => {
    const sw = document.createElement("div");
    sw.className = "skin-sw" + (i === 0 ? " selected" : "");
    sw.style.background = t.hex;
    sw.title = t.name;
    sw.addEventListener("click", () => {
      selectedSkin = t.hex;
      skinHolder.querySelectorAll(".skin-sw").forEach(el => el.classList.remove("selected"));
      sw.classList.add("selected");
      refreshPreview();
    });
    skinHolder.appendChild(sw);
  });

  function readForm() {
    return {
      shirt:       document.getElementById("shirt-color").value,
      pants:       document.getElementById("pants-color").value,
      skin:        selectedSkin,
      hairStyle:   document.getElementById("hair-style").value,
      hairColor:   document.getElementById("hair-color").value,
      jacketOn:    document.getElementById("jacket-on").checked,
      jacketColor: document.getElementById("jacket-color").value,
      shoeColor:   document.getElementById("shoe-color").value,
    };
  }

  function refreshPreview() {
    buildAppearance(previewChar, readForm());
  }
  refreshPreview();

  // Hook every input
  ["shirt-color", "pants-color", "shoe-color", "hair-color", "jacket-color"]
    .forEach(id => document.getElementById(id).addEventListener("input", refreshPreview));
  document.getElementById("hair-style").addEventListener("change", refreshPreview);
  document.getElementById("jacket-on").addEventListener("change", refreshPreview);

  (function animPreview() {
    requestAnimationFrame(animPreview);
    previewChar.rotation.y += 0.01;
    previewRenderer.render(previewScene, previewCamera);
  })();

  document.getElementById("enter-btn").addEventListener("click", () => {
    const name = document.getElementById("player-name-input").value.trim() || "ChurchGoer";
    const church = document.getElementById("church-name-input").value.trim() || "ChristLife Church";
    playerData = { name, church, ...readForm() };
    localStorage.setItem("clw_character", JSON.stringify(playerData));
    document.getElementById("char-create").style.display = "none";
    startGame(playerData);
  });
} else {
  document.getElementById("char-create").style.display = "none";
  startGame(playerData);
}

// ---- GAME START ----
async function startGame(pData) {
  ["hud-top", "hud-bottom", "membership-bar"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === "hud-bottom" ? "flex" : "block";
  });
  document.getElementById("church-name-display").textContent = "⛪ " + pData.church;
  if (!isMobile) {
    document.getElementById("controls-hint").style.display = "block";
    document.getElementById("chat-panel").style.display = "block";
  }

  const uid = await firebaseSignIn();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87CEEB);
  scene.fog = new THREE.Fog(0xD4E8FF, isMobile ? 20 : 30, isMobile ? 50 : 80);

  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 200);

  const renderer = new THREE.WebGLRenderer({ antialias: !isMobile, powerPreference: "high-performance" });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
  upgradeRenderer(renderer, { isMobile });
  document.body.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.domElement.style.position = "absolute";
  labelRenderer.domElement.style.top = "0";
  labelRenderer.domElement.style.pointerEvents = "none";
  // Keep 3D name tags BELOW UI overlays (dialogue z=20, minigame modal z=40,
  // etc.) so they don't bleed through popups.
  labelRenderer.domElement.style.zIndex = "5";
  document.body.appendChild(labelRenderer.domElement);

  // Realistic outdoor lighting rig: hemisphere bounce + warm sun + cool fill.
  buildRealisticLighting(scene, { isMobile });

  const { colliders, zones } = buildWorld(scene);
  const player = await createPlayer(scene, pData, camera);
  const npcs = spawnNPCs(scene, player, zones);
  initVehicles(player, zones);
  spawnCars(scene);

  initUI(pData);
  initAudio();
  initGrowth(scene, zones);
  initCongregation(scene, zones);
  initSitting(player, scene, zones);
  initWorship(player);
  initActions(player);
  initFood(scene, player);
  initAesthetics(scene, zones);
  initBasketball(scene, player, zones);
  initBaptism(scene, player, zones);
  initWolves(scene, player, zones);
  initFountain(scene, player, zones);
  initPlayground(player, zones);
  initGarden(scene, player, zones);
  initMultiplayer(scene, uid, pData, labelRenderer);
  initMobileControls();

  // Retention / progression systems
  initFaith();
  initFloaters(player, camera);
  initEvents();
  initPet(scene, player);
  initSeasons(scene);
  initLeaderboards(uid, pData);
  initProgression(scene);
  initOutfits(player, pData);

  if (!isMobile) {
    document.addEventListener("click", () => {
      if (!document.pointerLockElement &&
          document.getElementById("dialogue-box").style.display !== "block" &&
          document.getElementById("minigame-modal").style.display !== "flex") {
        document.body.requestPointerLock();
      }
    });
  }

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
    checkOrientation();
  });

  const clock = new THREE.Clock();
  function loop() {
    requestAnimationFrame(loop);
    const delta = Math.min(clock.getDelta(), 0.05);
    const elapsed = clock.getElapsedTime();
    if (isDriving()) {
      updateVehicles(camera, delta, colliders);
    } else {
      updatePlayer(player, camera, delta, colliders);
      updateVehicles(camera, delta, colliders); // updates "Press F" prompts on parked cars
    }
    updateNPCs(npcs, player, delta, elapsed);
    updateCongregation(delta, elapsed);
    updateHouses(zones, player.group.position);
    updateSitting();
    updateWorship(delta);
    updateActions(delta);
    updateFood(delta);
    updateBasketball(delta);
    updateMatch(delta);
    updateBaptism(delta);
    updateWolves(delta);
    updateFountain();
    updatePlayground(delta);
    updateGarden(delta);
    updateEvents(delta);
    updatePet(delta);
    updateSeasons(delta, player.group.position);
    updateMultiplayer(player);
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }
  loop();
}

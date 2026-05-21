import { pushMembership } from "./multiplayer.js";
import { showToast, openMinigameModal } from "./ui.js";
import { makePew } from "./world.js";
import { addFace } from "./face.js";
import { refreshCongregation } from "./congregation.js";
import { floatXP, floatMember } from "./floaters.js";
import { onXPChanged } from "./faith.js";
import { playCoin, playMemberBell, vibrate } from "./audio.js";
import * as THREE from "three";

let scene = null, zones = null;
const seatedMembers = []; // meshes already placed on pews

// Shirt/skin color palette for seated members
const PALETTE = [
  [0xFF6B6B, 0xFFCBA4], [0x4ECDC4, 0xD4956A], [0xFFD700, 0xFFCBA4],
  [0xA29BFE, 0xD4956A], [0x6BCB77, 0xFFCBA4], [0xFF9F40, 0xD4956A],
  [0x3CB371, 0xFFCBA4], [0xFF7F50, 0xD4956A], [0x4169E1, 0xFFCBA4],
  [0xBB8FCE, 0xD4956A], [0xF7DC6F, 0xFFCBA4], [0xE74C3C, 0xD4956A],
];

function makeSeatedPerson(seed) {
  const [shirt, skin] = PALETTE[seed % PALETTE.length];
  const mat = c => new THREE.MeshToonMaterial({ color: c });
  const g = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.4), mat(shirt));
  torso.position.y = 1.05; torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.45), mat(skin));
  head.position.y = 1.65; head.castShadow = true;
  addFace(head, { skin });
  g.add(torso, head);
  // Default orientation already faces -z (toward pulpit at z=-28); addFace puts the
  // face on the head's -z side, so no rotation needed.
  return g;
}

// Returns world-space seat slots, in pew order × 3 seats per pew, only for currently visible pews.
function gatherSeatSlots() {
  const allPews = [
    ...(zones.pewsBasic || []),
    ...(zones.extraPews || []),
    ...(zones.upgradedPews || []),
  ].filter(p => p.visible);
  const SEAT_OFFSETS = [-0.95, 0, 0.95]; // local x on the 3-wide pew
  const slots = [];
  allPews.forEach(pew => {
    SEAT_OFFSETS.forEach(ox => {
      slots.push({ x: pew.position.x + ox, y: 0, z: pew.position.z });
    });
  });
  return slots;
}

function refreshSeats() {
  if (!scene) return;
  // Remove previously seated meshes
  seatedMembers.forEach(m => scene.remove(m));
  seatedMembers.length = 0;
  const slots = gatherSeatSlots();
  const count = Math.min(getMemberCount(), slots.length);
  for (let i = 0; i < count; i++) {
    const person = makeSeatedPerson(i);
    person.position.set(slots[i].x, slots[i].y, slots[i].z);
    scene.add(person);
    seatedMembers.push(person);
  }
}

function totalCapacity() {
  return gatherSeatSlots().length;
}

// Returns world-space {x,z} positions of every seated congregation member.
// Used by sitting.js to skip pew slots that are already occupied.
export function getOccupiedSeats() {
  return seatedMembers.map(m => ({ x: m.position.x, z: m.position.z }));
}

// ---- Sanctuary upgrade ----
function isUpgraded() { return localStorage.getItem("clw_sanctuary_upgraded") === "1"; }
function markUpgraded() { localStorage.setItem("clw_sanctuary_upgraded", "1"); }

function performUpgrade() {
  if (isUpgraded()) return;
  markUpgraded();
  // Add 10 new pews on outer aisles (x = ±8) at every existing row z position.
  const rows = [-25, -20, -15, -10, -7];
  zones.upgradedPews = zones.upgradedPews || [];
  rows.forEach(z => {
    [-8, 8].forEach(x => {
      const pew = makePew(x, z);
      scene.add(pew);
      zones.upgradedPews.push(pew);
    });
  });
  // Reveal the extra-row pews too, in case the player hadn't hit the milestone yet.
  if (zones.extraPews) zones.extraPews.forEach(p => p.visible = true);
  refreshSeats();
  showToast("⛪ Sanctuary 2.0 unlocked! +30 new seats");
}

function offerUpgrade() {
  if (isUpgraded()) return;
  openMinigameModal(`
    <h2 style="color:#FFD700;font-family:'Fredoka One',cursive;">⛪ Church is Full!</h2>
    <p style="color:#ccc;margin:12px 0;font-size:15px;line-height:1.5;">
      Every seat in the sanctuary is taken. The congregation is overflowing into the aisles!</p>
    <p style="color:#ccc;margin-bottom:18px;font-size:14px;">
      Upgrade to <strong style="color:#FFD700;">Sanctuary 2.0</strong> — adds two new side wings of pews (+30 seats).</p>
    <div style="display:flex;gap:10px;">
      <button id="up-yes" style="flex:1;padding:14px;background:#7C3AED;color:#fff;border:none;
        border-radius:8px;font-size:15px;cursor:pointer;font-weight:bold;">✨ Build Sanctuary 2.0</button>
      <button id="up-no" style="padding:14px 18px;background:#2a1a2a;color:#aaa;border:1px solid #555;
        border-radius:8px;font-size:14px;cursor:pointer;">Later</button>
    </div>`);
  document.getElementById("up-yes").addEventListener("click", () => {
    document.getElementById("minigame-modal").style.display = "none";
    performUpgrade();
  });
  document.getElementById("up-no").addEventListener("click", () => {
    document.getElementById("minigame-modal").style.display = "none";
  });
}

// ---- Public API ----
export function initGrowth(_scene, _zones) {
  scene = _scene; zones = _zones;
  zones.upgradedPews = [];
  const count = getMemberCount();
  document.getElementById("member-count").textContent = count;
  applyMilestones(count, false);
  // If they already upgraded in a previous session, rebuild the upgrade pews silently.
  if (isUpgraded()) {
    const rows = [-25, -20, -15, -10, -7];
    rows.forEach(z => {
      [-8, 8].forEach(x => {
        const pew = makePew(x, z);
        scene.add(pew);
        zones.upgradedPews.push(pew);
      });
    });
    if (zones.extraPews) zones.extraPews.forEach(p => p.visible = true);
  }
  refreshSeats();
  updateRole(count);
}

export function getMemberCount() {
  return parseInt(localStorage.getItem("clw_members") || "12");
}

export function addMember(n = 1) {
  const next = getMemberCount() + n;
  localStorage.setItem("clw_members", next);
  document.getElementById("member-count").textContent = next;
  floatMember(n);
  if (n > 0) { playMemberBell(); vibrate([30, 40, 30]); }
  pushMembership();
  applyMilestones(next, true);
  refreshSeats();
  refreshCongregation();
  updateRole(next);
  window.dispatchEvent(new CustomEvent("clw-members-changed", { detail: { members: next } }));
  // If they've now filled every visible seat (and haven't upgraded yet), offer it.
  if (!isUpgraded() && next >= totalCapacity()) {
    setTimeout(offerUpgrade, 600); // brief delay so the toast can show first
  }
}

export function addXP(amount) {
  const current = parseInt(localStorage.getItem("clw_xp") || "0");
  const next = current + amount;
  localStorage.setItem("clw_xp", next);
  document.getElementById("xp-count").textContent = next;
  floatXP(amount);
  if (amount > 0) { playCoin(); vibrate(15); }
  // Notify the faith-level system so the meter + level-up toast update.
  onXPChanged();
  window.dispatchEvent(new CustomEvent("clw-xp-changed", { detail: { xp: next } }));
}

export function getXP() {
  return parseInt(localStorage.getItem("clw_xp") || "0");
}

// Attempts to spend `amount` XP. Returns true on success, false if not enough.
export function spendXP(amount) {
  const current = getXP();
  if (current < amount) return false;
  localStorage.setItem("clw_xp", current - amount);
  document.getElementById("xp-count").textContent = current - amount;
  return true;
}

function updateRole(count) {
  const role = count >= 75 ? "Leader" : count >= 40 ? "Volunteer" : count >= 20 ? "Member" : "Guest";
  document.getElementById("player-role").textContent = role;
}

function applyMilestones(count, animate) {
  if (count >= 20 && zones.prayerDoor) {
    const firstUnlock = zones.prayerDoor.visible; // was visible (locked) before this call
    zones.prayerDoor.visible = false;
    // Also remove the door's physics collider so the player can walk through.
    if (zones.prayerDoorCollider && zones.colliders) {
      const i = zones.colliders.indexOf(zones.prayerDoorCollider);
      if (i !== -1) zones.colliders.splice(i, 1);
      zones.prayerDoorCollider = null;
    }
    if (animate && firstUnlock) {
      showMilestoneCutscene({
        emoji: "🙏",
        title: "20 Members!",
        subtitle: "The Prayer Room is Unlocked",
        verse: `"Where two or three gather in My name, there am I with them."\n— Matthew 18:20`,
        accent: "#FFD700",
      });
    }
  }
  // Reveal the bonus front-row pews once the basic 8 (24 seats) fill up.
  if (count >= 24 && zones.extraPews) {
    zones.extraPews.forEach(p => p.visible = true);
    if (animate) showToast("⛪ 24 Members! Extra Pews Added!");
  }
  if (count >= 50 && zones.expansionBarrier) {
    const wasVisible = zones.expansionBarrier.visible;
    zones.expansionBarrier.visible = false;
    // Also remove the barrier's physics collider — otherwise the wall is
    // invisible but the player still bounces off it and can't enter the
    // Children's Wing.
    if (zones.expansionBarrierCollider && zones.colliders) {
      const i = zones.colliders.indexOf(zones.expansionBarrierCollider);
      if (i !== -1) zones.colliders.splice(i, 1);
      zones.expansionBarrierCollider = null;
    }
    if (zones.lockSprite) zones.lockSprite.visible = false;
    if (animate && wasVisible) showToast("🏗️ 50 Members! Children's Wing Unlocked!");
  }
  if (count >= 100 && animate) triggerRevival();
}

// Generic milestone cutscene — full-screen overlay with emoji, headline, scripture,
// and a soft golden glow. Auto-dismisses after a few seconds, or click to skip.
function showMilestoneCutscene({ emoji, title, subtitle, verse, accent = "#FFD700" }) {
  let overlay = document.getElementById("milestone-cutscene");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "milestone-cutscene";
    overlay.style.cssText =
      "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;" +
      "background:radial-gradient(circle at center,rgba(255,215,0,0.25),rgba(15,5,32,0.9) 70%);" +
      "z-index:60;opacity:0;transition:opacity 0.5s;cursor:pointer;backdrop-filter:blur(2px);";
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `
    <div style="text-align:center;font-family:'Fredoka One',cursive;color:#fff;padding:24px;
      animation:cutsceneIn 0.7s ease-out;">
      <div style="font-size:96px;line-height:1;filter:drop-shadow(0 0 24px ${accent});">${emoji}</div>
      <div style="font-size:48px;color:${accent};margin-top:12px;text-shadow:0 0 24px ${accent};">${title}</div>
      <div style="font-size:22px;color:#fff;margin-top:6px;">${subtitle}</div>
      <div style="margin-top:22px;max-width:480px;color:#e0d4f7;font-family:'Nunito',sans-serif;
        font-style:italic;font-size:16px;line-height:1.5;white-space:pre-line;">${verse}</div>
      <div style="margin-top:18px;color:#aaa;font-size:12px;font-family:'Nunito',sans-serif;">
        (click anywhere to continue)</div>
    </div>`;
  if (!document.getElementById("cutscene-anim-css")) {
    const s = document.createElement("style");
    s.id = "cutscene-anim-css";
    s.textContent = `@keyframes cutsceneIn {
      0% { transform: scale(0.6); opacity: 0; }
      60%{ transform: scale(1.08); opacity: 1; }
      100%{transform: scale(1);    opacity: 1; }
    }`;
    document.head.appendChild(s);
  }
  requestAnimationFrame(() => { overlay.style.opacity = "1"; });
  const dismiss = () => {
    overlay.style.opacity = "0";
    setTimeout(() => { overlay.style.display = "none"; }, 500);
    overlay.removeEventListener("click", dismiss);
    clearTimeout(timer);
  };
  overlay.style.display = "flex";
  overlay.addEventListener("click", dismiss);
  const timer = setTimeout(dismiss, 6000);
}

function triggerRevival() {
  const overlay = document.getElementById("revival-overlay");
  overlay.style.display = "flex";
  showToast("🔥 REVIVAL! 100 Members!");
  setTimeout(() => overlay.style.display = "none", 6000);
}

import { db, firebaseEnabled } from "./firebase.js";
import {
  ref, set, update, onValue, onDisconnect, serverTimestamp,
  runTransaction, push, query, limitToLast
} from "firebase/database";
import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { getVisitInfo } from "./worldSnapshot.js";
import { buildAppearance } from "./appearance.js";
import { applyOutfit } from "./outfits.js";

// Appearance fields broadcast for every player so remote viewers can
// render the exact same avatar the local player sees.
const APPEARANCE_KEYS = [
  "shirt", "pants", "skin",
  "hairStyle", "hairColor",
  "jacketOn", "jacketColor",
  "shoeColor", "handItem",
];
function pickAppearance(pData) {
  const out = {};
  for (const k of APPEARANCE_KEYS) {
    if (pData && pData[k] !== undefined) out[k] = pData[k];
  }
  return out;
}

let uid = null, playerRef = null, scene = null;
let remotePlayers = {}, lastUpdate = 0;
// Room (= host) UID: when visiting someone else's church we join their room
// (worlds/<hostUid>/players/...) instead of our own. When not visiting, the
// room is our own UID so other players visiting us land in the same room.
let roomUid = null;
let roomBase = "worlds/christlife";   // legacy global path for chat/membership

export function initMultiplayer(_scene, _uid, pData) {
  scene = _scene;
  uid = _uid;

  const visit = getVisitInfo();
  roomUid  = visit ? visit.hostUid : _uid;
  // Keep chat + membership tied to the church being rendered. Legacy global
  // path is used when we're in our own world with no UID (offline mode).
  roomBase = roomUid ? `worlds/${roomUid}` : "worlds/christlife";

  if (!firebaseEnabled) {
    // Offline mode: still drive the local membership/who-panel UI.
    document.getElementById("member-count").textContent =
      parseInt(localStorage.getItem("clw_members") || "12");
    updateMembershipBar(parseInt(localStorage.getItem("clw_members") || "12"));
    document.getElementById("chat-messages").innerHTML =
      '<div style="color:#888;font-style:italic;">Chat offline — configure Firebase in .env.local to enable.</div>';
    return;
  }

  playerRef = ref(db, `${roomBase}/players/${uid}`);

  // Fold the active outfit into the broadcast so remote viewers see the
  // same avatar (shirt/pants/skin/hair/jacket/shoes/handItem) the host
  // sees locally, not just a generic toon body with a shirt color.
  const fullAppearance = pickAppearance(applyOutfit(pData));

  set(playerRef, {
    name: pData.name,
    // Keep top-level `shirt` for the who-panel dot legacy code path.
    shirt: fullAppearance.shirt || pData.shirt,
    appearance: fullAppearance,
    x: 0, y: 0, z: -8, rotY: 0,
    visiting: !!visit,
    lastSeen: serverTimestamp()
  });
  onDisconnect(playerRef).remove();

  onValue(ref(db, `${roomBase}/players`), snap => {
    updateRemotePlayers(snap.val() || {});
    updateWhoPanel(snap.val() || {}, pData.name);
  });

  onValue(ref(db, `${roomBase}/membership/count`), snap => {
    const count = snap.val() || parseInt(localStorage.getItem("clw_members") || "12", 10);
    document.getElementById("member-count").textContent = count;
    updateMembershipBar(count);
  });

  initChat(pData.name);
}

export function updateMultiplayer(player) {
  if (!firebaseEnabled || !playerRef) return;
  const now = Date.now();
  if (now - lastUpdate < 100) return;
  lastUpdate = now;
  const p = player.group.position;
  update(playerRef, {
    x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2),
    rotY: +player.yaw.toFixed(3),
    lastSeen: serverTimestamp()
  });
}

function updateRemotePlayers(all) {
  const seen = new Set();
  Object.entries(all).forEach(([id, data]) => {
    if (id === uid) return;
    seen.add(id);
    if (!remotePlayers[id]) {
      remotePlayers[id] = createRemoteMesh(data);
      remotePlayers[id].appearanceKey = JSON.stringify(data.appearance || null);
    } else {
      // If the host swapped outfits / changed their character, rebuild
      // the remote mesh so we always mirror the current appearance.
      const key = JSON.stringify(data.appearance || null);
      if (key !== remotePlayers[id].appearanceKey) {
        scene.remove(remotePlayers[id].group);
        remotePlayers[id] = createRemoteMesh(data);
        remotePlayers[id].appearanceKey = key;
      } else {
        remotePlayers[id].group.position.lerp(
          new THREE.Vector3(data.x || 0, data.y || 0, data.z || 0), 0.2
        );
        remotePlayers[id].group.rotation.y = data.rotY || 0;
      }
    }
  });
  Object.keys(remotePlayers).forEach(id => {
    if (!seen.has(id)) { scene.remove(remotePlayers[id].group); delete remotePlayers[id]; }
  });
}

function createRemoteMesh(data) {
  const group = new THREE.Group();

  // Prefer the full broadcast appearance so the remote avatar matches
  // exactly what the host sees on their own device. Fall back to a
  // shirt-color-only minimal body for legacy records that pre-date the
  // appearance broadcast.
  const appearance = data.appearance && typeof data.appearance === "object"
    ? data.appearance
    : { shirt: data.shirt || "#4169E1" };
  buildAppearance(group, appearance);

  const div = document.createElement("div");
  div.style.cssText = "color:#4ECDC4;font-size:13px;font-family:'Nunito',sans-serif;" +
    "background:rgba(0,0,0,0.6);padding:2px 8px;border-radius:6px;pointer-events:none;";
  div.textContent = data.name || "Player";
  const label = new CSS2DObject(div);
  label.position.set(0, 2.6, 0);
  group.add(label);

  scene.add(group);
  return { group };
}

function updateWhoPanel(all, myName) {
  const list = document.getElementById("who-list");
  list.innerHTML = "";
  Object.values(all).forEach(p => {
    const div = document.createElement("div");
    div.className = "player-entry";
    div.innerHTML =
      `<div class="player-dot" style="background:${p.shirt || "#4169E1"}"></div>` +
      `<span>${p.name || "Player"}${p.name === myName ? " (you)" : ""}</span>`;
    list.appendChild(div);
  });
}

function updateMembershipBar(count) {
  const milestones = [20, 35, 50, 75, 100];
  const next = milestones.find(m => m > count) || 100;
  const prev = milestones[milestones.indexOf(next) - 1] || 12;
  const pct = Math.min(100, ((count - prev) / (next - prev)) * 100);
  document.getElementById("membership-fill").style.width = pct + "%";
  document.getElementById("membership-label").textContent =
    `Members: ${count} → Next: ${next}`;
}

export function pushMembership() {
  if (!firebaseEnabled) return;
  // Only the church owner mutates membership; visitors never bump someone
  // else's congregation counter.
  if (getVisitInfo()) return;
  const base = roomBase || "worlds/christlife";
  runTransaction(ref(db, `${base}/membership/count`), v => (v || 12) + 1);
}

/**
 * Accessors used by minigames that want to publish session state into
 * the same Firebase room as the rest of multiplayer (e.g. free-throw
 * leaderboards visible to everyone in this church).
 */
export function getRoomBase() { return roomBase || "worlds/christlife"; }
export function getMyUid()    { return uid; }

/**
 * Re-publish the local player's appearance (called by outfits.js when
 * the active outfit changes so other players see the swap live).
 */
export function publishAppearance(pData) {
  if (!firebaseEnabled || !playerRef || !pData) return;
  const fullAppearance = pickAppearance(applyOutfit(pData));
  update(playerRef, {
    shirt: fullAppearance.shirt || pData.shirt,
    appearance: fullAppearance,
    lastSeen: serverTimestamp()
  });
}

function initChat(playerName) {
  const base = roomBase || "worlds/christlife";
  onValue(query(ref(db, `${base}/chat`), limitToLast(20)), snap => {
    const msgs = snap.val() || {};
    const box = document.getElementById("chat-messages");
    box.innerHTML = "";
    Object.values(msgs).forEach(m => {
      const div = document.createElement("div");
      div.style.marginBottom = "4px";
      // text content for safety
      const nameSpan = document.createElement("span");
      nameSpan.style.cssText = "color:#FFD700;font-weight:700;";
      nameSpan.textContent = (m.name || "?") + ": ";
      const msgSpan = document.createElement("span");
      msgSpan.textContent = m.message || "";
      div.appendChild(nameSpan);
      div.appendChild(msgSpan);
      box.appendChild(div);
    });
    box.scrollTop = box.scrollHeight;
  });

  function sendChat() {
    const input = document.getElementById("chat-input");
    const text = input.value.trim();
    if (!text) return;
    push(ref(db, `${base}/chat`), {
      name: playerName, message: text, timestamp: serverTimestamp()
    });
    input.value = "";
  }

  document.getElementById("chat-send").addEventListener("click", sendChat);
  document.getElementById("chat-input").addEventListener("keydown", e => {
    if (e.code === "Enter") { e.stopPropagation(); sendChat(); }
  });
  window.addEventListener("keydown", e => {
    if (e.code === "Enter" &&
        document.activeElement !== document.getElementById("chat-input") &&
        document.getElementById("dialogue-box").style.display !== "block") {
      document.getElementById("chat-input").focus();
    }
  });
}

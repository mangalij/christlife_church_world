import { db, firebaseEnabled } from "./firebase.js";
import {
  ref, set, update, onValue, onDisconnect, serverTimestamp,
  runTransaction, push, query, limitToLast
} from "firebase/database";
import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";

let uid = null, playerRef = null, scene = null;
let remotePlayers = {}, lastUpdate = 0;

export function initMultiplayer(_scene, _uid, pData) {
  scene = _scene;
  uid = _uid;

  if (!firebaseEnabled) {
    // Offline mode: still drive the local membership/who-panel UI.
    document.getElementById("member-count").textContent =
      parseInt(localStorage.getItem("clw_members") || "12");
    updateMembershipBar(parseInt(localStorage.getItem("clw_members") || "12"));
    document.getElementById("chat-messages").innerHTML =
      '<div style="color:#888;font-style:italic;">Chat offline — configure Firebase in .env.local to enable.</div>';
    return;
  }

  playerRef = ref(db, `worlds/christlife/players/${uid}`);

  set(playerRef, {
    name: pData.name, shirt: pData.shirt,
    x: 0, y: 0, z: -8, rotY: 0,
    lastSeen: serverTimestamp()
  });
  onDisconnect(playerRef).remove();

  onValue(ref(db, "worlds/christlife/players"), snap => {
    updateRemotePlayers(snap.val() || {});
    updateWhoPanel(snap.val() || {}, pData.name);
  });

  onValue(ref(db, "worlds/christlife/membership/count"), snap => {
    const count = snap.val() || 12;
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
    if (!remotePlayers[id]) remotePlayers[id] = createRemoteMesh(data);
    else {
      remotePlayers[id].group.position.lerp(
        new THREE.Vector3(data.x || 0, data.y || 0, data.z || 0), 0.2
      );
      remotePlayers[id].group.rotation.y = data.rotY || 0;
    }
  });
  Object.keys(remotePlayers).forEach(id => {
    if (!seen.has(id)) { scene.remove(remotePlayers[id].group); delete remotePlayers[id]; }
  });
}

function createRemoteMesh(data) {
  const group = new THREE.Group();
  const shirt = parseInt((data.shirt || "#4169E1").replace("#", ""), 16);
  const mat = c => new THREE.MeshToonMaterial({ color: c });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1, 0.5), mat(shirt));
  torso.position.y = 1.2;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.6), mat(0xFFCBA4));
  head.position.y = 2.05;
  [-0.22, 0.22].forEach(x => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.9, 0.4), mat(0x333333));
    leg.position.set(x, 0.45, 0); group.add(leg);
  });
  [-0.6, 0.6].forEach(x => {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.85, 0.4), mat(shirt));
    arm.position.set(x, 1.2, 0); group.add(arm);
  });
  group.add(torso, head);

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
  runTransaction(ref(db, "worlds/christlife/membership/count"), v => (v || 12) + 1);
}

function initChat(playerName) {
  onValue(query(ref(db, "worlds/christlife/chat"), limitToLast(20)), snap => {
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
    push(ref(db, "worlds/christlife/chat"), {
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

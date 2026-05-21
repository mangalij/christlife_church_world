// Weekly leaderboards — pushes the player's current XP / member count
// / best trivia score to Firebase, and offers a HUD panel showing the
// top 10 from this week's window. The week id is derived from
// (year * 53 + ISO-week) so every Monday the boards reset themselves
// naturally; we keep writing under the same ISO-week key.
//
// If Firebase isn't configured the panel just shows a friendly
// "offline" notice — nothing crashes.

import { db, firebaseEnabled, auth } from "./firebase.js";

let _ref, _onValue, _set, _serverTimestamp, _query, _orderByChild, _limitToLast, _get;
let _firebaseImported = false;
let _myUid = null;
let _myName = "Player";
let _pendingWriteTimer = null;
let _panel = null;
let _panelTab = "xp";
let _topCache = { xp: [], members: [], triviaHigh: [] };

const TRIVIA_KEY = "clw_trivia_high";

// ---- Week key ------------------------------------------------------
function isoWeek(d = new Date()) {
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  return `${d.getFullYear()}-W${1 + Math.ceil((firstThursday - target) / 604800000)}`;
}

// ---- Firebase wiring (dynamic so we don't pay if disabled) ---------
async function ensureFirebaseImports() {
  if (_firebaseImported) return;
  const mod = await import("firebase/database");
  _ref = mod.ref;
  _onValue = mod.onValue;
  _set = mod.set;
  _serverTimestamp = mod.serverTimestamp;
  _query = mod.query;
  _orderByChild = mod.orderByChild;
  _limitToLast = mod.limitToLast;
  _get = mod.get;
  _firebaseImported = true;
}

function basePath() {
  return `worlds/christlife/leaderboards/${isoWeek()}`;
}

// ---- Snapshot writer -----------------------------------------------
async function pushSnapshot() {
  if (!firebaseEnabled || !_myUid) return;
  try {
    await ensureFirebaseImports();
    const xp = parseInt(localStorage.getItem("clw_xp") || "0");
    const members = parseInt(localStorage.getItem("clw_members") || "0");
    const triviaHigh = parseInt(localStorage.getItem(TRIVIA_KEY) || "0");
    await _set(_ref(db, `${basePath()}/${_myUid}`), {
      name: _myName,
      xp,
      members,
      triviaHigh,
      updatedAt: _serverTimestamp(),
    });
  } catch (err) {
    console.warn("Leaderboard write failed:", err);
  }
}

function schedulePush() {
  if (_pendingWriteTimer) return;     // debounce 4s so we batch rapid XP gains
  _pendingWriteTimer = setTimeout(() => { _pendingWriteTimer = null; pushSnapshot(); }, 4000);
}

// ---- Top-10 reader -------------------------------------------------
async function fetchTop(field) {
  if (!firebaseEnabled) return [];
  await ensureFirebaseImports();
  try {
    const q = _query(_ref(db, basePath()), _orderByChild(field), _limitToLast(10));
    const snap = await _get(q);
    const rows = [];
    snap.forEach(child => {
      const v = child.val();
      rows.push({ uid: child.key, name: v.name || "Player", value: v[field] || 0,
                  xp: v.xp || 0, members: v.members || 0, triviaHigh: v.triviaHigh || 0 });
    });
    rows.sort((a, b) => b.value - a.value);
    return rows;
  } catch (err) {
    console.warn("Leaderboard read failed:", err);
    return [];
  }
}

async function refreshTops() {
  if (!firebaseEnabled) return;
  _topCache.xp         = await fetchTop("xp");
  _topCache.members    = await fetchTop("members");
  _topCache.triviaHigh = await fetchTop("triviaHigh");
  if (_panel?.style.display === "block") renderPanel();
}

// ---- HUD button ----------------------------------------------------
function ensureButton() {
  if (document.getElementById("leaderboard-btn")) return;
  const hud = document.getElementById("hud-top") || document.body;
  const btn = document.createElement("button");
  btn.id = "leaderboard-btn";
  btn.textContent = "🏆";
  btn.title = "Weekly Leaderboards";
  btn.style.cssText =
    "background:rgba(20,10,40,0.78);border:1px solid #FFD700;color:#FFD700;" +
    "border-radius:8px;padding:4px 10px;margin-left:6px;cursor:pointer;font-size:18px;";
  btn.addEventListener("click", togglePanel);
  hud.appendChild(btn);
}

// ---- Panel ---------------------------------------------------------
function ensurePanel() {
  if (_panel) return _panel;
  const p = document.createElement("div");
  p.id = "leaderboard-panel";
  p.style.cssText =
    "position:fixed;top:90px;right:16px;width:340px;max-height:60vh;overflow-y:auto;" +
    "background:linear-gradient(135deg,rgba(40,20,80,0.96),rgba(20,10,40,0.96));" +
    "border:2px solid #FFD700;border-radius:14px;padding:14px;color:#fff;z-index:39;display:none;" +
    "font-family:'Nunito',sans-serif;box-shadow:0 8px 32px rgba(0,0,0,0.55);";
  document.body.appendChild(p);
  _panel = p;
  return p;
}

function togglePanel() {
  const p = ensurePanel();
  if (p.style.display === "block") { p.style.display = "none"; return; }
  p.style.display = "block";
  refreshTops().then(renderPanel);
  renderPanel();
}

function renderPanel() {
  const p = ensurePanel();
  if (!firebaseEnabled) {
    p.innerHTML = `
      <div style="text-align:center;">
        <h2 style="color:#FFD700;margin:0 0 8px 0;">🏆 Weekly Leaderboards</h2>
        <p style="color:#ddd;">Leaderboards need Firebase to be configured.</p>
        <button id="lb-close" style="margin-top:10px;padding:6px 16px;background:#2E0854;color:#fff;
          border:1px solid #7C3AED;border-radius:8px;cursor:pointer;font-family:inherit;">Close</button>
      </div>`;
    document.getElementById("lb-close")?.addEventListener("click", togglePanel);
    return;
  }
  const tabBtn = (key, label) => `<button data-tab="${key}" style="flex:1;padding:6px;background:${
    _panelTab === key ? "#7C3AED" : "#2E0854"};color:${_panelTab === key ? "#FFD700" : "#fff"};
    border:1px solid #7C3AED;border-radius:6px;cursor:pointer;font-family:inherit;font-size:12px;">
    ${label}</button>`;
  const list = _topCache[_panelTab] || [];
  const rows = list.length === 0
    ? `<p style="color:#888;text-align:center;padding:14px;">No entries yet this week.</p>`
    : list.map((r, i) => {
        const me = r.uid === _myUid;
        const colors = ["#FFD700", "#C0C0C0", "#CD7F32"];
        const rankColor = colors[i] || "#888";
        return `<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px solid #2A1850;
          ${me ? "background:rgba(255,215,0,0.08);" : ""}">
          <span style="color:${rankColor};font-weight:bold;width:24px;">#${i + 1}</span>
          <span style="flex:1;color:${me ? "#FFD700" : "#fff"};">${r.name}${me ? " (you)" : ""}</span>
          <span style="color:#A0E7E5;">${r.value.toLocaleString()}</span>
        </div>`;
      }).join("");
  p.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
      <h2 style="color:#FFD700;margin:0;font-family:'Fredoka One',cursive;font-size:18px;">
        🏆 Top of the Week
      </h2>
      <button id="lb-close" style="background:transparent;color:#FFD700;border:none;font-size:22px;
        cursor:pointer;">×</button>
    </div>
    <p style="color:#888;font-size:11px;margin:0 0 8px 0;">Week ${isoWeek()}</p>
    <div style="display:flex;gap:4px;margin-bottom:10px;">
      ${tabBtn("xp", "✨ XP")}${tabBtn("members", "👥 Members")}${tabBtn("triviaHigh", "❓ Trivia")}
    </div>
    <div>${rows}</div>
  `;
  document.getElementById("lb-close")?.addEventListener("click", togglePanel);
  p.querySelectorAll("button[data-tab]").forEach(b => {
    b.addEventListener("click", () => { _panelTab = b.getAttribute("data-tab"); renderPanel(); });
  });
}

// ---- Public --------------------------------------------------------
export async function initLeaderboards(uid, playerData) {
  _myUid = uid || (auth?.currentUser?.uid) || ("local-" + Math.random().toString(36).slice(2, 8));
  _myName = playerData?.name || localStorage.getItem("clw_player_name") || "Player";
  ensureButton();
  ensurePanel();
  if (firebaseEnabled) {
    pushSnapshot();
    // Periodically refresh in the background
    setInterval(refreshTops, 30000);
    setInterval(pushSnapshot, 60000);
  }
  // Hook into XP changes — listen on storage events too in case of multiple tabs
  window.addEventListener("clw-xp-changed", schedulePush);
  window.addEventListener("clw-members-changed", schedulePush);
  window.addEventListener("clw-trivia-changed", schedulePush);
  window.addEventListener("storage", e => {
    if (e.key === "clw_xp" || e.key === "clw_members" || e.key === TRIVIA_KEY) schedulePush();
  });
}

// growth.js can call this directly; we also fire the event from there for loose coupling.
export function notifyLeaderboardChange() { schedulePush(); }

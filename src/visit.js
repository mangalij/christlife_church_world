// ---------------------------------------------------------------------------
// visit.js
//
// UI + control flow for visiting another player's church.
//
//  - Adds a "Visit Church" button to the HUD
//  - Opens a modal listing churches published to Firebase
//  - Begins a visit by swapping localStorage + reloading
//  - When in visit mode, shows a banner with the host's name + Leave button
// ---------------------------------------------------------------------------

import { firebaseEnabled } from "./firebase.js";
import {
  subscribeToChurchCatalog,
  beginVisit,
  endVisit,
  getVisitInfo,
  isVisiting,
} from "./worldSnapshot.js";
import { showToast } from "./ui.js";

let panelEl = null;
let unsubscribeCatalog = null;
let currentList = [];
let mySelfUid = null;

export function initVisit(uid /*, pData */) {
  mySelfUid = uid;
  ensureStyles();
  ensureButton();
  ensureVisitBanner();
}

// -------- Visit banner (shown while visiting someone else's church) -------

function ensureVisitBanner() {
  const info = getVisitInfo();
  let banner = document.getElementById("visit-banner");
  if (!info) { if (banner) banner.style.display = "none"; return; }

  if (!banner) {
    banner = document.createElement("div");
    banner.id = "visit-banner";
    banner.innerHTML =
      `<span id="visit-banner-text"></span>` +
      `<button id="visit-leave-btn">Leave Visit</button>`;
    document.body.appendChild(banner);
    banner.querySelector("#visit-leave-btn").addEventListener("click", () => {
      endVisit();
    });
  }
  banner.querySelector("#visit-banner-text").textContent =
    `👋 Visiting ${info.hostName}'s "${info.churchName}"`;
  banner.style.display = "flex";
}

// -------- HUD button ------------------------------------------------------

function ensureButton() {
  if (document.getElementById("visit-church-btn")) return;
  const btn = document.createElement("button");
  btn.id = "visit-church-btn";
  btn.textContent = "🏛️ Visit";
  btn.title = "Visit another player's church";
  btn.addEventListener("click", openVisitPanel);
  document.body.appendChild(btn);

  if (!firebaseEnabled) {
    btn.disabled = true;
    btn.title = "Configure Firebase in .env.local to visit other churches";
    btn.style.opacity = "0.5";
    btn.style.cursor = "not-allowed";
  }
}

// -------- Modal panel -----------------------------------------------------

function openVisitPanel() {
  if (!firebaseEnabled) {
    showToast("Visiting requires Firebase to be configured.");
    return;
  }
  if (isVisiting()) {
    showToast("Leave your current visit first.");
    return;
  }

  if (panelEl) { panelEl.style.display = "flex"; refreshList(); return; }

  panelEl = document.createElement("div");
  panelEl.id = "visit-panel";
  panelEl.innerHTML = `
    <div class="visit-panel-inner">
      <button class="visit-close" aria-label="Close">✕</button>
      <h2>🏛️ Visit a Church</h2>
      <p class="visit-sub">Step into another player's church and worship together.</p>
      <div id="visit-list"><div class="visit-empty">Loading…</div></div>
    </div>`;
  document.body.appendChild(panelEl);

  panelEl.querySelector(".visit-close").addEventListener("click", closeVisitPanel);
  panelEl.addEventListener("click", e => { if (e.target === panelEl) closeVisitPanel(); });

  unsubscribeCatalog = subscribeToChurchCatalog(list => {
    currentList = list;
    renderList();
  });
}

function closeVisitPanel() {
  if (panelEl) panelEl.style.display = "none";
  if (unsubscribeCatalog) { unsubscribeCatalog(); unsubscribeCatalog = null; }
}

function refreshList() {
  if (!unsubscribeCatalog) {
    unsubscribeCatalog = subscribeToChurchCatalog(list => {
      currentList = list;
      renderList();
    });
  }
}

function renderList() {
  const host = panelEl?.querySelector("#visit-list");
  if (!host) return;
  const visitable = currentList.filter(c => c.uid !== mySelfUid);
  if (!visitable.length) {
    host.innerHTML = `<div class="visit-empty">No other churches published yet.<br>Invite a friend!</div>`;
    return;
  }
  host.innerHTML = "";
  for (const c of visitable) {
    const row = document.createElement("div");
    row.className = "visit-row";
    row.innerHTML = `
      <div class="visit-dot" style="background:${escapeAttr(c.shirt || "#7C3AED")}"></div>
      <div class="visit-meta">
        <div class="visit-church">${escapeHtml(c.churchName)}</div>
        <div class="visit-owner">by ${escapeHtml(c.ownerName || "Friend")} · 👥 ${c.members || 0}</div>
      </div>
      <button class="visit-go">Visit</button>`;
    row.querySelector(".visit-go").addEventListener("click", async () => {
      row.querySelector(".visit-go").disabled = true;
      row.querySelector(".visit-go").textContent = "Loading…";
      try {
        await beginVisit(c.uid, { ownerName: c.ownerName, churchName: c.churchName });
      } catch (err) {
        showToast(err.message || "Couldn't load that church.");
        row.querySelector(".visit-go").disabled = false;
        row.querySelector(".visit-go").textContent = "Visit";
      }
    });
    host.appendChild(row);
  }
}

// -------- Helpers ---------------------------------------------------------

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

// -------- Styles (injected once) ------------------------------------------

function ensureStyles() {
  if (document.getElementById("visit-styles")) return;
  const css = document.createElement("style");
  css.id = "visit-styles";
  css.textContent = `
    #visit-church-btn {
      position: absolute; top: 50px; right: 12px; z-index: 11;
      padding: 8px 14px; border: 1px solid #7C3AED; border-radius: 8px;
      background: rgba(20,10,40,0.85); color: #FFD700;
      font-family: 'Fredoka One', cursive; font-size: 14px; cursor: pointer;
    }
    #visit-church-btn:hover:not(:disabled) { background: #7C3AED; color: #fff; }

    #visit-banner {
      position: absolute; top: 50px; left: 50%; transform: translateX(-50%);
      z-index: 12; display: flex; align-items: center; gap: 12px;
      padding: 8px 14px; border: 1px solid #FFD700; border-radius: 10px;
      background: rgba(20,10,40,0.92); color: #FFD700;
      font-family: 'Nunito', sans-serif; font-size: 14px; font-weight: 700;
    }
    #visit-leave-btn {
      padding: 4px 10px; background: #FFD700; color: #1a0a2e;
      border: none; border-radius: 6px; cursor: pointer;
      font-family: 'Nunito', sans-serif; font-weight: 700; font-size: 12px;
    }
    #visit-leave-btn:hover { background: #fff; }

    #visit-panel {
      position: fixed; inset: 0; z-index: 45;
      background: rgba(10,5,20,0.92);
      display: flex; align-items: center; justify-content: center;
      padding: 20px;
    }
    .visit-panel-inner {
      background: #1a0a2e; border: 2px solid #7C3AED; border-radius: 16px;
      padding: 28px 24px; width: min(520px, 100%);
      max-height: 80vh; overflow-y: auto;
      color: #fff; position: relative;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
    }
    .visit-panel-inner h2 {
      color: #FFD700; font-family: 'Fredoka One', cursive;
      font-size: 22px; margin-bottom: 4px;
    }
    .visit-sub { color: #bbb; font-size: 13px; margin-bottom: 16px; }
    .visit-close {
      position: absolute; top: 10px; right: 14px;
      background: none; border: none; color: #ccc;
      font-size: 20px; cursor: pointer;
    }
    .visit-empty {
      color: #888; text-align: center; padding: 30px 10px;
      font-size: 14px; line-height: 1.5;
    }
    .visit-row {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 12px; margin-bottom: 8px;
      background: rgba(40,20,60,0.6); border-radius: 10px;
      border: 1px solid #2c1a4a;
    }
    .visit-dot {
      width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0;
      border: 2px solid rgba(255,255,255,0.2);
    }
    .visit-meta { flex: 1; min-width: 0; }
    .visit-church {
      font-family: 'Fredoka One', cursive; font-size: 16px; color: #FFD700;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .visit-owner { font-size: 12px; color: #aaa; }
    .visit-go {
      padding: 6px 14px; background: #7C3AED; color: #fff;
      border: none; border-radius: 8px; cursor: pointer;
      font-family: 'Nunito', sans-serif; font-weight: 700; font-size: 13px;
    }
    .visit-go:hover:not(:disabled) { background: #9d5cff; }
    .visit-go:disabled { opacity: 0.6; cursor: wait; }

    @media (max-width: 600px) {
      #visit-church-btn { top: auto; bottom: 70px; right: 8px;
        padding: 6px 10px; font-size: 12px; }
      #visit-banner { top: 8px; font-size: 12px; padding: 6px 10px; }
    }
  `;
  document.head.appendChild(css);
}

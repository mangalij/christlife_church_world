// Outfit / wardrobe system — gives the player a reason to keep leveling
// up Faith past the first few tiers. Each outfit overrides a subset of
// the appearance fields (shirt / pants / hairStyle / etc.) so the
// existing buildAppearance() pipeline stays the source of truth.
//
// Outfits unlock at Faith Level milestones. The chosen outfit is
// persisted in localStorage and applied on top of the player's base
// appearance every time they re-equip or the avatar rebuilds.

import { getFaithLevel } from "./faith.js";
import { buildAppearance } from "./appearance.js";
import { showToast } from "./ui.js";

const STORAGE_KEY = "clw_outfit";

// Each outfit's `overrides` is merged onto the player's base pData
// before buildAppearance runs. Leaving a field undefined keeps the
// player's customized color.
export const OUTFITS = [
  {
    id: "default",
    name: "Sunday Casual",
    emoji: "👕",
    description: "Your everyday church look.",
    unlockLevel: 1,
    overrides: {},          // no overrides — uses the player's character-creator choices
  },
  {
    id: "polo",
    name: "Polo & Jeans",
    emoji: "👖",
    description: "A clean polo shirt and comfortable jeans.",
    unlockLevel: 2,
    overrides: { shirt: "#3B82F6", pants: "#1E3A8A", shoeColor: "#5A3010", jacketOn: false },
  },
  {
    id: "suit",
    name: "Sharp Suit",
    emoji: "🤵",
    description: "A crisp black suit, white shirt, polished shoes.",
    unlockLevel: 5,
    overrides: { shirt: "#F5F5F5", pants: "#0A0A0A", jacketOn: true, jacketColor: "#0A0A0A", shoeColor: "#000000" },
  },
  {
    id: "gym",
    name: "Gym Clothes",
    emoji: "🏋️",
    description: "Tank top and athletic shorts — ready to move.",
    unlockLevel: 7,
    overrides: { shirt: "#EF4444", pants: "#1F2937", shoeColor: "#FFFFFF", jacketOn: false, hairStyle: "cap", hairColor: "#111111" },
  },
  {
    id: "hiphop",
    name: "Hip-Hop Style",
    emoji: "🎧",
    description: "Oversized jacket, baggy fit, fresh kicks.",
    unlockLevel: 10,
    overrides: { shirt: "#FBBF24", pants: "#1F1F1F", jacketOn: true, jacketColor: "#7C3AED", shoeColor: "#FFFFFF", hairStyle: "cap", hairColor: "#000000" },
  },
  {
    id: "choir",
    name: "Choir Robe",
    emoji: "🎶",
    description: "A flowing purple choir robe for special services.",
    unlockLevel: 15,
    overrides: { shirt: "#FFFFFF", pants: "#4C1D95", jacketOn: true, jacketColor: "#6D28D9", shoeColor: "#1a0a2e" },
  },
  {
    id: "missionary",
    name: "Missionary Khakis",
    emoji: "🌍",
    description: "Khaki shirt and trousers — ready to serve abroad.",
    unlockLevel: 20,
    overrides: { shirt: "#D6C8A0", pants: "#7A6A40", shoeColor: "#3B2810", jacketOn: false },
  },
  {
    id: "pastor",
    name: "Pastor's Robe",
    emoji: "⛪",
    description: "Solemn black robe with a white preaching collar.",
    unlockLevel: 25,
    overrides: { shirt: "#FFFFFF", pants: "#0A0A0A", jacketOn: true, jacketColor: "#0A0A0A", shoeColor: "#000000" },
  },
  {
    id: "radiance",
    name: "Holy Radiance",
    emoji: "✨",
    description: "Glow with golden glory — reserved for the most faithful.",
    unlockLevel: 50,
    overrides: { shirt: "#FFD700", pants: "#FFB300", jacketOn: true, jacketColor: "#FFE34D", shoeColor: "#FFD700", hairColor: "#FFD700" },
  },
];

// ---- Persistence ---------------------------------------------------
export function getActiveOutfitId() {
  return localStorage.getItem(STORAGE_KEY) || "default";
}

export function setActiveOutfit(id) {
  if (!OUTFITS.find(o => o.id === id)) return;
  localStorage.setItem(STORAGE_KEY, id);
}

export function getActiveOutfit() {
  return OUTFITS.find(o => o.id === getActiveOutfitId()) || OUTFITS[0];
}

// Merge the outfit's overrides onto the supplied base appearance data.
// `basePData` is the pristine character-creator data; we never mutate it.
export function applyOutfit(basePData) {
  const outfit = getActiveOutfit();
  return { ...basePData, ...outfit.overrides };
}

// ---- Module state --------------------------------------------------
let _player = null;
let _basePData = null;

function rebuildPlayer() {
  if (!_player || !_player.refreshOutfit) return;
  _player.refreshOutfit(applyOutfit(_basePData));
}

// ---- UI ------------------------------------------------------------
function ensureButton() {
  if (document.getElementById("outfit-btn")) return;
  const hud = document.getElementById("hud-top") || document.body;
  const btn = document.createElement("button");
  btn.id = "outfit-btn";
  btn.textContent = "👔";
  btn.title = "Wardrobe";
  btn.style.cssText =
    "background:rgba(20,10,40,0.78);border:1px solid #FFD700;color:#FFD700;" +
    "border-radius:8px;padding:4px 10px;margin-left:6px;cursor:pointer;font-size:18px;";
  btn.addEventListener("click", openWardrobe);
  hud.appendChild(btn);
}

function openWardrobe() {
  const level = getFaithLevel();
  const activeId = getActiveOutfitId();

  const cards = OUTFITS.map(o => {
    const locked = level < o.unlockLevel;
    const isActive = o.id === activeId;
    return `<div data-outfit="${o.id}" style="
      background:${isActive ? "rgba(255,215,0,0.12)" : "#1a0a2e"};
      border:2px solid ${isActive ? "#FFD700" : locked ? "#444" : "#7C3AED"};
      border-radius:10px;padding:10px;display:flex;flex-direction:column;
      align-items:center;text-align:center;cursor:${locked ? "not-allowed" : "pointer"};
      opacity:${locked ? "0.55" : "1"};min-height:130px;justify-content:space-between;">
        <div>
          <div style="font-size:36px;line-height:1;">${o.emoji}</div>
          <div style="color:${isActive ? "#FFD700" : "#fff"};font-family:'Fredoka One',cursive;
            margin-top:4px;font-size:14px;">${o.name}</div>
          <div style="color:#aaa;font-size:11px;margin-top:4px;line-height:1.3;">${o.description}</div>
        </div>
        <div style="margin-top:8px;font-size:11px;color:${locked ? "#F87171" : "#A0E7E5"};">
          ${locked
            ? `🔒 Faith Lv.${o.unlockLevel}`
            : isActive
              ? "✓ Equipped"
              : `<button data-equip="${o.id}" style="padding:4px 10px;background:#7C3AED;color:#fff;
                  border:none;border-radius:6px;font-family:inherit;font-size:11px;cursor:pointer;">
                  Equip</button>`}
        </div>
    </div>`;
  }).join("");

  // We reuse the existing minigame-modal as a generic dialog container.
  const modal = document.getElementById("minigame-modal");
  const content = document.getElementById("minigame-content");
  if (!modal || !content) return;
  content.innerHTML = `
    <div style="text-align:center;padding:4px;">
      <h2 style="margin:0 0 4px 0;color:#FFD700;font-family:'Fredoka One',cursive;">👔 Wardrobe</h2>
      <p style="color:#A0E7E5;margin:0 0 12px 0;font-size:13px;">
        Faith Lv.${level} — unlock new outfits as you grow.
      </p>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));
        gap:10px;max-height:60vh;overflow-y:auto;padding:4px;">${cards}</div>
      <button id="outfit-close" style="margin-top:12px;padding:6px 18px;background:#2E0854;color:#fff;
        border:1px solid #7C3AED;border-radius:8px;cursor:pointer;font-family:inherit;">Close</button>
    </div>
  `;
  modal.style.display = "flex";

  content.querySelectorAll("button[data-equip]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const id = btn.getAttribute("data-equip");
      const outfit = OUTFITS.find(o => o.id === id);
      setActiveOutfit(id);
      rebuildPlayer();
      showToast(`${outfit.emoji} Equipped: ${outfit.name}`);
      openWardrobe();    // refresh the modal so the "Equipped" badge updates
    });
  });
  document.getElementById("outfit-close")?.addEventListener("click", () => {
    modal.style.display = "none";
  });
}

// ---- Public API ----------------------------------------------------
// Called from main.js after the player avatar is built. Remembers the
// player's base appearance so outfits can be applied non-destructively.
export function initOutfits(player, basePData) {
  _player = player;
  _basePData = { ...basePData };
  ensureButton();
  // Apply the saved outfit immediately on game start.
  rebuildPlayer();

  // When the Faith level changes, re-announce any newly unlocked outfits.
  let lastLevel = getFaithLevel();
  window.addEventListener("clw-xp-changed", () => {
    const cur = getFaithLevel();
    if (cur > lastLevel) {
      for (let lvl = lastLevel + 1; lvl <= cur; lvl++) {
        const newOnes = OUTFITS.filter(o => o.unlockLevel === lvl);
        for (const o of newOnes) {
          showToast(`${o.emoji} New outfit unlocked: ${o.name}!`);
        }
      }
      lastLevel = cur;
    }
  });
}

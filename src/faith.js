// Faith Level system — converts the player's lifetime XP into a visible
// level with a progress bar in the HUD, and exposes per-level perks that
// other systems read at runtime (cheaper aesthetics, faster garden growth,
// member chance on harvest, etc.).
//
// The XP curve is mildly exponential so the first few levels come fast
// (instant gratification) while higher tiers take real grinding.
//
//   level 1 →    0 XP   (you start here)
//   level 2 →  100 XP
//   level 3 →  250 XP   (+150)
//   level 4 →  450 XP   (+200)
//   level 5 →  700 XP   (+250)
//   ...      each tier costs +50 more than the last
//   level n →  sum_{k=1..n-1} (50 + 50*k)  = 50 * (n-1) * (n+2) / 2 - 50
//
// We don't bother with an inverse function — a single loop is plenty fast
// for the ~50 levels a player will ever realistically reach.

import { getXP } from "./growth.js";
import { showToast } from "./ui.js";

const STORAGE_LAST_LEVEL = "clw_faith_last_level";

// Returns total XP needed to *enter* a given level.
function xpForLevel(n) {
  if (n <= 1) return 0;
  let total = 0;
  for (let k = 1; k < n; k++) total += 50 + 50 * k;   // 100, 150, 200, 250...
  return total;
}

export function getFaithLevel(xp = getXP()) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

export function getLevelProgress(xp = getXP()) {
  const lvl     = getFaithLevel(xp);
  const baseXP  = xpForLevel(lvl);
  const nextXP  = xpForLevel(lvl + 1);
  const into    = xp - baseXP;
  const span    = nextXP - baseXP;
  return { level: lvl, into, span, ratio: Math.min(1, into / span), nextLevelAt: nextXP };
}

// ---- Perks read by other systems -----------------------------------
// Returns a multiplier applied to aesthetics purchase cost. Caps at 0.7.
export function aestheticsDiscount(level = getFaithLevel()) {
  return Math.max(0.7, 1 - 0.03 * (level - 1));     // 3% off per level
}

// Returns a multiplier on garden growth time. Caps at 0.5 (twice as fast).
export function gardenGrowthMultiplier(level = getFaithLevel()) {
  return Math.max(0.5, 1 - 0.04 * (level - 1));     // 4% faster per level
}

// Chance (0..1) that a garden harvest also adds a church member.
export function gardenMemberChance(level = getFaithLevel()) {
  return Math.min(0.6, 0.05 + 0.025 * (level - 1)); // 5% at L1, +2.5% per level
}

// Returns a human-readable list of perks unlocked AT a given level — used
// in the level-up toast so the player feels rewarded.
export function newPerksAt(level) {
  const perks = [];
  if (level === 2)  perks.push("Aesthetics 3% cheaper");
  if (level === 3)  perks.push("Garden grows 8% faster");
  if (level === 5)  perks.push("NPCs say new lines");
  if (level === 7)  perks.push("Unlock weekly leaderboards");
  if (level === 10) perks.push("Garden harvests have a chance to bring a new member");
  if (level === 15) perks.push("Random events reward 50% more XP");
  if (level === 20) perks.push("Faith Veteran — golden name tag");
  if (level === 30) perks.push("Apostle status — choir sings when you enter");
  if (level % 5 === 0 && !perks.length) perks.push("+1% bonus to all rewards");
  return perks;
}

// ---- HUD bar -------------------------------------------------------
let _barEl = null, _labelEl = null, _fillEl = null;

function ensureBar() {
  if (_barEl) return _barEl;
  const wrap = document.createElement("div");
  wrap.id = "faith-bar";
  wrap.style.cssText =
    "position:absolute;top:75px;left:10px;width:200px;z-index:10;" +
    "background:rgba(20,10,40,0.78);border:1px solid #7C3AED;border-radius:8px;" +
    "padding:6px 10px;font-family:'Fredoka One',cursive;color:#FFD700;font-size:12px;" +
    "pointer-events:none;";
  wrap.innerHTML = `
    <div id="faith-label" style="display:flex;justify-content:space-between;align-items:center;">
      <span>✝️ Faith Lv.1</span>
      <span id="faith-xp-info" style="color:#A0E7E5;font-size:10px;font-family:'Nunito',sans-serif;">0 / 100</span>
    </div>
    <div style="height:6px;background:#1a0a2e;border-radius:3px;margin-top:4px;overflow:hidden;">
      <div id="faith-fill" style="height:100%;width:0%;background:linear-gradient(90deg,#7C3AED,#FFD700);
        border-radius:3px;transition:width 0.4s ease;"></div>
    </div>
  `;
  document.body.appendChild(wrap);
  _barEl   = wrap;
  _labelEl = wrap.querySelector("#faith-label > span");
  _fillEl  = wrap.querySelector("#faith-fill");
  return wrap;
}

export function refreshFaithBar() {
  ensureBar();
  const { level, into, span, ratio } = getLevelProgress();
  _labelEl.textContent = `✝️ Faith Lv.${level}`;
  _fillEl.style.width = `${(ratio * 100).toFixed(1)}%`;
  const info = _barEl.querySelector("#faith-xp-info");
  if (info) info.textContent = `${into} / ${span}`;
}

// Called by growth.js immediately after XP changes. Detects a level-up
// and shows a celebratory toast naming any unlocked perks.
export function onXPChanged() {
  refreshFaithBar();
  const lvl = getFaithLevel();
  const last = parseInt(localStorage.getItem(STORAGE_LAST_LEVEL) || "1");
  if (lvl > last) {
    localStorage.setItem(STORAGE_LAST_LEVEL, String(lvl));
    // Fire one toast per level crossed (rare, but possible on a big harvest).
    for (let n = last + 1; n <= lvl; n++) announceLevelUp(n);
  } else if (lvl < last) {
    // Could happen if XP was somehow decreased below the threshold.
    localStorage.setItem(STORAGE_LAST_LEVEL, String(lvl));
  }
}

function announceLevelUp(level) {
  const perks = newPerksAt(level);
  let msg = `🎉 Faith Level ${level}!`;
  if (perks.length) msg += ` — ${perks.join(", ")}`;
  showToast(msg);
  // Audio chime (lazy-imported to avoid circular dependency at startup).
  import("./audio.js").then(a => a.playLevelUp && a.playLevelUp()).catch(() => {});
  // Brief HUD flash
  const bar = ensureBar();
  bar.style.transition = "box-shadow 0.4s ease";
  bar.style.boxShadow = "0 0 20px #FFD700";
  setTimeout(() => { bar.style.boxShadow = "none"; }, 1200);
}

export function initFaith() {
  ensureBar();
  // Make sure we don't fire a phantom level-up on a fresh install where
  // the player legitimately reached Lv.X across sessions: snap the
  // "last level" to whatever they actually are now, then refresh.
  const lvl = getFaithLevel();
  if (!localStorage.getItem(STORAGE_LAST_LEVEL)) {
    localStorage.setItem(STORAGE_LAST_LEVEL, String(lvl));
  }
  refreshFaithBar();
}

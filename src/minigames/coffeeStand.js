import { openMinigameModal, showToast } from "../ui.js";
import { addXP, addMember } from "../growth.js";

// Drink menu — each grants a different perk.
const DRINKS = [
  { name: "House Drip",          emoji: "☕", price: 5,  desc: "Classic church coffee. Reliable, hot, blessed.",         boost: 8000,  xp: 5,  speed: 1.25 },
  { name: "Holy Roast Espresso", emoji: "⚡", price: 10, desc: "Double shot. The Spirit moves… fast.",                     boost: 6000,  xp: 8,  speed: 1.6  },
  { name: "Manna Mocha",         emoji: "🍫", price: 12, desc: "Chocolate + faith. Sweet boost, longer pull.",            boost: 12000, xp: 10, speed: 1.3  },
  { name: "Grace Latte",         emoji: "🥛", price: 10, desc: "Smooth oat milk, a cross drawn in foam.",                 boost: 10000, xp: 8,  speed: 1.25 },
  { name: "Living Water",        emoji: "💧", price: 0,  desc: "On the house. Refreshing. No boost — just blessing.",     boost: 0,     xp: 15, speed: 1    },
  { name: "Decaf Discernment",   emoji: "🌿", price: 6,  desc: "Calm, focused. No speed — bonus XP for wise choices.",    boost: 0,     xp: 20, speed: 1    },
];

function applyBoost(durationMs, mult) {
  if (durationMs > 0) {
    localStorage.setItem("clw_boost", Date.now() + durationMs);
    if (mult && mult !== 1) localStorage.setItem("clw_boost_mult", mult);
  }
}

// ---------- Entry: the two-option stand ----------
export function openCoffeeStand() {
  openMinigameModal(`
    <h2 style="color:#FFD700;font-family:'Fredoka One',cursive;margin-bottom:6px;">
      ☕ Church Coffee Stand</h2>
    <p style="color:#ccc;margin:0 0 16px;font-size:14px;">
      What can we get you?</p>
    <div style="display:flex;flex-direction:column;gap:12px;">
      <button id="cs-play" style="padding:18px;background:#7C3AED;color:#fff;border:none;
        border-radius:10px;font-size:16px;cursor:pointer;font-weight:bold;text-align:left;
        font-family:'Fredoka One',cursive;">
        🎯 Play "Perfect Pour"
        <div style="font-size:12px;font-weight:normal;color:#e9d5ff;margin-top:4px;
          font-family:'Nunito',sans-serif;">
          Stop the meter in the gold zone 3 times. Nail it for the perfect cup (+XP, big boost).</div>
      </button>
      <button id="cs-menu" style="padding:18px;background:#4A2C0A;color:#fff;border:none;
        border-radius:10px;font-size:16px;cursor:pointer;font-weight:bold;text-align:left;
        font-family:'Fredoka One',cursive;">
        📜 Order from the Menu
        <div style="font-size:12px;font-weight:normal;color:#f5deb3;margin-top:4px;
          font-family:'Nunito',sans-serif;">
          Pick a drink. Different brews give different perks.</div>
      </button>
      <button id="cs-cancel" style="padding:10px;background:#2a1a2a;color:#aaa;border:1px solid #555;
        border-radius:8px;font-size:13px;cursor:pointer;">Maybe later</button>
    </div>`);
  document.getElementById("cs-play").addEventListener("click", openPerfectPour);
  document.getElementById("cs-menu").addEventListener("click", openCoffeeMenu);
  document.getElementById("cs-cancel").addEventListener("click", closeModal);
}

function closeModal() {
  document.getElementById("minigame-modal").style.display = "none";
}

// ---------- Menu ----------
function openCoffeeMenu() {
  openMinigameModal(`
    <h2 style="color:#FFD700;font-family:'Fredoka One',cursive;margin-bottom:6px;">
      📜 Today's Menu</h2>
    <p style="color:#ccc;margin:0 0 14px;font-size:13px;">Choose your brew:</p>
    <div id="cs-list" style="display:flex;flex-direction:column;gap:8px;max-height:360px;overflow:auto;">
      ${DRINKS.map((d, i) => `
        <button data-i="${i}" class="cs-drink" style="display:flex;align-items:center;gap:12px;
          padding:12px;background:#1a0a2e;color:#fff;border:1px solid #553388;border-radius:8px;
          cursor:pointer;text-align:left;font-family:'Nunito',sans-serif;">
          <div style="font-size:30px;">${d.emoji}</div>
          <div style="flex:1;">
            <div style="font-family:'Fredoka One',cursive;color:#FFD700;font-size:15px;">
              ${d.name}</div>
            <div style="font-size:12px;color:#ccc;margin-top:2px;">${d.desc}</div>
          </div>
          <div style="color:#7C3AED;font-weight:bold;">+${d.xp} XP</div>
        </button>`).join("")}
    </div>
    <button id="cs-back" style="margin-top:12px;padding:10px;background:#2a1a2a;color:#aaa;
      border:1px solid #555;border-radius:8px;font-size:13px;cursor:pointer;width:100%;">← Back</button>`);
  document.querySelectorAll(".cs-drink").forEach(btn => {
    btn.addEventListener("click", () => {
      const i = parseInt(btn.dataset.i);
      const d = DRINKS[i];
      applyBoost(d.boost, d.speed);
      addXP(d.xp);
      const boostMsg = d.boost > 0 ? ` (boost ${Math.round(d.boost / 1000)}s)` : "";
      showToast(`${d.emoji} Enjoy your ${d.name}! +${d.xp} XP${boostMsg}`);
      closeModal();
    });
  });
  document.getElementById("cs-back").addEventListener("click", openCoffeeStand);
}

// ---------- Perfect Pour mini-game ----------
const STAGES = [
  { label: "Espresso Shot", color: "#3E1F0A" },
  { label: "Steamed Milk",  color: "#F5E6D3" },
  { label: "Foam Top",      color: "#FFFCF2" },
];

function openPerfectPour() {
  openMinigameModal(`
    <h2 style="color:#FFD700;font-family:'Fredoka One',cursive;margin-bottom:4px;">
      🎯 Perfect Pour</h2>
    <p style="color:#ccc;margin:0 0 12px;font-size:13px;">
      Stop the meter in the <span style="color:#FFD700;">gold zone</span>. 3 stages — don't spill!</p>
    <div id="pp-stage" style="color:#fff;font-size:15px;margin-bottom:8px;font-weight:bold;
      font-family:'Fredoka One',cursive;">Stage 1: ${STAGES[0].label}</div>

    <div id="pp-cup" style="width:140px;height:160px;margin:8px auto 14px;border:4px solid #fff;
      border-top:none;border-radius:0 0 60px 60px;background:#0a0520;position:relative;overflow:hidden;">
      <div id="pp-fill" style="position:absolute;left:0;right:0;bottom:0;height:0%;
        background:#3E1F0A;transition:height 0.25s ease-out;"></div>
    </div>

    <div id="pp-bar" style="position:relative;width:100%;height:36px;background:#1a0a2e;
      border:2px solid #553388;border-radius:8px;overflow:hidden;">
      <div id="pp-zone" style="position:absolute;top:0;bottom:0;background:linear-gradient(
        180deg,#FFD700,#FFA500);opacity:0.7;"></div>
      <div id="pp-marker" style="position:absolute;top:0;bottom:0;width:6px;
        background:#fff;left:0;box-shadow:0 0 8px #fff;"></div>
    </div>

    <div style="display:flex;gap:10px;margin-top:14px;">
      <button id="pp-stop" style="flex:1;padding:16px;background:#7C3AED;color:#fff;border:none;
        border-radius:10px;font-size:18px;cursor:pointer;font-weight:bold;
        font-family:'Fredoka One',cursive;">POUR! (Space)</button>
      <button id="pp-quit" style="padding:16px;background:#2a1a2a;color:#aaa;border:1px solid #555;
        border-radius:10px;font-size:13px;cursor:pointer;">Quit</button>
    </div>
    <div id="pp-score" style="margin-top:10px;color:#ccc;font-size:13px;text-align:center;">
      Hits: 0 / 3</div>`);

  let stage = 0;
  let hits = 0;
  let bestSoFar = 0;     // 2 = perfect, 1 = good, 0 = bad
  let stageScore = [];
  let active = true;
  let raf = null;
  let pos = 0;
  let dir = 1;
  let speed = 0.9;       // fraction of bar width per second

  const bar = document.getElementById("pp-bar");
  const marker = document.getElementById("pp-marker");
  const zone = document.getElementById("pp-zone");
  const fill = document.getElementById("pp-fill");
  const stageEl = document.getElementById("pp-stage");
  const scoreEl = document.getElementById("pp-score");

  // Place zone for current stage
  let zoneStart, zoneEnd, zoneWidth;
  function placeZone() {
    zoneWidth = 0.18 - stage * 0.04; // shrinks each stage: 0.18, 0.14, 0.10
    zoneStart = 0.15 + Math.random() * (0.85 - zoneWidth - 0.15);
    zoneEnd = zoneStart + zoneWidth;
    zone.style.left = (zoneStart * 100) + "%";
    zone.style.width = (zoneWidth * 100) + "%";
  }
  placeZone();

  let lastT = performance.now();
  function tick(now) {
    if (!active) return;
    const dt = (now - lastT) / 1000;
    lastT = now;
    pos += dir * speed * dt;
    if (pos >= 1) { pos = 1; dir = -1; }
    if (pos <= 0) { pos = 0; dir = 1; }
    marker.style.left = `calc(${pos * 100}% - 3px)`;
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  function judge() {
    if (!active) return;
    // 2 = perfect (inside zone), 1 = close (within half-zone-width), 0 = miss
    let result = 0;
    if (pos >= zoneStart && pos <= zoneEnd) result = 2;
    else {
      const d = pos < zoneStart ? zoneStart - pos : pos - zoneEnd;
      if (d < zoneWidth * 0.6) result = 1;
    }
    stageScore.push(result);
    if (result > 0) hits++;
    bestSoFar += result;

    // Visual: fill cup with stage color, proportional to result
    const heightPct = 33 * (stage + 1);
    fill.style.background = STAGES[stage].color;
    fill.style.height = (heightPct - (2 - result) * 6) + "%";

    stage++;
    if (stage >= STAGES.length) return finish();

    // Next stage
    speed += 0.25;            // gets faster each stage
    stageEl.textContent = `Stage ${stage + 1}: ${STAGES[stage].label}`;
    placeZone();
  }

  function finish() {
    active = false;
    cancelAnimationFrame(raf);
    cleanup();

    let resultText, xp, boostMs, mult, emoji, memberGain = 0;
    if (bestSoFar === 6) {
      // Perfect cup — the guest stays for service and joins the church
      resultText = "✨ PERFECT CUP! ✨"; xp = 30; boostMs = 14000; mult = 1.6; emoji = "☕"; memberGain = 1;
    } else if (bestSoFar >= 4) {
      resultText = "Great pour!";        xp = 18; boostMs = 9000;  mult = 1.35; emoji = "☕";
    } else if (bestSoFar >= 2) {
      resultText = "Lukewarm cup…";      xp = 8;  boostMs = 4000;  mult = 1.15; emoji = "\uD83E\uDD64";
    } else {
      resultText = "Spilled it everywhere!"; xp = 3; boostMs = 0; mult = 1; emoji = "\uD83D\uDCA6";
    }
    addXP(xp);
    if (memberGain > 0) addMember(memberGain);
    applyBoost(boostMs, mult);

    // Replace modal with result
    document.getElementById("minigame-content").innerHTML = `
      <h2 style="color:#FFD700;font-family:'Fredoka One',cursive;text-align:center;">
        ${emoji} ${resultText}</h2>
      <p style="color:#ccc;text-align:center;margin:14px 0;">
        Stage scores: ${stageScore.map(s => s === 2 ? "🟡" : s === 1 ? "🟠" : "⚪").join(" ")}<br>
        +${xp} XP${boostMs > 0 ? ` · Speed boost ${Math.round(boostMs / 1000)}s` : ""}
      </p>
      <div style="display:flex;gap:10px;">
        <button id="pp-again" style="flex:1;padding:12px;background:#7C3AED;color:#fff;border:none;
          border-radius:8px;font-size:14px;cursor:pointer;font-weight:bold;">Brew Another</button>
        <button id="pp-done" style="padding:12px 18px;background:#2a1a2a;color:#aaa;
          border:1px solid #555;border-radius:8px;font-size:13px;cursor:pointer;">Done</button>
      </div>`;
    document.getElementById("pp-again").addEventListener("click", openPerfectPour);
    document.getElementById("pp-done").addEventListener("click", closeModal);
  }

  // Hook up controls
  const stopBtn = document.getElementById("pp-stop");
  const quitBtn = document.getElementById("pp-quit");
  function onStop(e) { if (e) e.preventDefault(); judge(); }
  function onKey(e) { if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); judge(); } }
  function onQuit() { active = false; cancelAnimationFrame(raf); cleanup(); closeModal(); }

  stopBtn.addEventListener("click", onStop);
  stopBtn.addEventListener("touchstart", onStop, { passive: false });
  quitBtn.addEventListener("click", onQuit);
  window.addEventListener("keydown", onKey);

  function cleanup() {
    window.removeEventListener("keydown", onKey);
  }

  void bar; // (keep ref so future tweaks have it; suppress unused warning)
}

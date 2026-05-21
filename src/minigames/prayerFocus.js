import { openMinigameModal } from "../ui.js";
import { addXP, addMember } from "../growth.js";

// "Intercession" — prayer requests pop up around the board. Tap each one
// before its glow ring closes to lift it up to Heaven. Chain prayers in a
// row to build a streak multiplier. Lasts 45 seconds.
export function openPrayerFocus() {
  const GAME_MS = 45000;
  const REQUESTS = [
    { emoji: "🏥", need: "Healing",      names: ["Sarah", "Brother James", "Grandma Ruth", "Pastor Tim"] },
    { emoji: "💼", need: "Job",          names: ["Marcus", "Elena", "David"] },
    { emoji: "👨‍👩‍👧", need: "Family",       names: ["The Lees", "The Garcias", "Aunt Mae"] },
    { emoji: "🕊️", need: "Peace",        names: ["Jordan", "A widow", "A stranger"] },
    { emoji: "🎓", need: "Guidance",     names: ["Tasha", "Young Eli", "A new convert"] },
    { emoji: "🙏", need: "Salvation",    names: ["A coworker", "A neighbor", "A friend"] },
    { emoji: "💔", need: "Heartbreak",   names: ["Rachel", "Sam", "Mia"] },
    { emoji: "🌍", need: "Missionaries", names: ["the Kims", "the field team", "Bro. Andre"] },
    { emoji: "🍞", need: "Provision",    names: ["A single mom", "The food pantry", "Carl"] },
    { emoji: "✝️", need: "Faith",         names: ["A doubter", "A backslider", "A seeker"] },
  ];

  openMinigameModal(`
    <h2 style="color:#FFD700;font-family:'Fredoka One',cursive;margin-bottom:4px;text-align:center;">
      🙏 Intercession</h2>
    <p style="color:#ccc;margin:0 0 10px;font-size:13px;text-align:center;">
      Prayer requests rise up. <strong>Tap each one</strong> before its halo fades to lift it to Heaven.
      Chain them for a streak bonus.</p>

    <div id="pi-board" style="position:relative;width:100%;height:340px;
      background:radial-gradient(ellipse at center,#2a1450 0%,#0a0420 100%);
      border:1px solid #553388;border-radius:10px;overflow:hidden;
      box-shadow:inset 0 0 40px #00000088;"></div>

    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;
      font-size:13px;color:#ccc;font-family:'Fredoka One',cursive;">
      <span>⏱ <span id="pi-time">45</span>s</span>
      <span>🙌 Lifted: <span id="pi-score" style="color:#FFD700;">0</span></span>
      <span>🔥 Streak: <span id="pi-streak" style="color:#FF8C00;">0</span></span>
    </div>

    <button id="pi-quit" style="margin-top:10px;padding:8px;background:#2a1a2a;color:#aaa;
      border:1px solid #555;border-radius:6px;font-size:12px;cursor:pointer;width:100%;">End Early</button>`);

  const board    = document.getElementById("pi-board");
  const timeEl   = document.getElementById("pi-time");
  const scoreEl  = document.getElementById("pi-score");
  const streakEl = document.getElementById("pi-streak");
  const quit     = document.getElementById("pi-quit");

  let active   = true;
  let lifted   = 0;
  let missed   = 0;
  let streak   = 0;
  let best     = 0;
  const startTime = performance.now();
  const tiles  = new Set();
  let spawnTimer = null;
  let tickTimer  = null;

  function pickRequest() {
    const r = REQUESTS[Math.floor(Math.random() * REQUESTS.length)];
    const name = r.names[Math.floor(Math.random() * r.names.length)];
    return { emoji: r.emoji, need: r.need, name };
  }

  function spawnTile() {
    if (!active) return;
    const req = pickRequest();
    const W = board.clientWidth, H = board.clientHeight;
    const tileW = 130, tileH = 70;
    const x = Math.random() * Math.max(1, W - tileW);
    const y = Math.random() * Math.max(1, H - tileH);
    // Difficulty ramps: lifetime shrinks from 2.6s → 1.4s over the round.
    const elapsed = (performance.now() - startTime) / GAME_MS;
    const lifeMs  = 2600 - 1200 * Math.min(1, elapsed);

    const tile = document.createElement("div");
    tile.style.cssText = `
      position:absolute;left:${x}px;top:${y}px;width:${tileW}px;height:${tileH}px;
      background:linear-gradient(135deg,#3a1f6e,#1a0a3e);
      border:2px solid #FFD70088;border-radius:10px;
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      cursor:pointer;color:#fff;font-family:'Fredoka One',cursive;font-size:12px;
      box-shadow:0 0 18px #FFD70044, inset 0 0 12px #00000066;
      user-select:none;-webkit-tap-highlight-color:transparent;
      animation:pi-pop 0.25s ease-out;`;
    tile.innerHTML = `
      <div style="font-size:22px;line-height:1;">${req.emoji}</div>
      <div style="color:#FFD700;margin-top:2px;">${req.need}</div>
      <div style="color:#ccc;font-size:11px;font-family:sans-serif;">${req.name}</div>
      <div class="pi-halo" style="position:absolute;inset:-2px;border:2px solid #FFD700;
        border-radius:10px;opacity:1;pointer-events:none;
        transition:transform ${lifeMs}ms linear, opacity ${lifeMs}ms linear;"></div>`;

    const expireAt = performance.now() + lifeMs;
    const entry = { el: tile, expireAt };
    tiles.add(entry);
    board.appendChild(tile);

    // Trigger the halo shrink + fade.
    requestAnimationFrame(() => {
      const halo = tile.querySelector(".pi-halo");
      if (halo) { halo.style.transform = "scale(0.4)"; halo.style.opacity = "0"; }
    });

    tile.addEventListener("click", () => {
      if (!tiles.has(entry)) return;
      tiles.delete(entry);
      const remaining = (expireAt - performance.now()) / lifeMs; // 0..1, higher = earlier
      streak++;
      best = Math.max(best, streak);
      lifted++;
      // Base 10 pts, up to +5 for fast response, +1 per streak (capped at 10).
      const pts = 10 + Math.round(5 * Math.max(0, remaining)) + Math.min(10, streak);
      flashTile(tile, "lift", `+${pts}`);
      updateHud();
    });

    setTimeout(() => {
      if (!tiles.has(entry)) return;
      tiles.delete(entry);
      missed++;
      streak = 0;
      flashTile(tile, "miss", "missed");
      updateHud();
    }, lifeMs + 30);
  }

  function flashTile(tile, kind, text) {
    const color = kind === "lift" ? "#9CFF9C" : "#FF7C7C";
    tile.style.borderColor = color;
    tile.style.pointerEvents = "none";
    const tag = document.createElement("div");
    tag.textContent = text;
    tag.style.cssText = `position:absolute;left:50%;top:-2px;transform:translateX(-50%);
      color:${color};font-family:'Fredoka One',cursive;font-size:14px;
      text-shadow:0 1px 4px #000;animation:pi-rise 0.7s ease-out forwards;pointer-events:none;`;
    tile.appendChild(tag);
    setTimeout(() => { if (tile.parentNode) tile.parentNode.removeChild(tile); }, 600);
  }

  function updateHud() {
    scoreEl.textContent  = lifted;
    streakEl.textContent = streak;
  }

  function scheduleNextSpawn() {
    if (!active) return;
    const elapsed = (performance.now() - startTime) / GAME_MS;
    // Spawn cadence speeds up: 900ms → 380ms.
    const delay = 900 - 520 * Math.min(1, elapsed);
    spawnTimer = setTimeout(() => { spawnTile(); scheduleNextSpawn(); }, delay);
  }

  function tick() {
    if (!active) return;
    const remaining = Math.max(0, GAME_MS - (performance.now() - startTime));
    timeEl.textContent = Math.ceil(remaining / 1000);
    if (remaining <= 0) return finish();
    tickTimer = setTimeout(tick, 200);
  }

  function finish() {
    if (!active) return;
    active = false;
    clearTimeout(spawnTimer);
    clearTimeout(tickTimer);
    tiles.forEach(e => { if (e.el.parentNode) e.el.parentNode.removeChild(e.el); });
    tiles.clear();

    let title, xp, verse, memberGain = 0;
    if (lifted >= 25) {
      title = "🕊️ Mighty Intercessor"; xp = 60; memberGain = 2;
      verse = `"The prayer of a righteous person is powerful and effective." — James 5:16`;
    } else if (lifted >= 18) {
      title = "🙏 Faithful in Prayer";  xp = 45; memberGain = 1;
      verse = `"Devote yourselves to prayer, being watchful and thankful." — Colossians 4:2`;
    } else if (lifted >= 10) {
      title = "✨ Standing in the Gap";  xp = 30;
      verse = `"I sought the Lord, and He answered me." — Psalm 34:4`;
    } else if (lifted >= 4) {
      title = "🌱 A Quiet Start";        xp = 15;
      verse = `"Pray continually." — 1 Thessalonians 5:17`;
    } else {
      title = "💛 Keep Lifting Them Up"; xp = 8;
      verse = `"The Lord is near to all who call on Him." — Psalm 145:18`;
    }
    addXP(xp);
    if (memberGain > 0) addMember(memberGain);

    document.getElementById("minigame-content").innerHTML = `
      <h2 style="color:#FFD700;font-family:'Fredoka One',cursive;text-align:center;">${title}</h2>
      <div style="background:#1a0a2e;padding:14px;border-left:3px solid #FFD700;
        margin:14px 0;color:#e0d4f7;font-style:italic;text-align:center;">${verse}</div>
      <div style="display:flex;justify-content:space-around;color:#ccc;font-size:13px;
        font-family:'Fredoka One',cursive;margin:12px 0;">
        <span>🙌 Lifted: <strong style="color:#FFD700;">${lifted}</strong></span>
        <span>💨 Missed: <strong style="color:#FF7C7C;">${missed}</strong></span>
        <span>🔥 Best Streak: <strong style="color:#FF8C00;">${best}</strong></span>
      </div>
      <p style="color:#ccc;text-align:center;margin:0 0 14px;font-size:13px;">
        +${xp} XP${memberGain > 0 ? ` · 🏛️ +${memberGain} member${memberGain > 1 ? "s" : ""} (your prayers bore fruit!)` : ""}</p>
      <div style="display:flex;gap:10px;">
        <button id="pi-again" style="flex:1;padding:12px;background:#7C3AED;color:#fff;border:none;
          border-radius:8px;font-size:14px;cursor:pointer;font-weight:bold;">Pray Again</button>
        <button id="pi-done" style="padding:12px 18px;background:#2a1a2a;color:#aaa;
          border:1px solid #555;border-radius:8px;font-size:13px;cursor:pointer;">Amen</button>
      </div>`;
    document.getElementById("pi-again").addEventListener("click", openPrayerFocus);
    document.getElementById("pi-done").addEventListener("click", () => {
      document.getElementById("minigame-modal").style.display = "none";
    });
  }

  // Inject one-time keyframes for the pop/rise animations.
  if (!document.getElementById("pi-keyframes")) {
    const style = document.createElement("style");
    style.id = "pi-keyframes";
    style.textContent = `
      @keyframes pi-pop  { from { transform:scale(0.4); opacity:0; } to { transform:scale(1); opacity:1; } }
      @keyframes pi-rise { from { transform:translate(-50%,0); opacity:1; }
                            to  { transform:translate(-50%,-26px); opacity:0; } }`;
    document.head.appendChild(style);
  }

  quit.addEventListener("click", finish);

  // Kick things off after a short beat so the player can read the prompt.
  setTimeout(() => { if (active) { spawnTile(); scheduleNextSpawn(); } }, 600);
  tick();
}

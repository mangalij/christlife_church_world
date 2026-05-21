// Noah's Ark — survive the 40-day storm.
//
// A canvas-based side-scrolling dodge game opened by interacting with the
// courtyard fountain. The player steers the ark left/right (A/D or arrows
// on desktop, on-screen buttons on mobile) along a tossing sea while the
// storm hurls debris at them: lightning, rocks, driftwood logs, and
// whirlpools. The ark has 3 hearts. Survive the full storm to earn the
// best rewards; sinking ends the run early.
import { openMinigameModal } from "../ui.js";
import { addXP, addMember } from "../growth.js";
import { isMobile } from "../main.js";

const W = 420;            // canvas width
const H = 480;            // canvas height
const ARK_W = 78;
const ARK_H = 46;
const ARK_Y = H - 80;
const ARK_SPEED = 260;    // px/sec
const STORM_DURATION = 45; // seconds
const HEARTS_START = 3;
const HIT_INVUL_MS = 900;

// Obstacle catalogue. Each entry has a draw function and a hit radius.
const OBSTACLES = [
  { kind: "log",       w: 70, h: 18, color: "#6B3410", points: 5,  vy: 110 },
  { kind: "rock",      w: 44, h: 36, color: "#777",    points: 6,  vy: 130 },
  { kind: "whirlpool", w: 70, h: 70, color: "#1E90FF", points: 8,  vy: 90  },
  { kind: "lightning", w: 24, h: 90, color: "#FFD700", points: 10, vy: 260 },
];

export function openNoahsArk() {
  openMinigameModal(`
    <h2 style="color:#FFD700;font-family:'Fredoka One',cursive;margin-bottom:4px;text-align:center;">
      🌧️ Noah's Ark — Survive the Storm</h2>
    <p style="color:#aaa;font-size:12px;text-align:center;margin-bottom:8px;">
      ${isMobile
        ? "Tap LEFT / RIGHT to steer. Dodge rocks, logs, whirlpools, and lightning!"
        : "A / D or ← / → to steer. Dodge rocks, logs, whirlpools, and lightning!"}
    </p>
    <div style="display:flex;justify-content:space-between;align-items:center;
                color:#fff;font-size:13px;margin-bottom:6px;padding:0 4px;">
      <div id="na-hearts">❤️❤️❤️</div>
      <div id="na-timer">Day 0 / 40</div>
      <div id="na-score">0</div>
    </div>
    <canvas id="na-canvas" width="${W}" height="${H}"
      style="display:block;margin:0 auto;background:linear-gradient(180deg,#0a0a2a 0%,#1a3a6e 60%,#0a4a6e 100%);
             border-radius:8px;box-shadow:0 0 20px rgba(255,215,0,0.25);max-width:100%;"></canvas>
    ${isMobile ? `
    <div style="display:flex;gap:10px;margin-top:10px;">
      <button id="na-left"  style="flex:1;padding:18px;font-size:22px;background:#7C3AED;
        color:#fff;border:none;border-radius:8px;-webkit-tap-highlight-color:transparent;">⬅️</button>
      <button id="na-right" style="flex:1;padding:18px;font-size:22px;background:#7C3AED;
        color:#fff;border:none;border-radius:8px;-webkit-tap-highlight-color:transparent;">➡️</button>
    </div>` : ""}
    <p style="color:#777;font-size:11px;text-align:center;margin-top:8px;font-style:italic;">
      "And Noah did everything just as God commanded him." — Genesis 6:22</p>
  `);

  const cv = document.getElementById("na-canvas");
  const ctx = cv.getContext("2d");

  // ---- Game state ----
  let arkX = W / 2 - ARK_W / 2;
  let hearts = HEARTS_START;
  let score = 0;
  let elapsed = 0;
  let lastSpawn = 0;
  let lastInvulHit = -Infinity;
  let active = true;
  const debris = [];   // { x, y, vy, w, h, kind, color, points, rot, rotVel }
  const raindrops = Array.from({ length: 60 }, () => ({
    x: Math.random() * W, y: Math.random() * H,
    s: 4 + Math.random() * 6,
    v: 280 + Math.random() * 220,
  }));

  // ---- Input ----
  const keys = { left: false, right: false };
  const keyHandler = (e) => {
    if (!active) return;
    if (e.code === "KeyA" || e.code === "ArrowLeft")  keys.left  = true;
    if (e.code === "KeyD" || e.code === "ArrowRight") keys.right = true;
  };
  const keyUp = (e) => {
    if (e.code === "KeyA" || e.code === "ArrowLeft")  keys.left  = false;
    if (e.code === "KeyD" || e.code === "ArrowRight") keys.right = false;
  };
  window.addEventListener("keydown", keyHandler);
  window.addEventListener("keyup", keyUp);

  if (isMobile) {
    const lb = document.getElementById("na-left");
    const rb = document.getElementById("na-right");
    const hold = (btn, k) => {
      const on  = (e) => { e.preventDefault(); keys[k] = true; };
      const off = (e) => { e.preventDefault(); keys[k] = false; };
      btn.addEventListener("touchstart", on, { passive: false });
      btn.addEventListener("touchend",   off, { passive: false });
      btn.addEventListener("touchcancel", off, { passive: false });
      btn.addEventListener("mousedown", on);
      btn.addEventListener("mouseup",   off);
      btn.addEventListener("mouseleave", off);
    };
    hold(lb, "left");
    hold(rb, "right");
  }

  // ---- Spawn schedule (ramps up over time) ----
  function spawnInterval() {
    // Starts ~900ms, drops to ~280ms by the end of the storm.
    const t = Math.min(1, elapsed / STORM_DURATION);
    return 900 - t * 620;
  }
  function pickObstacle() {
    const t = Math.min(1, elapsed / STORM_DURATION);
    // Later in the storm, lightning becomes more common.
    const weights = [3, 3, 2, 1 + t * 4];
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return OBSTACLES[i];
    }
    return OBSTACLES[0];
  }
  function spawnOne() {
    const o = pickObstacle();
    const x = Math.random() * (W - o.w);
    debris.push({
      x, y: -o.h - 20,
      vy: o.vy + Math.random() * 40 + elapsed * 1.5,   // speed scales with time
      w: o.w, h: o.h,
      kind: o.kind, color: o.color, points: o.points,
      rot: 0, rotVel: (Math.random() - 0.5) * 4,
    });
  }

  // ---- Per-frame ----
  let lastFrame = performance.now();
  function frame(now) {
    if (!active) return;
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    elapsed += dt;
    score += dt * 4;  // base survival score

    // Steering
    if (keys.left)  arkX -= ARK_SPEED * dt;
    if (keys.right) arkX += ARK_SPEED * dt;
    arkX = Math.max(8, Math.min(W - ARK_W - 8, arkX));

    // Spawn
    lastSpawn += dt * 1000;
    if (lastSpawn > spawnInterval()) {
      lastSpawn = 0;
      spawnOne();
      // Lightning often comes in a brief pair.
      if (Math.random() < 0.2 + elapsed / 100) spawnOne();
    }

    // Move & collide
    const invul = (now - lastInvulHit) < HIT_INVUL_MS;
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i];
      d.y += d.vy * dt;
      d.rot += d.rotVel * dt;
      if (d.y > H + 40) {
        debris.splice(i, 1);
        score += d.points;        // survived = earn its points
        continue;
      }
      if (!invul && overlapsArk(d)) {
        hearts--;
        lastInvulHit = now;
        debris.splice(i, 1);
        if (hearts <= 0) { endGame(); return; }
      }
    }

    // Rain (cosmetic)
    for (const r of raindrops) {
      r.y += r.v * dt;
      if (r.y > H) { r.y = -10; r.x = Math.random() * W; }
    }

    draw(invul);
    updateHUD();

    if (elapsed >= STORM_DURATION) { winGame(); return; }
    requestAnimationFrame(frame);
  }

  function overlapsArk(d) {
    const ax1 = arkX, ay1 = ARK_Y, ax2 = arkX + ARK_W, ay2 = ARK_Y + ARK_H;
    // Shrink the obstacle's hitbox slightly to keep it feeling fair.
    const pad = 6;
    const dx1 = d.x + pad, dy1 = d.y + pad;
    const dx2 = d.x + d.w - pad, dy2 = d.y + d.h - pad;
    return !(dx2 < ax1 || dx1 > ax2 || dy2 < ay1 || dy1 > ay2);
  }

  // ---- Drawing ----
  function draw(invul) {
    // Sky / water gradient is the canvas bg. Draw a horizon and waves.
    ctx.clearRect(0, 0, W, H);

    // Distant lightning flashes during the worst of the storm
    const flashChance = Math.min(0.04, elapsed / 1500);
    if (Math.random() < flashChance) {
      ctx.fillStyle = "rgba(255,255,200,0.18)";
      ctx.fillRect(0, 0, W, H);
    }

    // Rain streaks
    ctx.strokeStyle = "rgba(180,210,255,0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const r of raindrops) {
      ctx.moveTo(r.x, r.y);
      ctx.lineTo(r.x - 2, r.y + r.s);
    }
    ctx.stroke();

    // Waves at the bottom for visual feel
    const t = elapsed * 2;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath();
    ctx.moveTo(0, H - 18);
    for (let x = 0; x <= W; x += 14) {
      ctx.lineTo(x, H - 18 + Math.sin(x * 0.05 + t) * 5);
    }
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
    ctx.fill();

    // Obstacles
    for (const d of debris) {
      ctx.save();
      ctx.translate(d.x + d.w / 2, d.y + d.h / 2);
      ctx.rotate(d.rot);
      drawObstacle(d);
      ctx.restore();
    }

    // The ark — blink when invulnerable after a hit.
    if (!(invul && Math.floor(performance.now() / 80) % 2)) {
      drawArk(arkX, ARK_Y);
    }
  }

  function drawObstacle(d) {
    const w = d.w, h = d.h;
    ctx.fillStyle = d.color;
    if (d.kind === "log") {
      ctx.beginPath();
      ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#3B1F08";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-w / 2 + 6, 0); ctx.lineTo(w / 2 - 6, 0);
      ctx.stroke();
    } else if (d.kind === "rock") {
      ctx.beginPath();
      ctx.moveTo(-w / 2, h / 4);
      ctx.lineTo(-w / 3, -h / 2);
      ctx.lineTo(w / 4, -h / 2);
      ctx.lineTo(w / 2, h / 3);
      ctx.lineTo(0, h / 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#5a5a5a";
      ctx.fillRect(-6, -8, 12, 4);
    } else if (d.kind === "whirlpool") {
      const grd = ctx.createRadialGradient(0, 0, 4, 0, 0, w / 2);
      grd.addColorStop(0, "#02324a");
      grd.addColorStop(0.6, "#1E90FF");
      grd.addColorStop(1, "rgba(30,144,255,0)");
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(0, 0, w / 2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#ffffff88";
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(0, 0, w / 2 - 6 - i * 8, i * 1.2, i * 1.2 + Math.PI * 1.4);
        ctx.stroke();
      }
    } else if (d.kind === "lightning") {
      ctx.fillStyle = "#FFD700";
      ctx.shadowColor = "#FFD700";
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(-4, -h / 2);
      ctx.lineTo(8, -h / 6);
      ctx.lineTo(-2, 4);
      ctx.lineTo(10, 12);
      ctx.lineTo(-6, h / 2);
      ctx.lineTo(2, 8);
      ctx.lineTo(-8, -4);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  function drawArk(x, y) {
    // Hull
    ctx.fillStyle = "#8B4513";
    ctx.beginPath();
    ctx.moveTo(x, y + 18);
    ctx.lineTo(x + 10, y + ARK_H);
    ctx.lineTo(x + ARK_W - 10, y + ARK_H);
    ctx.lineTo(x + ARK_W, y + 18);
    ctx.closePath();
    ctx.fill();
    // Hull planks
    ctx.strokeStyle = "#5a2c0a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 6, y + 28); ctx.lineTo(x + ARK_W - 6, y + 28);
    ctx.moveTo(x + 4, y + 36); ctx.lineTo(x + ARK_W - 4, y + 36);
    ctx.stroke();
    // Cabin
    ctx.fillStyle = "#A0522D";
    ctx.fillRect(x + 16, y + 4, ARK_W - 32, 16);
    // Roof
    ctx.fillStyle = "#7B3F00";
    ctx.beginPath();
    ctx.moveTo(x + 12, y + 4);
    ctx.lineTo(x + ARK_W / 2, y - 10);
    ctx.lineTo(x + ARK_W - 12, y + 4);
    ctx.closePath();
    ctx.fill();
    // Tiny animal silhouette
    ctx.fillStyle = "#fff";
    ctx.fillRect(x + ARK_W / 2 - 3, y + 8, 6, 4);
  }

  function updateHUD() {
    const heartsEl = document.getElementById("na-hearts");
    if (heartsEl) heartsEl.textContent = "❤️".repeat(Math.max(0, hearts))
                                       + "🖤".repeat(HEARTS_START - hearts);
    const tEl = document.getElementById("na-timer");
    if (tEl) {
      const day = Math.min(40, Math.floor((elapsed / STORM_DURATION) * 40));
      tEl.textContent = `Day ${day} / 40`;
    }
    const sEl = document.getElementById("na-score");
    if (sEl) sEl.textContent = Math.floor(score).toString();
  }

  function endGame() { finish(false); }
  function winGame() { finish(true); }

  function finish(survived) {
    if (!active) return;
    active = false;
    window.removeEventListener("keydown", keyHandler);
    window.removeEventListener("keyup", keyUp);

    let xp, members, title, subtitle, verse;
    if (survived) {
      xp = 70 + Math.floor(score / 4);
      members = 2 + (hearts >= 3 ? 1 : 0);
      title = "🌈 The Waters Receded";
      subtitle = `You weathered all 40 days! +${xp} XP · +${members} members`;
      verse = `"I have set my rainbow in the clouds…" — Genesis 9:13`;
    } else {
      const dayReached = Math.floor((elapsed / STORM_DURATION) * 40);
      xp = 15 + Math.floor(score / 6);
      members = 0;
      title = "🌊 The Ark Sank";
      subtitle = `You made it to Day ${dayReached}. +${xp} XP — try again!`;
      verse = `"Be strong and courageous." — Joshua 1:9`;
    }
    if (xp)      addXP(xp);
    if (members) addMember(members);

    document.getElementById("minigame-content").innerHTML = `
      <h2 style="color:#FFD700;font-family:'Fredoka One',cursive;text-align:center;">${title}</h2>
      <p style="font-size:48px;text-align:center;margin:14px 0;">${Math.floor(score)}</p>
      <p style="color:#ccc;text-align:center;font-size:14px;">${subtitle}</p>
      <p style="color:#888;text-align:center;font-style:italic;font-size:12px;margin-top:10px;">${verse}</p>
      <div style="display:flex;gap:10px;margin-top:18px;">
        <button id="na-again" style="flex:1;padding:12px;background:#7C3AED;color:#fff;border:none;
          border-radius:8px;font-size:14px;cursor:pointer;font-weight:bold;">Sail Again</button>
        <button id="na-back" style="flex:1;padding:12px;background:#444;color:#fff;border:none;
          border-radius:8px;font-size:14px;cursor:pointer;">Back to Church</button>
      </div>`;
    document.getElementById("na-again").addEventListener("click", openNoahsArk);
    document.getElementById("na-back").addEventListener("click", () => {
      document.getElementById("minigame-modal").style.display = "none";
    });
  }

  requestAnimationFrame(frame);
}

import { openMinigameModal } from "../ui.js";
import { addXP, addMember } from "../growth.js";

// "Church Hoops 1v1" — alternating-possession street ball vs Coach Marcus.
// Player offense: a power meter sweeps; press SPACE to shoot. A red
//   "defender" zone blocks part of the meter — stop the marker in the green
//   for a swish (+2), yellow for a bank (+1), red gets blocked, miss = brick.
// Player defense: Coach's release-timing meter sweeps. Press SPACE to
//   contest. A perfect contest in the green forces a miss; the yellow makes
//   Coach a bank shot; missing the window lets Coach drain a swish.
// First to 7 wins. Best-of-12 possessions hard cap.
export function openBasketballGame() {
  const TARGET = 7;
  const MAX_POSSESSIONS = 12;

  openMinigameModal(`
    <h2 style="color:#FFD700;font-family:'Fredoka One',cursive;margin-bottom:4px;text-align:center;">
      🏀 1v1 vs Coach Marcus</h2>
    <p style="color:#ccc;margin:0 0 10px;font-size:13px;text-align:center;">
      First to <strong style="color:#FFD700;">${TARGET}</strong> wins. Swish = 2, bank = 1.
      Press <strong>Space</strong> to shoot or contest.</p>

    <!-- Scoreboard -->
    <div style="display:flex;justify-content:space-between;align-items:center;
      background:#1a0a2e;border:1px solid #553388;border-radius:8px;padding:8px 14px;
      margin-bottom:8px;font-family:'Fredoka One',cursive;">
      <div style="text-align:center;">
        <div style="color:#9CFF9C;font-size:13px;">YOU</div>
        <div id="bb-you" style="color:#FFD700;font-size:26px;">0</div>
      </div>
      <div id="bb-poss" style="color:#FF8C00;font-size:14px;text-align:center;">
        Possession: YOU<br><span style="color:#aaa;font-size:11px;">Play 1</span>
      </div>
      <div style="text-align:center;">
        <div style="color:#FF7C7C;font-size:13px;">COACH</div>
        <div id="bb-coach" style="color:#FFD700;font-size:26px;">0</div>
      </div>
    </div>

    <!-- Court / animation stage -->
    <div id="bb-stage" style="position:relative;width:100%;height:220px;
      background:linear-gradient(180deg,#87CEEB 0%,#5BA8D8 60%,#3C3C42 60%,#3C3C42 100%);
      border:1px solid #553388;border-radius:10px;overflow:hidden;
      box-shadow:inset 0 0 30px #00000066;">
      <!-- Hoop on the right -->
      <div id="bb-pole" style="position:absolute;right:30px;bottom:0;width:6px;height:130px;background:#222;"></div>
      <div id="bb-board" style="position:absolute;right:18px;top:60px;width:50px;height:38px;
        background:#fff;border:2px solid #ddd;border-radius:3px;box-shadow:0 2px 4px #0006;">
        <div style="position:absolute;left:14px;top:10px;width:22px;height:14px;
          border:2px solid #CC2A2A;background:transparent;"></div>
      </div>
      <div id="bb-rim" style="position:absolute;right:6px;top:98px;width:34px;height:5px;
        background:#E65A2A;border-radius:3px;box-shadow:0 1px 2px #0008;"></div>
      <div id="bb-net" style="position:absolute;right:10px;top:103px;width:26px;height:22px;
        background:repeating-linear-gradient(180deg,#fff 0 2px,transparent 2px 4px);
        clip-path:polygon(0 0,100% 0,80% 100%,20% 100%);opacity:0.8;"></div>

      <!-- Player figure -->
      <div id="bb-player" style="position:absolute;left:18px;bottom:8px;width:30px;height:64px;
        font-size:42px;line-height:1;">🧍</div>
      <!-- Coach figure (defender on player's O, shooter on player's D) -->
      <div id="bb-coach-fig" style="position:absolute;left:90px;bottom:8px;width:30px;height:64px;
        font-size:42px;line-height:1;">🧑‍🏫</div>

      <!-- Ball -->
      <div id="bb-ball" style="position:absolute;left:50px;bottom:38px;width:22px;height:22px;
        border-radius:50%;background:radial-gradient(circle at 35% 35%,#FF8B4A,#A23A0A);
        box-shadow:0 2px 4px #0008, inset -3px -3px 4px #00000055;
        transition:left 0.55s ease-out, bottom 0.55s ease-out, transform 0.55s linear;"></div>

      <!-- Floating result tag -->
      <div id="bb-result" style="position:absolute;left:50%;top:14px;transform:translateX(-50%);
        color:#FFD700;font-family:'Fredoka One',cursive;font-size:22px;
        text-shadow:0 1px 4px #000;pointer-events:none;opacity:0;transition:opacity 0.2s;"></div>
    </div>

    <!-- Action meter (reused for offense + defense) -->
    <div id="bb-meter-label" style="margin-top:10px;color:#FFD700;font-size:12px;
      font-family:'Fredoka One',cursive;text-align:center;">Stop in the GREEN for a swish</div>
    <div id="bb-meter" style="position:relative;height:28px;margin-top:6px;
      background:#1a0a2e;border:1px solid #553388;border-radius:6px;overflow:hidden;">
      <div id="bb-bank" style="position:absolute;top:0;height:100%;background:#806020;"></div>
      <div id="bb-sweet" style="position:absolute;top:0;height:100%;background:#2E8B57;"></div>
      <!-- Defender shadow (only shown on offense — a red blocked zone) -->
      <div id="bb-defender" style="position:absolute;top:0;height:100%;
        background:repeating-linear-gradient(45deg,#8B1A1A 0 6px,#5A0F0F 6px 12px);
        opacity:0.85;display:none;"></div>
      <div style="position:absolute;inset:0;background:repeating-linear-gradient(90deg,
        transparent 0 9.9%,#0006 9.9% 10%);pointer-events:none;"></div>
      <div id="bb-marker" style="position:absolute;top:-3px;left:0;width:4px;height:34px;
        background:#FFD700;box-shadow:0 0 6px #FFD700;"></div>
    </div>

    <div style="display:flex;gap:8px;margin-top:10px;">
      <button id="bb-action" style="flex:1;padding:12px;background:#E65A2A;color:#fff;border:none;
        border-radius:8px;font-size:15px;cursor:pointer;font-weight:bold;">SHOOT (Space)</button>
      <button id="bb-quit" style="padding:12px 18px;background:#2a1a2a;color:#aaa;
        border:1px solid #555;border-radius:8px;font-size:13px;cursor:pointer;">Forfeit</button>
    </div>`);

  const stage    = document.getElementById("bb-stage");
  const marker   = document.getElementById("bb-marker");
  const sweet    = document.getElementById("bb-sweet");
  const bank     = document.getElementById("bb-bank");
  const defender = document.getElementById("bb-defender");
  const ball     = document.getElementById("bb-ball");
  const result   = document.getElementById("bb-result");
  const youEl    = document.getElementById("bb-you");
  const coachEl  = document.getElementById("bb-coach");
  const possEl   = document.getElementById("bb-poss");
  const meterLbl = document.getElementById("bb-meter-label");
  const actionBtn= document.getElementById("bb-action");
  const quitBtn  = document.getElementById("bb-quit");
  const coachFig = document.getElementById("bb-coach-fig");

  let active = true;
  let youScore = 0, coachScore = 0;
  let possession = "you";    // "you" | "coach"
  let plays = 0;
  let raf = null;
  let canAct = false;
  let swishes = 0, contests = 0;

  // Sweep state
  let sweepStart = 0;
  let sweepPeriod = 1100;
  let markerPct = 0;

  function setupOffense() {
    possession = "you";
    possEl.innerHTML = `Possession: <span style="color:#9CFF9C;">YOU</span><br>
      <span style="color:#aaa;font-size:11px;">Play ${plays + 1}</span>`;
    meterLbl.innerHTML = `Stop in <span style="color:#9CFF9C;">GREEN</span> for swish · 
      <span style="color:#FFD700;">YELLOW</span> = bank · 
      <span style="color:#FF7C7C;">RED</span> = blocked`;
    actionBtn.textContent = "SHOOT (Space)";
    actionBtn.style.background = "#E65A2A";

    const sweetW = Math.max(5, 9 - plays * 0.4);
    const sweetCenter = 35 + Math.random() * 30;
    sweet.style.display = "block";
    sweet.style.left  = (sweetCenter - sweetW / 2) + "%";
    sweet.style.width = sweetW + "%";
    const bankW = sweetW + 10;
    bank.style.display = "block";
    bank.style.left  = (sweetCenter - bankW / 2) + "%";
    bank.style.width = bankW + "%";
    // Defender block zone — placed away from the sweet spot
    defender.style.display = "block";
    const defW = 12 + Math.min(plays, 8) * 1.2;
    let defLeft;
    let tries = 0;
    do {
      defLeft = Math.random() * (100 - defW);
      tries++;
    } while (tries < 20 &&
      Math.abs((defLeft + defW / 2) - sweetCenter) < (defW / 2 + sweetW / 2 + 4));
    defender.style.left  = defLeft + "%";
    defender.style.width = defW + "%";

    sweepPeriod = Math.max(550, 1100 - plays * 55);

    ball.style.transition = "none";
    ball.style.left = "50px";
    ball.style.bottom = "38px";
    ball.style.transform = "rotate(0deg)";
    void ball.offsetHeight;
    ball.style.transition = "left 0.55s ease-out, bottom 0.55s ease-out, transform 0.55s linear";
    coachFig.style.left = "150px";

    canAct = true;
    sweepStart = performance.now();
    raf = requestAnimationFrame(animate);
  }

  function setupDefense() {
    possession = "coach";
    possEl.innerHTML = `Possession: <span style="color:#FF7C7C;">COACH</span><br>
      <span style="color:#aaa;font-size:11px;">Play ${plays + 1}</span>`;
    meterLbl.innerHTML = `Tap when marker hits <span style="color:#9CFF9C;">GREEN</span> 
      to contest the shot!`;
    actionBtn.textContent = "CONTEST (Space)";
    actionBtn.style.background = "#3A6EA5";

    const sweetW = Math.max(7, 12 - plays * 0.5);
    const sweetCenter = 30 + Math.random() * 40;
    sweet.style.display = "block";
    sweet.style.left  = (sweetCenter - sweetW / 2) + "%";
    sweet.style.width = sweetW + "%";
    const bankW = sweetW + 12;
    bank.style.display = "block";
    bank.style.left  = (sweetCenter - bankW / 2) + "%";
    bank.style.width = bankW + "%";
    defender.style.display = "none";

    sweepPeriod = Math.max(500, 1000 - plays * 50);

    coachFig.style.left = "90px";
    ball.style.transition = "none";
    ball.style.left = "120px";
    ball.style.bottom = "44px";
    ball.style.transform = "rotate(0deg)";
    void ball.offsetHeight;
    ball.style.transition = "left 0.55s ease-out, bottom 0.55s ease-out, transform 0.55s linear";

    canAct = true;
    sweepStart = performance.now();
    raf = requestAnimationFrame(animate);
  }

  function animate(now) {
    if (!active || !canAct) return;
    const t = ((now - sweepStart) % sweepPeriod) / sweepPeriod;
    markerPct = (t < 0.5 ? t * 2 : (1 - t) * 2) * 100;
    marker.style.left = `calc(${markerPct}% - 2px)`;
    raf = requestAnimationFrame(animate);
  }

  function actorAct() {
    if (!active || !canAct) return;
    canAct = false;
    cancelAnimationFrame(raf);

    const sLeft  = parseFloat(sweet.style.left);
    const sWidth = parseFloat(sweet.style.width);
    const bLeft  = parseFloat(bank.style.left);
    const bWidth = parseFloat(bank.style.width);
    const inGreen  = markerPct >= sLeft && markerPct <= sLeft + sWidth;
    const inYellow = !inGreen && markerPct >= bLeft && markerPct <= bLeft + bWidth;

    if (possession === "you") {
      const dLeft = parseFloat(defender.style.left);
      const dWidth = parseFloat(defender.style.width);
      const blocked = markerPct >= dLeft && markerPct <= dLeft + dWidth;
      if (blocked)        resolveShot("you", "blocked");
      else if (inGreen)   resolveShot("you", "swish");
      else if (inYellow)  resolveShot("you", "bank");
      else                resolveShot("you", "miss");
    } else {
      contests++;
      let outcome;
      if (inGreen)        outcome = "miss";   // perfectly contested
      else if (inYellow)  outcome = "bank";   // bothered
      else                outcome = "swish";  // wide open
      resolveShot("coach", outcome);
    }
  }

  function resolveShot(shooter, outcome) {
    const stageW = stage.clientWidth;
    const startLeft = shooter === "you" ? 50 : 120;
    const targetLeft = stageW - 70;
    const isMake = (outcome === "swish" || outcome === "bank");
    const targetBottom = isMake ? 95 : 30 + Math.random() * 20;
    const finalLeft = outcome === "bank"
      ? targetLeft + (Math.random() < 0.5 ? -10 : 10)
      : outcome === "blocked" ? startLeft + 40
      : targetLeft;

    ball.style.transition = "left 0.55s ease-out, bottom 0.28s ease-out, transform 0.55s linear";
    ball.style.left   = ((finalLeft + startLeft) / 2) + "px";
    ball.style.bottom = (outcome === "blocked" ? 80 : 160) + "px";
    ball.style.transform = "rotate(360deg)";
    setTimeout(() => {
      ball.style.transition = "left 0.32s ease-in, bottom 0.32s ease-in, transform 0.32s linear";
      ball.style.left   = finalLeft + "px";
      ball.style.bottom = targetBottom + "px";
      ball.style.transform = "rotate(720deg)";
    }, 280);

    setTimeout(() => {
      let pts = 0;
      let label = "", color = "#FFD700";
      if (outcome === "swish")        { pts = 2; label = "SWISH! +2"; color = "#9CFF9C"; }
      else if (outcome === "bank")    { pts = 1; label = "Bank! +1"; color = "#FFD700"; }
      else if (outcome === "blocked") { label = "BLOCKED!"; color = "#FF7C7C"; }
      else if (outcome === "miss")    { label = "Brick"; color = "#FF7C7C"; }

      if (shooter === "you") {
        if (pts > 0) youScore += pts;
        if (outcome === "swish") swishes++;
      } else {
        if (pts > 0) coachScore += pts;
        if (outcome === "miss")  { label = "Contested! Miss"; color = "#9CFF9C"; }
        if (outcome === "bank")  { label = "Bothered — bank"; color = "#FFD700"; }
        if (outcome === "swish") { label = "Coach drains it"; color = "#FF7C7C"; }
      }
      youEl.textContent = youScore;
      coachEl.textContent = coachScore;
      flashResult(label, color);

      plays++;
      if (youScore >= TARGET || coachScore >= TARGET || plays >= MAX_POSSESSIONS) {
        setTimeout(finish, 700);
        return;
      }
      setTimeout(() => {
        if (possession === "you") setupDefense();
        else setupOffense();
      }, 600);
    }, 640);
  }

  function flashResult(text, color) {
    result.textContent = text;
    result.style.color = color;
    result.style.opacity = "1";
    setTimeout(() => { result.style.opacity = "0"; }, 800);
  }

  function finish() {
    if (!active) return;
    active = false;
    cancelAnimationFrame(raf);
    cleanup();

    const won = youScore > coachScore;
    const tied = youScore === coachScore;
    let title, xp, memberGain = 0, verse;
    if (won && youScore >= TARGET) {
      title = "🏆 1v1 Champ"; xp = 60; memberGain = 2;
      verse = `"In all these things we are more than conquerors through Him who loved us." — Romans 8:37`;
    } else if (won) {
      title = "🎯 Edged It Out"; xp = 40; memberGain = 1;
      verse = `"I press on toward the goal to win the prize." — Philippians 3:14`;
    } else if (tied) {
      title = "🤝 Stalemate"; xp = 25;
      verse = `"Iron sharpens iron, and one man sharpens another." — Proverbs 27:17`;
    } else if (coachScore - youScore <= 2) {
      title = "💪 So Close"; xp = 20; memberGain = 1;
      verse = `"Let us not become weary in doing good." — Galatians 6:9`;
    } else {
      title = "🙏 Coach Schooled You"; xp = 10;
      verse = `"Humble yourselves before the Lord, and He will lift you up." — James 4:10`;
    }
    addXP(xp);
    if (memberGain > 0) addMember(memberGain);

    document.getElementById("minigame-content").innerHTML = `
      <h2 style="color:#FFD700;font-family:'Fredoka One',cursive;text-align:center;">${title}</h2>
      <div style="background:#1a0a2e;padding:14px;border-left:3px solid #FFD700;
        margin:14px 0;color:#e0d4f7;font-style:italic;text-align:center;">${verse}</div>
      <div style="display:flex;justify-content:space-around;color:#ccc;font-size:14px;
        font-family:'Fredoka One',cursive;margin:12px 0;">
        <span>YOU <strong style="color:#9CFF9C;font-size:22px;">${youScore}</strong></span>
        <span style="color:#888;">vs</span>
        <span>COACH <strong style="color:#FF7C7C;font-size:22px;">${coachScore}</strong></span>
      </div>
      <div style="display:flex;justify-content:space-around;color:#aaa;font-size:12px;
        font-family:'Nunito',sans-serif;margin:0 0 12px;">
        <span>🎯 Swishes: <strong style="color:#9CFF9C;">${swishes}</strong></span>
        <span>🛡️ Contests: <strong style="color:#3A6EA5;">${contests}</strong></span>
        <span>📋 Plays: <strong style="color:#FFD700;">${plays}</strong></span>
      </div>
      <p style="color:#ccc;text-align:center;margin:0 0 14px;font-size:13px;">
        +${xp} XP${memberGain > 0
          ? ` · 🏛️ +${memberGain} member${memberGain > 1 ? "s" : ""}`
          : ""}</p>
      <div style="display:flex;gap:10px;">
        <button id="bb-again" style="flex:1;padding:12px;background:#E65A2A;color:#fff;border:none;
          border-radius:8px;font-size:14px;cursor:pointer;font-weight:bold;">Rematch</button>
        <button id="bb-done" style="padding:12px 18px;background:#2a1a2a;color:#aaa;
          border:1px solid #555;border-radius:8px;font-size:13px;cursor:pointer;">Hit the Showers</button>
      </div>`;
    document.getElementById("bb-again").addEventListener("click", openBasketballGame);
    document.getElementById("bb-done").addEventListener("click", () => {
      document.getElementById("minigame-modal").style.display = "none";
    });
  }

  function onKey(e) {
    if (e.code !== "Space") return;
    e.preventDefault();
    actorAct();
  }
  function cleanup() {
    window.removeEventListener("keydown", onKey);
  }

  window.addEventListener("keydown", onKey);
  actionBtn.addEventListener("click", actorAct);
  quitBtn.addEventListener("click", finish);

  // Tip-off — player gets first possession
  setupOffense();
}

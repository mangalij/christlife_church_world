import { openMinigameModal } from "../ui.js";
import { addXP, addMember } from "../growth.js";
import { isMobile } from "../main.js";

export function openRhythmTap() {
  openMinigameModal(`
    <h2 style="color:#FFD700;font-family:'Fredoka One',cursive;margin-bottom:6px;">
      🎵 Worship Rhythm Tap</h2>
    <p style="color:#ccc;margin-bottom:10px;font-size:12px;">
      ${isMobile
        ? "Tap the colored buttons below when notes reach the line!"
        : "Press D · F · J · K when notes reach the bottom line!"}</p>
    <div id="rhythm-lanes" style="display:flex;gap:6px;height:240px;position:relative;
      background:#0a0520;border-radius:8px;overflow:hidden;padding:0 6px;">
      ${["#FF6B6B", "#4ECDC4", "#FFD700", "#A29BFE"].map((c, i) => `
        <div id="lane-${i}" style="flex:1;position:relative;border-right:1px solid #222;">
          <div style="position:absolute;bottom:36px;left:0;right:0;height:3px;
            background:${c};opacity:0.6;"></div>
          <div id="flash-${i}" style="position:absolute;inset:0;
            background:transparent;transition:background 0.08s;"></div>
        </div>`).join("")}
    </div>
    ${isMobile ? `
    <div id="tap-row" style="display:flex;gap:8px;margin-top:10px;">
      ${["#FF6B6B", "#4ECDC4", "#FFD700", "#A29BFE"].map((c, i) => `
        <div style="flex:1;height:60px;background:${c}22;border:2px solid ${c};
          border-radius:8px;display:flex;align-items:center;justify-content:center;
          color:${c};font-size:26px;cursor:pointer;-webkit-tap-highlight-color:transparent;"
          id="tap-btn-${i}">●</div>`).join("")}
    </div>` : ""}
    <div id="rhythm-score" style="margin-top:8px;color:#fff;font-size:13px;">
      Score: 0 | Time: 20s</div>`);

  const timings = [0.5, 0.8, 1.1, 1.5, 1.8, 2.2, 2.6, 3.0, 3.4, 3.7, 4.1, 4.5, 4.9, 5.3,
    5.7, 6.1, 6.6, 7.0, 7.4, 7.9, 8.3, 8.8, 9.2, 9.7, 10.2, 10.7, 11.2, 11.8, 12.3, 12.9];

  let score = 0, hits = 0, total = 0, noteIndex = 0, gameActive = true;
  const startTime = Date.now();
  const activeNotes = [];

  function spawnNote(lane) {
    const laneEl = document.getElementById(`lane-${lane}`);
    if (!laneEl) return;
    const note = document.createElement("div");
    note.style.cssText = `position:absolute;top:0;left:10%;width:80%;height:18px;
      background:${["#FF6B6B", "#4ECDC4", "#FFD700", "#A29BFE"][lane]};
      border-radius:4px;transition:top 1.8s linear;`;
    laneEl.appendChild(note);
    requestAnimationFrame(() => { note.style.top = "222px"; });
    const obj = { el: note, lane, spawnTime: Date.now(), hit: false };
    activeNotes.push(obj); total++;
    setTimeout(() => {
      if (!obj.hit) note.remove();
      const i = activeNotes.indexOf(obj); if (i > -1) activeNotes.splice(i, 1);
    }, 1900);
  }

  function flash(lane, color) {
    const f = document.getElementById(`flash-${lane}`);
    if (f) { f.style.background = color + "44"; setTimeout(() => f.style.background = "transparent", 100); }
  }

  function keyHit(lane) {
    if (!gameActive) return;
    const now = Date.now();
    const hit = activeNotes.find(n => n.lane === lane && !n.hit &&
      (now - n.spawnTime) > 1400 && (now - n.spawnTime) < 2000);
    if (hit) { hit.hit = true; hit.el.remove(); hits++; score += 10; flash(lane, "#FFD700"); }
    else flash(lane, "#FF6B6B");
    const el = document.getElementById("rhythm-score");
    if (el) el.textContent = `Score: ${score} | Time: ${
      Math.max(0, 20 - Math.floor((Date.now() - startTime) / 1000))}s`;
  }

  const keyMap = { KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3 };
  const keyHandler = e => { if (keyMap[e.code] !== undefined) keyHit(keyMap[e.code]); };
  window.addEventListener("keydown", keyHandler);

  if (isMobile) {
    [0, 1, 2, 3].forEach(i => {
      const btn = document.getElementById(`tap-btn-${i}`);
      if (btn) btn.addEventListener("touchstart", e => { e.preventDefault(); keyHit(i); },
        { passive: false });
    });
  }

  const interval = setInterval(() => {
    const elapsed = (Date.now() - startTime) / 1000;
    while (noteIndex < timings.length && timings[noteIndex] <= elapsed) {
      spawnNote(Math.floor(Math.random() * 4));
      noteIndex++;
    }
    const el = document.getElementById("rhythm-score");
    if (el) el.textContent = `Score: ${score} | Time: ${Math.max(0, Math.floor(20 - elapsed))}s`;
    if (elapsed >= 20) {
      clearInterval(interval); gameActive = false;
      window.removeEventListener("keydown", keyHandler);
      const acc = total > 0 ? Math.round((hits / total) * 100) : 0;
      const xp = Math.round(acc * 0.8);
      addXP(xp); if (acc >= 70) addMember(1);
      document.getElementById("minigame-content").innerHTML = `
        <h2 style="color:#FFD700;font-family:'Fredoka One',cursive;">Worship Complete! 🎵</h2>
        <p style="font-size:52px;margin:14px 0;">${acc}%</p>
        <p style="color:#ccc;">+${xp} XP${acc >= 70 ? " · +1 Member!" : ""}</p>
        <button id="rt-back"
          style="margin-top:14px;padding:12px 24px;background:#7C3AED;color:#fff;border:none;
          border-radius:8px;font-size:16px;cursor:pointer;">Back to Church</button>`;
      document.getElementById("rt-back").addEventListener("click", () => {
        document.getElementById("minigame-modal").style.display = "none";
      });
    }
  }, 50);
}

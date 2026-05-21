// Wheel of Blessings — a Wheel of Fortune-style phrase guessing game
// run by the church Greeter. The player spins the wheel for a dollar
// value, picks a consonant (revealed copies × spin value go into the
// round bank), buys vowels for $250 each, and tries to solve the
// puzzle. BANKRUPT zeroes the round bank; LOSE A TURN ends the round.
// Solving converts the total bank into XP + member rewards.

import { openMinigameModal, showToast } from "../ui.js";
import { addXP, addMember } from "../growth.js";

// ---- Wheel slices --------------------------------------------------
const WHEEL = [
  { type: "cash", value: 500,  color: "#1E88E5" },
  { type: "cash", value: 300,  color: "#43A047" },
  { type: "bankrupt",          color: "#000000", label: "BANKRUPT" },
  { type: "cash", value: 700,  color: "#7C3AED" },
  { type: "cash", value: 250,  color: "#FB8C00" },
  { type: "cash", value: 900,  color: "#E53935" },
  { type: "lose",              color: "#444444", label: "LOSE TURN" },
  { type: "cash", value: 350,  color: "#26A69A" },
  { type: "cash", value: 600,  color: "#8E24AA" },
  { type: "cash", value: 400,  color: "#FFD700" },
  { type: "cash", value: 1000, color: "#C2185B" },
  { type: "cash", value: 450,  color: "#00ACC1" },
];

const N = WHEEL.length;
const SLICE_RAD = (Math.PI * 2) / N;

// ---- Puzzle bank ---------------------------------------------------
const PUZZLES = [
  { category: "Bible Verse",  phrase: "FOR GOD SO LOVED THE WORLD" },
  { category: "Bible Verse",  phrase: "THE LORD IS MY SHEPHERD" },
  { category: "Bible Verse",  phrase: "BE STILL AND KNOW THAT I AM GOD" },
  { category: "Bible Verse",  phrase: "FAITH HOPE AND LOVE" },
  { category: "Bible Verse",  phrase: "IN THE BEGINNING WAS THE WORD" },
  { category: "Hymn",         phrase: "AMAZING GRACE HOW SWEET THE SOUND" },
  { category: "Hymn",         phrase: "HOW GREAT THOU ART" },
  { category: "Hymn",         phrase: "BLESSED ASSURANCE JESUS IS MINE" },
  { category: "Person",       phrase: "JOHN THE BAPTIST" },
  { category: "Person",       phrase: "MARY MAGDALENE" },
  { category: "Person",       phrase: "KING SOLOMON" },
  { category: "Person",       phrase: "THE APOSTLE PAUL" },
  { category: "Place",        phrase: "GARDEN OF GETHSEMANE" },
  { category: "Place",        phrase: "THE SEA OF GALILEE" },
  { category: "Place",        phrase: "THE UPPER ROOM" },
  { category: "Phrase",       phrase: "FRUIT OF THE SPIRIT" },
  { category: "Phrase",       phrase: "BREAD OF LIFE" },
  { category: "Phrase",       phrase: "THE GOOD SHEPHERD" },
  { category: "Phrase",       phrase: "FISHERS OF MEN" },
  { category: "Phrase",       phrase: "WALK BY FAITH NOT BY SIGHT" },
];

const VOWELS = new Set(["A", "E", "I", "O", "U"]);
const VOWEL_COST = 250;

// $100 banked ≈ 10 XP, plus a member bonus for big solves.
function payout(totalBank) {
  const xp = Math.max(15, Math.round(totalBank / 10));
  let mem = 1;
  if (totalBank >= 1500) mem = 2;
  if (totalBank >= 3000) mem = 3;
  return { xp, mem };
}

export function openWheelOfBlessings() {
  openMinigameModal("");
  const SIZE = 300;

  const puzzle = PUZZLES[Math.floor(Math.random() * PUZZLES.length)];
  const phrase = puzzle.phrase;

  document.getElementById("minigame-content").innerHTML = `
    <h2 style="color:#FFD700;font-family:'Fredoka One',cursive;margin:0 0 4px;text-align:center;">
      🎡 Wheel of Blessings</h2>
    <p style="color:#ccc;margin:0 0 8px;text-align:center;font-size:12px;">
      Spin, pick consonants, buy vowels, solve the puzzle!</p>

    <div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;justify-content:center;">
      <div style="position:relative;width:${SIZE}px;height:${SIZE + 26}px;flex:0 0 auto;">
        <div id="wob-pointer" style="position:absolute;top:0;left:50%;transform:translateX(-50%);
          width:0;height:0;border-left:11px solid transparent;border-right:11px solid transparent;
          border-top:20px solid #FFD700;z-index:2;
          filter:drop-shadow(0 2px 2px rgba(0,0,0,0.5));"></div>
        <canvas id="wob-canvas" width="${SIZE}" height="${SIZE}"
          style="position:absolute;top:20px;left:0;"></canvas>
      </div>

      <div style="flex:1 1 280px;min-width:260px;max-width:380px;">
        <div style="color:#aaa;font-size:11px;text-transform:uppercase;letter-spacing:1px;">
          Category</div>
        <div id="wob-category" style="color:#FFD700;font-family:'Fredoka One',cursive;
          font-size:17px;margin-bottom:6px;">${puzzle.category}</div>

        <div id="wob-board" style="background:#1a0a2e;border:2px solid #FFD700;border-radius:8px;
          padding:8px;min-height:70px;display:flex;flex-wrap:wrap;gap:4px;justify-content:center;
          align-content:center;"></div>

        <div style="display:flex;justify-content:space-around;margin-top:8px;color:#fff;
          font-family:'Nunito',sans-serif;font-size:13px;">
          <div>Round: <span id="wob-round" style="color:#FFD700;font-weight:bold;">$0</span></div>
          <div>Total: <span id="wob-total" style="color:#43E97B;font-weight:bold;">$0</span></div>
        </div>

        <div id="wob-status" style="min-height:20px;margin:6px 0 4px;color:#FFD700;
          font-family:'Fredoka One',cursive;font-size:13px;text-align:center;"></div>

        <div id="wob-actions" style="display:flex;gap:5px;justify-content:center;flex-wrap:wrap;
          margin-bottom:6px;">
          <button id="wob-spin" class="wob-btn"
            style="background:#7C3AED;box-shadow:0 3px 0 #4A1F8E;">SPIN</button>
          <button id="wob-vowel" class="wob-btn"
            style="background:#1E88E5;box-shadow:0 3px 0 #0D47A1;">VOWEL $${VOWEL_COST}</button>
          <button id="wob-solve" class="wob-btn"
            style="background:#43A047;box-shadow:0 3px 0 #1B5E20;">SOLVE</button>
        </div>

        <div id="wob-keyboard" style="display:grid;grid-template-columns:repeat(7,1fr);
          gap:3px;"></div>
      </div>
    </div>

    <style>
      .wob-btn { padding:7px 12px; color:#fff; border:none; border-radius:16px;
        font-family:'Fredoka One',cursive; font-size:12px; cursor:pointer;
        -webkit-tap-highlight-color:transparent; }
      .wob-btn:disabled { opacity:0.4; cursor:not-allowed; }
      .wob-key { padding:7px 0; background:#2d1b4e; color:#fff; border:1px solid #7C3AED;
        border-radius:5px; font-family:'Nunito',sans-serif; font-weight:bold; font-size:13px;
        cursor:pointer; -webkit-tap-highlight-color:transparent; }
      .wob-key:disabled { background:#1a1a1a; color:#555; border-color:#333; cursor:not-allowed; }
      .wob-key.vowel { background:#3a1a1a; border-color:#E53935; }
      .wob-key.vowel:disabled { background:#1a1a1a; color:#555; border-color:#333; }
    </style>`;

  const canvas = document.getElementById("wob-canvas");
  const ctx = canvas.getContext("2d");
  const boardEl = document.getElementById("wob-board");
  const keyboardEl = document.getElementById("wob-keyboard");
  const roundEl = document.getElementById("wob-round");
  const totalEl = document.getElementById("wob-total");
  const statusEl = document.getElementById("wob-status");
  const spinBtn = document.getElementById("wob-spin");
  const vowelBtn = document.getElementById("wob-vowel");
  const solveBtn = document.getElementById("wob-solve");

  // ---- State -------------------------------------------------------
  let angle = 0;
  let spinning = false;
  let aborted = false;
  let gameOver = false;
  let roundBank = 0;
  let totalBank = 0;
  let lastSpinValue = 0;
  // "spin": player may spin / buy vowel / solve
  // "consonant": waiting for the player to click a consonant after a cash spin
  // "vowel": waiting for the player to click a vowel after buying
  // "done": game over
  let phase = "spin";
  const guessed = new Set();

  buildBoard();
  buildKeyboard();
  drawWheel();
  setPhase("spin");
  setStatus("Press SPIN to start!");

  // ---- Button wiring ----------------------------------------------
  spinBtn.addEventListener("click", () => {
    if (spinning || gameOver || phase !== "spin") return;
    spin();
  });

  vowelBtn.addEventListener("click", () => {
    if (spinning || gameOver || phase !== "spin") return;
    const available = roundBank + totalBank;
    if (available < VOWEL_COST) {
      setStatus(`Need $${VOWEL_COST} to buy a vowel.`);
      return;
    }
    if (!hasUnguessedVowel()) {
      setStatus("No vowels left to buy.");
      return;
    }
    if (roundBank >= VOWEL_COST) {
      roundBank -= VOWEL_COST;
    } else {
      totalBank -= (VOWEL_COST - roundBank);
      roundBank = 0;
    }
    updateMoney();
    setPhase("vowel");
    setStatus("Pick a vowel.");
  });

  solveBtn.addEventListener("click", () => {
    if (spinning || gameOver || phase !== "spin") return;
    promptSolve();
  });

  const modal = document.getElementById("minigame-modal");
  const observer = new MutationObserver(() => {
    if (modal && modal.style.display === "none") {
      aborted = true;
      observer.disconnect();
    }
  });
  if (modal) observer.observe(modal, { attributes: true, attributeFilter: ["style"] });

  // ---- Phase / UI helpers -----------------------------------------
  function setPhase(p) {
    phase = p;
    spinBtn.disabled    = gameOver || p !== "spin";
    solveBtn.disabled   = gameOver || p !== "spin";
    vowelBtn.disabled   = gameOver || p !== "spin"
      || (roundBank + totalBank < VOWEL_COST) || !hasUnguessedVowel();

    keyboardEl.querySelectorAll("button").forEach(btn => {
      const letter = btn.dataset.letter;
      if (gameOver || guessed.has(letter)) { btn.disabled = true; return; }
      const isVowel = VOWELS.has(letter);
      if (p === "consonant") btn.disabled = isVowel;
      else if (p === "vowel") btn.disabled = !isVowel;
      else btn.disabled = true;
    });
  }

  function setStatus(msg) { statusEl.textContent = msg; }

  function updateMoney() {
    // "Round" = money at-risk this spin (lost on BANKRUPT or a wrong guess).
    // "Total" = live running winnings — includes the round bank so the
    // player sees the number tick up as they reveal consonants. Without
    // this, Total would sit at $0 until they actually SOLVE, which looks
    // like the totals aren't updating at all.
    roundEl.textContent = `$${roundBank}`;
    totalEl.textContent = `$${roundBank + totalBank}`;
  }

  function hasUnguessedVowel() {
    for (const v of VOWELS) if (!guessed.has(v) && phrase.includes(v)) return true;
    return false;
  }

  // ---- Board -------------------------------------------------------
  function buildBoard() {
    boardEl.innerHTML = "";
    const words = phrase.split(" ");
    words.forEach((word, wi) => {
      const wrap = document.createElement("div");
      wrap.style.cssText = "display:flex;gap:3px;margin:2px 3px;";
      for (const ch of word) {
        const tile = document.createElement("div");
        tile.dataset.letter = ch;
        tile.style.cssText = `width:20px;height:28px;display:flex;align-items:center;
          justify-content:center;font-family:'Fredoka One',cursive;font-size:16px;
          background:#fff;color:#1a0a2e;border-radius:3px;`;
        tile.textContent = "";
        wrap.appendChild(tile);
      }
      boardEl.appendChild(wrap);
      if (wi < words.length - 1) {
        const sp = document.createElement("div");
        sp.style.cssText = "width:6px;";
        boardEl.appendChild(sp);
      }
    });
  }

  function revealLetter(letter) {
    let count = 0;
    boardEl.querySelectorAll("div[data-letter]").forEach(tile => {
      if (tile.dataset.letter === letter) {
        tile.textContent = letter;
        count++;
      }
    });
    return count;
  }

  function revealAll() {
    boardEl.querySelectorAll("div[data-letter]").forEach(tile => {
      tile.textContent = tile.dataset.letter;
      tile.style.background = "#FFD700";
    });
  }

  function isFullyRevealed() {
    for (const tile of boardEl.querySelectorAll("div[data-letter]")) {
      if (/[A-Z]/.test(tile.dataset.letter) && !tile.textContent) return false;
    }
    return true;
  }

  // ---- Keyboard ----------------------------------------------------
  function buildKeyboard() {
    keyboardEl.innerHTML = "";
    for (let c = 65; c <= 90; c++) {
      const letter = String.fromCharCode(c);
      const btn = document.createElement("button");
      btn.className = "wob-key" + (VOWELS.has(letter) ? " vowel" : "");
      btn.textContent = letter;
      btn.dataset.letter = letter;
      btn.addEventListener("click", () => onLetterPick(letter));
      keyboardEl.appendChild(btn);
    }
  }

  function onLetterPick(letter) {
    if (gameOver || guessed.has(letter)) return;
    const isVowel = VOWELS.has(letter);
    if (phase === "consonant" && isVowel) return;
    if (phase === "vowel" && !isVowel) return;

    guessed.add(letter);
    const count = revealLetter(letter);

    if (phase === "consonant") {
      if (count > 0) {
        const won = count * lastSpinValue;
        roundBank += won;
        updateMoney();
        setStatus(`${count} × ${letter} — +$${won}! Spin, buy a vowel, or solve.`);
        if (isFullyRevealed()) return winRound();
        setPhase("spin");
      } else {
        setStatus(`No ${letter}'s. Round bank lost.`);
        loseTurn();
      }
    } else if (phase === "vowel") {
      if (count > 0) {
        setStatus(`${count} × ${letter}. Spin or solve.`);
        if (isFullyRevealed()) return winRound();
        setPhase("spin");
      } else {
        setStatus(`No ${letter}'s. Round bank lost.`);
        loseTurn();
      }
    }
  }

  // ---- Solve -------------------------------------------------------
  function promptSolve() {
    const ans = window.prompt(`Solve the puzzle! (${puzzle.category})`, "");
    if (ans === null) return;
    const norm = ans.trim().toUpperCase().replace(/\s+/g, " ");
    if (norm === phrase) {
      revealAll();
      winRound();
    } else {
      setStatus(`"${ans}" is not the phrase. Round bank lost.`);
      loseTurn();
    }
  }

  function winRound() {
    if (gameOver) return;
    gameOver = true;
    revealAll();
    totalBank += roundBank;
    roundBank = 0;
    updateMoney();
    const { xp, mem } = payout(totalBank);
    setStatus(`🎉 Solved! +${xp} XP and +${mem} Member${mem > 1 ? "s" : ""}`);
    showToast(`🎡 Blessing Solved! +${xp} XP, +${mem} Member${mem > 1 ? "s" : ""}`);
    if (xp) addXP(xp);
    if (mem) addMember(mem);
    finishGame();
  }

  // Wrong letter, BANKRUPT, LOSE A TURN, or bad solve — round bank
  // resets and the player goes back to spinning.
  function loseTurn() {
    roundBank = 0;
    updateMoney();
    if (isFullyRevealed()) return winRound();
    setPhase("spin");
  }

  function finishGame() {
    // Lock the puzzle interaction first, THEN re-enable just the
    // solve button as a "CLOSE" exit. setPhase("done") disables
    // every action button (including solve, because phase !== "spin"),
    // so we have to flip its disabled state back AFTER the phase
    // change — otherwise the player has no clickable way out and the
    // modal looks frozen after a correct solve.
    setPhase("done");
    spinBtn.disabled = true;
    vowelBtn.disabled = true;
    solveBtn.textContent = "CLOSE";
    solveBtn.style.background = "#43A047";
    solveBtn.disabled = false;
    solveBtn.onclick = () => {
      document.getElementById("minigame-modal").style.display = "none";
    };
  }

  // ---- Spin animation ---------------------------------------------
  function spin() {
    spinning = true;
    setStatus("Spinning...");
    spinBtn.disabled = true; vowelBtn.disabled = true; solveBtn.disabled = true;

    const startAngle = angle;
    const turns = 4 + Math.random() * 3;
    const landing = Math.random() * Math.PI * 2;
    const endAngle = startAngle + turns * Math.PI * 2 + landing;
    const DURATION = 3800;
    const startTime = performance.now();

    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

    function frame(now) {
      if (aborted) return;
      const t = Math.min(1, (now - startTime) / DURATION);
      angle = startAngle + (endAngle - startAngle) * easeOutCubic(t);
      drawWheel();
      if (t < 1) requestAnimationFrame(frame);
      else { spinning = false; finishSpin(); }
    }
    requestAnimationFrame(frame);
  }

  function finishSpin() {
    const pointerAngle = -Math.PI / 2;
    const rel = (pointerAngle - angle) % (Math.PI * 2);
    const normalized = (rel + Math.PI * 2) % (Math.PI * 2);
    const idx = Math.floor(normalized / SLICE_RAD) % N;
    const slice = WHEEL[idx];

    if (slice.type === "bankrupt") {
      roundBank = 0;
      updateMoney();
      setStatus("💀 BANKRUPT! Round bank wiped.");
      setPhase("spin");
      return;
    }
    if (slice.type === "lose") {
      setStatus("😬 LOSE A TURN!");
      setPhase("spin");
      return;
    }
    lastSpinValue = slice.value;
    // If no consonants remain in the puzzle, force a vowel buy / solve path.
    if (!hasUnguessedConsonantInPhrase()) {
      setStatus(`💰 $${slice.value}, but no consonants left. Buy a vowel or solve.`);
      setPhase("spin");
      return;
    }
    setStatus(`💰 $${slice.value}! Pick a consonant.`);
    setPhase("consonant");
  }

  function hasUnguessedConsonantInPhrase() {
    for (let c = 65; c <= 90; c++) {
      const ch = String.fromCharCode(c);
      if (VOWELS.has(ch)) continue;
      if (!guessed.has(ch) && phrase.includes(ch)) return true;
    }
    return false;
  }

  // ---- Rendering --------------------------------------------------
  function drawWheel() {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const r = Math.min(cx, cy) - 6;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.shadowColor = "rgba(255, 215, 0, 0.55)";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(0, 0, r + 2, 0, Math.PI * 2);
    ctx.fillStyle = "#1a0a2e";
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    for (let i = 0; i < N; i++) {
      const a0 = i * SLICE_RAD;
      const a1 = a0 + SLICE_RAD;
      const s = WHEEL[i];

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, a0, a1);
      ctx.closePath();
      ctx.fillStyle = s.color;
      ctx.fill();

      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.stroke();

      ctx.save();
      const mid = a0 + SLICE_RAD / 2;
      ctx.rotate(mid);
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      const textColor =
        s.color === "#FFD700" ? "#1a0a2e" :
        s.color === "#000000" ? "#FFD700" : "#fff";
      ctx.fillStyle = textColor;
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 3;
      if (s.type === "cash") {
        ctx.font = "bold 14px Nunito, sans-serif";
        ctx.fillText(`$${s.value}`, r - 8, 0);
      } else {
        ctx.font = "bold 9px Nunito, sans-serif";
        ctx.fillText(s.label, r - 6, 0);
      }
      ctx.restore();
    }

    // Hub
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fillStyle = "#FFD700";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#7C3AED";
    ctx.stroke();
    ctx.fillStyle = "#7C3AED";
    ctx.font = "bold 15px 'Fredoka One', cursive";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("✝", 0, 1);

    ctx.restore();
  }
}

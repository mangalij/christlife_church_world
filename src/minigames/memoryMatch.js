import { openMinigameModal } from "../ui.js";
import { addXP, addMember } from "../growth.js";
import { isMobile } from "../main.js";

const VERSES = [
  ["John 3:16a",  "For God so loved the world..."],
  ["Psalm 23:1",  "The Lord is my shepherd..."],
  ["Phil 4:13a",  "I can do all things through Christ..."],
  ["Jer 29:11a",  "For I know the plans I have for you..."],
  ["Rom 8:28a",   "In all things God works for good..."],
  ["Prov 3:5a",   "Trust in the Lord with all your heart..."],
  ["Matt 28:19a", "Go and make disciples of all nations..."],
  ["Josh 1:9a",   "Be strong and courageous..."],
];

export function openMemoryMatch() {
  const pairs = VERSES.map(([a, b], i) => [
    { id: i,     pair: i, text: a, flipped: false, matched: false },
    { id: i + 8, pair: i, text: b, flipped: false, matched: false }
  ]).flat().sort(() => Math.random() - 0.5);

  let flipped = [], lockBoard = false, matchCount = 0;
  const cols = isMobile ? 2 : 4;

  function render() {
    document.getElementById("minigame-content").innerHTML = `
      <h2 style="color:#FFD700;font-family:'Fredoka One',cursive;margin-bottom:14px;">
        📖 Memory Verse Match</h2>
      <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:8px;">
        ${pairs.map((card, idx) => `
          <div data-mm-idx="${idx}"
            style="height:${isMobile ? 100 : 80}px;border-radius:8px;cursor:pointer;
            display:flex;align-items:center;justify-content:center;text-align:center;
            font-size:11px;padding:6px;font-family:'Nunito',sans-serif;
            background:${card.matched ? "#1a4a1a" : card.flipped ? "#2E0854" : "#4a0080"};
            border:2px solid ${card.matched ? "#4CAF50" : card.flipped ? "#FFD700" : "#7C3AED"};
            color:${card.flipped || card.matched ? "#fff" : "transparent"};">
            ${card.flipped || card.matched ? card.text : "?"}</div>`).join("")}
      </div>
      <p style="margin-top:10px;color:#888;font-size:13px;">Matches: ${matchCount}/8</p>`;

    document.querySelectorAll("[data-mm-idx]").forEach(el => {
      el.addEventListener("click", () => flip(parseInt(el.dataset.mmIdx)));
    });
  }

  function flip(idx) {
    if (lockBoard) return;
    const card = pairs[idx];
    if (card.flipped || card.matched) return;
    card.flipped = true; flipped.push({ idx, card }); render();
    if (flipped.length === 2) {
      lockBoard = true;
      const [a, b] = flipped;
      setTimeout(() => {
        if (a.card.pair === b.card.pair) {
          a.card.matched = b.card.matched = true; matchCount++;
          if (matchCount === 8) {
            addXP(80); addMember(1);
            document.getElementById("minigame-content").innerHTML = `
              <h2 style="color:#FFD700;font-family:'Fredoka One',cursive;">All Matched! 🎉</h2>
              <p style="margin:16px 0;color:#ccc;">+80 XP · +1 Member!</p>
              <button id="mm-back"
                style="padding:12px 24px;background:#7C3AED;color:#fff;border:none;
                border-radius:8px;font-size:16px;cursor:pointer;">Back to Church</button>`;
            document.getElementById("mm-back").addEventListener("click", () => {
              document.getElementById("minigame-modal").style.display = "none";
            });
            return;
          }
        } else { a.card.flipped = b.card.flipped = false; }
        flipped = []; lockBoard = false; render();
      }, 900);
    }
  }

  openMinigameModal(""); render();
}

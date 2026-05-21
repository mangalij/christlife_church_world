// "Spot the Imposter" — a discernment minigame hosted in the Bible Study
// Room. Five members sit in a circle; one is a false christian (a wolf in
// sheep's clothing). The player asks them questions, compares their
// answers against Scripture in the Study panel, then makes an accusation.
//
//   Correct accusation → +60 XP and a verse toast.
//   Wrong  accusation → -25 XP and a "Test the spirits" warning.
//
// References:
//   "Test the spirits to see whether they are from God."  — 1 John 4:1
//   "Beware of false prophets... in sheep's clothing."   — Matthew 7:15

import { openMinigameModal, showToast } from "../ui.js";
import { addXP } from "../growth.js";

// ---- The five circle members ----------------------------------------
// Names + avatar colors. We pick one as the imposter per game.
const MEMBERS = [
  { name: "Anna",   color: "#FF6B6B" },
  { name: "Marcus", color: "#4ECDC4" },
  { name: "Lydia",  color: "#FFD700" },
  { name: "Caleb",  color: "#A29BFE" },
  { name: "Ruth",   color: "#6BCB77" },
];

// ---- Questions & answers --------------------------------------------
// Each question has multiple "true" answers (rotated among the faithful
// so they don't all sound identical) and a pool of "false" answers that
// the imposter draws from. The Study panel shows the Scripture standard
// the player should test answers against.
const QUESTIONS = [
  {
    id: "jesus",
    q: "Who is Jesus?",
    truth:
      "Jesus is the eternal Son of God — fully God and fully man — who died for our sins and rose again. (John 1:1, 14; Colossians 2:9)",
    trueAnswers: [
      "He is the Son of God, the Word made flesh — fully God and fully man.",
      "Jesus is God in the flesh. He died for our sins and rose on the third day.",
      "He is the Christ, the eternal Son sent by the Father to save us.",
    ],
    falseAnswers: [
      "Jesus was a wise moral teacher — one path among many to enlightenment.",
      "He was a great prophet, but not God. We follow his example more than his person.",
      "Jesus is a spiritual being who became divine through his good works.",
    ],
  },
  {
    id: "salvation",
    q: "How is a person saved?",
    truth:
      "We are saved by grace through faith in Jesus Christ alone — not by works, so no one can boast. (Ephesians 2:8-9; Romans 10:9)",
    trueAnswers: [
      "By grace, through faith in Jesus — it's God's gift, not something we earn.",
      "We trust in Christ's finished work. Faith saves; works are the fruit, not the root.",
      "Salvation is by faith in Jesus. He paid what we never could.",
    ],
    falseAnswers: [
      "We earn salvation by doing enough good deeds and following the right rules.",
      "If your good outweighs your bad on judgment day, you'll be fine.",
      "Salvation comes through secret knowledge that only the enlightened receive.",
    ],
  },
  {
    id: "bible",
    q: "What is the Bible?",
    truth:
      "The Bible is the inspired, inerrant Word of God — useful for teaching, correcting, and training in righteousness. (2 Timothy 3:16-17)",
    trueAnswers: [
      "It's the inspired Word of God — our authority for faith and life.",
      "Scripture is God-breathed. Every part trains us in righteousness.",
      "The Bible is God's Word — true, sufficient, and our standard.",
    ],
    falseAnswers: [
      "It's just one of many ancient holy books — stories meant to inspire us.",
      "The Bible is mostly myth. The Spirit speaks to each of us privately and we shouldn't lean on a book.",
      "Only the parts a modern teacher approves are still binding today.",
    ],
  },
  {
    id: "cross",
    q: "What happened on the cross?",
    truth:
      "Christ died for our sins, was buried, and rose again on the third day, according to the Scriptures. (1 Corinthians 15:3-4)",
    trueAnswers: [
      "Jesus took the punishment our sins deserved, died, and rose three days later.",
      "On the cross he bore our sin; in the resurrection he proved his victory.",
      "He died as our substitute and rose bodily — that's the gospel we preach.",
    ],
    falseAnswers: [
      "Jesus only appeared to die — he was rescued and traveled on to teach in other lands.",
      "The cross was a tragedy, not a payment. God forgives us simply because he is loving.",
      "Christ's death was symbolic — the real resurrection is just a feeling inside us.",
    ],
  },
];

// ---- Game state -----------------------------------------------------
let imposterIdx = 0;          // which member is the imposter
let imposterLies = new Set(); // set of question ids the imposter lies about
let asked = {};               // { memberName: { questionId: answerText } }
let aborted = false;

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function newGame() {
  imposterIdx = Math.floor(Math.random() * MEMBERS.length);
  imposterLies.clear();
  // The imposter lies about 2 of the 4 questions (so a single question
  // isn't always enough — the player has to test multiple answers).
  const shuffled = [...QUESTIONS].sort(() => Math.random() - 0.5);
  imposterLies.add(shuffled[0].id);
  imposterLies.add(shuffled[1].id);
  asked = {};
  MEMBERS.forEach(m => { asked[m.name] = {}; });
  aborted = false;
}

// What does `memberIdx` say when asked `questionId`? Cached so a member's
// story stays consistent within a game (otherwise the imposter could just
// be asked the same question twice and "change" their answer).
function answerFor(memberIdx, questionId) {
  const m = MEMBERS[memberIdx];
  const cache = asked[m.name];
  if (cache[questionId]) return cache[questionId];
  const q = QUESTIONS.find(x => x.id === questionId);
  const isLie = (memberIdx === imposterIdx) && imposterLies.has(questionId);
  const ans = pickRandom(isLie ? q.falseAnswers : q.trueAnswers);
  cache[questionId] = ans;
  return ans;
}

// ---- Rendering ------------------------------------------------------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function memberCardHtml(m, i, askedCount) {
  return (
    `<button class="imp-member" data-imp-idx="${i}" ` +
    `style="display:flex;align-items:center;gap:10px;padding:10px 12px;margin:6px 0;width:100%;` +
    `border:2px solid #7C3AED;border-radius:10px;background:#2E0854;color:#fff;cursor:pointer;` +
    `font-family:'Nunito',sans-serif;text-align:left;">` +
    `<span style="display:inline-block;width:28px;height:28px;border-radius:50%;background:${m.color};` +
    `border:2px solid #fff;flex-shrink:0;"></span>` +
    `<span style="flex:1;font-size:15px;">${escapeHtml(m.name)}</span>` +
    `<span style="font-size:12px;color:#bbb;">${askedCount}/4 asked</span>` +
    `</button>`
  );
}

function renderLobby() {
  const askedCounts = MEMBERS.map(m => Object.keys(asked[m.name]).length);
  const html =
    `<h2 style="color:#FFD700;font-family:'Fredoka One',cursive;margin:0 0 6px 0;">` +
    `\uD83D\uDD75\uFE0F Spot the Imposter</h2>` +
    `<p style="color:#ddd;font-size:13px;margin:0 0 10px 0;">` +
    `One of these five is a false christian. Question them, study the Scripture, then accuse.<br>` +
    `<span style="color:#aaa;font-size:12px;">\u201CTest the spirits to see whether they are from God.\u201D \u2014 1 John 4:1</span></p>` +
    `<div style="max-height:46vh;overflow-y:auto;">` +
    MEMBERS.map((m, i) => memberCardHtml(m, i, askedCounts[i])).join("") +
    `</div>` +
    `<div style="display:flex;gap:8px;margin-top:12px;">` +
    `<button id="imp-study" style="flex:1;padding:10px;border-radius:10px;background:#1f3a6f;color:#A0E0FF;` +
    `border:1px solid #6FB8FA;cursor:pointer;font-family:'Fredoka One',cursive;">\uD83D\uDCD6 Study Scripture</button>` +
    `<button id="imp-accuse" style="flex:1;padding:10px;border-radius:10px;background:#7a0000;color:#FFD700;` +
    `border:1px solid #FFD700;cursor:pointer;font-family:'Fredoka One',cursive;">\u26A0\uFE0F Accuse</button>` +
    `</div>`;

  document.getElementById("minigame-content").innerHTML = html;
  document.querySelectorAll(".imp-member").forEach(btn => {
    btn.addEventListener("click", () => renderMember(parseInt(btn.dataset.impIdx)));
  });
  document.getElementById("imp-study").addEventListener("click", renderStudy);
  document.getElementById("imp-accuse").addEventListener("click", renderAccuse);
}

function renderMember(i) {
  const m = MEMBERS[i];
  const cache = asked[m.name];
  const qButtons = QUESTIONS.map(q => {
    const answered = !!cache[q.id];
    return (
      `<button class="imp-q" data-q="${q.id}" ` +
      `style="display:block;width:100%;text-align:left;margin:6px 0;padding:9px 12px;border-radius:8px;` +
      `background:${answered ? "#1a3a1a" : "#2E0854"};color:#fff;border:1px solid #7C3AED;cursor:pointer;` +
      `font-family:'Nunito',sans-serif;font-size:14px;">` +
      `${answered ? "\u2713 " : ""}${escapeHtml(q.q)}` +
      `</button>`
    );
  }).join("");

  const lastQ = Object.keys(cache).slice(-1)[0];
  const lastAns = lastQ ? cache[lastQ] : "";

  document.getElementById("minigame-content").innerHTML =
    `<h2 style="color:#FFD700;font-family:'Fredoka One',cursive;margin:0 0 6px 0;">` +
    `<span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:${m.color};` +
    `border:2px solid #fff;vertical-align:middle;margin-right:6px;"></span>` +
    `${escapeHtml(m.name)}</h2>` +
    `<p style="color:#aaa;font-size:12px;margin:0 0 10px 0;">Ask a question. Their answer is recorded.</p>` +
    qButtons +
    (lastAns
      ? `<div style="margin-top:12px;padding:12px;background:#1a0a2e;border-left:3px solid #FFD700;` +
        `border-radius:6px;color:#eee;font-size:14px;font-style:italic;">` +
        `\u201C${escapeHtml(lastAns)}\u201D</div>`
      : "") +
    `<button id="imp-back" style="margin-top:14px;padding:10px 16px;border-radius:10px;` +
    `background:#2a1a40;color:#ccc;border:1px solid #5a4a7a;cursor:pointer;` +
    `font-family:'Fredoka One',cursive;">\u2190 Back to the circle</button>`;

  document.querySelectorAll(".imp-q").forEach(btn => {
    btn.addEventListener("click", () => {
      answerFor(i, btn.dataset.q);
      renderMember(i);
    });
  });
  document.getElementById("imp-back").addEventListener("click", renderLobby);
}

function renderStudy() {
  const rows = QUESTIONS.map(q =>
    `<div style="margin-bottom:14px;">` +
    `<div style="color:#FFD700;font-family:'Fredoka One',cursive;font-size:15px;margin-bottom:4px;">` +
    `${escapeHtml(q.q)}</div>` +
    `<div style="color:#eee;font-size:13px;line-height:1.45;">${escapeHtml(q.truth)}</div>` +
    `</div>`
  ).join("");

  document.getElementById("minigame-content").innerHTML =
    `<h2 style="color:#A0E0FF;font-family:'Fredoka One',cursive;margin:0 0 8px 0;">` +
    `\uD83D\uDCD6 Study the Scripture</h2>` +
    `<p style="color:#bbb;font-size:13px;margin:0 0 12px 0;">` +
    `Compare each member's answers against what the Bible actually says.</p>` +
    `<div style="max-height:50vh;overflow-y:auto;padding-right:4px;">${rows}</div>` +
    `<button id="imp-back" style="margin-top:14px;padding:10px 16px;border-radius:10px;` +
    `background:#2a1a40;color:#ccc;border:1px solid #5a4a7a;cursor:pointer;` +
    `font-family:'Fredoka One',cursive;">\u2190 Back to the circle</button>`;
  document.getElementById("imp-back").addEventListener("click", renderLobby);
}

function renderAccuse() {
  const rows = MEMBERS.map((m, i) =>
    `<button class="imp-accuse-btn" data-imp-idx="${i}" ` +
    `style="display:flex;align-items:center;gap:10px;padding:10px 12px;margin:6px 0;width:100%;` +
    `border:2px solid #c41010;border-radius:10px;background:#3a0a0a;color:#fff;cursor:pointer;` +
    `font-family:'Nunito',sans-serif;text-align:left;">` +
    `<span style="display:inline-block;width:24px;height:24px;border-radius:50%;background:${m.color};` +
    `border:2px solid #fff;flex-shrink:0;"></span>` +
    `<span style="flex:1;font-size:15px;">${escapeHtml(m.name)}</span>` +
    `</button>`
  ).join("");

  document.getElementById("minigame-content").innerHTML =
    `<h2 style="color:#FF6B6B;font-family:'Fredoka One',cursive;margin:0 0 8px 0;">` +
    `\u26A0\uFE0F Who is the imposter?</h2>` +
    `<p style="color:#bbb;font-size:13px;margin:0 0 10px 0;">` +
    `Choose carefully \u2014 false accusations carry a cost.</p>` +
    rows +
    `<button id="imp-back" style="margin-top:14px;padding:10px 16px;border-radius:10px;` +
    `background:#2a1a40;color:#ccc;border:1px solid #5a4a7a;cursor:pointer;` +
    `font-family:'Fredoka One',cursive;">\u2190 Not yet</button>`;
  document.querySelectorAll(".imp-accuse-btn").forEach(btn => {
    btn.addEventListener("click", () => finishGame(parseInt(btn.dataset.impIdx)));
  });
  document.getElementById("imp-back").addEventListener("click", renderLobby);
}

function finishGame(guessIdx) {
  if (aborted) return;
  const correct = guessIdx === imposterIdx;
  const imposter = MEMBERS[imposterIdx];
  const xp = correct ? 60 : -25;
  addXP(xp);

  const headline = correct ? "\u2705 Discerned!" : "\u274C False Accusation";
  const verse = correct
    ? "\u201CTest the spirits to see whether they are from God.\u201D \u2014 1 John 4:1"
    : "\u201CDo not judge by appearances, but judge with right judgment.\u201D \u2014 John 7:24";
  const reasonRows = QUESTIONS
    .filter(q => imposterLies.has(q.id))
    .map(q =>
      `<li style="margin-bottom:6px;"><b>${escapeHtml(q.q)}</b><br>` +
      `<span style="color:#FF8888;">${escapeHtml(asked[imposter.name][q.id] || pickRandom(q.falseAnswers))}</span></li>`
    ).join("");

  document.getElementById("minigame-content").innerHTML =
    `<h2 style="color:${correct ? "#6BCB77" : "#FF6B6B"};font-family:'Fredoka One',cursive;` +
    `margin:0 0 6px 0;">${headline}</h2>` +
    `<p style="color:#ddd;font-size:14px;margin:0 0 10px 0;">` +
    `The imposter was <b style="color:${imposter.color};">${escapeHtml(imposter.name)}</b>. ` +
    `${correct
      ? "Your discernment guarded the flock."
      : `You accused <b>${escapeHtml(MEMBERS[guessIdx].name)}</b>, but the false christian slipped away.`}</p>` +
    `<div style="background:#1a0a2e;padding:10px 12px;border-radius:8px;border-left:3px solid #FFD700;` +
    `color:#FFD700;font-style:italic;margin-bottom:10px;">${verse}</div>` +
    (reasonRows
      ? `<div style="color:#ccc;font-size:13px;margin-bottom:8px;">Where they strayed from Scripture:</div>` +
        `<ul style="color:#eee;font-size:13px;padding-left:18px;margin-top:0;">${reasonRows}</ul>`
      : "") +
    `<p style="color:${xp >= 0 ? "#6BCB77" : "#FF6B6B"};font-family:'Fredoka One',cursive;` +
    `margin-top:14px;">${xp >= 0 ? "+" : ""}${xp} XP</p>` +
    `<div style="display:flex;gap:8px;margin-top:8px;">` +
    `<button id="imp-replay" style="flex:1;padding:10px;border-radius:10px;background:#7C3AED;color:#fff;` +
    `border:none;cursor:pointer;font-family:'Fredoka One',cursive;">Play Again</button>` +
    `<button id="imp-close" style="flex:1;padding:10px;border-radius:10px;background:#2a1a40;color:#ccc;` +
    `border:1px solid #5a4a7a;cursor:pointer;font-family:'Fredoka One',cursive;">Close</button>` +
    `</div>`;

  document.getElementById("imp-replay").addEventListener("click", () => {
    newGame();
    renderLobby();
  });
  document.getElementById("imp-close").addEventListener("click", () => {
    document.getElementById("minigame-modal").style.display = "none";
  });

  if (correct) {
    showToast("\uD83D\uDD4A\uFE0F Discernment rewarded: +60 XP");
  } else {
    showToast("\u26A0\uFE0F Test the spirits. Study harder before accusing.");
  }
}

// ---- Public API ----------------------------------------------------
export function openImposter() {
  newGame();
  openMinigameModal("");
  renderLobby();

  // Mark aborted if the player closes the modal so any in-flight handlers
  // bail cleanly (mostly defensive — this game is event-driven, not timed).
  const closeBtn = document.getElementById("minigame-close");
  function onAbort() {
    aborted = true;
    closeBtn?.removeEventListener("click", onAbort);
  }
  closeBtn?.addEventListener("click", onAbort);
}

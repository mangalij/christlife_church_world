// Random church events — every 3-5 minutes one of a handful of small
// vignettes pops up requiring a player choice. Each choice has different
// costs/rewards so there's a tiny strategic flavor and a constant "what
// will happen next?" hook that keeps the player checking in.
//
// Events are deliberately *small modals* — they don't take over the
// game world, they just appear in the corner with a snappy decision.
// If the player ignores them for 20 seconds they auto-resolve with the
// neutral "Ignore" outcome.

import { addXP, addMember, getXP, spendXP } from "./growth.js";
import { showToast } from "./ui.js";
import { playEventChime, vibrate } from "./audio.js";
import { getFaithLevel } from "./faith.js";

const EVENT_MIN_DELAY = 180;        // seconds (3 min)
const EVENT_MAX_DELAY = 300;        // seconds (5 min)
const AUTO_RESOLVE_AFTER = 20;      // seconds

// XP bonus multiplier from Faith Level 15+ perk.
function rewardMult() { return getFaithLevel() >= 15 ? 1.5 : 1.0; }
function scaleXP(n)   { return Math.round(n * rewardMult()); }

// ---- Event definitions --------------------------------------------
// Each event: id, title, icon, body text, and 2-3 choices.
// Each choice has a label, an optional cost (returned/applied via the
// choose() callback), and a `resolve(ctx)` that applies rewards and
// returns a short outcome string for the toast.
const EVENTS = [
  {
    id: "visitor",
    icon: "🚪",
    title: "A Visitor Knocks",
    body: "Someone you've never seen before is standing in the foyer, looking nervous.",
    choices: [
      {
        label: "Greet them warmly",
        resolve: () => { addMember(1); addXP(scaleXP(20)); return "🤝 New member! +1 Member, +" + scaleXP(20) + " XP"; },
      },
      {
        label: "Invite them to lunch",
        cost: 10,
        resolve: () => { addMember(1); addXP(scaleXP(40)); return "🍞 They felt loved. +1 Member, +" + scaleXP(40) + " XP"; },
      },
      {
        label: "Let an usher handle it",
        resolve: () => { addXP(scaleXP(5));  return "🤷 They quietly left. +" + scaleXP(5) + " XP"; },
      },
    ],
  },
  {
    id: "baby",
    icon: "👶",
    title: "Baby Dedication",
    body: "The Robinson family wants their newborn dedicated this Sunday.",
    choices: [
      {
        label: "Personally officiate",
        resolve: () => { addMember(2); addXP(scaleXP(50)); return "💒 The family joins! +2 Members, +" + scaleXP(50) + " XP"; },
      },
      {
        label: "Ask the deacon to do it",
        resolve: () => { addMember(1); addXP(scaleXP(15)); return "🙂 A nice ceremony. +1 Member, +" + scaleXP(15) + " XP"; },
      },
    ],
  },
  {
    id: "outage",
    icon: "💡",
    title: "Power Outage!",
    body: "The lights flicker out mid-worship. The room falls silent.",
    choices: [
      {
        label: "Lead an acapella hymn",
        resolve: () => { addXP(scaleXP(35)); return "🎶 The Spirit moved. +" + scaleXP(35) + " XP"; },
      },
      {
        label: "Call an emergency electrician",
        cost: 25,
        resolve: () => { addXP(scaleXP(20)); return "⚡ Lights back. +" + scaleXP(20) + " XP"; },
      },
      {
        label: "Dismiss the service",
        resolve: () => { addXP(-5); return "😟 People left disappointed. -5 XP"; },
      },
    ],
  },
  {
    id: "missionary",
    icon: "✈️",
    title: "Missionary Request",
    body: "Brother Daniel writes from overseas: \"We need $50 to print Bibles for a new village.\"",
    choices: [
      {
        label: "Sponsor the printing",
        cost: 50,
        resolve: () => { addXP(scaleXP(100)); addMember(1); return "📖 Bibles printed! +" + scaleXP(100) + " XP, +1 Member"; },
      },
      {
        label: "Send a smaller gift",
        cost: 20,
        resolve: () => { addXP(scaleXP(30)); return "🙏 Daniel was grateful. +" + scaleXP(30) + " XP"; },
      },
      {
        label: "Pray for him this week",
        resolve: () => { addXP(scaleXP(5)); return "🕯️ A prayer goes up. +" + scaleXP(5) + " XP"; },
      },
    ],
  },
  {
    id: "lostsheep",
    icon: "🐑",
    title: "A Lost Sheep",
    body: "Sister Margaret hasn't been to service in three weeks. The phone tree says she's been ill.",
    choices: [
      {
        label: "Visit her at home",
        resolve: () => { addMember(1); addXP(scaleXP(25)); return "🌷 She felt remembered. +1 Member, +" + scaleXP(25) + " XP"; },
      },
      {
        label: "Send the women's group",
        cost: 5,
        resolve: () => { addMember(1); addXP(scaleXP(15)); return "💐 They brought soup. +1 Member, +" + scaleXP(15) + " XP"; },
      },
      {
        label: "She'll be back when she's better",
        resolve: () => { addXP(-10); return "💔 She drifted away. -10 XP"; },
      },
    ],
  },
  {
    id: "wedding",
    icon: "💒",
    title: "Wedding Request",
    body: "A young couple wants to be married at your church next month.",
    choices: [
      {
        label: "Bless and officiate",
        resolve: () => { addMember(2); addXP(scaleXP(60)); return "💍 Two families joined. +2 Members, +" + scaleXP(60) + " XP"; },
      },
      {
        label: "Require pre-marriage counseling",
        cost: 0,
        resolve: () => { addMember(2); addXP(scaleXP(80)); return "❤️ Strong start! +2 Members, +" + scaleXP(80) + " XP"; },
      },
    ],
  },
  {
    id: "fundraiser",
    icon: "🍰",
    title: "Bake Sale Idea",
    body: "The youth group wants to host a bake sale to raise mission funds.",
    choices: [
      {
        label: "Sponsor the supplies",
        cost: 15,
        resolve: () => { addXP(scaleXP(45)); return "🧁 They raised $200! +" + scaleXP(45) + " XP"; },
      },
      {
        label: "Encourage but don't fund",
        resolve: () => { addXP(scaleXP(10)); return "🍪 Modest success. +" + scaleXP(10) + " XP"; },
      },
    ],
  },
];

// ---- Module state --------------------------------------------------
let _timer = 0;
let _nextDelay = randDelay();
let _activeEl = null;
let _activeAuto = 0;

function randDelay() {
  return EVENT_MIN_DELAY + Math.random() * (EVENT_MAX_DELAY - EVENT_MIN_DELAY);
}

function pickEvent() {
  return EVENTS[Math.floor(Math.random() * EVENTS.length)];
}

// ---- UI ------------------------------------------------------------
function buildPopup(event) {
  const xp = getXP();
  const wrap = document.createElement("div");
  wrap.id = "event-popup";
  wrap.style.cssText =
    "position:fixed;right:16px;top:90px;width:320px;z-index:38;" +
    "background:linear-gradient(135deg,rgba(40,20,80,0.96),rgba(20,10,40,0.96));" +
    "border:2px solid #FFD700;border-radius:14px;padding:14px 16px;color:#fff;" +
    "font-family:'Nunito',sans-serif;box-shadow:0 8px 32px rgba(0,0,0,0.55);" +
    "animation:event-slidein 0.4s ease;";
  if (!document.getElementById("event-style")) {
    const style = document.createElement("style");
    style.id = "event-style";
    style.textContent = `
      @keyframes event-slidein {
        from { opacity: 0; transform: translateX(40px); }
        to   { opacity: 1; transform: translateX(0); }
      }
    `;
    document.head.appendChild(style);
  }
  const choicesHtml = event.choices.map((c, i) => {
    const cantAfford = c.cost && xp < c.cost;
    const costBadge = c.cost ? ` <span style="color:#FFD700;font-size:11px;">(${c.cost} XP)</span>` : "";
    return `<button data-choice="${i}" ${cantAfford ? "disabled" : ""}
      style="display:block;width:100%;margin-top:6px;padding:8px 10px;background:#2E0854;color:#fff;
      border:1px solid #7C3AED;border-radius:8px;cursor:${cantAfford ? "not-allowed" : "pointer"};
      opacity:${cantAfford ? "0.45" : "1"};font-family:inherit;font-size:13px;text-align:left;">
      ${c.label}${costBadge}
    </button>`;
  }).join("");
  wrap.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <div style="color:#FFD700;font-family:'Fredoka One',cursive;font-size:16px;">
        ${event.icon} ${event.title}
      </div>
      <div id="event-timer" style="color:#A0E7E5;font-size:12px;">${AUTO_RESOLVE_AFTER}s</div>
    </div>
    <p style="margin:6px 0 4px 0;color:#ddd;font-size:13px;line-height:1.4;">${event.body}</p>
    ${choicesHtml}
  `;
  document.body.appendChild(wrap);
  return wrap;
}

function triggerEvent() {
  if (_activeEl) return;                            // already one on screen
  // Don't pop while modals/dialogue have focus
  if (document.getElementById("minigame-modal")?.style.display === "flex") return;
  if (document.getElementById("dialogue-box")?.style.display === "block") return;
  const event = pickEvent();
  const el = buildPopup(event);
  _activeEl = el;
  _activeAuto = AUTO_RESOLVE_AFTER;
  playEventChime();
  vibrate([40, 60, 40]);

  el.querySelectorAll("button[data-choice]").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.getAttribute("data-choice"));
      const choice = event.choices[idx];
      if (choice.cost && !spendXP(choice.cost)) {
        showToast("Not enough XP for that choice.");
        return;
      }
      const outcome = choice.resolve();
      showToast(outcome);
      closePopup();
    });
  });
}

function closePopup() {
  if (!_activeEl) return;
  _activeEl.remove();
  _activeEl = null;
  _activeAuto = 0;
}

function autoResolve() {
  // Fire the *cheapest* (or "ignore") choice — the last one in each list.
  if (!_activeEl) return;
  const remaining = _activeEl.querySelector("#event-timer");
  if (remaining) remaining.textContent = "—";
  closePopup();
  showToast("The moment passed...");
}

// ---- Public API ----------------------------------------------------
export function initEvents() {
  _timer = 0;
  _nextDelay = randDelay();
}

export function updateEvents(delta) {
  if (_activeEl) {
    _activeAuto -= delta;
    const t = _activeEl.querySelector("#event-timer");
    if (t) t.textContent = `${Math.max(0, Math.ceil(_activeAuto))}s`;
    if (_activeAuto <= 0) autoResolve();
    return;
  }
  _timer += delta;
  if (_timer >= _nextDelay) {
    _timer = 0;
    _nextDelay = randDelay();
    triggerEvent();
  }
}

// Debug / convenience trigger
export function forceEvent() { triggerEvent(); }

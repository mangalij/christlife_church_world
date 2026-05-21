// Witnessing minigame: present the gospel to a Visitor NPC using different methods.
// Each method = 3 turns; each turn the NPC raises an objection, the player picks
// one of three responses (2/1/0 points). Need >= 4/6 to convert.

import { openMinigameModal } from "./ui.js";
import { addXP, addMember } from "./growth.js";
import { notifyConverted } from "./baptism.js";
import { showToast } from "./ui.js";
import { spawnReplacementVisitor } from "./npc.js";

// Each visitor has a unique "concern" that frames their objections.
const VISITOR_CONCERNS = {
  suffering: {
    opener: "Honestly? If God is real and good, why is there so much suffering in the world? I've seen things that broke me.",
    icon: "💭"
  },
  guilt: {
    opener: "I want peace, but you don't know the things I've done. I'm pretty sure I'm beyond fixing.",
    icon: "😔"
  },
  apathy: {
    opener: "I'm a good person. I help my neighbors, I don't hurt anyone. Why would I need religion?",
    icon: "🤷"
  }
};

// Methods. Each has 3 rounds.
//   Round 1: a shared opener whose NPC line varies by the visitor's `concern`.
//   Round 2: the NPC reacts to your round-1 choice — three different
//            follow-ups (keyed by your last answer's score 0/1/2), each with
//            its own NPC line AND its own three player options.
//   Round 3: same branching pattern, keyed by your round-2 score.
// This means the conversation actually responds to how you handled the
// previous beat — a harsh answer in round 1 yields a defensive NPC and a
// different recovery option set in round 2 than a wise answer would.
const METHODS = {
  romansRoad: {
    name: "Romans Road",
    blurb: "Walk through Romans 3:23 → 6:23 → 5:8.",
    icon: "🛣️",
    rounds: [
      // Round 1 — Romans 3:23 (the universal problem)
      {
        npc: {
          suffering: "Sin? People suffer because life is unfair, not because of 'sin'.",
          guilt:     "Yeah, I'm a 'sinner' alright. Doesn't that just mean I'm too far gone?",
          apathy:    "I'm not a sinner. I'm a decent human being."
        },
        options: [
          { text: "Romans 3:23 — 'All have sinned and fall short of God's glory.' Everyone is in the same boat, including me.", score: 2 },
          { text: "Well, nobody's perfect, right?", score: 1 },
          { text: "You really are kind of a bad person if you're honest.", score: 0 }
        ]
      },
      // Round 2 — Romans 6:23 (the cost AND the gift)
      {
        2: {
          npc: "Okay… 'all of us' including you. That's actually disarming. So what's the cost of that?",
          options: [
            { text: "Romans 6:23 — 'The wages of sin is death, but the gift of God is eternal life in Christ Jesus.' The cost is real, but so is the gift.", score: 2 },
            { text: "It separates you from God, mostly.", score: 1 },
            { text: "Eternal punishment. That's the cost.", score: 0 }
          ]
        },
        1: {
          npc: "Right, 'nobody's perfect.' So why even bring it up? It's just life.",
          options: [
            { text: "Because Romans 6:23 says the wages of sin is death — and God offers eternal life as a free gift. The stakes are higher than 'oh well.'", score: 2 },
            { text: "Because God wants us to try harder.", score: 1 },
            { text: "Because it sends you to hell.", score: 0 }
          ]
        },
        0: {
          npc: "Wow. That's harsh. I came here for hope, not a lecture.",
          options: [
            { text: "I'm sorry — I phrased that badly. Romans 6:23 says we ALL earn death, but God offers eternal life as a free gift. I needed that gift just as much as you.", score: 2 },
            { text: "Sorry. Let's just keep going.", score: 1 },
            { text: "Truth hurts. Better than sugarcoating.", score: 0 }
          ]
        }
      },
      // Round 3 — Romans 5:8 (the gift made personal)
      {
        2: {
          npc: "A free gift… after everything? Why would God offer that?",
          options: [
            { text: "Romans 5:8 — 'God demonstrates His love in this: while we were still sinners, Christ died for us.' He didn't wait for us to clean up first.", score: 2 },
            { text: "Because Jesus died for sinners, basically.", score: 1 },
            { text: "Because if you clean up your life first, He'll accept you.", score: 0 }
          ]
        },
        1: {
          npc: "Okay but… is any of this actually FOR me, or just a religion talk?",
          options: [
            { text: "Romans 5:8 — while we were still sinners, Christ died for us. It's already for you — before you ever ask.", score: 2 },
            { text: "Sure, just believe in Jesus.", score: 1 },
            { text: "Start coming to church and prove you mean it.", score: 0 }
          ]
        },
        0: {
          npc: "Yeah, I think I should just go.",
          options: [
            { text: "Wait — please. Romans 5:8 — Christ died for us while we were still sinners. That includes me, and it includes you. I'm not above you.", score: 2 },
            { text: "Fine, but think about what I said.", score: 1 },
            { text: "Yeah, you probably should.", score: 0 }
          ]
        }
      }
    ]
  },

  bridge: {
    name: "Bridge Illustration",
    blurb: "Sin is a chasm between us and God; the cross is the bridge.",
    icon: "🌉",
    rounds: [
      // Round 1 — name the gap
      {
        npc: {
          suffering: "You're saying I'm separated from God. That actually... feels true. Like there's a gap.",
          guilt:     "Separated from God? I've felt that wall my whole life.",
          apathy:    "Separated from God? I don't really feel separated from anything."
        },
        options: [
          { text: "That gap is real — Isaiah 59:2 says our sins have separated us from God. We can't build a bridge across it ourselves.", score: 2 },
          { text: "Yeah, religion is basically about closing that gap.", score: 1 },
          { text: "If you try hard enough you can probably reach Him.", score: 0 }
        ]
      },
      // Round 2 — can we cross it?
      {
        2: {
          npc: "If we can't build it ourselves… then we're stuck, right?",
          options: [
            { text: "We were — until Ephesians 2:8-9. God built the bridge FOR us through Christ. Grace, not works.", score: 2 },
            { text: "God meets you halfway if you start trying.", score: 1 },
            { text: "Pretty much. Most people stay stuck.", score: 0 }
          ]
        },
        1: {
          npc: "So religion is the bridge? Pick one and start crossing?",
          options: [
            { text: "Not religion — a Person. Ephesians 2:8-9 says we're saved by grace through faith in Christ, not by climbing a religious ladder.", score: 2 },
            { text: "Christianity is the right one to pick.", score: 1 },
            { text: "Yeah, as long as you pick the right religion.", score: 0 }
          ]
        },
        0: {
          npc: "Try hard enough? I've been trying my whole life. It's exhausting.",
          options: [
            { text: "You're right — and I was wrong to put it that way. Ephesians 2:8-9: salvation is a gift of grace, not the result of works. You can stop earning.", score: 2 },
            { text: "Just don't give up. Keep trying.", score: 1 },
            { text: "Maybe you're not trying hard enough.", score: 0 }
          ]
        }
      },
      // Round 3 — step onto the bridge
      {
        2: {
          npc: "If He already built the bridge… how do I actually cross?",
          options: [
            { text: "John 14:6 — Jesus said 'I am the way.' Trusting Him IS crossing. It's simple — it cost Him everything so it could cost you nothing but faith.", score: 2 },
            { text: "Just believe and say a prayer.", score: 1 },
            { text: "Trust Him AND start following all the rules.", score: 0 }
          ]
        },
        1: {
          npc: "Okay, but is 'just believe' really it? Sounds too simple.",
          options: [
            { text: "It IS simple — and yet Jesus paid for it with His life (John 14:6). The simplicity is the miracle. Trust is the bridge.", score: 2 },
            { text: "Yeah, just believe and you're in.", score: 1 },
            { text: "Believe and earn the rest with good behavior.", score: 0 }
          ]
        },
        0: {
          npc: "I don't know — this all just sounds like more pressure.",
          options: [
            { text: "Hear me out: Jesus said in John 14:6, 'I am the way.' He carries the weight. It's not more pressure — it's the One who lifts it off you.", score: 2 },
            { text: "It's not that hard, really.", score: 1 },
            { text: "Yeah well, no one said following God was easy.", score: 0 }
          ]
        }
      }
    ]
  },

  testimony: {
    name: "Personal Testimony",
    blurb: "Share your own story of what Christ has done for you.",
    icon: "💬",
    rounds: [
      // Round 1 — does it actually work?
      {
        npc: {
          suffering: "Has Christianity actually helped you with real pain, or is it just words?",
          guilt:     "Did believing actually do anything for you, or did you just convince yourself?",
          apathy:    "Why does any of this matter to YOU personally?"
        },
        options: [
          { text: "I used to carry things alone. When I met Jesus I didn't get a perfect life — I got Someone walking through it WITH me.", score: 2 },
          { text: "It just makes me feel better, I guess.", score: 1 },
          { text: "Honestly I just grew up with it.", score: 0 }
        ]
      },
      // Round 2 — what really changed?
      {
        2: {
          npc: "'Someone walking through it with you.' Did anything actually CHANGE, or just the company?",
          options: [
            { text: "Both. He gave me a peace that doesn't depend on circumstances — Philippians 4:7 calls it peace that 'surpasses understanding.' My situation changed slower than I did.", score: 2 },
            { text: "I started reading the Bible and going to church.", score: 1 },
            { text: "I stopped doing a lot of bad stuff.", score: 0 }
          ]
        },
        1: {
          npc: "'Feel better.' So… it's a feeling? Like a placebo?",
          options: [
            { text: "It's more than feelings — Philippians 4:7 talks about a peace that doesn't make sense given the circumstances. I've held it through things feelings can't survive.", score: 2 },
            { text: "Fine, it's just a feeling. But it's a good one.", score: 1 },
            { text: "Better than nothing, right?", score: 0 }
          ]
        },
        0: {
          npc: "Grew up with it. So it's just culture, not conviction. That's what I figured.",
          options: [
            { text: "Fair pushback. Honestly, it became real to me when I hit the wall — Philippians 4:7, peace beyond understanding. That's when 'inherited' became 'mine.'", score: 2 },
            { text: "Cultural or not, it works for me.", score: 1 },
            { text: "Yeah, it's mostly tradition I guess.", score: 0 }
          ]
        }
      },
      // Round 3 — could it be for them?
      {
        2: {
          npc: "Peace that survives the worst… could that be for me too?",
          options: [
            { text: "Yes. The same Jesus who met me will meet you exactly where you are — Revelation 3:20, He's already knocking. You just open the door.", score: 2 },
            { text: "Yeah, you should try Him out.", score: 1 },
            { text: "Only if you really commit and never look back.", score: 0 }
          ]
        },
        1: {
          npc: "If it's just a feeling, why would I trade my life for it?",
          options: [
            { text: "Because it isn't just a feeling — it's a Person. Revelation 3:20 — Jesus says He stands at the door knocking. You're not trading your life for a vibe; you're trading it for Him.", score: 2 },
            { text: "I dunno, it just helps. Worth a shot.", score: 1 },
            { text: "Look, just try it. What's the harm?", score: 0 }
          ]
        },
        0: {
          npc: "Honestly I'm not sure I even want this. I came over here out of curiosity.",
          options: [
            { text: "That's okay — curiosity is enough. Revelation 3:20 says Jesus is already knocking. You don't have to want it perfectly; you just have to crack the door open.", score: 2 },
            { text: "Want it or not, you need it.", score: 1 },
            { text: "Then maybe you shouldn't have come over.", score: 0 }
          ]
        }
      }
    ]
  }
};

const PRAYER = [
  "Jesus, I know I'm a sinner and I can't fix it on my own.",
  "Thank You for dying for me and rising again.",
  "I'm trusting You — come into my life. I want to follow You.",
  "Amen."
];

function pickConcern(npc) {
  // Stable concern per NPC based on shirt color (so same visitor = same personality).
  if (npc.__concern) return npc.__concern;
  const keys = Object.keys(VISITOR_CONCERNS);
  const idx = (npc.data.shirtColor + (npc.data.pos?.[0] ?? 0)) & 0xff;
  npc.__concern = keys[idx % keys.length];
  return npc.__concern;
}

export function openWitnessing(npc, onConvert) {
  if (npc.__converted) {
    finishConverted(npc);
    return;
  }
  if (npc.__offended) {
    // They've already walked out emotionally — show a closed door instead
    // of letting the player retry until they get a different result.
    openMinigameModal("");
    modal().innerHTML = `
      <h2 style="color:#FF6B6B;font-family:'Fredoka One',cursive;">Door Closed</h2>
      <p style="color:#ccc;margin:12px 0;font-size:14px;line-height:1.5;">
        ${npc.data.name} doesn't want to talk about it again right now. Give them
        time, pray for them, and focus on the next visitor God brings.</p>
      <p style="color:#FF6B6B;font-size:13px;font-style:italic;margin:0 0 12px;">
        "Shake the dust off your feet… and move on." — Matthew 10:14</p>
      <button id="ww-close" style="${btnStyle("#7C3AED", "#7C3AED")}">OK</button>`;
    document.getElementById("ww-close").addEventListener("click", closeModal);
    return;
  }
  const concernKey = pickConcern(npc);
  const concern = VISITOR_CONCERNS[concernKey];
  openMinigameModal("");
  renderOpener(npc, concernKey, concern, onConvert);
}

function modal() { return document.getElementById("minigame-content"); }

function btnStyle(bg = "#2E0854", border = "#7C3AED") {
  return `padding:12px 14px;background:${bg};color:#fff;border:2px solid ${border};
    border-radius:8px;cursor:pointer;font-size:14px;font-family:'Nunito',sans-serif;
    text-align:left;line-height:1.35;-webkit-tap-highlight-color:transparent;`;
}

function renderOpener(npc, concernKey, concern, onConvert) {
  modal().innerHTML = `
    <h2 style="color:#FFD700;font-family:'Fredoka One',cursive;margin-bottom:8px;">
      ✝️ Witnessing to ${npc.data.name}</h2>
    <div style="background:#1a0a2e;padding:14px;border-radius:8px;border-left:4px solid #FFD700;
      margin-bottom:14px;font-size:15px;line-height:1.45;">
      <span style="font-size:22px;">${concern.icon}</span> "${concern.opener}"
    </div>
    <p style="color:#ccc;margin-bottom:10px;font-size:13px;">Choose your approach:</p>
    <div style="display:flex;flex-direction:column;gap:10px;">
      ${Object.entries(METHODS).map(([id, m]) => `
        <button data-method="${id}" style="${btnStyle()}">
          <div style="font-weight:bold;color:#FFD700;font-size:15px;">${m.icon} ${m.name}</div>
          <div style="color:#ccc;font-size:12px;margin-top:3px;">${m.blurb}</div>
        </button>`).join("")}
      <button id="ww-walk" style="${btnStyle("#2a1a1a", "#6b3030")}">
        🚪 Walk away — they're not ready
      </button>
    </div>`;

  modal().querySelectorAll("[data-method]").forEach(b =>
    b.addEventListener("click", () => runMethod(npc, concernKey, b.dataset.method, onConvert)));
  document.getElementById("ww-walk").addEventListener("click", closeModal);
}

function runMethod(npc, concernKey, methodId, onConvert) {
  const method = METHODS[methodId];
  const totalRounds = method.rounds.length;
  let round = 0, score = 0;
  const responses = [];   // each round's chosen score (0/1/2)
  let lastScore = null;   // drives branch selection for rounds 2+

  // Resolve the current round's node {npc, options}. Round 1 is a flat
  // object; later rounds are score-keyed branch maps.
  function currentNode() {
    const r = method.rounds[round];
    if (round === 0) return r;
    // Fallback to the score-2 branch if something is missing (defensive).
    return r[lastScore] || r[2];
  }

  function renderTurn() {
    const node = currentNode();
    const npcLine = round === 0 ? node.npc[concernKey] : node.npc;

    // Shuffle options so the "best" answer isn't always first
    const shuffled = [...node.options].map((o, i) => ({ ...o, _orig: i }))
      .sort(() => Math.random() - 0.5);

    // Mood indicator on the NPC's reply — they visibly cool off after a 0
    // and warm up after a 2. This gives the player feedback in-flight.
    const moodIcon = lastScore === 0 ? "\uD83D\uDE20"   // angry
                   : lastScore === 1 ? "\uD83D\uDE10"   // neutral
                   : lastScore === 2 ? "\uD83D\uDE4F"   // moved
                   : "\uD83D\uDCAD";
    const moodColor = lastScore === 0 ? "#c14040" : lastScore === 2 ? "#FFD700" : "#888";

    modal().innerHTML = `
      <h2 style="color:#FFD700;font-family:'Fredoka One',cursive;margin-bottom:6px;">
        ${method.icon} ${method.name}</h2>
      <p style="color:#888;font-size:12px;margin-bottom:10px;">
        ${npc.data.name} · Turn ${round + 1}/${totalRounds} · Openness: ${score}/6</p>
      <div style="background:#1a0a2e;padding:12px;border-radius:8px;border-left:4px solid ${moodColor};
        margin-bottom:14px;font-size:15px;line-height:1.45;">${moodIcon} "${npcLine}"</div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${shuffled.map((o, i) => `
          <button data-opt="${i}" data-score="${o.score}" style="${btnStyle()}">${o.text}</button>
        `).join("")}
      </div>`;

    modal().querySelectorAll("[data-opt]").forEach(b =>
      b.addEventListener("click", () => {
        const s = parseInt(b.dataset.score);
        score += s;
        responses.push(s);
        lastScore = s;
        round++;
        // Early exit: two harsh (0) answers in the first two rounds and the
        // visitor walks out before the third — they've heard enough.
        const zeros = responses.filter(r => r === 0).length;
        if (round < totalRounds && zeros >= 2) {
          finishMethod(npc, score, onConvert, responses, /*earlyExit=*/true);
          return;
        }
        if (round >= totalRounds) finishMethod(npc, score, onConvert, responses, false);
        else renderTurn();
      }));
  }
  renderTurn();
}

// Possible end-states for a witnessing encounter. Each one drives a
// different reward, message, and (sometimes) follow-up effect. The
// branch chosen depends on the player's response pattern — not just the
// raw score — so harsh answers feel different from gentle-but-shallow ones.
function classifyOutcome(score, responses, earlyExit) {
  const zeros = responses.filter(r => r === 0).length;
  const twos  = responses.filter(r => r === 2).length;

  if (earlyExit) return "offended";                 // walked out mid-conversation
  if (zeros >= 2) return "offended";                // mostly harsh
  if (score === 6 && twos === 3) return "household";// perfect, brings family
  if (score === 5) return "friend";                 // strong, brings a friend
  if (score === 4) return "convert";                // genuine convert
  if (score === 3 && zeros === 0) return "almost";  // "almost persuaded" — returns later
  if (zeros === 0) return "seed";                   // confused but not offended
  return "hardened";                                 // some harsh + low score
}

function finishMethod(npc, score, onConvert, responses = [], earlyExit = false) {
  const outcome = classifyOutcome(score, responses, earlyExit);

  // ---- Converted branches ----
  if (outcome === "household" || outcome === "friend" || outcome === "convert") {
    npc.__converted = true;
    const memberGain = outcome === "household" ? 3 : outcome === "friend" ? 2 : 1;
    const xpGain     = outcome === "household" ? 120 : outcome === "friend" ? 85 : 60;
    addMember(memberGain);
    addXP(xpGain);
    onConvert?.();
    const extra = outcome === "household" ? " (+3 — their whole household believed! Acts 16:31)"
                : outcome === "friend"    ? " (+2 — they're bringing a friend!)"
                : "";
    showToast("\uD83C\uDF89 " + npc.data.name + " accepted Christ!" + extra);
    setTimeout(() => {
      const v = spawnReplacementVisitor();
      if (v) showToast("\uD83D\uDC4B A new visitor just arrived in the courtyard");
    }, 15000);
    renderPrayer(npc);
    return;
  }

  // ---- "Almost persuaded" ----
  // No harsh answers, but the gospel wasn't presented clearly enough.
  // Player gets meaningful XP and the visitor stays around to be tried again.
  if (outcome === "almost") {
    addXP(35);
    modal().innerHTML = `
      <h2 style="color:#FFD700;font-family:'Fredoka One',cursive;">Almost Persuaded…</h2>
      <p style="color:#ccc;margin:12px 0;font-size:14px;line-height:1.5;">
        ${npc.data.name} pauses for a long moment. "You know what — I think I need to
        hear more. Can we talk again later?"</p>
      <p style="color:#FFD700;font-size:13px;font-style:italic;margin:0 0 12px;">
        "Almost thou persuadest me to be a Christian." — Acts 26:28</p>
      <p style="color:#888;font-size:13px;margin-bottom:14px;">+35 XP. Try a different
        method — sometimes a story lands where an argument can't.</p>
      <button id="ww-close" style="${btnStyle("#7C3AED", "#7C3AED")}">Back to Church</button>`;
    document.getElementById("ww-close").addEventListener("click", closeModal);
    return;
  }

  // ---- Seed planted (the original soft-fail) ----
  if (outcome === "seed") {
    addXP(15);
    modal().innerHTML = `
      <h2 style="color:#FFD700;font-family:'Fredoka One',cursive;">Not Yet…</h2>
      <p style="color:#ccc;margin:12px 0;font-size:14px;line-height:1.5;">
        ${npc.data.name} listens politely but isn't ready to make a decision.
        Sometimes the seed has to grow.</p>
      <p style="color:#FFD700;font-size:13px;font-style:italic;margin:0 0 12px;">
        "I planted, Apollos watered, but God gave the increase." — 1 Cor 3:6</p>
      <p style="color:#888;font-size:13px;margin-bottom:14px;">+15 XP for sharing your faith.
        Try again later with a different approach.</p>
      <button id="ww-close" style="${btnStyle("#7C3AED", "#7C3AED")}">Back to Church</button>`;
    document.getElementById("ww-close").addEventListener("click", closeModal);
    return;
  }

  // ---- Offended (early walkout OR ≥2 harsh answers) ----
  if (outcome === "offended") {
    addXP(-10);
    npc.__offended = true;
    modal().innerHTML = `
      <h2 style="color:#FF6B6B;font-family:'Fredoka One',cursive;">They Walked Away</h2>
      <p style="color:#ccc;margin:12px 0;font-size:14px;line-height:1.5;">
        ${npc.data.name} shakes their head. "This isn't for me" — and they walk
        out of the courtyard.${earlyExit
          ? " You never even finished the conversation." : ""}</p>
      <p style="color:#FF6B6B;font-size:13px;font-style:italic;margin:0 0 12px;">
        "Reckless words pierce like a sword, but the tongue of the wise brings
        healing." — Proverbs 12:18</p>
      <p style="color:#888;font-size:13px;margin-bottom:14px;">−10 XP. Lead with the
        gospel, not condemnation.</p>
      <button id="ww-close" style="${btnStyle("#7a0000", "#c14040")}">Back to Church</button>`;
    document.getElementById("ww-close").addEventListener("click", closeModal);
    return;
  }

  // ---- Hardened (default catch-all: low score with at least one 0) ----
  modal().innerHTML = `
    <h2 style="color:#FF8B6B;font-family:'Fredoka One',cursive;">Their Heart Hardened</h2>
    <p style="color:#ccc;margin:12px 0;font-size:14px;line-height:1.5;">
      ${npc.data.name} crosses their arms. "I think we're done here." The conversation
      ended worse than it started.</p>
    <p style="color:#FF8B6B;font-size:13px;font-style:italic;margin:0 0 12px;">
      "Let your speech always be with grace, seasoned with salt." — Colossians 4:6</p>
    <p style="color:#888;font-size:13px;margin-bottom:14px;">No XP awarded.
      Pray for them, study Scripture, and try a different method.</p>
    <button id="ww-close" style="${btnStyle("#7C3AED", "#7C3AED")}">Back to Church</button>`;
  document.getElementById("ww-close").addEventListener("click", closeModal);
}

function renderPrayer(npc) {
  let line = 0;
  function step() {
    modal().innerHTML = `
      <h2 style="color:#FFD700;font-family:'Fredoka One',cursive;">🙏 The Sinner's Prayer</h2>
      <p style="color:#aaa;margin:8px 0 16px;font-size:13px;">${npc.data.name} prays with you:</p>
      <div style="background:#1a0a2e;padding:18px;border-radius:8px;border-left:4px solid #FFD700;
        font-size:16px;line-height:1.5;font-style:italic;min-height:80px;">
        "${PRAYER.slice(0, line + 1).join(" ")}"</div>
      <button id="ww-pray-next" style="${btnStyle("#7C3AED", "#7C3AED")}; margin-top:16px;">
        ${line < PRAYER.length - 1 ? "Continue…" : "Welcome to the family! ✝️"}</button>`;
    document.getElementById("ww-pray-next").addEventListener("click", () => {
      line++;
      if (line >= PRAYER.length) finishConverted(npc);
      else step();
    });
  }
  step();
}

function finishConverted(npc) {
  notifyConverted(npc?.data?.name || "A new believer");
  modal().innerHTML = `
    <h2 style="color:#FFD700;font-family:'Fredoka One',cursive;">🎉 New Believer!</h2>
    <p style="color:#ccc;margin:14px 0;font-size:15px;line-height:1.5;">
      ${npc.data.name} has joined the church family. +1 Member · +60 XP</p>
    <p style="color:#FFD700;font-size:13px;margin:-6px 0 12px;">
      💧 They're waiting at the Baptismal Pool — head to the back of the sanctuary to baptize them.</p>
    <p style="color:#888;font-size:13px;margin-bottom:14px;">
      <em>"There is rejoicing in heaven over one sinner who repents." — Luke 15:7</em></p>
    <button id="ww-done" style="${btnStyle("#7C3AED", "#7C3AED")}">Amen</button>`;
  document.getElementById("ww-done").addEventListener("click", closeModal);
}

function closeModal() {
  document.getElementById("minigame-modal").style.display = "none";
}

import * as THREE from "three";
import { CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { openDialogue, showToast } from "./ui.js";
import { addMember, addXP } from "./growth.js";
import { openMinigame } from "./minigames/trivia.js";
import { openMemoryMatch } from "./minigames/memoryMatch.js";
import { openRhythmTap } from "./minigames/rhythmTap.js";
import { openCoffeeStand } from "./minigames/coffeeStand.js";
import { openPrayerFocus } from "./minigames/prayerFocus.js";
import { openWheelOfBlessings } from "./minigames/wheelOfBlessings.js";
import { openImposter } from "./minigames/imposter.js";
import { start1v1Match } from "./match1v1.js";
import { setInteractButtonVisible } from "./player.js";
import { addFace } from "./face.js";
import { openWitnessing } from "./witnessing.js";

const NPC_DATA = [
  {
    name: "Pastor James", shirtColor: 0x2E4057, pantsColor: 0x1a0a2e, headColor: 0xFFCBA4,
    pos: [0, 0, -26.5], role: "Pastor", facing: Math.PI,
    dialogue: [
      "Welcome to ChristLife World! I'm Pastor James.",
      "Our church is growing — but we need YOUR help to reach more people.",
      "Talk to the visitors in the courtyard and invite them to join us.",
      "Complete quests to earn XP and unlock new areas of the church!",
      "The Great Commission calls us forward. Let's go!"
    ],
    quest: { id: "greet_visitors", label: "Greet 3 Visitors", goal: 3, key: "clw_greet_count" },
    action: null
  },
  {
    name: "Sister Gloria", shirtColor: 0xFF69B4, pantsColor: 0x800080, headColor: 0xD4956A,
    pos: [-32, 0, -10], role: "Host",
    dialogue: [
      "Hey hey! Welcome to the Fellowship Hall!",
      "I run our Bible Trivia nights — think you know your Scripture?",
      "Let's find out!"
    ],
    action: () => openMinigame()
  },
  {
    name: "Brother Mike", shirtColor: 0x4169E1, pantsColor: 0x191970, headColor: 0xFFCBA4,
    pos: [0, 0, 7], role: "Steward",
    dialogue: [
      "As we grow, our building grows too!",
      "Reach 20 members to unlock the Prayer Room.",
      "50 members opens the Expansion Zone — a whole new wing!",
      "Keep inviting, keep serving, keep believing."
    ],
    action: null
  },
  {
    name: "Kids Leader", shirtColor: 0xFF8C00, pantsColor: 0x654321, headColor: 0xFFCBA4,
    pos: [-37, 0, -15], role: "Kids Ministry",
    dialogue: [
      "Hey there! Ready for a memory challenge?",
      "We match Bible verses in our memory game!",
      "Can you find all the pairs?"
    ],
    action: () => openMemoryMatch()
  },
  {
    name: "Worship Leader", shirtColor: 0x9400D3, pantsColor: 0x4B0082, headColor: 0xD4956A,
    pos: [-4, 0.5, -27], role: "Worship", facing: Math.PI,
    dialogue: [
      "Music is how we connect with the heavens!",
      "Step into our rhythm game and feel the worship!",
      "Hit the notes, feel the Spirit!"
    ],
    action: () => openRhythmTap()
  },
  {
    name: "Prayer Partner", shirtColor: 0xFFD700, pantsColor: 0x8B6914, headColor: 0xFFCBA4,
    pos: [-8, 0, -46], role: "Intercessor",
    dialogue: [
      "'The Lord is near to all who call on Him.' — Psalm 145:18",
      "Come, take a moment. Let's breathe and pray together.",
      "Follow the rhythm — inhale as the circle grows, exhale as it shrinks."
    ],
    action: () => openPrayerFocus()
  },
  {
    name: "Coffee Volunteer", shirtColor: 0xFFA500, pantsColor: 0x4A2C0A, headColor: 0xD4956A,
    pos: [6, 0, 8], role: "Hospitality",
    dialogue: [
      "Can I interest you in a cup of church coffee?",
      "Warning: it may be 40% prayer, 60% caffeine.",
      "Pull up to the bar — we've got a menu, or you can try your hand at a pour."
    ],
    action: () => openCoffeeStand()
  },
  {
    // Greeter at the church entrance — always the first face visitors
    // see. Runs the Wheel of Blessings minigame (wheel-of-fortune style).
    name: "Brother Andre", shirtColor: 0x6A1B9A, pantsColor: 0x222244, headColor: 0xB07A50,
    pos: [-3, 0, 11], role: "Greeter", facing: Math.PI,
    dialogue: [
      "Welcome, welcome! So glad you came in today!",
      "Every visitor gets a turn at our Wheel of Blessings — it's tradition.",
      "Give it a spin and see what the Lord has for you!"
    ],
    action: () => openWheelOfBlessings()
  },
  {
    // Bible Study Leader — stands just outside the study room door.
    // Opens the "Spot the Imposter" minigame where the player questions
    // five members in a circle and discerns the false christian among them.
    name: "Sister Esther", shirtColor: 0x6A1B9A, pantsColor: 0x2A1B5A, headColor: 0xD4956A,
    pos: [22, 0, -42.5], role: "Study Leader", facing: Math.PI,
    dialogue: [
      "Welcome to Bible Study! We're sitting in a circle tonight.",
      "I'll be honest — something feels off. One of us isn't a true believer.",
      "'Beware of false prophets in sheep's clothing.' — Matthew 7:15",
      "Ask each member questions, study the Scripture, then call out the imposter.",
      "Test the spirits, friend. Don't accuse lightly."
    ],
    action: () => openImposter()
  },
  {
    name: "New Visitor", shirtColor: 0x20B2AA, pantsColor: 0x2F4F4F, headColor: 0xFFCBA4,
    pos: [32, 0, -5], role: "Visitor", wandering: true, witness: true,
    dialogue: [
      "Oh! Hi there. I just stopped by to check this place out...",
      "Honestly, I have a lot of questions about faith."
    ],
    action: null
  },
  {
    name: "New Visitor", shirtColor: 0x3CB371, pantsColor: 0x2E4057, headColor: 0xD4956A,
    pos: [35, 0, -2], role: "Visitor", wandering: true, witness: true,
    dialogue: [
      "Hey. I saw the sign outside and thought I'd come in.",
      "It's nice in here... but I'm not sure what I believe."
    ],
    action: null
  },
  {
    name: "New Visitor", shirtColor: 0xFF7F50, pantsColor: 0x8B4513, headColor: 0xFFCBA4,
    pos: [29, 0, -8], role: "Visitor", wandering: true, witness: true,
    dialogue: [
      "My friend told me about this church...",
      "I've been looking for something, but I don't know what."
    ],
    action: null
  },
  // ---- BASKETBALL COURT ----
  {
    name: "Coach Marcus", shirtColor: 0xE65A2A, pantsColor: 0x1B1B2F, headColor: 0x6E4A2E,
    pos: [47, 0, 20], role: "Hoops Coach", facing: Math.PI / 2,
    dialogue: [
      "Welcome to Church Hoops! We run open court for the kids most evenings.",
      "Think you can hang with the old man? Let's run a 1-on-1 right here on the court.",
      "Every swish is 2. Beat me to 11 — or have more buckets when the clock hits zero.",
      "WASD to move, E to grab/shoot. Get up in my grill on D — E to steal, stand close to block.",
    ],
    action: () => start1v1Match(_scene, _player, _zones)
  },
  {
    name: "Jayden",  shirtColor: 0x2980B9, pantsColor: 0x2F2F2F, headColor: 0x6E4A2E, scale: 0.7,
    pos: [55, 0, 14], role: "Church Kid", wandering: true, wanderArea: { x: 55, z: 17, r: 5 },
    dialogue: [
      "Yo! You ballin' today?",
      "Coach says basketball teaches you teamwork — like the body of Christ!",
      "Watch this crossover... *trips on own feet*"
    ],
    action: null
  },
  {
    name: "Sophia",  shirtColor: 0xE91E63, pantsColor: 0x8B6914, headColor: 0xD4956A, scale: 0.7,
    pos: [58, 0, 22], role: "Church Kid", wandering: true, wanderArea: { x: 55, z: 20, r: 5 },
    dialogue: [
      "I'm the best shooter on the team. Don't tell Jayden.",
      "We pray before every game. It's kinda our thing.",
      "Bet you can't beat my free-throw streak!"
    ],
    action: null
  },
  {
    name: "Little Eli", shirtColor: 0xF7DC6F, pantsColor: 0x4B2E2E, headColor: 0xFFCBA4, scale: 0.6,
    pos: [52, 0, 26], role: "Church Kid", wandering: true, wanderArea: { x: 55, z: 24, r: 4 },
    dialogue: [
      "I just started! The ball is REALLY heavy.",
      "Coach says 'practice makes perfect' but I just like running.",
      "Did you know Jesus was probably tall? Tall people are great at basketball."
    ],
    action: null
  },
];

export function spawnNPCs(scene, player, zones) {
  _scene = scene;
  _player = player || null;
  _zones  = zones  || null;
  _npcs = NPC_DATA.map(data => buildNPCMesh(data, scene));
  return _npcs;
}

// Used by the 1v1 match: hide any NPC standing inside the given XZ bounds so
// the court stays clear. We record originals so restoreClearedNPCs can put
// them back. Safe to call repeatedly while the match is running — already
// hidden NPCs are skipped.
export function clearNPCsFromRegion(bounds) {
  if (!_npcs) return;
  for (const npc of _npcs) {
    if (npc._clearedForMatch) continue;
    const p = npc.group.position;
    const inside = p.x >= bounds.minX && p.x <= bounds.maxX
                && p.z >= bounds.minZ && p.z <= bounds.maxZ;
    if (!inside) continue;
    npc._clearedForMatch = {
      visible: npc.group.visible,
      pos: p.clone(),
    };
    npc.group.visible = false;
  }
}

export function restoreClearedNPCs() {
  if (!_npcs) return;
  for (const npc of _npcs) {
    const o = npc._clearedForMatch;
    if (!o) continue;
    npc.group.visible = o.visible;
    npc.group.position.copy(o.pos);
    npc._clearedForMatch = null;
  }
}

let _scene = null;
let _player = null;
let _zones = null;
let _npcs = null;
let _visitorSerial = 0;

// Spawns a brand-new wandering Visitor in the courtyard so the player can
// keep witnessing after the starter trio has been converted.
export function spawnReplacementVisitor() {
  if (!_scene || !_npcs) return null;
  const shirts = [0x20B2AA, 0x3CB371, 0xFF7F50, 0x9B59B6, 0xE67E22, 0x16A085, 0xC0392B, 0x2980B9];
  const pants  = [0x2F4F4F, 0x2E4057, 0x8B4513, 0x1B1B2F, 0x4B2E2E];
  const skins  = [0xFFCBA4, 0xD4956A, 0xB07A50, 0x6E4A2E];
  const openers = [
    ["Is this where people, like, ask questions about God?", "A coworker invited me. I almost didn't come."],
    ["I've been going through a lot lately... I figured I'd check this out.", "What's the deal here, exactly?"],
    ["I drove past this place a hundred times. Today I actually stopped.", "Tell me why I'm here."],
    ["My grandma used to take me to church. I haven't been in years.", "Not sure I'm welcome here, honestly."],
  ];
  _visitorSerial++;
  const data = {
    name: "New Visitor",
    shirtColor: shirts[_visitorSerial % shirts.length],
    pantsColor: pants[_visitorSerial % pants.length],
    headColor:  skins[_visitorSerial % skins.length],
    pos: [27 + Math.random() * 10, 0, -8 + Math.random() * 8],
    role: "Visitor", wandering: true, witness: true,
    dialogue: openers[_visitorSerial % openers.length],
    action: null,
  };
  const npc = buildNPCMesh(data, _scene);
  _npcs.push(npc);
  return npc;
}

function buildNPCMesh(data, scene) {
  const group = new THREE.Group();
  const mat = c => new THREE.MeshToonMaterial({ color: c });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1, 0.5), mat(data.shirtColor));
  torso.position.y = 1.2;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.6), mat(data.headColor || 0xFFCBA4));
  head.position.y = 2.05;
  addFace(head, { skin: data.headColor || 0xFFCBA4 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.9, 0.4), mat(data.pantsColor));
  legL.position.set(-0.22, 0.45, 0);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.9, 0.4), mat(data.pantsColor));
  legR.position.set(0.22, 0.45, 0);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.85, 0.4), mat(data.shirtColor));
  armL.position.set(-0.6, 1.2, 0);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.85, 0.4), mat(data.shirtColor));
  armR.position.set(0.6, 1.2, 0);

  [torso, head, legL, legR, armL, armR].forEach(m => { m.castShadow = true; group.add(m); });
  group.position.set(...data.pos);
  if (typeof data.facing === "number") group.rotation.y = data.facing;
  if (typeof data.scale === "number") group.scale.setScalar(data.scale);
  scene.add(group);

  const div = document.createElement("div");
  div.style.cssText = "color:#fff;font-size:12px;font-family:'Nunito',sans-serif;" +
    "background:rgba(0,0,0,0.6);padding:2px 6px;border-radius:4px;pointer-events:none;";
  div.textContent = `${data.name} · ${data.role}`;
  const label = new CSS2DObject(div);
  label.position.set(0, 2.6, 0);
  group.add(label);

  const excDiv = document.createElement("div");
  excDiv.style.cssText = "color:#FFD700;font-size:22px;font-weight:bold;" +
    "font-family:'Fredoka One',cursive;pointer-events:none;display:none;";
  excDiv.textContent = "!";
  const excLabel = new CSS2DObject(excDiv);
  excLabel.position.set(0, 3.2, 0);
  group.add(excLabel);

  return {
    group, data, excDiv,
    dialogueIndex: 0,
    wanderTarget: null, wanderTimer: 0,
    parts: { legL, legR, armL, armR },
    interacted: false,
    // for Visitor NPCs, talking opens the witnessing minigame after the intro lines
    ...(data.witness ? { __isVisitor: true } : {})
  };
}

export function updateNPCs(npcs, player, delta, elapsed) {
  const playerPos = player.group.position;
  let anyNear = false;

  npcs.forEach(npc => {
    // Skip NPCs that have been hidden (e.g. cleared off the court during the
    // 1v1 match) — they shouldn't trigger the interact prompt or steal E.
    if (!npc.group.visible || npc._clearedForMatch) {
      if (window.__nearNPC === npc) window.__nearNPC = null;
      npc.excDiv.style.display = "none";
      return;
    }
    const dist = playerPos.distanceTo(npc.group.position);
    const near = dist < 3;
    // Reset the "just talked" cooldown once the player walks away
    if (npc.justTalked && dist > 4.5) npc.justTalked = false;

    const interactable = near && !npc.justTalked;
    npc.excDiv.style.display = interactable ? "block" : "none";

    if (interactable) { window.__nearNPC = npc; anyNear = true; }
    else if (window.__nearNPC === npc) window.__nearNPC = null;

    npc.group.position.y = Math.sin(elapsed * 1.5 + npc.group.position.x) * 0.05;

    if (npc.data.wandering && !npc.interacted) {
      npc.wanderTimer -= delta;
      if (!npc.wanderTarget || npc.wanderTimer <= 0) {
        const area = npc.data.wanderArea;
        if (area) {
          const ang = Math.random() * Math.PI * 2;
          const r = Math.random() * area.r;
          npc.wanderTarget = new THREE.Vector3(
            area.x + Math.cos(ang) * r, 0, area.z + Math.sin(ang) * r
          );
        } else {
          // default: courtyard visitor patrol
          npc.wanderTarget = new THREE.Vector3(
            27 + Math.random() * 14 - 7, 0, -10 + Math.random() * 12 - 6
          );
        }
        npc.wanderTimer = 3 + Math.random() * 4;
      }
      const toTarget = npc.wanderTarget.clone().sub(npc.group.position);
      if (toTarget.length() > 0.3) {
        toTarget.normalize().multiplyScalar(1.5 * delta);
        npc.group.position.add(toTarget);
        npc.group.lookAt(npc.wanderTarget);
        const t = elapsed * 4;
        npc.parts.legL.rotation.x =  Math.sin(t) * 0.4;
        npc.parts.legR.rotation.x =  Math.sin(t + Math.PI) * 0.4;
      }
    }
  });

  setInteractButtonVisible(anyNear);
}

window.addEventListener("keydown", e => {
  if (e.code === "KeyE" && window.__nearNPC) {
    const npc = window.__nearNPC;
    const action = npc.data.witness ? () => openWitnessing(npc) : npc.data.action;
    openDialogue(npc.data.name, npc.data.dialogue, action,
      npc.data.quest, () => { npc.interacted = true; npc.justTalked = true; });
  }
});

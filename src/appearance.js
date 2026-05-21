// Builds a character's visible body parts on the given THREE.Group, using the
// options object saved on the player profile. Used by both the in-game player
// (player.js) and the character-creation preview (main.js) so they always match.
import * as THREE from "three";
import { addFace } from "./face.js";

export const DEFAULT_APPEARANCE = {
  shirt:      "#7C3AED",
  pants:      "#1a0a2e",
  skin:       "#FFCBA4",
  hairStyle:  "short",      // "none" | "short" | "long" | "afro" | "cap"
  hairColor:  "#3a2718",
  jacketOn:   false,
  jacketColor:"#222244",
  shoeColor:  "#222222",
};

export const SKIN_TONES = [
  { name: "Light",       hex: "#FFCBA4" },
  { name: "Medium",      hex: "#D4956A" },
  { name: "Tan",         hex: "#B07A50" },
  { name: "Deep",        hex: "#6E4A2E" },
  { name: "Rich",        hex: "#4A2E1A" },
];

export const HAIR_STYLES = [
  { id: "none",  label: "Bald"  },
  { id: "short", label: "Short" },
  { id: "long",  label: "Long"  },
  { id: "afro",  label: "Afro"  },
  { id: "cap",   label: "Cap"   },
];

const toHex = v => typeof v === "string" ? parseInt(v.replace("#", ""), 16) : v;
const mat = c => new THREE.MeshToonMaterial({ color: toHex(c) });

// Builds geometry on `group` and returns { head, torso, legL, legR, armL, armR, hairGroup, jacket, shoeL, shoeR }
// `pData` may have just {shirt, pants} (legacy) — missing fields fall back to defaults.
export function buildAppearance(group, pData = {}) {
  const opts = { ...DEFAULT_APPEARANCE, ...pData };

  // Strip any previous children (preview rebuilds on every color change)
  while (group.children.length) group.remove(group.children[0]);

  const shirtMat  = mat(opts.shirt);
  const pantsMat  = mat(opts.pants);
  const skinMat   = mat(opts.skin);
  const jacketMat = mat(opts.jacketColor);
  const shoeMat   = mat(opts.shoeColor);

  // Torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1, 0.5), shirtMat);
  torso.position.y = 1.2;

  // Head
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.6), skinMat);
  head.position.y = 2.05;
  addFace(head, { skin: toHex(opts.skin) });

  // Legs
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.9, 0.4), pantsMat);
  legL.position.set(-0.22, 0.45, 0);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.9, 0.4), pantsMat);
  legR.position.set(0.22, 0.45, 0);

  // Arms (use jacket color if jacket is worn — feels like sleeves)
  const armMat = opts.jacketOn ? jacketMat : shirtMat;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.85, 0.4), armMat);
  armL.position.set(-0.6, 1.2, 0);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.85, 0.4), armMat);
  armR.position.set(0.6, 1.2, 0);

  // Optional jacket overlay on torso
  let jacket = null;
  if (opts.jacketOn) {
    jacket = new THREE.Mesh(new THREE.BoxGeometry(0.86, 1.04, 0.54), jacketMat);
    jacket.position.y = 1.2;
    // A small "lapel/zipper" strip down the front in shirt color so it reads as open jacket.
    // The character's face is on local -Z, so the front of the body is -Z too.
    const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0, 0.02), shirtMat);
    lapel.position.set(0, 1.2, -0.28);
    group.add(lapel);
  }

  // Shoes
  const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.55), shoeMat);
  shoeL.position.set(-0.22, 0.075, 0.05);
  const shoeR = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.55), shoeMat);
  shoeR.position.set(0.22, 0.075, 0.05);

  // Hair
  const hairGroup = buildHair(opts.hairStyle, opts.hairColor);
  hairGroup.position.y = 2.05;

  const parts = [head, torso, legL, legR, armL, armR, shoeL, shoeR];
  if (jacket) parts.push(jacket);
  parts.push(hairGroup);
  parts.forEach(p => { p.castShadow = true; group.add(p); });

  return { head, torso, legL, legR, armL, armR, shoeL, shoeR, jacket, hairGroup };
}

function buildHair(style, color) {
  const g = new THREE.Group();
  if (style === "none") return g;
  const m = mat(color);
  const headW = 0.7, headD = 0.6, headH = 0.7;

  if (style === "short") {
    const top = new THREE.Mesh(new THREE.BoxGeometry(headW + 0.04, 0.18, headD + 0.04), m);
    top.position.y = headH / 2 - 0.05;
    g.add(top);
    // Slight side wisps
    [-1, 1].forEach(sx => {
      const wisp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, headD + 0.02), m);
      wisp.position.set(sx * (headW / 2 + 0.01), 0.15, 0);
      g.add(wisp);
    });
  } else if (style === "long") {
    const top = new THREE.Mesh(new THREE.BoxGeometry(headW + 0.06, 0.2, headD + 0.06), m);
    top.position.y = headH / 2 - 0.05;
    g.add(top);
    // Long sides down to shoulders
    [-1, 1].forEach(sx => {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, headD + 0.04), m);
      side.position.set(sx * (headW / 2 + 0.02), -0.05, 0);
      g.add(side);
    });
    // Back curtain
    const back = new THREE.Mesh(new THREE.BoxGeometry(headW + 0.06, 0.5, 0.08), m);
    back.position.set(0, -0.05, -(headD / 2 + 0.02));
    g.add(back);
  } else if (style === "afro") {
    const puff = new THREE.Mesh(new THREE.BoxGeometry(headW + 0.35, 0.55, headD + 0.35), m);
    puff.position.y = headH / 2 + 0.08;
    g.add(puff);
  } else if (style === "cap") {
    const crown = new THREE.Mesh(new THREE.BoxGeometry(headW + 0.06, 0.22, headD + 0.06), m);
    crown.position.y = headH / 2 + 0.04;
    g.add(crown);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(headW + 0.06, 0.05, 0.25), m);
    brim.position.set(0, headH / 2 - 0.03, -(headD / 2 + 0.12));
    g.add(brim);
  }
  return g;
}

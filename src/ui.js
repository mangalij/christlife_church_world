let dialogueCallback = null, dialogueLines = [], dialogueIndex = 0;
let dialogueAction = null, dialogueQuest = null;
let typewriterInterval = null;

export function initUI(pData) {
  document.getElementById("dialogue-next").addEventListener("click", advanceDialogue);
  document.getElementById("dialogue-close").addEventListener("click", closeDialogue);
  document.getElementById("dialogue-quest").addEventListener("click", acceptQuest);
  document.getElementById("minigame-close").addEventListener("click", () => {
    document.getElementById("minigame-modal").style.display = "none";
    if (!window.isMobile) document.body.requestPointerLock?.();
  });
}

export function openDialogue(name, lines, action, quest, onClose) {
  document.exitPointerLock?.();
  dialogueLines = lines; dialogueIndex = 0;
  dialogueAction = action; dialogueQuest = quest; dialogueCallback = onClose;
  document.getElementById("dialogue-npc-name").textContent = name;
  document.getElementById("dialogue-box").style.display = "block";
  document.getElementById("dialogue-quest").style.display = quest ? "block" : "none";
  typewriter(lines[0]);
}

function typewriter(text) {
  const el = document.getElementById("dialogue-text");
  el.textContent = "";
  // Cancel any in-flight typewriter from a previous line. Without this,
  // clicking "Next" (or opening a new dialogue) before the current line
  // finishes leaves the old interval running; it keeps appending its
  // remaining characters into the same DOM node while the new interval
  // appends the new line — producing interleaved, jumbled text.
  if (typewriterInterval !== null) {
    clearInterval(typewriterInterval);
    typewriterInterval = null;
  }
  // Split into GRAPHEMES (user-perceived characters) rather than UTF-16
  // code units. Stepping one code unit at a time would split surrogate
  // pairs in emoji like "📜" / "🌧️" mid-render, briefly displaying lone
  // surrogates as garbage glyphs / replacement boxes — exactly the
  // "jumbled characters" players see during dialogue. Intl.Segmenter
  // also keeps variation selectors and ZWJ-joined family emoji intact.
  let chars;
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    chars = Array.from(seg.segment(text), s => s.segment);
  } else {
    // Fallback: Array.from iterates by code point, so it at least joins
    // surrogate pairs, even if it can't merge VS16 / ZWJ sequences.
    chars = Array.from(text);
  }
  let i = 0;
  typewriterInterval = setInterval(() => {
    el.textContent += chars[i++];
    if (i >= chars.length) {
      clearInterval(typewriterInterval);
      typewriterInterval = null;
    }
  }, 22);
}

function advanceDialogue() {
  dialogueIndex++;
  if (dialogueIndex >= dialogueLines.length) {
    if (dialogueAction) dialogueAction();
    if (dialogueCallback) dialogueCallback();
    closeDialogue();
  } else {
    typewriter(dialogueLines[dialogueIndex]);
  }
}

function acceptQuest() {
  if (!dialogueQuest) return;
  localStorage.setItem("clw_active_quest", JSON.stringify(dialogueQuest));
  document.getElementById("quest-name").textContent = "Quest: " + dialogueQuest.label;
  document.getElementById("quest-progress-fill").style.width = "0%";
  document.getElementById("dialogue-quest").style.display = "none";
  showToast("📜 Quest Accepted: " + dialogueQuest.label);
}

function closeDialogue() {
  document.getElementById("dialogue-box").style.display = "none";
  if (!window.isMobile) document.body.requestPointerLock?.();
}

export function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.style.opacity = "1";
  toast.style.transform = "translateX(-50%) translateY(0)";
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(-50%) translateY(20px)";
  }, 3000);
}

export function openMinigameModal(html) {
  document.getElementById("minigame-content").innerHTML = html;
  document.getElementById("minigame-modal").style.display = "flex";
  document.exitPointerLock?.();
}

window.toggleWhoPanel = function () {
  const p = document.getElementById("who-panel");
  p.style.display = p.style.display === "none" || p.style.display === "" ? "block" : "none";
};
window.toggleControls = function () {
  const c = document.getElementById("controls-hint");
  c.style.display = c.style.display === "none" || c.style.display === "" ? "block" : "none";
};

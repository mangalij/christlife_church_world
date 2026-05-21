let ctx = null;

export function initAudio() {
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Browsers require a user gesture to start audio — resume on first click/touch.
    const resume = () => {
      if (ctx && ctx.state === "suspended") ctx.resume();
      window.removeEventListener("click", resume);
      window.removeEventListener("touchstart", resume);
    };
    window.addEventListener("click", resume);
    window.addEventListener("touchstart", resume);
    startAmbient();
  } catch (e) {
    console.warn("Audio init failed:", e);
  }
}

function playTone(freq, duration, type = "sine", gain = 0.15) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.connect(g); g.connect(ctx.destination);
  osc.type = type; osc.frequency.setValueAtTime(freq, ctx.currentTime);
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.start(); osc.stop(ctx.currentTime + duration);
}

export function playChime() {
  [523, 659, 784].forEach((f, i) => setTimeout(() => playTone(f, 0.3), i * 80));
}
export function playFanfare() {
  [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 0.4), i * 120));
}

// Short, satisfying "ching" for an XP gain. Two stacked tones with a
// quick attack — feels like a coin pickup.
export function playCoin() {
  if (!ctx) return;
  playTone(988, 0.10, "triangle", 0.16);          // B5
  setTimeout(() => playTone(1319, 0.18, "triangle", 0.14), 60); // E6
}

// Warm bell for a new member — fuller body, longer tail.
export function playMemberBell() {
  if (!ctx) return;
  playTone(523, 0.6, "sine",     0.16);           // C5
  playTone(659, 0.6, "triangle", 0.10);           // E5
  setTimeout(() => playTone(784, 0.7, "sine", 0.10), 90);  // G5
}

// Triumphant level-up arpeggio.
export function playLevelUp() {
  if (!ctx) return;
  [392, 494, 587, 784, 988].forEach((f, i) =>
    setTimeout(() => playTone(f, 0.32, "triangle", 0.14), i * 90));
}

// Soft, attention-getting ping for a random event popup.
export function playEventChime() {
  if (!ctx) return;
  playTone(880, 0.18, "sine", 0.12);
  setTimeout(() => playTone(1175, 0.28, "sine", 0.10), 120);
}

// Drumroll-style noise burst (used before reveals).
export function playDrumroll(duration = 1.4) {
  if (!ctx) return;
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const g = ctx.createGain();
  const filt = ctx.createBiquadFilter();
  filt.type = "bandpass"; filt.frequency.value = 220; filt.Q.value = 1.4;
  src.connect(filt); filt.connect(g); g.connect(ctx.destination);
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.20, ctx.currentTime + 0.05);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  src.start();
  src.stop(ctx.currentTime + duration);
}

// Mobile haptic helper — silently no-ops on devices/browsers that don't
// support vibration (most desktops). Pattern is the standard
// navigator.vibrate signature (single int or array of [on, off, on, ...]).
export function vibrate(pattern) {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  try { navigator.vibrate(pattern); } catch { /* ignore */ }
}

function startAmbient() {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.connect(g); g.connect(ctx.destination);
  osc.type = "sine";
  osc.frequency.setValueAtTime(130.81, ctx.currentTime);
  g.gain.setValueAtTime(0.03, ctx.currentTime);
  osc.start();
}

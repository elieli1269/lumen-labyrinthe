let ctx: AudioContext | null = null;

export function unlockAudio() {
  if (typeof AudioContext === "undefined") return;
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
}

function tone(freq: number, dur: number, delay: number, gain = 0.045) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, t);
  amp.gain.setValueAtTime(gain, t);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(amp);
  amp.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export function playPickup() {
  tone(622, 0.09, 0, 0.04);
  tone(830, 0.14, 0.07, 0.04);
}

export function playWin() {
  [523, 659, 784, 1046].forEach((freq, i) => tone(freq, 0.22, i * 0.09, 0.05));
}

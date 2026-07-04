// Tiny Web Audio one-shots — no asset files needed.

let ctx: AudioContext | null = null;

function ac(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function beep(freq: number, duration: number, type: OscillatorType, volume = 0.15, slideTo?: number): void {
  try {
    const a = ac();
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, a.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, a.currentTime + duration);
    gain.gain.setValueAtTime(volume, a.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, a.currentTime + duration);
    osc.connect(gain).connect(a.destination);
    osc.start();
    osc.stop(a.currentTime + duration);
  } catch {
    // audio not available (autoplay policy) — fine
  }
}

export const sfx = {
  swing: () => beep(220, 0.12, 'sawtooth', 0.1, 90),
  hit: () => beep(140, 0.15, 'square', 0.12, 60),
  coin: () => {
    beep(880, 0.08, 'sine', 0.1);
    setTimeout(() => beep(1320, 0.1, 'sine', 0.1), 60);
  },
  place: () => beep(330, 0.15, 'triangle', 0.15, 440),
  shoot: () => beep(600, 0.06, 'square', 0.05, 300),
  horn: () => beep(180, 0.6, 'sawtooth', 0.12, 240),
  baseHit: () => beep(100, 0.4, 'square', 0.18, 50),
  win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.25, 'triangle', 0.15), i * 140)),
  lose: () => [400, 300, 200, 120].forEach((f, i) => setTimeout(() => beep(f, 0.3, 'sawtooth', 0.12), i * 180)),
};

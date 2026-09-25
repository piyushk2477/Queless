// Soft chime with WebAudio (no audio files needed).
let ctx = null;

export function chime(times = 2) {
  try {
    ctx ??= new AudioContext();
    const notes = [659, 880, 1047];
    for (let r = 0; r < times; r++) {
      notes.forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = f;
        const t = ctx.currentTime + r * 0.6 + i * 0.12;
        g.gain.setValueAtTime(0.12, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        o.connect(g).connect(ctx.destination);
        o.start(t);
        o.stop(t + 0.26);
      });
    }
  } catch {
    /* audio blocked */
  }
}

export function unlockAudio() {
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
  } catch {
    /* ignore */
  }
}

export function vibrate(pattern = [300, 120, 300, 120, 600]) {
  if ('vibrate' in navigator) navigator.vibrate(pattern);
}

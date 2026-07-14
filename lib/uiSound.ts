// Lightweight synthesized UI sound engine (no audio assets to fetch/host).
// Every call is fired from a user gesture (click/tap), so browser autoplay
// restrictions never block it. Originally lived only inside
// InstantAIBattle.tsx (battle-specific correct/wrong/win/lose tones); this
// is the shared low-level engine so other one-off UI moments (menu toggle,
// a marketing CTA) don't need to re-implement it.

type Note = { freq: number; startMs: number; durationMs: number; type?: OscillatorType };

export function playTone(notes: Note[]) {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    notes.forEach(({ freq, startMs, durationMs, type = "sine" }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);

      const start = ctx.currentTime + startMs / 1000;
      const end = start + durationMs / 1000;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.1, start + 0.01);
      gain.gain.linearRampToValueAtTime(0, end);
      osc.start(start);
      osc.stop(end + 0.02);
    });

    window.setTimeout(() => ctx.close(), 1200);
  } catch {
    // Web Audio unsupported or blocked -- sound is a nice-to-have, fail silent.
  }
}

// Generic, quiet, single-tick sounds for everyday UI moments -- deliberately
// not used on every button sitewide (that gets old fast); reserved for a
// small number of deliberate moments (a primary marketing CTA, the mobile
// nav toggle).
export const UI_SFX = {
  click: () => playTone([{ freq: 880, startMs: 0, durationMs: 55 }]),
  menuOpen: () => playTone([{ freq: 660, startMs: 0, durationMs: 55 }, { freq: 900, startMs: 50, durationMs: 65 }]),
  menuClose: () => playTone([{ freq: 720, startMs: 0, durationMs: 65 }]),
};

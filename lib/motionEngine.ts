// The shared motion engine for the marketing site.
//
// One rAF loop, one set of listeners, one source of truth for "how fast is
// the page moving and where is the pointer". Every reactive component
// subscribes to this instead of attaching its own scroll/pointer handlers.
//
// That matters more than it sounds: eight components each running their own
// scroll listener and their own rAF means eight layout reads and eight
// animation frames competing per tick, which is exactly how a
// motion-heavy page ends up janky on a laptop.
//
// Values are smoothed rather than raw. Raw scroll delta is spiky -- a
// trackpad flick produces a burst of huge values then nothing -- and
// driving typography directly from it makes text snap and stutter. Every
// exposed value is exponentially smoothed so it reads as momentum.

export type MotionState = {
  /** Smoothed absolute scroll speed, roughly 0..1 at normal reading pace. */
  scrollVelocity: number;
  /** Signed smoothed scroll direction: -1 up, +1 down. */
  scrollDirection: number;
  /** Total scroll position in px. */
  scrollY: number;
  /** Pointer position in px. */
  pointerX: number;
  pointerY: number;
  /** Smoothed pointer speed, roughly 0..1 for a brisk move. */
  pointerVelocity: number;
  /** Pointer position as 0..1 of the viewport. */
  pointerNormX: number;
  pointerNormY: number;
};

type Listener = (state: MotionState) => void;

const state: MotionState = {
  scrollVelocity: 0,
  scrollDirection: 0,
  scrollY: 0,
  pointerX: 0,
  pointerY: 0,
  pointerVelocity: 0,
  pointerNormX: 0.5,
  pointerNormY: 0.5,
};

const listeners = new Set<Listener>();

let started = false;
let frame = 0;
let lastScrollY = 0;
let rawScrollDelta = 0;
let lastPointer = { x: 0, y: 0 };
let rawPointerDelta = 0;
let hasPointer = false;

/** Exponential smoothing factor. Lower = heavier, more inertia. */
const SMOOTH = 0.12;

/** Scroll px/frame that counts as "1" on the velocity scale. */
const SCROLL_REFERENCE = 55;
/** Pointer px/frame that counts as "1". */
const POINTER_REFERENCE = 34;

function onScroll() {
  const y = window.scrollY;
  rawScrollDelta = y - lastScrollY;
  lastScrollY = y;
  state.scrollY = y;
}

function onPointer(event: PointerEvent) {
  if (hasPointer) {
    const dx = event.clientX - lastPointer.x;
    const dy = event.clientY - lastPointer.y;
    rawPointerDelta = Math.hypot(dx, dy);
  }
  hasPointer = true;
  lastPointer = { x: event.clientX, y: event.clientY };
  state.pointerX = event.clientX;
  state.pointerY = event.clientY;
  state.pointerNormX = event.clientX / Math.max(1, window.innerWidth);
  state.pointerNormY = event.clientY / Math.max(1, window.innerHeight);
}

function tick() {
  // Smooth toward the current raw reading, then decay the raw reading so
  // velocity falls back to zero when input stops. Without the decay a
  // flick would leave the page permanently "fast".
  const scrollTarget = Math.min(1.6, Math.abs(rawScrollDelta) / SCROLL_REFERENCE);
  state.scrollVelocity += (scrollTarget - state.scrollVelocity) * SMOOTH;

  const dirTarget = rawScrollDelta === 0 ? 0 : rawScrollDelta > 0 ? 1 : -1;
  state.scrollDirection += (dirTarget - state.scrollDirection) * SMOOTH;

  const pointerTarget = Math.min(1.6, rawPointerDelta / POINTER_REFERENCE);
  state.pointerVelocity += (pointerTarget - state.pointerVelocity) * SMOOTH;

  rawScrollDelta *= 0.82;
  rawPointerDelta *= 0.82;

  for (const listener of listeners) listener(state);
  frame = requestAnimationFrame(tick);
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  lastScrollY = window.scrollY;
  state.scrollY = lastScrollY;
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("pointermove", onPointer, { passive: true });
  frame = requestAnimationFrame(tick);
}

function stop() {
  if (!started) return;
  started = false;
  window.removeEventListener("scroll", onScroll);
  window.removeEventListener("pointermove", onPointer);
  cancelAnimationFrame(frame);
}

/**
 * Subscribe to the engine. The loop only runs while something is listening,
 * so a page with no reactive components costs nothing.
 */
export function subscribeMotion(listener: Listener): () => void {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stop();
  };
}

export function getMotionState(): MotionState {
  return state;
}

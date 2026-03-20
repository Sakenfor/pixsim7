/**
 * Animation Presets
 *
 * Canonical registry of named, imperative animations.
 * Use `runAnimation(element, 'flyTo', { ... })` instead of ad-hoc inline
 * styles so every motion in the app is discoverable and tuneable from one place.
 *
 * Built on Element.animate() (Web Animations API) — no CSS keyframes needed,
 * returns a promise that resolves when the animation finishes or is cancelled.
 */

// ── Easing presets ─────────────────────────────────────────────────

export const EASING = {
  /** Standard Material-style decelerate — good for enter / fly-to */
  decelerate: 'cubic-bezier(.4, 0, .2, 1)',
  /** Accelerate out — good for exit / dismiss */
  accelerate: 'cubic-bezier(.4, 0, 1, 1)',
  /** Symmetric ease — subtle hover / idle */
  standard: 'cubic-bezier(.4, 0, .6, 1)',
  /** Springy overshoot — pop-in, bounce */
  spring: 'cubic-bezier(.175, .885, .32, 1.275)',
} as const;

// ── Duration presets (ms) ──────────────────────────────────────────

export const DURATION = {
  instant: 120,
  fast: 200,
  normal: 280,
  slow: 400,
  dramatic: 600,
} as const;

// ── Preset parameter types ─────────────────────────────────────────

export interface FlyToParams {
  /** Target point (viewport coordinates) */
  targetX: number;
  targetY: number;
  /** Source element center — computed from element if omitted */
  sourceX?: number;
  sourceY?: number;
  /** End scale factor (default 0.05) */
  endScale?: number;
  /** Duration override */
  duration?: number;
}

export interface ScaleParams {
  from?: number;
  to?: number;
  duration?: number;
}

export interface FadeParams {
  from?: number;
  to?: number;
  duration?: number;
}

export interface PopInParams {
  duration?: number;
}

export interface ShakeParams {
  /** Pixel amplitude (default 4) */
  amplitude?: number;
  duration?: number;
}

// Union of all preset params keyed by name
export interface AnimationPresetMap {
  flyTo: FlyToParams;
  scaleIn: ScaleParams;
  scaleOut: ScaleParams;
  fadeIn: FadeParams;
  fadeOut: FadeParams;
  popIn: PopInParams;
  shake: ShakeParams;
}

export type AnimationPresetName = keyof AnimationPresetMap;

// ── Preset builders ────────────────────────────────────────────────
// Each returns [keyframes, options] for Element.animate().

function getElementCenter(el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

type AnimArgs = [Keyframe[], KeyframeAnimationOptions];

const presets: { [K in AnimationPresetName]: (el: Element, params: AnimationPresetMap[K]) => AnimArgs } = {

  flyTo(el, p) {
    const src = p.sourceX != null && p.sourceY != null
      ? { x: p.sourceX, y: p.sourceY }
      : getElementCenter(el);
    const dx = p.targetX - src.x;
    const dy = p.targetY - src.y;
    const endScale = p.endScale ?? 0.05;
    return [
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(${endScale})`, opacity: 0 },
      ],
      { duration: p.duration ?? DURATION.normal, easing: EASING.decelerate, fill: 'forwards' },
    ];
  },

  scaleIn(_el, p) {
    const from = p.from ?? 0.85;
    const to = p.to ?? 1;
    return [
      [
        { transform: `scale(${from})`, opacity: 0 },
        { transform: `scale(${to})`, opacity: 1 },
      ],
      { duration: p.duration ?? DURATION.fast, easing: EASING.spring, fill: 'forwards' },
    ];
  },

  scaleOut(_el, p) {
    const from = p.from ?? 1;
    const to = p.to ?? 0.85;
    return [
      [
        { transform: `scale(${from})`, opacity: 1 },
        { transform: `scale(${to})`, opacity: 0 },
      ],
      { duration: p.duration ?? DURATION.fast, easing: EASING.accelerate, fill: 'forwards' },
    ];
  },

  fadeIn(_el, p) {
    return [
      [{ opacity: p.from ?? 0 }, { opacity: p.to ?? 1 }],
      { duration: p.duration ?? DURATION.fast, easing: EASING.standard, fill: 'forwards' },
    ];
  },

  fadeOut(_el, p) {
    return [
      [{ opacity: p.from ?? 1 }, { opacity: p.to ?? 0 }],
      { duration: p.duration ?? DURATION.fast, easing: EASING.standard, fill: 'forwards' },
    ];
  },

  popIn(_el, p) {
    return [
      [
        { transform: 'scale(0.6)', opacity: 0 },
        { transform: 'scale(1.05)', opacity: 1, offset: 0.7 },
        { transform: 'scale(1)', opacity: 1 },
      ],
      { duration: p.duration ?? DURATION.normal, easing: EASING.spring, fill: 'forwards' },
    ];
  },

  shake(_el, p) {
    const a = p.amplitude ?? 4;
    return [
      [
        { transform: 'translateX(0)' },
        { transform: `translateX(-${a}px)`, offset: 0.15 },
        { transform: `translateX(${a}px)`, offset: 0.3 },
        { transform: `translateX(-${a}px)`, offset: 0.45 },
        { transform: `translateX(${a}px)`, offset: 0.6 },
        { transform: `translateX(-${a * 0.5}px)`, offset: 0.75 },
        { transform: 'translateX(0)' },
      ],
      { duration: p.duration ?? DURATION.slow, easing: EASING.standard },
    ];
  },
};

// ── Public API ─────────────────────────────────────────────────────

/**
 * Run a named animation preset on a DOM element.
 * Returns a promise that resolves when the animation finishes.
 *
 * @example
 * await runAnimation(el, 'flyTo', { targetX: 100, targetY: 500 });
 * el.remove();
 */
export function runAnimation<K extends AnimationPresetName>(
  el: Element,
  name: K,
  params: AnimationPresetMap[K],
): Animation {
  const builder = presets[name];
  const [keyframes, options] = builder(el, params as any);
  return el.animate(keyframes, options);
}

/**
 * Convenience: run animation and return a promise.
 */
export async function animateElement<K extends AnimationPresetName>(
  el: Element,
  name: K,
  params: AnimationPresetMap[K],
): Promise<void> {
  const anim = runAnimation(el, name, params);
  await anim.finished;
}

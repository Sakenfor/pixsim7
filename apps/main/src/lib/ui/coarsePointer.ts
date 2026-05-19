/**
 * Coarse-pointer detection → root class.
 *
 * Toggles `coarse-pointer` on <html> whenever the primary input is a finger
 * or stylus (`(pointer: coarse)`), regardless of viewport width. This is the
 * correct signal for *touch-target* sizing — a tablet in landscape is wide
 * but still finger-driven, where `useIsMobileViewport` (width-based) would
 * miss it.
 *
 * The class drives a single global CSS rule in index.css that expands the
 * invisible hit-area of small controls (see `.coarse-pointer ... ::after`).
 * No per-component edits; opt a dense row out with `no-tap-expand`.
 *
 * Side-effect module: imported once from main.tsx. Safe to call repeatedly.
 */

const CLASS = 'coarse-pointer';
const QUERY = '(pointer: coarse)';

let wired = false;

export function initCoarsePointerClass(): void {
  if (wired || typeof window === 'undefined' || !window.matchMedia) return;
  wired = true;

  const mql = window.matchMedia(QUERY);
  const apply = (matches: boolean) => {
    document.documentElement.classList.toggle(CLASS, matches);
  };

  apply(mql.matches);
  mql.addEventListener('change', (e) => apply(e.matches));
}

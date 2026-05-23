/**
 * Skin CSS emitter.
 *
 * Generates a single <style> block from the skin registry and injects it once.
 * This is the scoped analogue of the Tailwind preset's `.dark` / `.accent-*`
 * `addBase` blocks — emitted at runtime so the registry stays the single
 * source of truth (no codegen step). See plan `panel-skin-theming`.
 *
 * Selector convention:
 *   .skin-<id>                       → base vars + font + color-scheme
 *   .skin-<id>.skin-variant-<v>      → scheme-independent variant vars
 *   .skin-<id>[data-skin-fx~="glow"]      → phosphor text glow
 *   .skin-<id>[data-skin-fx~="scanline"]  → animated CRT scanline overlay
 *
 * Effects honor reduced-motion: the scanline animation is disabled both via
 * `@media (prefers-reduced-motion: reduce)` and under a `.user-reduced-motion`
 * ancestor (the app's existing accessibility class).
 */

import { SKINS } from './registry';

const STYLE_ELEMENT_ID = 'pixsim-panel-skins';

function varsBlock(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
}

function buildCss(): string {
  const blocks: string[] = [];

  for (const skin of Object.values(SKINS)) {
    if (skin.id === 'default') continue; // no-op: inherits global theme

    const sel = `.skin-${skin.id}`;

    // Base: font + color-scheme + any base vars. `color-scheme: dark` makes
    // native form controls / scrollbars match the dark phosphor surface.
    const baseDecls: string[] = [];
    if (skin.fontStack) {
      baseDecls.push(`  --font-skin: ${skin.fontStack};`);
      baseDecls.push('  font-family: var(--font-skin);');
    }
    baseDecls.push('  color-scheme: dark;');
    // Scanline overlay containment: a positioned root + a fresh stacking
    // context so `::after` z-index resolves within the panel subtree (won't
    // leak above modals / floating-panel chrome).
    baseDecls.push('  position: relative;');
    baseDecls.push('  isolation: isolate;');
    if (Object.keys(skin.vars).length) baseDecls.push(varsBlock(skin.vars));
    blocks.push(`${sel} {\n${baseDecls.join('\n')}\n}`);

    // Force-inherit the skin font across the entire subtree. Without this,
    // Tailwind's `font-mono` / `font-sans` utilities (and any explicit
    // `font-family` lower in the tree) override the root inheritance and the
    // skin font never reaches the visible text. For a terminal-style skin
    // everything wearing the skin should be monospace anyway — the
    // overridden `font-mono` resolves to the same stack, just rerouted
    // through --font-skin. Icon SVGs are unaffected (no font glyphs).
    if (skin.fontStack) {
      blocks.push(`${sel}, ${sel} * {\n  font-family: var(--font-skin);\n}`);
    }

    // Variants (scheme-independent — replace light/dark for this skin).
    for (const [vid, variant] of Object.entries(skin.variants ?? {})) {
      blocks.push(`${sel}.skin-variant-${vid} {\n${varsBlock(variant.vars)}\n}`);
    }

    if (skin.supportsEffects) {
      // Glow — phosphor bloom on text. Two stacked shadows: tight inner halo
      // + wider outer bloom for a CRT-ish read on already-luminous phosphor.
      blocks.push(
        `${sel}[data-skin-fx~="glow"] {\n` +
          '  text-shadow:\n' +
          '    0 0 2px rgb(var(--color-accent) / 0.55),\n' +
          '    0 0 8px rgb(var(--color-accent) / 0.45),\n' +
          '    0 0 16px rgb(var(--color-accent) / 0.25);\n' +
          '}',
      );
      // Scanline — moving raster overlay. Pseudo-element, non-interactive.
      // z-index sits above the in-panel z-scale (panel internals top out around
      // z-tooltip ~1003 within their own stacking context) so the overlay
      // isn't buried by sub-shells / chips.
      blocks.push(
        `${sel}[data-skin-fx~="scanline"]::after {\n` +
          '  content: "";\n' +
          '  position: absolute;\n' +
          '  inset: 0;\n' +
          '  pointer-events: none;\n' +
          '  z-index: 9999;\n' +
          '  background: repeating-linear-gradient(\n' +
          '    0deg,\n' +
          '    rgb(0 0 0 / 0) 0px,\n' +
          '    rgb(0 0 0 / 0) 2px,\n' +
          '    rgb(0 0 0 / 0.28) 3px,\n' +
          '    rgb(0 0 0 / 0) 4px\n' +
          '  );\n' +
          '  background-size: 100% 4px;\n' +
          '  animation: pixsim-skin-scanline 8s linear infinite;\n' +
          '}',
      );
    }
  }

  // Scanline keyframes + reduced-motion guards.
  blocks.push(
    '@keyframes pixsim-skin-scanline {\n' +
      '  from { background-position: 0 0; }\n' +
      '  to { background-position: 0 -160px; }\n' +
      '}',
  );
  blocks.push(
    '@media (prefers-reduced-motion: reduce) {\n' +
      '  [data-skin-fx~="scanline"]::after { animation: none; }\n' +
      '}',
  );
  blocks.push(
    '.user-reduced-motion [data-skin-fx~="scanline"]::after { animation: none; }',
  );

  return blocks.join('\n\n');
}

let injected = false;

/** Inject the skin stylesheet once. Idempotent and SSR-safe. */
export function ensureSkinStyles(): void {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  let el = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ELEMENT_ID;
    document.head.appendChild(el);
  }
  el.textContent = buildCss();
}

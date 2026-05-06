/**
 * Canonical preset categories. Single source of truth — referenced by the
 * preset form, the "create from selection" modal, and (transitively) the
 * preset-list filter, which derives its options from whatever categories
 * are actually in use on saved presets.
 *
 * Stored on the preset as a freeform string; this list just gives the UI a
 * curated dropdown plus an escape hatch for one-offs. Anything outside this
 * list is preserved and rendered as a custom value.
 *
 * `Snippet` is special-cased elsewhere (📦 icon in the action picker, sorted
 * first) — keep that exact spelling.
 */
export interface PresetCategoryOption {
  value: string;
  label: string;
  /** Optional description used as `title=` on the option for hover help. */
  hint?: string;
}

export const PRESET_CATEGORIES: readonly PresetCategoryOption[] = [
  { value: 'Snippet', label: '📦 Snippet', hint: 'Reusable building-block sequence — called by other presets via Call Preset' },
  { value: 'Login', label: 'Login / Auth', hint: 'Sign-in, account switching, OTP flows' },
  { value: 'Generation', label: 'Generation', hint: 'Triggering generation flows on a provider app' },
  { value: 'Navigation', label: 'Navigation', hint: 'Moving between screens, tabs, menus' },
  { value: 'Utility', label: 'Utility / Setup / Cleanup', hint: 'First-run config, screenshots, sign-out, diagnostics, waits' },
] as const;

const CANONICAL_VALUES = new Set(PRESET_CATEGORIES.map((c) => c.value));

/** True if `value` is one of the curated categories. */
export function isCanonicalPresetCategory(value: string): boolean {
  return CANONICAL_VALUES.has(value);
}

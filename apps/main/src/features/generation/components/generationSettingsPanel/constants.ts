// ── Provider brand config ──────────────────────────────────────────────
export const PROVIDER_BRANDS: Record<string, { color: string; short: string }> = {
  pixverse: { color: '#7C3AED', short: 'Px' },
  sora:     { color: '#6B7280', short: 'So' },
  remaker:  { color: '#059669', short: 'Rm' },
};
export const AUTO_BRAND = { color: '#3B82F6', short: 'A' };

// ── Shared dropdown item style ────────────────────────────────────────
export const DROPDOWN_ITEM_CLS = 'w-full flex items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-neutral-100 dark:hover:bg-neutral-700';

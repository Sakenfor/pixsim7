import { useEffect } from 'react';

import type { IconName } from '@lib/icons';

// ── Provider brand config ──────────────────────────────────────────────
export const PROVIDER_BRANDS: Record<string, { color: string; short: string }> = {
  pixverse: { color: '#7C3AED', short: 'Px' },
  sora:     { color: '#6B7280', short: 'So' },
  remaker:  { color: '#059669', short: 'Rm' },
};
export const AUTO_BRAND = { color: '#3B82F6', short: 'A' };

// ── Operation type config ──────────────────────────────────────────────
export const OPERATION_ICONS: Record<string, { icon: IconName; label: string; color: string }> = {
  image_to_image:   { icon: 'image',          label: 'Image',      color: '#8B5CF6' },
  image_to_video:   { icon: 'film',           label: 'Video',      color: '#2563EB' },
  video_extend:     { icon: 'arrowRight',     label: 'Extend',     color: '#0891B2' },
  video_transition: { icon: 'arrowRightLeft', label: 'Transition', color: '#D97706' },
  fusion:           { icon: 'layers',         label: 'Fusion',     color: '#DC2626' },
};

// ── Shared dropdown menu shell ─────────────────────────────────────────
export const DROPDOWN_MENU_CLS = 'absolute left-0 top-full mt-1 z-50 min-w-[140px] py-1 rounded-lg shadow-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700';
export const DROPDOWN_ITEM_CLS = 'w-full flex items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-neutral-100 dark:hover:bg-neutral-700';

// ── Shared close-on-outside hook ───────────────────────────────────────
export function useClickOutside(ref: React.RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, ref, close]);
}

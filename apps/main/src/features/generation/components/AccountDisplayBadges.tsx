import clsx from 'clsx';

import { Icon } from '@lib/icons';

import { isPromotionActive } from '@features/providers/lib/promotionCatalog';

const TIER_CONFIG: Record<number, { label: string; color: string }> = {
  1: { label: '1', color: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/25' },
  2: { label: '2', color: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/25' },
  3: { label: '3', color: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25' },
};

export function countActivePromotions(promotions?: Record<string, unknown> | null): number {
  if (!promotions || typeof promotions !== 'object') return 0;
  return Object.values(promotions).filter((value) => isPromotionActive(value)).length;
}

export function AccountTierBadge({ tier }: { tier?: number | null }) {
  if (typeof tier !== 'number') return null;
  const cfg = TIER_CONFIG[tier];
  if (!cfg) return null;
  return (
    <span
      className={clsx(
        'inline-flex items-center justify-center w-[16px] h-[16px] rounded text-[8px] font-bold border',
        cfg.color,
      )}
    >
      {cfg.label}
    </span>
  );
}

export function AccountPromoBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex items-center gap-0.5 px-1 py-px rounded text-[8px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-500/20">
      <Icon name="sparkles" size={8} />
      {count}
    </span>
  );
}

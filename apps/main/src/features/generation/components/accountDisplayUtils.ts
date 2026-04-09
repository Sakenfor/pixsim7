import { isPromotionActive } from '@features/providers/lib/promotionCatalog';

export function countActivePromotions(promotions?: Record<string, unknown> | null): number {
  if (!promotions || typeof promotions !== 'object') return 0;
  return Object.values(promotions).filter((value) => isPromotionActive(value)).length;
}

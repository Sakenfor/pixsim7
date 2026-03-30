export const PROMOTION_DISCOUNTS: Record<string, number> = {
  v6: 0.7, // 30% off during v6 launch promo
};

const PROMOTION_KEY_ALIASES: Record<string, string> = {
  is_v6_discount: 'v6',
};

const PROMOTION_DISCOUNT_LOOKUP: Record<string, number> = Object.entries(PROMOTION_DISCOUNTS).reduce(
  (acc, [rawModelId, multiplier]) => {
    const key = normalizePromotionKey(rawModelId);
    if (key) acc[key] = multiplier;
    return acc;
  },
  {} as Record<string, number>,
);

export function normalizePromotionKey(rawKey: string): string {
  let key = rawKey.trim().toLowerCase();
  if (!key) return '';
  if (PROMOTION_KEY_ALIASES[key]) key = PROMOTION_KEY_ALIASES[key];
  if (key.startsWith('is_') && key.endsWith('_discount')) {
    key = key.slice(3, -'_discount'.length);
  }
  if (key.startsWith('is_') && key.endsWith('_promo')) {
    key = key.slice(3, -'_promo'.length);
  }
  // Canonical model-id form: e.g. seedream_4_5 -> seedream-4.5.
  key = key.replace(/(\d)_(\d)/g, '$1.$2').replace(/_/g, '-').replace(/\s+/g, '');
  return key;
}

export function isPromotionActive(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'on', 'active', 'enabled'].includes(value.trim().toLowerCase());
  }
  return Boolean(value);
}

export function getModelMatchKeys(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const lower = trimmed.toLowerCase();
  const compact = lower.replace(/[\s_-]+/g, '');
  const lastSegment = lower.split(/[/:]/).filter(Boolean).at(-1) ?? lower;
  const compactLastSegment = lastSegment.replace(/[\s_-]+/g, '');
  return [trimmed, lower, compact, lastSegment, compactLastSegment];
}

export function buildKnownModelMatchKeySet(knownModelIds?: Iterable<string>): Set<string> {
  const knownModelMatchKeys = new Set<string>();
  if (!knownModelIds) return knownModelMatchKeys;
  for (const rawModelId of knownModelIds) {
    if (typeof rawModelId !== 'string') continue;
    const modelId = normalizePromotionKey(rawModelId);
    if (!modelId) continue;
    for (const key of getModelMatchKeys(modelId)) knownModelMatchKeys.add(key);
  }
  return knownModelMatchKeys;
}

export function isKnownModelPromotion(modelId: string, knownModelMatchKeys: Set<string>): boolean {
  if (knownModelMatchKeys.size === 0) return false;
  return getModelMatchKeys(modelId).some((key) => knownModelMatchKeys.has(key));
}

export function resolvePromotionDiscount(rawModelId: string): number | undefined {
  const key = normalizePromotionKey(rawModelId);
  if (!key) return undefined;
  return PROMOTION_DISCOUNT_LOOKUP[key];
}

export type PromotionCategory =
  | 'pricing_mapped'
  | 'pricing_unmapped'
  | 'feature'
  | 'inactive';

export interface PromotionDetailEntry {
  rawKey: string;
  key: string;
  active: boolean;
  category: PromotionCategory;
  discountMultiplier?: number;
}

export function buildPromotionDetailEntries(
  promotions: Record<string, unknown> | null | undefined,
  knownModelIds?: Iterable<string>,
): PromotionDetailEntry[] {
  if (!promotions || typeof promotions !== 'object') return [];
  const knownModelMatchKeys = buildKnownModelMatchKeySet(knownModelIds);

  const entries: PromotionDetailEntry[] = [];
  for (const [rawKey, rawValue] of Object.entries(promotions)) {
    const key = normalizePromotionKey(rawKey);
    if (!key) continue;
    const active = isPromotionActive(rawValue);
    const discountMultiplier = resolvePromotionDiscount(key);
    const knownModel = isKnownModelPromotion(key, knownModelMatchKeys);

    const category: PromotionCategory = !active
      ? 'inactive'
      : knownModel
        ? (discountMultiplier !== undefined ? 'pricing_mapped' : 'pricing_unmapped')
        : 'feature';

    entries.push({
      rawKey,
      key,
      active,
      category,
      discountMultiplier,
    });
  }

  return entries.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    if (a.category !== b.category) {
      const rank: Record<PromotionCategory, number> = {
        pricing_mapped: 0,
        pricing_unmapped: 1,
        feature: 2,
        inactive: 3,
      };
      return rank[a.category] - rank[b.category];
    }
    return a.key.localeCompare(b.key);
  });
}

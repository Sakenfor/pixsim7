import { useMemo } from 'react';

import {
  buildKnownModelMatchKeySet,
  isKnownModelPromotion,
  isPromotionActive,
  normalizePromotionKey,
  resolvePromotionDiscount,
} from '../lib/promotionCatalog';

import { useProviderAccounts } from './useProviderAccounts';

export interface ModelPromotionsResult {
  promoted: Set<string>;
  discounts: Record<string, number>;
  unknownPromotions: Set<string>;
  sourceAccountIds: number[];
}

/**
 * Returns model promotions for the current account context.
 *
 * Follows the same account-resolution pattern as useUnlimitedModels:
 * - Pinned account: only that account's promotions
 * - Auto mode: union of all active accounts' promotions
 *
 * Promotion flags come from Pixverse credits (`is_v6_discount`, etc.)
 * and are synced into provider_metadata.promotions during credit sync.
 */
export function useModelPromotions(
  pinnedAccountId?: number | null,
  providerId?: string,
  knownModelIds?: Iterable<string>,
): ModelPromotionsResult {
  const { accounts } = useProviderAccounts(providerId);

  return useMemo(() => {
    const promoted = new Set<string>();
    const discounts: Record<string, number> = {};
    const unknownPromotions = new Set<string>();
    const sourceAccountIds = new Set<number>();
    const knownModelMatchKeys = buildKnownModelMatchKeySet(knownModelIds);

    const collectFromAccount = (account: any) => {
      const promos: Record<string, unknown> | undefined = account?.promotions;
      if (!promos || typeof promos !== 'object') return;

      const planTier = Number(account?.plan_tier ?? 0);
      // In auto mode, avoid scanning baseline/free accounts with no subscription context.
      // If promotions are present, still allow them even on lower tiers.
      if (!pinnedAccountId && planTier <= 0 && Object.keys(promos).length === 0) {
        return;
      }

      let accountContributed = false;
      for (const [rawModelId, active] of Object.entries(promos)) {
        if (!isPromotionActive(active)) continue;
        const modelId = normalizePromotionKey(rawModelId);
        if (!modelId) continue;
        if (knownModelMatchKeys.size > 0) {
          const matchesKnownModel = isKnownModelPromotion(modelId, knownModelMatchKeys);
          if (!matchesKnownModel) continue;
        }
        promoted.add(modelId);
        accountContributed = true;
        const mult = resolvePromotionDiscount(modelId);
        if (mult !== undefined) {
          discounts[modelId] = mult;
        } else {
          unknownPromotions.add(modelId);
        }
      }
      if (accountContributed && typeof account?.id === 'number') {
        sourceAccountIds.add(account.id);
      }
    };

    if (pinnedAccountId) {
      const account = accounts.find((a) => a.id === pinnedAccountId);
      collectFromAccount(account);
    } else {
      for (const a of accounts) {
        if (a.status === 'active') collectFromAccount(a);
      }
    }

    return {
      promoted,
      discounts,
      unknownPromotions,
      sourceAccountIds: Array.from(sourceAccountIds),
    };
  }, [pinnedAccountId, accounts, knownModelIds]);
}

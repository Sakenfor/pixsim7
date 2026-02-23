import { useMemo } from 'react';

import { useProviderAccounts } from './useProviderAccounts';

/**
 * Returns the set of model IDs that are currently unlimited (free) for a
 * specific account, or across all active accounts when no account is pinned.
 *
 * The list comes from PixVerse's plan_details API and is synced into
 * provider_metadata → unlimited_image_models on each account.
 *
 * NOTE: PixVerse rotates which models are unlimited, so treat this as
 * "currently free" — not permanently free.
 */
export function useUnlimitedModels(
  pinnedAccountId?: number | null,
  providerId?: string,
): Set<string> {
  const { accounts } = useProviderAccounts(providerId);

  return useMemo(() => {
    const models = new Set<string>();

    if (pinnedAccountId) {
      // Pinned account: only that account's unlimited models
      const account = accounts.find(a => a.id === pinnedAccountId);
      if (account?.unlimited_image_models) {
        for (const m of account.unlimited_image_models) models.add(m);
      }
    } else {
      // Auto mode: union of all active accounts' unlimited models
      for (const a of accounts) {
        if (a.status === 'active' && a.unlimited_image_models) {
          for (const m of a.unlimited_image_models) models.add(m);
        }
      }
    }

    return models;
  }, [pinnedAccountId, accounts]);
}

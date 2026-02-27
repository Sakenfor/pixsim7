import { useMemo } from 'react';

import { useProviderAccounts } from './useProviderAccounts';

function addModelVariants(target: Set<string>, rawValue: unknown) {
  if (typeof rawValue !== 'string') return;
  const trimmed = rawValue.trim();
  if (!trimmed) return;

  const lower = trimmed.toLowerCase();
  const compact = lower.replace(/[\s_-]+/g, '');
  const lastSegment = lower.split(/[/:]/).filter(Boolean).at(-1) ?? lower;
  const compactLastSegment = lastSegment.replace(/[\s_-]+/g, '');

  target.add(trimmed);
  target.add(lower);
  target.add(compact);
  target.add(lastSegment);
  target.add(compactLastSegment);
}

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
    const collectFromAccount = (account: any) => {
      const list = account?.unlimited_image_models ?? account?.plan_unlimited_image_models;
      if (!Array.isArray(list)) return;
      for (const m of list) addModelVariants(models, m);
    };

    if (pinnedAccountId) {
      // Pinned account: only that account's unlimited models
      const account = accounts.find(a => a.id === pinnedAccountId);
      collectFromAccount(account);
    } else {
      // Auto mode: union of all active accounts' unlimited models
      for (const a of accounts) {
        if (a.status === 'active') collectFromAccount(a);
      }
    }

    return models;
  }, [pinnedAccountId, accounts]);
}

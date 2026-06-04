import { IconButton, Popover } from '@pixsim7/shared.ui';
import clsx from 'clsx';
import { useCallback, useMemo, useRef, useState } from 'react';

import { Icon } from '@lib/icons';

import {
  AccountPromoBadge,
  AccountTierBadge,
} from '@features/generation/components/AccountDisplayBadges';
import { countActivePromotions } from '@features/generation/components/accountDisplayUtils';
import { AccountRoutingManagerModal, type RoutingAccount } from '@features/providers';

import { usePersistentState } from '@/hooks/usePersistentState';

import { AUTO_BRAND, DROPDOWN_ITEM_CLS } from './constants';

interface AccountOption {
  id: number;
  provider_id?: string;
  nickname?: string | null;
  email: string;
  max_concurrent_jobs?: number;
  current_processing_jobs?: number;
  promotions?: Record<string, unknown>;
  plan_tier?: number;
  priority?: number;
  routing_allow_patterns?: string[] | null;
  routing_deny_patterns?: string[] | null;
  routing_priority_overrides?: Record<string, number> | null;
  last_used?: string | null;
  total_videos_generated?: number;
}

interface LocalAccountUsage {
  count: number;
  lastSelectedAt: number;
}

const ACCOUNT_USAGE_STORAGE_KEY = 'quickgen:account-usage-v1';

function accountDisplayName(account: AccountOption): string {
  return account.nickname ? `${account.nickname} (${account.email})` : account.email;
}

function accountToken(account?: AccountOption, fallback?: number): string {
  const source = account?.nickname || account?.email || (fallback != null ? String(fallback) : '');
  const match = source.match(/[A-Za-z0-9]/);
  return (match?.[0] || '?').toUpperCase();
}

function hasRoutingRules(account: AccountOption): boolean {
  return (
    (account.routing_allow_patterns?.length ?? 0) > 0 ||
    (account.routing_deny_patterns?.length ?? 0) > 0 ||
    Object.keys(account.routing_priority_overrides ?? {}).length > 0 ||
    (account.priority ?? 0) !== 0
  );
}

export function AccountIconButton({
  accounts,
  selectedAccountId,
  onSelect,
  disabled,
  operationType,
  model,
}: {
  accounts: AccountOption[];
  selectedAccountId?: number;
  onSelect: (id: number | undefined) => void;
  disabled?: boolean;
  operationType?: string;
  model?: string;
}) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [routingTarget, setRoutingTarget] = useState<{ accountId: number; providerId?: string; anchor: DOMRect } | null>(null);
  const [localAccountUpdates, setLocalAccountUpdates] = useState<Record<number, Partial<AccountOption>>>({});
  const [localUsageByAccountId, setLocalUsageByAccountId] = usePersistentState<Record<string, LocalAccountUsage>>(
    ACCOUNT_USAGE_STORAGE_KEY,
    {},
  );
  const triggerRef = useRef<HTMLButtonElement>(null);

  const recordAccountUsage = useCallback((accountId: number) => {
    const now = Date.now();
    setLocalUsageByAccountId((prev) => {
      const key = String(accountId);
      const existing = prev[key];
      return {
        ...prev,
        [key]: {
          count: (existing?.count ?? 0) + 1,
          lastSelectedAt: now,
        },
      };
    });
  }, [setLocalUsageByAccountId]);

  const mergedAccounts = useMemo(
    () => accounts.map((account) => ({ ...account, ...(localAccountUpdates[account.id] || {}) })),
    [accounts, localAccountUpdates],
  );

  const selectedAccount = useMemo(
    () => mergedAccounts.find((account) => account.id === selectedAccountId),
    [mergedAccounts, selectedAccountId],
  );
  const selectedToken = accountToken(selectedAccount, selectedAccountId);
  const selectedConcurrencyCap = useMemo(() => {
    const cap = selectedAccount?.max_concurrent_jobs;
    if (typeof cap !== 'number' || !Number.isFinite(cap) || cap < 0) return null;
    return cap;
  }, [selectedAccount]);

  const rankedAccounts = useMemo(() => {
    return mergedAccounts
      .map((account, index) => {
        const localUsage = localUsageByAccountId[String(account.id)];
        const lastUsedAtMs = account.last_used ? new Date(account.last_used).getTime() : 0;
        return {
          account,
          index,
          localLastSelectedAt: localUsage?.lastSelectedAt ?? 0,
          localSelectionCount: localUsage?.count ?? 0,
          backendLastUsedAt: Number.isFinite(lastUsedAtMs) ? lastUsedAtMs : 0,
          backendGeneratedCount: account.total_videos_generated ?? 0,
        };
      })
      .sort((a, b) => {
        if (a.localLastSelectedAt !== b.localLastSelectedAt) {
          return b.localLastSelectedAt - a.localLastSelectedAt;
        }
        if (a.localSelectionCount !== b.localSelectionCount) {
          return b.localSelectionCount - a.localSelectionCount;
        }
        if (a.backendLastUsedAt !== b.backendLastUsedAt) {
          return b.backendLastUsedAt - a.backendLastUsedAt;
        }
        if (a.backendGeneratedCount !== b.backendGeneratedCount) {
          return b.backendGeneratedCount - a.backendGeneratedCount;
        }
        return a.index - b.index;
      })
      .map((entry) => entry.account);
  }, [mergedAccounts, localUsageByAccountId]);

  const wheelValues = useMemo(
    () => [undefined as number | undefined, ...rankedAccounts.map((account) => account.id)],
    [rankedAccounts],
  );
  const filteredAccounts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return rankedAccounts;
    return rankedAccounts.filter((account) => {
      const name = accountDisplayName(account).toLowerCase();
      return name.includes(query) || String(account.id).includes(query);
    });
  }, [rankedAccounts, searchQuery]);

  const title = selectedAccount
    ? `Account: ${accountDisplayName(selectedAccount)}${selectedConcurrencyCap != null
      ? ` | Gen concurrency: ${selectedAccount.current_processing_jobs ?? 0}/${selectedConcurrencyCap}`
      : ''}`
    : selectedAccountId != null
      ? `Account: Pinned #${selectedAccountId} (inactive)`
      : 'Account: Auto';

  const handleRoutingSaved = (updated: RoutingAccount) => {
    setLocalAccountUpdates((prev) => ({
      ...prev,
      [updated.id]: {
        ...prev[updated.id],
        provider_id: updated.provider_id,
        nickname: updated.nickname,
        email: updated.email,
        priority: updated.priority,
        routing_allow_patterns: updated.routing_allow_patterns ?? [],
        routing_deny_patterns: updated.routing_deny_patterns ?? [],
        routing_priority_overrides: updated.routing_priority_overrides ?? {},
      },
    }));
  };

  return (
    <>
      <IconButton
        ref={triggerRef}
        bg={selectedAccountId != null ? '#4B5563' : AUTO_BRAND.color}
        size="lg"
        tapExpand={false}
        icon={
          <span className="relative inline-flex h-full w-full items-center justify-center">
            {selectedAccountId != null ? (
              <span className="text-[10px] font-bold">{selectedToken}</span>
            ) : (
              <Icon name="users" size={12} />
            )}
            {selectedConcurrencyCap != null && (
              <span className="absolute -top-1 -right-1 inline-flex min-w-[12px] h-3 items-center justify-center rounded-full border border-neutral-300 bg-white px-1 text-[8px] font-bold leading-none text-neutral-700 shadow-sm dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100">
                {selectedConcurrencyCap}
              </span>
            )}
          </span>
        }
        onClick={() => setOpen((current) => !current)}
        onWheel={(e: React.WheelEvent) => {
          if (disabled || wheelValues.length <= 1) return;
          e.preventDefault();
          const currentIndex = wheelValues.findIndex((value) => value === selectedAccountId);
          const index = currentIndex >= 0 ? currentIndex : 0;
          const nextIndex = e.deltaY > 0
            ? (index + 1) % wheelValues.length
            : (index - 1 + wheelValues.length) % wheelValues.length;
          const nextValue = wheelValues[nextIndex];
          if (nextValue != null) {
            recordAccountUsage(nextValue);
          }
          onSelect(nextValue);
        }}
        disabled={disabled}
        title={title}
      />

      <Popover
        anchor={triggerRef.current}
        placement="bottom"
        align="start"
        offset={4}
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
      >
        <div className="min-w-[260px] py-1 rounded-lg shadow-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
          <div className="px-2 pb-1">
            <div className="flex items-center gap-1 rounded-md border border-neutral-200 bg-neutral-50 px-1.5 py-1 dark:border-neutral-700 dark:bg-neutral-900/60">
              <Icon name="search" size={11} className="text-neutral-500 dark:text-neutral-400" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search accounts"
                className="w-full bg-transparent text-[11px] outline-none text-neutral-700 dark:text-neutral-200 placeholder:text-neutral-400"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              onSelect(undefined);
              setOpen(false);
            }}
            className={clsx(DROPDOWN_ITEM_CLS, selectedAccountId == null && 'font-semibold')}
          >
            <span
              className="inline-flex w-4 h-4 rounded-full text-[8px] font-bold text-white items-center justify-center shrink-0"
              style={{ backgroundColor: AUTO_BRAND.color }}
            >
              A
            </span>
            Auto account
          </button>

          {selectedAccountId != null && !selectedAccount && (
            <button
              type="button"
              onClick={() => {
                onSelect(selectedAccountId);
                setOpen(false);
              }}
              className={clsx(DROPDOWN_ITEM_CLS, 'font-semibold')}
            >
              <span className="inline-flex w-4 h-4 rounded-full text-[8px] font-bold text-white items-center justify-center shrink-0 bg-neutral-500">
                {selectedToken}
              </span>
              {`Pinned #${selectedAccountId} (inactive)`}
            </button>
          )}

          <div className="max-h-60 overflow-y-auto">
            {filteredAccounts.length === 0 && (
              <div className="px-3 py-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                No matching accounts
              </div>
            )}

            {filteredAccounts.map((account) => {
              const accountHasRules = hasRoutingRules(account);
              return (
              <div key={account.id} className="group">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      recordAccountUsage(account.id);
                      onSelect(account.id);
                      setOpen(false);
                    }}
                    className={clsx(
                      DROPDOWN_ITEM_CLS,
                      'flex-1 text-left min-w-0',
                      selectedAccountId === account.id && 'font-semibold',
                    )}
                    title={account.email}
                  >
                    <span className="inline-flex w-4 h-4 rounded-full text-[8px] font-bold text-white items-center justify-center shrink-0 bg-neutral-500">
                      {accountToken(account)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{accountDisplayName(account)}</span>
                    <span className="inline-flex items-center gap-1 shrink-0">
                      <AccountTierBadge tier={account.plan_tier} />
                      <AccountPromoBadge count={countActivePromotions(account.promotions)} />
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      setRoutingTarget({
                        accountId: account.id,
                        providerId: account.provider_id,
                        anchor: (e.currentTarget as HTMLElement).getBoundingClientRect(),
                      });
                      setOpen(false);
                    }}
                    className={clsx(
                      'mr-1 inline-flex w-5 h-5 items-center justify-center rounded hover:bg-neutral-100 dark:hover:bg-neutral-700',
                      accountHasRules
                        ? 'text-accent opacity-100'
                        : 'text-neutral-500 dark:text-neutral-400 opacity-0 group-hover:opacity-100',
                    )}
                    title={
                      accountHasRules
                        ? 'Routing rules configured — click to edit'
                        : 'Adjust routing and priority rules'
                    }
                  >
                    <Icon name="sliders" size={11} />
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      </Popover>

      <AccountRoutingManagerModal
        isOpen={routingTarget != null}
        anchor={routingTarget?.anchor ?? null}
        accountId={routingTarget?.accountId ?? null}
        providerId={routingTarget?.providerId}
        contextOperation={operationType}
        contextModel={model}
        onClose={() => setRoutingTarget(null)}
        onSaved={handleRoutingSaved}
      />
    </>
  );
}

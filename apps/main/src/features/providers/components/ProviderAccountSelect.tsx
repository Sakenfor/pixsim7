import clsx from 'clsx';

import type { ProviderAccount } from '../hooks/useProviderAccounts';

interface ProviderAccountSelectProps {
  accounts: ProviderAccount[];
  value: number | null | undefined;
  onChange: (accountId: number | null) => void;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  emptyLabel?: string;
  loadingLabel?: string;
  noAccountsLabel?: string;
  allowEmpty?: boolean;
  showProviderId?: boolean;
  showStatus?: boolean;
}

function formatAccountLabel(
  account: ProviderAccount,
  {
    showProviderId,
    showStatus,
  }: {
    showProviderId: boolean;
    showStatus: boolean;
  },
): string {
  const name = account.nickname?.trim() || account.email;
  const providerPart = showProviderId ? ` (${account.provider_id})` : '';
  const statusPart = showStatus && account.status !== 'active' ? ` [${account.status}]` : '';
  return `${name}${providerPart}${statusPart}`;
}

export function ProviderAccountSelect({
  accounts,
  value,
  onChange,
  loading = false,
  disabled = false,
  className,
  emptyLabel = 'Select account...',
  loadingLabel = 'Loading accounts...',
  noAccountsLabel = 'No accounts available',
  allowEmpty = true,
  showProviderId = true,
  showStatus = true,
}: ProviderAccountSelectProps) {
  const resolvedValue = value ?? null;
  const hasResolvedValue = resolvedValue !== null && accounts.some((account) => account.id === resolvedValue);

  return (
    <select
      value={resolvedValue ?? ''}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      className={clsx(className)}
      disabled={disabled || loading || (accounts.length === 0 && !hasResolvedValue)}
    >
      {allowEmpty && (
        <option value="">
          {loading ? loadingLabel : accounts.length === 0 ? noAccountsLabel : emptyLabel}
        </option>
      )}
      {accounts.map((account) => (
        <option key={account.id} value={account.id}>
          {formatAccountLabel(account, { showProviderId, showStatus })}
        </option>
      ))}
      {!allowEmpty && accounts.length === 0 && (
        <option value="">{loading ? loadingLabel : noAccountsLabel}</option>
      )}
      {!allowEmpty && hasResolvedValue === false && resolvedValue !== null && (
        <option value={resolvedValue}>
          {`Account #${resolvedValue} (inactive)`}
        </option>
      )}
    </select>
  );
}

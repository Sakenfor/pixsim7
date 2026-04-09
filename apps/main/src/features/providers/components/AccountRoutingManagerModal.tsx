import { Button, useToast } from '@pixsim7/shared.ui';
import { useEffect, useMemo, useRef, useState } from 'react';

import { pixsimClient } from '@lib/api/client';
import { FloatingToolPanel } from '@features/prompts/components/FloatingToolPanel';

import { useProviderAccounts } from '../hooks/useProviderAccounts';
import { useProviderCapability } from '../hooks/useProviderCapabilities';

export interface RoutingAccount {
  id: number;
  provider_id: string;
  email: string;
  nickname?: string | null;
  priority?: number;
  routing_allow_patterns?: string[] | null;
  routing_deny_patterns?: string[] | null;
  routing_priority_overrides?: Record<string, number> | null;
}

function normalizeRouteToken(value: unknown): string {
  const token = String(value ?? '').trim().toLowerCase();
  if (!token || token === '*' || token === 'any' || token === '_any') return '*';
  return token;
}

function buildRoutePattern(operation: string, model: string): string {
  return `${normalizeRouteToken(operation)}:${normalizeRouteToken(model)}`;
}

function normalizePatternList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const value of raw) {
    const text = String(value ?? '').trim();
    if (!text) continue;
    if (!out.includes(text)) out.push(text);
  }
  return out;
}

function normalizePriorityMap(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const normalizedKey = String(key ?? '').trim();
    if (!normalizedKey) continue;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) continue;
    out[normalizedKey] = Math.trunc(parsed);
  }
  return out;
}

function accountLabel(account: { email: string; nickname?: string | null }): string {
  return account.nickname ? `${account.nickname} (${account.email})` : account.email;
}

interface AccountRoutingManagerModalProps {
  isOpen: boolean;
  anchor: HTMLElement | DOMRect | null;
  accountId: number | null;
  providerId?: string;
  contextOperation?: string;
  contextModel?: string;
  onClose: () => void;
  onSaved?: (updated: RoutingAccount) => void;
}

export function AccountRoutingManagerModal({
  isOpen,
  anchor,
  accountId,
  providerId,
  contextOperation,
  contextModel,
  onClose,
  onSaved,
}: AccountRoutingManagerModalProps) {
  const toast = useToast();

  const [loadingAccount, setLoadingAccount] = useState(false);
  const [saving, setSaving] = useState(false);
  const [account, setAccount] = useState<RoutingAccount | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(accountId);

  const [basePriority, setBasePriority] = useState('0');
  const [allowPatterns, setAllowPatterns] = useState<string[]>([]);
  const [denyPatterns, setDenyPatterns] = useState<string[]>([]);
  const [priorityOverrides, setPriorityOverrides] = useState<Record<string, number>>({});
  const accountCacheRef = useRef<Record<number, RoutingAccount>>({});
  const formDirtyRef = useRef(false);

  const [builderOperation, setBuilderOperation] = useState<string>(normalizeRouteToken(contextOperation));
  const [builderModel, setBuilderModel] = useState<string>(normalizeRouteToken(contextModel));
  const [builderDelta, setBuilderDelta] = useState<string>('10');
  const [modelSearch, setModelSearch] = useState('');

  const providerIdForAccountList = account?.provider_id || providerId;
  const { accounts: providerAccounts } = useProviderAccounts(providerIdForAccountList);

  const accountOptions = useMemo(() => {
    const mapped = providerAccounts.map((item) => ({
      id: item.id,
      email: item.email,
      nickname: item.nickname,
    }));
    if (account && !mapped.some((item) => item.id === account.id)) {
      mapped.push({
        id: account.id,
        email: account.email,
        nickname: account.nickname ?? null,
      });
    }
    return mapped.sort((a, b) => accountLabel(a).localeCompare(accountLabel(b)));
  }, [providerAccounts, account]);

  const resolvedProviderId = account?.provider_id || providerId;
  const { capability } = useProviderCapability(resolvedProviderId);

  const operationSpecs = capability?.operation_specs ?? {};
  const operationOptions = useMemo(() => {
    const keys = Object.keys(operationSpecs).sort();
    return ['*', ...keys];
  }, [operationSpecs]);

  const modelsByOperation = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const [operation, spec] of Object.entries(operationSpecs)) {
      const parameters = Array.isArray(spec?.parameters) ? spec.parameters : [];
      const modelParam = parameters.find((parameter) => parameter?.name === 'model');
      const values = Array.isArray(modelParam?.enum)
        ? modelParam.enum.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        : [];
      map[operation] = Array.from(new Set(values)).sort();
    }
    return map;
  }, [operationSpecs]);

  const visibleModelOptions = useMemo(() => {
    const merged = builderOperation === '*'
      ? Array.from(new Set(Object.values(modelsByOperation).flat()))
      : (modelsByOperation[builderOperation] ?? []);
    const query = modelSearch.trim().toLowerCase();
    const filtered = query
      ? merged.filter((model) => model.toLowerCase().includes(query))
      : merged;
    return ['*', ...filtered];
  }, [builderOperation, modelSearch, modelsByOperation]);

  const applyAccountToForm = (nextAccount: RoutingAccount) => {
    setAccount(nextAccount);
    setSelectedAccountId(nextAccount.id);
    setBasePriority(String(Math.trunc(Number(nextAccount.priority ?? 0))));
    setAllowPatterns(nextAccount.routing_allow_patterns ?? []);
    setDenyPatterns(nextAccount.routing_deny_patterns ?? []);
    setPriorityOverrides(nextAccount.routing_priority_overrides ?? {});
  };

  const markDirty = () => {
    formDirtyRef.current = true;
  };

  useEffect(() => {
    if (!isOpen) return;
    setSelectedAccountId(accountId);
    setBuilderOperation(normalizeRouteToken(contextOperation));
    setBuilderModel(normalizeRouteToken(contextModel));
  }, [isOpen, accountId, contextOperation, contextModel]);

  useEffect(() => {
    if (!isOpen || selectedAccountId == null) return;

    formDirtyRef.current = false;
    let cancelled = false;
    const requestAccountId = selectedAccountId;
    const cached = accountCacheRef.current[requestAccountId];
    if (cached) {
      applyAccountToForm(cached);
      setLoadingAccount(false);
    } else {
      setLoadingAccount(true);
      setAccount(null);
    }

    (async () => {
      try {
        const response = await pixsimClient.get<Record<string, unknown>>(`/accounts/${requestAccountId}`);
        if (cancelled) return;

        const normalized: RoutingAccount = {
          id: Number(response.id),
          provider_id: String(response.provider_id ?? providerId ?? ''),
          email: String(response.email ?? ''),
          nickname: typeof response.nickname === 'string' ? response.nickname : null,
          priority: Number(response.priority ?? 0),
          routing_allow_patterns: normalizePatternList(response.routing_allow_patterns),
          routing_deny_patterns: normalizePatternList(response.routing_deny_patterns),
          routing_priority_overrides: normalizePriorityMap(response.routing_priority_overrides),
        };

        accountCacheRef.current[normalized.id] = normalized;
        if (!formDirtyRef.current) {
          applyAccountToForm(normalized);
        }
      } catch (error) {
        if (!cancelled && !cached) {
          const message = error instanceof Error ? error.message : 'Failed to load account routing settings';
          toast.error(message);
        }
      } finally {
        if (!cancelled) setLoadingAccount(false);
      }
    })();

    return () => { cancelled = true; };
  }, [isOpen, selectedAccountId, providerId, toast]);

  const addPattern = (kind: 'allow' | 'deny') => {
    markDirty();
    const pattern = buildRoutePattern(builderOperation, builderModel || '*');
    if (kind === 'allow') {
      setAllowPatterns((prev) => (prev.includes(pattern) ? prev : [...prev, pattern]));
      return;
    }
    setDenyPatterns((prev) => (prev.includes(pattern) ? prev : [...prev, pattern]));
  };

  const setOverrideFromBuilder = () => {
    markDirty();
    const key = buildRoutePattern(builderOperation, builderModel || '*');
    const parsed = Number(builderDelta);
    const delta = Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
    setPriorityOverrides((prev) => {
      const next = { ...prev };
      if (delta === 0) delete next[key];
      else next[key] = delta;
      return next;
    });
  };

  const removePattern = (kind: 'allow' | 'deny', pattern: string) => {
    markDirty();
    if (kind === 'allow') {
      setAllowPatterns((prev) => prev.filter((value) => value !== pattern));
      return;
    }
    setDenyPatterns((prev) => prev.filter((value) => value !== pattern));
  };

  const removeOverride = (key: string) => {
    markDirty();
    setPriorityOverrides((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const updateOverrideDelta = (key: string, value: string) => {
    markDirty();
    setPriorityOverrides((prev) => {
      const next = { ...prev };
      const trimmed = value.trim();
      if (!trimmed) {
        delete next[key];
        return next;
      }
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed)) return prev;
      next[key] = Math.trunc(parsed);
      return next;
    });
  };

  const save = async () => {
    if (!account || saving) return;

    const parsedPriority = Number(basePriority);
    const normalizedPriority = Number.isFinite(parsedPriority) ? Math.trunc(parsedPriority) : 0;

    const payload = {
      priority: normalizedPriority,
      routing_allow_patterns: allowPatterns,
      routing_deny_patterns: denyPatterns,
      routing_priority_overrides: priorityOverrides,
    };

    setSaving(true);
    try {
      const response = await pixsimClient.patch<Record<string, unknown>>(`/accounts/${account.id}`, payload);
      const updated: RoutingAccount = {
        id: Number(response.id ?? account.id),
        provider_id: String(response.provider_id ?? account.provider_id),
        email: String(response.email ?? account.email),
        nickname: typeof response.nickname === 'string' ? response.nickname : account.nickname,
        priority: Number(response.priority ?? normalizedPriority),
        routing_allow_patterns: normalizePatternList(response.routing_allow_patterns ?? allowPatterns),
        routing_deny_patterns: normalizePatternList(response.routing_deny_patterns ?? denyPatterns),
        routing_priority_overrides: normalizePriorityMap(response.routing_priority_overrides ?? priorityOverrides),
      };
      accountCacheRef.current[updated.id] = updated;
      formDirtyRef.current = false;
      setAccount(updated);
      onSaved?.(updated);
      toast.success('Routing rules updated');
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save routing rules';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <FloatingToolPanel
      open={isOpen}
      onClose={onClose}
      title="Account Routing Manager"
      anchor={anchor}
      defaultWidth={780}
      defaultHeight={620}
      minWidth={520}
      minHeight={360}
    >
      <div className="h-full overflow-y-auto p-4">
        <div className="mb-4">
          <label className="text-xs font-medium text-neutral-600 dark:text-neutral-300">Account</label>
          <select
            value={selectedAccountId ?? ''}
            onChange={(e) => {
              const nextId = Number(e.target.value);
              if (!Number.isFinite(nextId)) return;
              setSelectedAccountId(nextId);
            }}
            disabled={accountOptions.length === 0}
            className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm outline-none dark:border-neutral-700 dark:bg-neutral-800"
          >
            {accountOptions.length === 0 && (
              <option value="">No accounts available</option>
            )}
            {accountOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {accountLabel(option)}
              </option>
            ))}
          </select>
        </div>

        {loadingAccount || !account ? (
          <div className="py-8 text-sm text-neutral-500 dark:text-neutral-400">Loading account details...</div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-300">
              <div className="font-medium text-neutral-800 dark:text-neutral-100">
                {account.nickname || account.email}
              </div>
              <div className="mt-0.5">{account.provider_id}</div>
            </div>

            <div>
              <label className="text-xs font-medium text-neutral-600 dark:text-neutral-300">Base Priority</label>
              <input
                type="number"
                value={basePriority}
                onChange={(e) => setBasePriority(e.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm outline-none dark:border-neutral-700 dark:bg-neutral-800"
              />
            </div>

            <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-700">
              <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">Quick Rule Builder</div>
              <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-4">
                <label className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  Operation
                  <select
                    value={builderOperation}
                    onChange={(e) => setBuilderOperation(e.target.value)}
                    className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                  >
                    {operationOptions.map((operation) => (
                      <option key={operation} value={operation}>{operation}</option>
                    ))}
                  </select>
                </label>
                <label className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  Model Search
                  <input
                    value={modelSearch}
                    onChange={(e) => setModelSearch(e.target.value)}
                    placeholder="Filter models"
                    className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                  />
                </label>
                <label className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  Model
                  <select
                    value={builderModel}
                    onChange={(e) => setBuilderModel(e.target.value)}
                    className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                  >
                    {visibleModelOptions.map((modelOption) => (
                      <option key={modelOption} value={modelOption}>{modelOption}</option>
                    ))}
                  </select>
                </label>
                <label className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  Priority Delta
                  <input
                    type="number"
                    value={builderDelta}
                    onChange={(e) => setBuilderDelta(e.target.value)}
                    className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                  />
                </label>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => addPattern('allow')}>Add Allow</Button>
                <Button size="sm" variant="secondary" onClick={() => addPattern('deny')}>Add Deny</Button>
                <Button size="sm" variant="secondary" onClick={setOverrideFromBuilder}>Set Delta</Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-700">
                <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">Allow Patterns</div>
                <div className="mt-2 max-h-36 overflow-auto space-y-1">
                  {allowPatterns.length === 0 && (
                    <div className="text-[11px] text-neutral-500 dark:text-neutral-400">No allow rules</div>
                  )}
                  {allowPatterns.map((pattern) => (
                    <div key={pattern} className="flex items-center justify-between rounded bg-neutral-100 px-2 py-1 text-[11px] dark:bg-neutral-800">
                      <span className="truncate">{pattern}</span>
                      <button type="button" onClick={() => removePattern('allow', pattern)} className="ml-2 text-red-500">x</button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-700">
                <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">Deny Patterns</div>
                <div className="mt-2 max-h-36 overflow-auto space-y-1">
                  {denyPatterns.length === 0 && (
                    <div className="text-[11px] text-neutral-500 dark:text-neutral-400">No deny rules</div>
                  )}
                  {denyPatterns.map((pattern) => (
                    <div key={pattern} className="flex items-center justify-between rounded bg-neutral-100 px-2 py-1 text-[11px] dark:bg-neutral-800">
                      <span className="truncate">{pattern}</span>
                      <button type="button" onClick={() => removePattern('deny', pattern)} className="ml-2 text-red-500">x</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

              <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-700">
                <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">
                  Priority Overrides ({Object.keys(priorityOverrides).length})
                </div>
                <div className="mt-2 max-h-40 overflow-auto space-y-1">
                  {Object.keys(priorityOverrides).length === 0 && (
                    <div className="text-[11px] text-neutral-500 dark:text-neutral-400">No override rules</div>
                )}
                {Object.entries(priorityOverrides)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([key, delta]) => (
                      <div key={key} className="flex items-center justify-between rounded bg-neutral-100 px-2 py-1 text-[11px] dark:bg-neutral-800">
                        <span className="truncate">{key}</span>
                        <div className="ml-2 flex items-center gap-2">
                          <input
                            type="number"
                            value={delta}
                            onChange={(e) => updateOverrideDelta(key, e.target.value)}
                            className="w-16 rounded border border-neutral-200 bg-white px-1 py-0.5 text-[11px] font-mono outline-none dark:border-neutral-700 dark:bg-neutral-900"
                          />
                          <button type="button" onClick={() => removeOverride(key)} className="text-red-500">x</button>
                        </div>
                      </div>
                  ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1 pb-1">
              <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
              <Button variant="primary" onClick={save} disabled={saving}>
                {saving ? 'Saving...' : 'Save Rules'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </FloatingToolPanel>
  );
}

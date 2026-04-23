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

function splitPattern(pattern: string): [string, string] {
  const idx = pattern.indexOf(':');
  if (idx < 0) return [normalizeRouteToken(pattern), '*'];
  return [normalizeRouteToken(pattern.slice(0, idx)), normalizeRouteToken(pattern.slice(idx + 1))];
}

function patternMatches(pattern: string, op: string, model: string): boolean {
  const [pOp, pModel] = splitPattern(pattern);
  const opMatch = pOp === '*' || pOp === op;
  const modelMatch = pModel === '*' || pModel === model;
  return opMatch && modelMatch;
}

type PatternState = 'allow' | 'deny' | 'neutral';

interface EffectiveState {
  state: PatternState;
  matchedPattern?: string;
  isExact: boolean;
  viaAllowListRejection: boolean;
}

function resolveEffectiveState(
  op: string,
  model: string,
  allow: string[],
  deny: string[],
): EffectiveState {
  const exact = buildRoutePattern(op, model);

  if (deny.includes(exact)) {
    return { state: 'deny', matchedPattern: exact, isExact: true, viaAllowListRejection: false };
  }
  if (allow.includes(exact)) {
    return { state: 'allow', matchedPattern: exact, isExact: true, viaAllowListRejection: false };
  }

  const denyMatch = deny.find((p) => patternMatches(p, op, model));
  if (denyMatch) {
    return { state: 'deny', matchedPattern: denyMatch, isExact: false, viaAllowListRejection: false };
  }

  const allowMatch = allow.find((p) => patternMatches(p, op, model));
  if (allowMatch) {
    return { state: 'allow', matchedPattern: allowMatch, isExact: false, viaAllowListRejection: false };
  }

  if (allow.length > 0) {
    return { state: 'deny', isExact: false, viaAllowListRejection: true };
  }

  return { state: 'neutral', isExact: false, viaAllowListRejection: false };
}

function resolveEffectiveDelta(
  op: string,
  model: string,
  overrides: Record<string, number>,
): number {
  let delta = 0;
  for (const [key, value] of Object.entries(overrides)) {
    if (patternMatches(key, op, model)) delta += value;
  }
  return delta;
}

interface Rule {
  pattern: string;
  op: string;
  model: string;
  mode: PatternState;
  delta: number;
}

const STRENGTH_TIERS: ReadonlyArray<{ label: string; value: number; tone: 'red' | 'neutral' | 'emerald' }> = [
  { label: 'Strongly avoid', value: -50, tone: 'red' },
  { label: 'Avoid', value: -25, tone: 'red' },
  { label: 'Slight avoid', value: -10, tone: 'red' },
  { label: 'None', value: 0, tone: 'neutral' },
  { label: 'Slight prefer', value: 10, tone: 'emerald' },
  { label: 'Prefer', value: 25, tone: 'emerald' },
  { label: 'Strongly prefer', value: 50, tone: 'emerald' },
];

function extractRules(
  allow: string[],
  deny: string[],
  overrides: Record<string, number>,
): Rule[] {
  const patterns = new Set<string>();
  allow.forEach((pattern) => patterns.add(pattern));
  deny.forEach((pattern) => patterns.add(pattern));
  Object.keys(overrides).forEach((pattern) => patterns.add(pattern));

  return Array.from(patterns)
    .map((pattern): Rule => {
      const [op, model] = splitPattern(pattern);
      const mode: PatternState = deny.includes(pattern)
        ? 'deny'
        : allow.includes(pattern)
          ? 'allow'
          : 'neutral';
      return { pattern, op, model, mode, delta: overrides[pattern] ?? 0 };
    })
    .sort((a, b) => a.pattern.localeCompare(b.pattern));
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

function StateDot({ state }: { state: PatternState }) {
  const cls =
    state === 'allow'
      ? 'bg-emerald-500'
      : state === 'deny'
        ? 'bg-red-500'
        : 'bg-neutral-300 dark:bg-neutral-600';
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${cls}`} />;
}

function StateBadge({ state, delta }: { state: EffectiveState; delta: number }) {
  const label = state.state === 'neutral' ? 'Neutral' : state.state === 'allow' ? 'Allowed' : 'Denied';
  const cls =
    state.state === 'allow'
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
      : state.state === 'deny'
        ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
        : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300';
  return (
    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {label}
      {!state.isExact && state.state !== 'neutral' && <span className="italic opacity-70">(wildcard)</span>}
      {delta !== 0 && <span className="font-mono">{delta > 0 ? `+${delta}` : delta}</span>}
    </span>
  );
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
  const loadedAccountIdRef = useRef<number | null>(null);
  const formDirtyRef = useRef(false);
  const toastRef = useRef(toast);

  const [builderOperation, setBuilderOperation] = useState<string>(normalizeRouteToken(contextOperation));
  const [builderModel, setBuilderModel] = useState<string>(normalizeRouteToken(contextModel));
  const [builderDelta, setBuilderDelta] = useState<string>('10');
  const [showAdvancedDelta, setShowAdvancedDelta] = useState<boolean>(false);
  const [accountPickerOpen, setAccountPickerOpen] = useState<boolean>(false);
  const [showModelBrowser, setShowModelBrowser] = useState<boolean>(false);
  const [modelSearch, setModelSearch] = useState('');
  const [accountSearch, setAccountSearch] = useState('');
  const [applyToAllModels, setApplyToAllModels] = useState<boolean>(
    normalizeRouteToken(contextModel) === '*',
  );

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

  const filteredAccountOptions = useMemo(() => {
    const query = accountSearch.trim().toLowerCase();
    if (!query) return accountOptions;
    return accountOptions.filter((option) => {
      const label = accountLabel(option).toLowerCase();
      return (
        label.includes(query) ||
        option.email.toLowerCase().includes(query) ||
        String(option.id).includes(query)
      );
    });
  }, [accountOptions, accountSearch]);

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
    toastRef.current = toast;
  }, [toast]);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedAccountId(accountId);
    setBuilderOperation(normalizeRouteToken(contextOperation));
    const nextModel = normalizeRouteToken(contextModel);
    setBuilderModel(nextModel);
    setApplyToAllModels(nextModel === '*');
    setAccountSearch('');
  }, [isOpen, accountId, contextOperation, contextModel]);

  useEffect(() => {
    if (!isOpen) {
      loadedAccountIdRef.current = null;
      return;
    }
    if (selectedAccountId == null) return;

    let cancelled = false;
    const requestAccountId = selectedAccountId;
    const accountChanged = loadedAccountIdRef.current !== requestAccountId;
    const cached = accountCacheRef.current[requestAccountId];

    if (accountChanged) {
      formDirtyRef.current = false;
      if (cached) {
        applyAccountToForm(cached);
        setLoadingAccount(false);
      } else {
        setLoadingAccount(true);
        setAccount(null);
      }
    }

    // Avoid re-fetch loops while the same account stays selected.
    if (!accountChanged && cached) {
      return () => { cancelled = true; };
    }

    (async () => {
      try {
        const response = await pixsimClient.get<Record<string, unknown>>(`/accounts/${requestAccountId}`);
        if (cancelled) return;

        const normalized: RoutingAccount = {
          id: Number(response.id),
          provider_id: String(response.provider_id ?? ''),
          email: String(response.email ?? ''),
          nickname: typeof response.nickname === 'string' ? response.nickname : null,
          priority: Number(response.priority ?? 0),
          routing_allow_patterns: normalizePatternList(response.routing_allow_patterns),
          routing_deny_patterns: normalizePatternList(response.routing_deny_patterns),
          routing_priority_overrides: normalizePriorityMap(response.routing_priority_overrides),
        };

        accountCacheRef.current[normalized.id] = normalized;
        loadedAccountIdRef.current = normalized.id;
        if (!formDirtyRef.current) {
          applyAccountToForm(normalized);
        }
      } catch (error) {
        if (!cancelled && !cached) {
          const message = error instanceof Error ? error.message : 'Failed to load account routing settings';
          toastRef.current.error(message);
        }
      } finally {
        if (!cancelled) setLoadingAccount(false);
      }
    })();

    return () => { cancelled = true; };
  }, [isOpen, selectedAccountId]);

  const effectiveBuilderModel = applyToAllModels ? '*' : (builderModel || '*');

  const setPatternState = (nextState: PatternState) => {
    markDirty();
    const pattern = buildRoutePattern(builderOperation, effectiveBuilderModel);
    if (nextState === 'allow') {
      setDenyPatterns((prev) => prev.filter((value) => value !== pattern));
      setAllowPatterns((prev) => (prev.includes(pattern) ? prev : [...prev, pattern]));
      return;
    }
    if (nextState === 'deny') {
      setAllowPatterns((prev) => prev.filter((value) => value !== pattern));
      setDenyPatterns((prev) => (prev.includes(pattern) ? prev : [...prev, pattern]));
      return;
    }
    setAllowPatterns((prev) => prev.filter((value) => value !== pattern));
    setDenyPatterns((prev) => prev.filter((value) => value !== pattern));
  };

  const setOverrideFromBuilder = () => {
    markDirty();
    const key = buildRoutePattern(builderOperation, effectiveBuilderModel);
    const parsed = Number(builderDelta);
    const delta = Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
    setPriorityOverrides((prev) => {
      const next = { ...prev };
      if (delta === 0) delete next[key];
      else next[key] = delta;
      return next;
    });
  };

  const applyDeltaTier = (value: number) => {
    markDirty();
    const key = buildRoutePattern(builderOperation, effectiveBuilderModel);
    setBuilderDelta(String(value));
    setPriorityOverrides((prev) => {
      const next = { ...prev };
      if (value === 0) delete next[key];
      else next[key] = value;
      return next;
    });
  };

  const currentEffectiveState = useMemo(
    () => resolveEffectiveState(builderOperation, effectiveBuilderModel, allowPatterns, denyPatterns),
    [builderOperation, effectiveBuilderModel, allowPatterns, denyPatterns],
  );

  const currentEffectiveDelta = useMemo(
    () => resolveEffectiveDelta(builderOperation, effectiveBuilderModel, priorityOverrides),
    [builderOperation, effectiveBuilderModel, priorityOverrides],
  );

  const rules = useMemo(
    () => extractRules(allowPatterns, denyPatterns, priorityOverrides),
    [allowPatterns, denyPatterns, priorityOverrides],
  );

  const loadRuleIntoBuilder = (rule: Rule) => {
    setBuilderOperation(rule.op);
    setBuilderModel(rule.model);
    setApplyToAllModels(rule.model === '*');
    setBuilderDelta(String(rule.delta));
  };

  const removeRule = (rule: Rule) => {
    markDirty();
    setAllowPatterns((prev) => prev.filter((value) => value !== rule.pattern));
    setDenyPatterns((prev) => prev.filter((value) => value !== rule.pattern));
    setPriorityOverrides((prev) => {
      if (!(rule.pattern in prev)) return prev;
      const next = { ...prev };
      delete next[rule.pattern];
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

  const requestClose = () => {
    if (formDirtyRef.current) {
      const confirmed = window.confirm('Discard unsaved routing changes?');
      if (!confirmed) return;
    }
    formDirtyRef.current = false;
    onClose();
  };

  return (
    <FloatingToolPanel
      open={isOpen}
      onClose={requestClose}
      title="Account Routing"
      anchor={anchor}
      defaultWidth={560}
      defaultHeight={500}
      minWidth={440}
      minHeight={320}
    >
      <div className="h-full overflow-y-auto p-3">
        <div className="mb-3">
          <button
            type="button"
            onClick={() => setAccountPickerOpen((open) => !open)}
            className="flex w-full items-center justify-between rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-left text-sm dark:border-neutral-700 dark:bg-neutral-800"
            title={account ? `${account.email} · ${account.provider_id}` : 'Select account'}
          >
            <span className="min-w-0 flex-1 truncate">
              {account
                ? <>
                    <span className="font-medium">{account.nickname || account.email}</span>
                    <span className="ml-2 text-[10px] text-neutral-500 dark:text-neutral-400">{account.provider_id}</span>
                  </>
                : selectedAccountId != null
                  ? <span className="text-neutral-500 dark:text-neutral-400">Loading #{selectedAccountId}…</span>
                  : <span className="text-neutral-500 dark:text-neutral-400">Select account…</span>}
            </span>
            <span className="ml-2 text-[10px] text-neutral-500 dark:text-neutral-400">
              {accountPickerOpen ? '▴' : '▾'} {accountOptions.length}
            </span>
          </button>
          {accountPickerOpen && (
            <div className="mt-1 space-y-1.5">
              <input
                value={accountSearch}
                onChange={(e) => setAccountSearch(e.target.value)}
                placeholder="Search name, email, or id"
                className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs outline-none dark:border-neutral-700 dark:bg-neutral-800"
                autoFocus
              />
              <div className="max-h-40 overflow-y-auto rounded-md border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900/40">
                {filteredAccountOptions.length === 0 && (
                  <div className="px-2 py-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                    No matching accounts
                  </div>
                )}
                {filteredAccountOptions.map((option) => {
                  const isSelected = option.id === selectedAccountId;
                  return (
                    <button
                      type="button"
                      key={option.id}
                      onClick={() => {
                        setSelectedAccountId(option.id);
                        setAccountPickerOpen(false);
                      }}
                      className={`flex w-full items-center justify-between px-2 py-1 text-left text-xs transition-colors ${
                        isSelected
                          ? 'bg-accent-subtle text-accent font-medium'
                          : 'text-neutral-700 hover:bg-neutral-50 dark:text-neutral-200 dark:hover:bg-neutral-800/70'
                      }`}
                    >
                      <span className="truncate">{accountLabel(option)}</span>
                      <span className="ml-2 text-[10px] text-neutral-500 dark:text-neutral-400">#{option.id}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {loadingAccount || !account ? (
          <div className="py-8 text-sm text-neutral-500 dark:text-neutral-400">Loading account details...</div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                Base priority
                <input
                  type="number"
                  value={basePriority}
                  onChange={(e) => setBasePriority(e.target.value)}
                  className="w-16 rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm outline-none dark:border-neutral-700 dark:bg-neutral-800"
                />
              </label>
              <span
                className="ml-auto text-[10px] text-neutral-400 dark:text-neutral-500"
                title="Rules apply only on Auto account picks. Pinned accounts and retries bypass them."
              >
                ⓘ Auto-mode only
              </span>
            </div>

            <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-700">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">Quick Rule Builder</div>
                <StateBadge state={currentEffectiveState} delta={currentEffectiveDelta} />
              </div>

              <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
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
                  Model
                  <select
                    value={builderModel}
                    onChange={(e) => {
                      const value = e.target.value;
                      setBuilderModel(value);
                      setApplyToAllModels(value === '*');
                    }}
                    disabled={applyToAllModels}
                    className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800 disabled:opacity-50"
                  >
                    {visibleModelOptions.map((modelOption) => (
                      <option key={modelOption} value={modelOption}>
                        {modelOption === '*' ? '* (all models)' : modelOption}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-2 flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-[11px] text-neutral-600 dark:text-neutral-300">
                  <input
                    type="checkbox"
                    checked={applyToAllModels}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setApplyToAllModels(checked);
                      if (checked) setBuilderModel('*');
                    }}
                  />
                  All models
                </label>
                <button
                  type="button"
                  onClick={() => setShowModelBrowser((value) => !value)}
                  disabled={applyToAllModels}
                  className="text-[10px] text-neutral-500 hover:text-neutral-700 disabled:opacity-50 dark:text-neutral-400 dark:hover:text-neutral-200"
                >
                  {showModelBrowser ? 'Hide browser' : 'Browse with state hints'}
                </button>
                <input
                  value={modelSearch}
                  onChange={(e) => setModelSearch(e.target.value)}
                  placeholder="Filter"
                  disabled={applyToAllModels || !showModelBrowser}
                  className="ml-auto w-28 rounded-md border border-neutral-200 bg-white px-2 py-1 text-[11px] outline-none dark:border-neutral-700 dark:bg-neutral-800 disabled:opacity-50"
                />
              </div>

              {showModelBrowser && !applyToAllModels && (
                <div className="mt-2 max-h-32 overflow-y-auto rounded-md border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900/40">
                  {visibleModelOptions.length === 0 && (
                    <div className="px-2 py-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                      No models for this operation
                    </div>
                  )}
                  {visibleModelOptions.map((modelOption) => {
                    const rowState = resolveEffectiveState(builderOperation, modelOption, allowPatterns, denyPatterns);
                    const rowDelta = resolveEffectiveDelta(builderOperation, modelOption, priorityOverrides);
                    const isSelected = modelOption === builderModel;
                    return (
                      <button
                        type="button"
                        key={modelOption}
                        onClick={() => setBuilderModel(modelOption)}
                        className={`flex w-full items-center justify-between px-2 py-1 text-left text-xs transition-colors ${
                          isSelected
                            ? 'bg-accent-subtle text-accent font-medium'
                            : 'text-neutral-700 hover:bg-neutral-50 dark:text-neutral-200 dark:hover:bg-neutral-800/70'
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <StateDot state={rowState.state} />
                          <span className="truncate">{modelOption}</span>
                        </span>
                        <span className="flex items-center gap-2 text-[10px] text-neutral-500 dark:text-neutral-400">
                          {rowState.state !== 'neutral' && !rowState.isExact && (
                            <span className="italic">via {rowState.viaAllowListRejection ? 'allow-list' : rowState.matchedPattern}</span>
                          )}
                          {rowDelta !== 0 && (
                            <span className={rowDelta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}>
                              {rowDelta > 0 ? `+${rowDelta}` : rowDelta}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="mt-3">
                <div className="mb-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                  State for <code>{buildRoutePattern(builderOperation, effectiveBuilderModel)}</code>
                </div>
                <div className="inline-flex overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-700">
                  {(['allow', 'neutral', 'deny'] as const).map((option) => {
                    const isActive = currentEffectiveState.state === option && currentEffectiveState.isExact;
                    const activeClasses =
                      option === 'allow'
                        ? 'bg-emerald-500 text-white'
                        : option === 'deny'
                          ? 'bg-red-500 text-white'
                          : 'bg-neutral-500 text-white';
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setPatternState(option)}
                        className={`px-3 py-1 text-xs font-medium capitalize transition-colors ${
                          isActive
                            ? activeClasses
                            : 'bg-white text-neutral-600 hover:bg-neutral-50 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'
                        }`}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
                {!currentEffectiveState.isExact && currentEffectiveState.state !== 'neutral' && (
                  <div className="mt-1 text-[10px] italic text-neutral-500 dark:text-neutral-400">
                    Inherited from{' '}
                    {currentEffectiveState.viaAllowListRejection
                      ? 'allow-list'
                      : <code>{currentEffectiveState.matchedPattern}</code>}
                    . Click to add an exact rule.
                  </div>
                )}
              </div>

              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[11px] text-neutral-500 dark:text-neutral-400">Strength</span>
                  <button
                    type="button"
                    onClick={() => setShowAdvancedDelta((value) => !value)}
                    className="text-[10px] text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
                  >
                    {showAdvancedDelta ? 'Hide raw value' : 'Advanced'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {STRENGTH_TIERS.map((tier) => {
                    const isActive = currentEffectiveDelta === tier.value;
                    const activeClasses =
                      tier.tone === 'red'
                        ? 'bg-red-500 text-white border-red-500'
                        : tier.tone === 'emerald'
                          ? 'bg-emerald-500 text-white border-emerald-500'
                          : 'bg-neutral-500 text-white border-neutral-500';
                    return (
                      <button
                        key={tier.value}
                        type="button"
                        onClick={() => applyDeltaTier(tier.value)}
                        className={`rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                          isActive
                            ? activeClasses
                            : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'
                        }`}
                        title={tier.value === 0 ? 'No priority change' : `${tier.value > 0 ? '+' : ''}${tier.value}`}
                      >
                        {tier.label}
                      </button>
                    );
                  })}
                </div>
                {showAdvancedDelta && (
                  <div className="mt-2 flex items-end gap-2">
                    <label className="text-[10px] text-neutral-500 dark:text-neutral-400">
                      Raw delta
                      <input
                        type="number"
                        value={builderDelta}
                        onChange={(e) => setBuilderDelta(e.target.value)}
                        className="mt-1 w-24 rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                      />
                    </label>
                    <Button size="sm" variant="secondary" onClick={setOverrideFromBuilder}>Apply</Button>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-700">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">
                  Rules ({rules.length})
                </div>
                <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                  Click a row to edit it in the builder above.
                </div>
              </div>
              {rules.length === 0 ? (
                <div className="mt-3 text-[11px] italic text-neutral-500 dark:text-neutral-400">
                  No rules configured. Use the builder above to add one.
                </div>
              ) : (
                <div className="mt-2 max-h-56 overflow-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead className="text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                      <tr className="border-b border-neutral-200 dark:border-neutral-700">
                        <th className="py-1 pr-2 font-medium">Operation</th>
                        <th className="py-1 pr-2 font-medium">Model</th>
                        <th className="py-1 pr-2 font-medium">Mode</th>
                        <th className="py-1 pr-2 font-medium">Delta</th>
                        <th className="py-1 w-6" />
                      </tr>
                    </thead>
                    <tbody>
                      {rules.map((rule) => {
                        const isActive =
                          rule.op === builderOperation && rule.model === effectiveBuilderModel;
                        return (
                          <tr
                            key={rule.pattern}
                            onClick={() => loadRuleIntoBuilder(rule)}
                            className={`cursor-pointer border-b border-neutral-100 transition-colors last:border-b-0 dark:border-neutral-800 ${
                              isActive
                                ? 'bg-accent-subtle/40'
                                : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/60'
                            }`}
                          >
                            <td className="py-1.5 pr-2 font-mono">{rule.op}</td>
                            <td className="py-1.5 pr-2 font-mono">{rule.model}</td>
                            <td className="py-1.5 pr-2">
                              {rule.mode === 'neutral' ? (
                                <span className="text-neutral-400">—</span>
                              ) : (
                                <span className="inline-flex items-center gap-1">
                                  <StateDot state={rule.mode} />
                                  <span className="capitalize">{rule.mode}</span>
                                </span>
                              )}
                            </td>
                            <td className="py-1.5 pr-2">
                              <input
                                type="number"
                                value={rule.delta}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => updateOverrideDelta(rule.pattern, e.target.value)}
                                className="w-16 rounded border border-neutral-200 bg-white px-1 py-0.5 text-[11px] font-mono outline-none dark:border-neutral-700 dark:bg-neutral-900"
                              />
                            </td>
                            <td className="py-1.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeRule(rule);
                                }}
                                className="text-neutral-400 hover:text-red-500"
                                title="Remove rule"
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-1 pb-1">
              <Button variant="ghost" onClick={requestClose} disabled={saving}>Cancel</Button>
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

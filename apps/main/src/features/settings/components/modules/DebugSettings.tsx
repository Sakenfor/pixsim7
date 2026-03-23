/**
 * Debug Settings Module
 *
 * Unified debug logging toggles stored in backend user preferences.
 * Controls both frontend (browser console) and backend (server logs) debug output.
 *
 * Also renders settings exposed by dev tools from the DevTools registry.
 *
 * NOTE: Only visible in development mode.
 */
import type { DevToolSetting, DevToolSettingSelect, DevToolSettingNumber } from '@pixsim7/shared.devtools.core';
import { useState, useEffect, useCallback } from 'react';

import { pixsimClient } from '@lib/api/client';
import { getUserPreferences, updatePreferenceKey, type DebugPreferences, type DevToolsPreferences, type DevToolSettingValue } from '@lib/api/userPreferences';
import { devToolRegistry } from '@lib/dev/devtools/devToolRegistry';
import { debugFlags } from '@lib/utils/debugFlags';

import { settingsRegistry } from '../../lib/core/registry';


interface DebugCategoryMeta {
  id: string;
  description: string;
  enabled: boolean;
  default: boolean;
  group: string;
}

interface DebugGroupMeta {
  id: string;
  label: string;
}

interface DebugCategory {
  id: keyof DebugPreferences;
  label: string;
  description: string;
  group: string;
}

interface DebugCategoriesData {
  categories: DebugCategory[];
  groups: DebugGroupMeta[];
  loading: boolean;
}

function useDebugCategories(): DebugCategoriesData {
  const [categories, setCategories] = useState<DebugCategory[]>([]);
  const [groups, setGroups] = useState<DebugGroupMeta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    pixsimClient
      .get<{ categories: DebugCategoryMeta[]; groups: DebugGroupMeta[] }>('/users/me/debug/categories')
      .then((data) => {
        setCategories(
          data.categories.map((c) => ({
            id: c.id as keyof DebugPreferences,
            label: c.id.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()),
            description: c.description,
            group: c.group,
          })),
        );
        setGroups(data.groups ?? []);
      })
      .catch(() => {
        setCategories([]);
        setGroups([]);
      })
      .finally(() => setLoading(false));
  }, []);

  return { categories, groups, loading };
}

/** Shared hook for debug state management */
function useDebugState() {
  const [debugStates, setDebugStates] = useState<DebugPreferences>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getUserPreferences()
      .then(prefs => {
        const debug = prefs.debug || {};
        setDebugStates(debug);
        debugFlags.updateFromPreferences(debug);
        setIsLoading(false);
      })
      .catch(err => {
        console.error('Failed to load debug preferences:', err);
        setIsLoading(false);
      });
  }, []);

  const handleToggle = async (categoryId: keyof DebugPreferences) => {
    let previousStates: DebugPreferences | null = null;
    let nextStates: DebugPreferences | null = null;

    setDebugStates(prev => {
      previousStates = prev;
      const newValue = !prev[categoryId];
      nextStates = { ...prev, [categoryId]: newValue };
      return nextStates;
    });

    if (nextStates) {
      debugFlags.updateFromPreferences(nextStates);
    }

    try {
      if (nextStates) {
        await updatePreferenceKey('debug', nextStates);
      }
    } catch (err) {
      console.error('Failed to save debug preference:', err);
      if (previousStates) {
        setDebugStates(previousStates);
        debugFlags.updateFromPreferences(previousStates);
      }
    }
  };

  return { debugStates, isLoading, handleToggle };
}

/** Hook for managing dev tools preferences */
function useDevToolsSettings() {
  const [devtoolsStates, setDevtoolsStates] = useState<DevToolsPreferences>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getUserPreferences()
      .then(prefs => {
        setDevtoolsStates(prefs.devtools || {});
        setIsLoading(false);
      })
      .catch(err => {
        console.error('Failed to load devtools preferences:', err);
        setIsLoading(false);
      });
  }, []);

  const getSettingValue = <T extends DevToolSettingValue>(
    toolId: string,
    settingKey: string,
    defaultValue: T
  ): T => {
    const stored = devtoolsStates[toolId]?.[settingKey];
    return (stored !== undefined ? stored : defaultValue) as T;
  };

  const updateSetting = async (toolId: string, settingKey: string, newValue: DevToolSettingValue) => {
    let previousStates: DevToolsPreferences | null = null;
    let nextStates: DevToolsPreferences | null = null;

    setDevtoolsStates(prev => {
      previousStates = prev;
      const newToolSettings = {
        ...(prev[toolId] || {}),
        [settingKey]: newValue,
      };
      nextStates = { ...prev, [toolId]: newToolSettings };
      return nextStates;
    });

    try {
      if (nextStates) {
        await updatePreferenceKey('devtools', nextStates);
      }
    } catch (err) {
      console.error('Failed to save devtools preference:', err);
      if (previousStates) {
        setDevtoolsStates(previousStates);
      }
    }
  };

  return { devtoolsStates, isLoading, getSettingValue, updateSetting };
}

/** Single category toggle row — compact inline layout */
function DebugCategoryRow({
  category,
  enabled,
  onToggle,
}: {
  category: DebugCategory;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 px-1 group">
      <div className="flex-1 min-w-0">
        <span className="text-[11px] font-medium text-neutral-800 dark:text-neutral-100">
          {category.label}
        </span>
        <span className="text-[10px] text-neutral-500 dark:text-neutral-400 ml-2">
          {category.description}
        </span>
      </div>
      <label className="flex items-center cursor-pointer ml-3 shrink-0">
        <input
          type="checkbox"
          checked={enabled}
          onChange={onToggle}
          className="sr-only peer"
        />
        <div className="w-8 h-[18px] bg-neutral-300 dark:bg-neutral-700 rounded-full peer peer-checked:bg-blue-500 peer-checked:after:translate-x-3.5 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-[14px] after:w-[14px] after:transition-all relative"></div>
      </label>
    </div>
  );
}

/** Grouped debug category toggle list */
function DebugCategoryList({
  categories,
  groups,
  debugStates,
  onToggle,
}: {
  categories: DebugCategory[];
  groups: DebugGroupMeta[];
  debugStates: DebugPreferences;
  onToggle: (id: keyof DebugPreferences) => void;
}) {
  // Build ordered groups; fall back to ungrouped if backend doesn't send groups
  const groupOrder = groups.length > 0 ? groups : [{ id: '__all__', label: '' }];
  const grouped = new Map<string, DebugCategory[]>();
  for (const g of groupOrder) grouped.set(g.id, []);
  for (const cat of categories) {
    const key = groups.length > 0 ? cat.group : '__all__';
    const bucket = grouped.get(key);
    if (bucket) bucket.push(cat);
    else {
      // Unknown group — append to an "Other" bucket
      if (!grouped.has('other')) {
        grouped.set('other', []);
        groupOrder.push({ id: 'other', label: 'Other' });
      }
      grouped.get('other')!.push(cat);
    }
  }

  return (
    <div className="space-y-4">
      {groupOrder.map((group) => {
        const items = grouped.get(group.id);
        if (!items || items.length === 0) return null;
        const enabledCount = items.filter((c) => debugStates[c.id]).length;
        return (
          <div
            key={group.id}
            className="rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden"
          >
            {group.label && (
              <div className="flex items-center justify-between px-3 py-2 bg-neutral-100/80 dark:bg-neutral-800/80 border-b border-neutral-200 dark:border-neutral-700">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  {group.label}
                </span>
                <span className="text-[10px] tabular-nums text-neutral-400 dark:text-neutral-500">
                  {enabledCount}/{items.length}
                </span>
              </div>
            )}
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800 px-2 py-1">
              {items.map((cat) => (
                <DebugCategoryRow
                  key={cat.id}
                  category={cat}
                  enabled={debugStates[cat.id] ?? false}
                  onToggle={() => onToggle(cat.id)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Debug log categories — fetched from backend DebugSettings */
function DebugLogCategories() {
  const { debugStates, isLoading: prefsLoading, handleToggle } = useDebugState();
  const { categories, groups, loading: catsLoading } = useDebugCategories();

  if (prefsLoading || catsLoading) {
    return (
      <div className="flex-1 overflow-auto p-4 text-xs text-neutral-500 dark:text-neutral-400">
        Loading debug preferences...
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4 space-y-4 text-xs text-neutral-800 dark:text-neutral-100">
      <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
        Toggle debug categories. Backend categories write to server logs; frontend categories output to browser console.
      </p>
      <DebugCategoryList
        categories={categories}
        groups={groups}
        debugStates={debugStates}
        onToggle={handleToggle}
      />
      <LogDatabaseSettings />
    </div>
  );
}

// ── Log Database Settings (editable) ─────────────────────────────────

const LOG_LEVELS = ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'OFF'] as const;

interface LoggingConfig {
  log_retention_days: number;
  log_level: string;
  log_domain_levels: Record<string, string>;
}

interface DbStats {
  total_rows: number;
  oldest: string | null;
  newest: string | null;
}

interface IngestionStats {
  active: boolean;
  dropped_logs?: number;
  worker_errors?: number;
}

function useLoggingConfig() {
  // Stats from the per-user endpoint (DB rows, ingestion)
  const [dbStats, setDbStats] = useState<DbStats | null>(null);
  const [ingestion, setIngestion] = useState<IngestionStats | null>(null);

  // Editable config from the admin endpoint
  const [config, setConfig] = useState<LoggingConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Fetch read-only stats
    pixsimClient
      .get<{ config: LoggingConfig; db: DbStats | null; ingestion: IngestionStats }>('/users/me/debug/logging-config')
      .then((data) => {
        setDbStats(data.db);
        setIngestion(data.ingestion);
      })
      .catch(() => {});

    // Fetch editable config from admin endpoint
    pixsimClient
      .get<LoggingConfig>('/admin/logging/config')
      .then(setConfig)
      .catch(() => {});
  }, []);

  const patchConfig = useCallback(async (patch: Partial<LoggingConfig>) => {
    setSaving(true);
    try {
      const updated = await pixsimClient.patch<LoggingConfig>('/admin/logging/config', patch);
      setConfig(updated);
    } catch (err) {
      console.error('Failed to update logging config:', err);
    } finally {
      setSaving(false);
    }
  }, []);

  const purge = useCallback(async (olderThanDays: number | null) => {
    setSaving(true);
    try {
      const result = await pixsimClient.post<{ deleted: number | null }>('/admin/logging/purge', {
        older_than_days: olderThanDays,
      });
      // Re-fetch stats after purge
      pixsimClient
        .get<{ config: LoggingConfig; db: DbStats | null; ingestion: IngestionStats }>('/users/me/debug/logging-config')
        .then((data) => setDbStats(data.db))
        .catch(() => {});
      return result.deleted;
    } catch (err) {
      console.error('Failed to purge logs:', err);
      return null;
    } finally {
      setSaving(false);
    }
  }, []);

  return { config, dbStats, ingestion, saving, patchConfig, purge };
}

/** Retention slider with local state — only patches on pointer release. */
function RetentionSlider({
  value,
  saving,
  onCommit,
}: {
  value: number;
  saving: boolean;
  onCommit: (days: number) => void;
}) {
  const [local, setLocal] = useState(value);
  const [dragging, setDragging] = useState(false);

  // Sync from parent when not actively dragging
  useEffect(() => {
    if (!dragging) setLocal(value);
  }, [value, dragging]);

  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-[11px] font-medium text-neutral-800 dark:text-neutral-100">Retention</div>
        <div className="text-[10px] text-neutral-500 dark:text-neutral-400">Days to keep log entries (1\u2013365)</div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={1}
          max={365}
          value={local}
          disabled={saving}
          onChange={(e) => setLocal(parseInt(e.target.value))}
          onPointerDown={() => setDragging(true)}
          onPointerUp={() => { setDragging(false); onCommit(local); }}
          onLostPointerCapture={() => { setDragging(false); onCommit(local); }}
          className="w-24 h-1 accent-blue-500"
        />
        <span className="text-[11px] tabular-nums w-12 text-right text-neutral-700 dark:text-neutral-300">
          {local}d
        </span>
      </div>
    </div>
  );
}

function LogDatabaseSettings() {
  const { config, dbStats, ingestion, saving, patchConfig, purge } = useLoggingConfig();

  if (!config) return null;

  const fmt = (iso: string | null) => {
    if (!iso) return '\u2014';
    const d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const domainLevels = config.log_domain_levels ?? {};

  return (
    <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-700 space-y-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        Log Database
      </div>

      {/* ── Settings row ── */}
      <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
        <div className="px-3 py-2 bg-neutral-100/80 dark:bg-neutral-800/80 border-b border-neutral-200 dark:border-neutral-700">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Configuration
          </span>
        </div>
        <div className="px-3 py-2 space-y-2">
          {/* Global level */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] font-medium text-neutral-800 dark:text-neutral-100">Global Log Level</div>
              <div className="text-[10px] text-neutral-500 dark:text-neutral-400">Minimum severity for all domains</div>
            </div>
            <select
              value={config.log_level}
              disabled={saving}
              onChange={(e) => patchConfig({ log_level: e.target.value })}
              className="px-2 py-1 text-[11px] rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            >
              {LOG_LEVELS.filter((l) => l !== 'OFF').map((level) => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
          </div>

          {/* Retention */}
          <RetentionSlider
            value={config.log_retention_days}
            saving={saving}
            onCommit={(days) => patchConfig({ log_retention_days: days })}
          />
        </div>
      </div>

      {/* ── Domain level overrides ── */}
      <DomainLevelOverrides
        domainLevels={domainLevels}
        saving={saving}
        onUpdate={(levels) => patchConfig({ log_domain_levels: levels })}
      />

      {/* ── DB Stats + Purge ── */}
      {dbStats && (
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
          <div className="px-3 py-2 bg-neutral-100/80 dark:bg-neutral-800/80 border-b border-neutral-200 dark:border-neutral-700">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Storage
            </span>
          </div>
          <div className="px-3 py-2 space-y-2">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
              <span className="text-neutral-500 dark:text-neutral-400">Total entries</span>
              <span>{dbStats.total_rows.toLocaleString()}</span>
              <span className="text-neutral-500 dark:text-neutral-400">Oldest</span>
              <span>{fmt(dbStats.oldest)}</span>
              <span className="text-neutral-500 dark:text-neutral-400">Newest</span>
              <span>{fmt(dbStats.newest)}</span>
            </div>
            <LogPurgeControls saving={saving} onPurge={purge} />
          </div>
        </div>
      )}

      {/* ── Ingestion ── */}
      {ingestion?.active && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] px-1">
          <span className="text-neutral-500 dark:text-neutral-400">Ingestion</span>
          <span className="text-green-600 dark:text-green-400">Active</span>
          {(ingestion.dropped_logs ?? 0) > 0 && (
            <>
              <span className="text-neutral-500 dark:text-neutral-400">Dropped</span>
              <span className="text-amber-600 dark:text-amber-400">{ingestion.dropped_logs}</span>
            </>
          )}
          {(ingestion.worker_errors ?? 0) > 0 && (
            <>
              <span className="text-neutral-500 dark:text-neutral-400">Write errors</span>
              <span className="text-red-600 dark:text-red-400">{ingestion.worker_errors}</span>
            </>
          )}
        </div>
      )}

      {!dbStats && !ingestion && (
        <p className="text-[11px] text-neutral-400">Log database not connected</p>
      )}
    </div>
  );
}

/** Purge controls — delete old or all log entries */
function LogPurgeControls({
  saving,
  onPurge,
}: {
  saving: boolean;
  onPurge: (olderThanDays: number | null) => Promise<number | null>;
}) {
  const [confirmAll, setConfirmAll] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const handlePurge = async (days: number | null) => {
    setLastResult(null);
    const deleted = await onPurge(days);
    if (deleted !== null) {
      setLastResult(`Deleted ${deleted.toLocaleString()} entries`);
    }
    setConfirmAll(false);
  };

  return (
    <div className="pt-2 border-t border-neutral-200/50 dark:border-neutral-700/50 space-y-1.5">
      <div className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
        Purge
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          disabled={saving}
          onClick={() => handlePurge(30)}
          className="px-2 py-1 text-[10px] font-medium rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-50 transition-colors"
        >
          Older than 30d
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => handlePurge(7)}
          className="px-2 py-1 text-[10px] font-medium rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-50 transition-colors"
        >
          Older than 7d
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => handlePurge(1)}
          className="px-2 py-1 text-[10px] font-medium rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-50 transition-colors"
        >
          Older than 1d
        </button>
        {!confirmAll ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => setConfirmAll(true)}
            className="px-2 py-1 text-[10px] font-medium rounded border border-red-300 dark:border-red-800 bg-white dark:bg-neutral-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
          >
            Purge all
          </button>
        ) : (
          <button
            type="button"
            disabled={saving}
            onClick={() => handlePurge(0)}
            className="px-2 py-1 text-[10px] font-medium rounded border border-red-500 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors animate-pulse"
          >
            Confirm purge all?
          </button>
        )}
      </div>
      {lastResult && (
        <div className="text-[10px] text-green-600 dark:text-green-400">{lastResult}</div>
      )}
    </div>
  );
}

/** Per-domain log level overrides — collapsible list with level dropdowns */
function DomainLevelOverrides({
  domainLevels,
  saving,
  onUpdate,
}: {
  domainLevels: Record<string, string>;
  saving: boolean;
  onUpdate: (levels: Record<string, string>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const activeCount = Object.values(domainLevels).filter((v) => v && v !== 'INFO').length;

  // Use DOMAINS from the backend response (keys), but we know them from spec
  const allDomains = [
    'account', 'audit', 'cron', 'generation', 'localFolders',
    'overlay', 'persistence', 'provider', 'sql', 'stores',
    'system', 'websocket', 'worker',
  ];

  const handleChange = (domain: string, level: string) => {
    const next = { ...domainLevels };
    if (level === '' || level === 'INFO') {
      delete next[domain];
    } else {
      next[domain] = level;
    }
    onUpdate(next);
  };

  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 bg-neutral-100/80 dark:bg-neutral-800/80 border-b border-neutral-200 dark:border-neutral-700 hover:bg-neutral-200/60 dark:hover:bg-neutral-700/60 transition-colors"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Domain Level Overrides
        </span>
        <span className="flex items-center gap-2">
          {activeCount > 0 && (
            <span className="text-[10px] tabular-nums px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
              {activeCount} active
            </span>
          )}
          <span className="text-[10px] text-neutral-400">{expanded ? '\u25B2' : '\u25BC'}</span>
        </span>
      </button>
      {expanded && (
        <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {allDomains.map((domain) => {
            const current = domainLevels[domain] ?? '';
            const isOverridden = current && current !== 'INFO';
            return (
              <div key={domain} className="flex items-center justify-between px-3 py-1.5">
                <span className={`text-[11px] ${isOverridden ? 'font-medium text-neutral-800 dark:text-neutral-100' : 'text-neutral-600 dark:text-neutral-400'}`}>
                  {domain}
                </span>
                <select
                  value={current}
                  disabled={saving}
                  onChange={(e) => handleChange(domain, e.target.value)}
                  className={`px-1.5 py-0.5 text-[10px] rounded border bg-white dark:bg-neutral-800 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 ${
                    isOverridden
                      ? 'border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400'
                      : 'border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-400'
                  }`}
                >
                  <option value="">default</option>
                  {LOG_LEVELS.map((level) => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Render a boolean toggle setting */
function BooleanSettingControl({
  value,
  onUpdate,
}: {
  value: boolean;
  onUpdate: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center cursor-pointer ml-4">
      <input
        type="checkbox"
        checked={value}
        onChange={() => onUpdate(!value)}
        className="sr-only peer"
      />
      <div className="w-11 h-6 bg-neutral-300 dark:bg-neutral-700 rounded-full peer peer-checked:bg-blue-500 peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all relative"></div>
    </label>
  );
}

/** Render a select dropdown setting */
function SelectSettingControl({
  setting,
  value,
  onUpdate,
}: {
  setting: DevToolSettingSelect;
  value: string;
  onUpdate: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onUpdate(e.target.value)}
      className="ml-4 px-2 py-1 text-[11px] rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
    >
      {setting.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** Render a number input setting */
function NumberSettingControl({
  setting,
  value,
  onUpdate,
}: {
  setting: DevToolSettingNumber;
  value: number;
  onUpdate: (value: number) => void;
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => {
        const parsed = parseFloat(e.target.value);
        if (Number.isNaN(parsed)) {
          return;
        }
        onUpdate(parsed);
      }}
      min={setting.min}
      max={setting.max}
      step={setting.step}
      className="ml-4 w-20 px-2 py-1 text-[11px] rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
    />
  );
}

/** Render a single dev tool setting based on its type */
function DevToolSettingRow({
  toolId,
  setting,
  getSettingValue,
  updateSetting,
}: {
  toolId: string;
  setting: DevToolSetting;
  getSettingValue: <T extends DevToolSettingValue>(toolId: string, key: string, defaultValue: T) => T;
  updateSetting: (toolId: string, key: string, value: DevToolSettingValue) => void;
}) {
  const renderControl = () => {
    switch (setting.type) {
      case 'boolean': {
        const value = getSettingValue(toolId, setting.key, setting.defaultValue);
        return (
          <BooleanSettingControl
            value={value}
            onUpdate={(v) => updateSetting(toolId, setting.key, v)}
          />
        );
      }
      case 'select': {
        const value = getSettingValue(toolId, setting.key, setting.defaultValue);
        return (
          <SelectSettingControl
            setting={setting}
            value={value}
            onUpdate={(v) => updateSetting(toolId, setting.key, v)}
          />
        );
      }
      case 'number': {
        const value = getSettingValue(toolId, setting.key, setting.defaultValue);
        return (
          <NumberSettingControl
            setting={setting}
            value={value}
            onUpdate={(v) => updateSetting(toolId, setting.key, v)}
          />
        );
      }
      default:
        return null;
    }
  };

  return (
    <div className="flex items-center justify-between p-3 rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-50/60 dark:bg-neutral-900/40">
      <div className="flex-1">
        <div className="text-[11px] font-semibold text-neutral-800 dark:text-neutral-100">
          {setting.label}
        </div>
        {setting.description && (
          <div className="text-[10px] text-neutral-600 dark:text-neutral-400">
            {setting.description}
          </div>
        )}
      </div>
      {renderControl()}
    </div>
  );
}

/** Dev tool settings section - renders settings from registry */
function DevToolsSettingsSection() {
  const { isLoading, getSettingValue, updateSetting } = useDevToolsSettings();
  const toolsWithSettings = devToolRegistry.getToolsWithSettings();

  if (toolsWithSettings.length === 0) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="text-xs text-neutral-500 dark:text-neutral-400">
        Loading dev tool settings...
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        Dev Tool Settings
      </h2>
      <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
        Settings exposed by individual dev tools.
      </p>

      {toolsWithSettings.map(tool => (
        <div key={tool.id} className="space-y-2">
          <h3 className="text-[11px] font-medium text-neutral-700 dark:text-neutral-300">
            {tool.label}
          </h3>
          <div className="space-y-2">
            {tool.settings!.map(setting => (
              <DevToolSettingRow
                key={setting.key}
                toolId={tool.id}
                setting={setting}
                getSettingValue={getSettingValue}
                updateSetting={updateSetting}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

/** Dev Tools settings sub-section */
function DebugDevToolsSettings() {
  return (
    <div className="flex-1 overflow-auto p-4 space-y-4 text-xs text-neutral-800 dark:text-neutral-100">
      <DevToolsSettingsSection />
    </div>
  );
}

/** Default component - shows log categories (first sub-section) */
export function DebugSettings() {
  return <DebugLogCategories />;
}

// Register this module (only in development mode)
if (import.meta.env.DEV) {
  settingsRegistry.register({
    id: 'debug',
    label: 'Debug',
    icon: '🐛',
    component: DebugSettings,
    order: 90,
    subSections: [
      {
        id: 'categories',
        label: 'Log Categories',
        icon: '📋',
        component: DebugLogCategories,
      },
      {
        id: 'devtools',
        label: 'Dev Tools',
        icon: '🔧',
        component: DebugDevToolsSettings,
      },
    ],
  });
}

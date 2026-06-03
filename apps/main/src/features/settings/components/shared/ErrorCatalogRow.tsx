/**
 * ErrorCatalogRow — Maintenance dashboard surface for the generation error
 * taxonomy.
 *
 * Read: every GenerationErrorCode with its description, category, default vs
 * effective retry policy, and live occurrence counts (24h / 7d).
 * Write: for the tweakable content_* family, flip retryability and/or set a
 * per-code max-attempts override live (admin) — backed by
 * /api/v1/generations/error-catalog{,/overrides}.
 */

import { Button, useToast } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Icon } from '@lib/icons';

import {
  bustStatsCache,
  extractErrorMessage,
  maintGet,
  maintPatch,
} from './maintenanceShared';
import { Spinner } from './MaintenanceSpinner';

const SURFACE = 'settings:error-catalog';
const CATALOG_KEY = '/api/v1/generations/error-catalog';
const OVERRIDES_PATH = '/api/v1/generations/error-catalog/overrides';

// ── Types (mirror backend ErrorCatalogResponse) ───────────────────────────

interface ErrorPolicyOverride {
  retryable: boolean;
  max_attempts: number | null;
}

interface ErrorCatalogEntry {
  code: string;
  description: string;
  category: string;
  default_retryable: boolean;
  effective_retryable: boolean;
  tweakable: boolean;
  override: ErrorPolicyOverride | null;
  count_24h: number;
  count_7d: number;
}

interface ErrorCatalogResponse {
  codes: ErrorCatalogEntry[];
  global_max_attempts: number;
}

const CATEGORY_ORDER = ['moderation', 'provider', 'param', 'other'] as const;
const CATEGORY_LABEL: Record<string, string> = {
  moderation: 'Content moderation',
  provider: 'Provider',
  param: 'Parameter validation',
  other: 'Other',
};

export function ErrorCatalogRow() {
  const toast = useToast();
  const [data, setData] = useState<ErrorCatalogResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingCode, setSavingCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await maintGet<ErrorCatalogResponse>(CATALOG_KEY, SURFACE);
      setData(res);
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyOverride = useCallback(
    async (code: string, override: ErrorPolicyOverride | null) => {
      setSavingCode(code);
      try {
        const res = await maintPatch<ErrorCatalogResponse>(
          OVERRIDES_PATH,
          { overrides: { [code]: override } },
          SURFACE,
        );
        setData(res);
        bustStatsCache(CATALOG_KEY);
        toast.success(override === null ? `${code} reset to default` : `${code} updated`);
      } catch (err) {
        toast.error(extractErrorMessage(err));
      } finally {
        setSavingCode(null);
      }
    },
    [toast],
  );

  // Flip retryability. If the new value equals the default and there's no
  // max-attempts override, clear the override entirely (back to default).
  const toggleRetry = useCallback(
    (entry: ErrorCatalogEntry) => {
      const next = !entry.effective_retryable;
      const maxOv = entry.override?.max_attempts ?? null;
      if (next === entry.default_retryable && maxOv === null) {
        void applyOverride(entry.code, null);
      } else {
        void applyOverride(entry.code, { retryable: next, max_attempts: maxOv });
      }
    },
    [applyOverride],
  );

  const grouped = useMemo(() => {
    const by: Record<string, ErrorCatalogEntry[]> = {};
    for (const e of data?.codes ?? []) {
      (by[e.category] ??= []).push(e);
    }
    return by;
  }, [data]);

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Spinner className="w-4 h-4" /> Loading error catalog…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4">
        <Button onClick={() => void load()} variant="outline" size="sm">
          <Icon name="refresh" size={12} /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          Retry policy + recent failures by error code. Global cap:{' '}
          <span className="font-medium tabular-nums">{data.global_max_attempts}</span> attempts.
          Only <span className="font-medium">tweakable</span> codes (content moderation, where
          output varies) can be overridden.
        </div>
        <Button onClick={() => void load()} disabled={loading} variant="outline" size="sm">
          {loading ? <Spinner className="w-3 h-3" /> : <Icon name="refresh" size={12} />}
        </Button>
      </div>

      {CATEGORY_ORDER.filter((c) => grouped[c]?.length).map((category) => (
        <div key={category} className="flex flex-col gap-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
            {CATEGORY_LABEL[category] ?? category}
          </div>
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-2 py-1">Code</th>
                  <th className="text-right font-medium px-2 py-1 w-14">24h</th>
                  <th className="text-right font-medium px-2 py-1 w-14">7d</th>
                  <th className="text-center font-medium px-2 py-1 w-28">Retry</th>
                  <th className="px-2 py-1 w-16" />
                </tr>
              </thead>
              <tbody>
                {grouped[category].map((e) => {
                  const overridden = e.override !== null;
                  const busy = savingCode === e.code;
                  return (
                    <tr
                      key={e.code}
                      className="border-t border-border/60 hover:bg-muted/20 align-top"
                    >
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-medium">{e.code}</span>
                          {overridden && (
                            <span
                              className="text-[9px] px-1 rounded bg-amber-200/70 dark:bg-amber-800/60 text-amber-900 dark:text-amber-100"
                              title="Has a per-code override"
                            >
                              override
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground">{e.description}</div>
                        {e.override?.max_attempts != null && (
                          <div className="text-[10px] text-amber-700 dark:text-amber-300">
                            max attempts: {e.override.max_attempts}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {e.count_24h || <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {e.count_7d || <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {e.tweakable ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => toggleRetry(e)}
                            className={[
                              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors',
                              e.effective_retryable
                                ? 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200 hover:bg-green-200'
                                : 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 hover:bg-red-200',
                              busy ? 'opacity-50 cursor-wait' : 'cursor-pointer',
                            ].join(' ')}
                            title="Click to toggle retryability"
                          >
                            {busy ? (
                              <Spinner className="w-3 h-3" />
                            ) : (
                              <Icon name={e.effective_retryable ? 'rotateCcw' : 'xCircle'} size={10} />
                            )}
                            {e.effective_retryable ? 'retry' : 'terminal'}
                          </button>
                        ) : (
                          <span
                            className={[
                              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]',
                              e.effective_retryable
                                ? 'text-green-700 dark:text-green-300'
                                : 'text-muted-foreground',
                            ].join(' ')}
                            title="Fixed policy (not tweakable)"
                          >
                            {e.effective_retryable ? 'retry' : 'terminal'}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {overridden && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void applyOverride(e.code, null)}
                            className="text-[10px] text-muted-foreground hover:text-foreground underline"
                            title="Reset to default policy"
                          >
                            reset
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

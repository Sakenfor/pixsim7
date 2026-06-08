/**
 * PromptModerationChip — persistent render-moderation status shown next to the
 * prompt-box character cap.
 *
 * Inline (no hover needed):
 *  - no history yet: a faint "—"
 *  - has history: rate + raw counts "✓63% 5/8" so you see confidence, not just a
 *    percentage (5/8 and 50/80 are both 63% but very different)
 *  - actively failing: prefixes the live "⟳N/cap" retry-streak (gray → orange →
 *    red toward the auto-retry cap)
 *
 * Hovering opens a richer breakdown (both scopes, the streak-vs-cap explanation,
 * and what "fast-filtered" means). The popover has hover-intent: it stays open
 * while you move onto it and only closes after a short grace delay.
 *
 * `operationType` scopes the stats to one operation (i2v vs i2i etc.) and, for
 * admins, unlocks an inline gear to tweak that operation's filtered-retry policy
 * (cap + backoff) without leaving the prompt box.
 *
 * `grain` controls which scope drives the inline number:
 *  - 'auto'   — prefer prompt+image stats, fall back to prompt-only (default)
 *  - 'prompt' — always show the broader prompt-only track record
 */
import { isAdminUser, useAuthStore } from '@pixsim7/shared.auth.core';
import { Badge } from '@pixsim7/shared.ui';
import { useEffect, useRef, useState } from 'react';

import { pixsimClient } from '@lib/api';
import { Icon } from '@lib/icons';

import { usePromptModerationStats } from '../hooks/usePromptModerationStats';

export type PromptModerationGrain = 'auto' | 'prompt';

const CLOSE_GRACE_MS = 240;

function pct(rate: number | null): number {
  return rate == null ? 0 : Math.round(rate * 100);
}

export function PromptModerationChip({
  prompt,
  imageAssetId,
  operationType = null,
  model = null,
  duration = null,
  modelOptions,
  durationOptions,
  grain = 'auto',
}: {
  prompt: string;
  imageAssetId: number | null;
  operationType?: string | null;
  /** Current model/duration — scopes the resolved cap/backoff + seeds the editor. */
  model?: string | null;
  duration?: number | null;
  /** Selectable values for the scope picker (composer). Omit in the viewer. */
  modelOptions?: string[];
  durationOptions?: number[];
  grain?: PromptModerationGrain;
}) {
  // Self-contained: fetching here (rather than via a parent hook) means the
  // chip's own updates re-render only the chip, never the heavy composer.
  const stats = usePromptModerationStats(prompt, imageAssetId, operationType, model, duration);
  const isAdmin = useAuthStore((s) => isAdminUser(s.user));

  // Hover-intent: open immediately, but defer close so the pointer can travel
  // the gap onto the popover (a descendant of the wrapper) without it vanishing.
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  // Optimistic local copy of cap/defer after a save (avoids a settings refetch).
  const [localPolicy, setLocalPolicy] = useState<{ cap: number; defer: number } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = undefined;
  };
  const openNow = () => {
    cancelClose();
    setOpen(true);
  };
  const scheduleClose = () => {
    if (editing) return; // never auto-close mid-edit (keyboard may leave the box)
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_GRACE_MS);
  };
  useEffect(() => cancelClose, []);

  // The optimistic policy is scoped to ONE operation — drop it whenever the
  // operation (or prompt/image) changes, so each scope shows its own fetched
  // cap/defer instead of carrying the last edit's value across. Without this,
  // editing i2i then switching to i2v would show i2i's cap, looking shared.
  useEffect(() => {
    setLocalPolicy(null);
    setEditing(false);
  }, [operationType, model, duration, prompt, imageAssetId]);

  if (!stats) {
    return (
      <Badge color="gray" title="No render-moderation history for this prompt yet.">
        —
      </Badge>
    );
  }

  const po = stats.prompt_only;
  const poTotal = po.passed + po.filtered;
  const pi = stats.prompt_image;
  const piTotal = pi ? pi.passed + pi.filtered : 0;

  // Headline scope: 'prompt' forces the broad prompt-only track record;
  // 'auto' prefers prompt+image when it has data, else falls back to prompt-only.
  const usingImage = grain === 'auto' && piTotal > 0;
  const headline = usingImage ? pi! : po;
  const total = headline.passed + headline.filtered;

  const ratePct = pct(headline.rate);
  const hasStreak = stats.streak >= 1;
  const cap = localPolicy?.cap ?? stats.cap;
  const defer = localPolicy?.defer ?? stats.defer_seconds;
  const atCap = stats.streak >= cap;
  const near = stats.streak >= Math.ceil(cap * 0.6);
  const empty = total === 0 && !hasStreak;

  // Streak severity drives the color while failing; otherwise the rate does.
  const color = empty
    ? 'gray'
    : hasStreak
      ? atCap
        ? 'red'
        : near
          ? 'orange'
          : 'gray'
      : ratePct >= 60
        ? 'green'
        : ratePct >= 25
          ? 'yellow'
          : 'red';

  // Inline label: rate + raw counts so confidence is visible without hovering.
  const streakPrefix = hasStreak ? `⟳${stats.streak}/${cap} ` : '';
  const label = empty ? '—' : `${streakPrefix}✓${ratePct}% ${headline.passed}/${total}`;

  const headerColor = hasStreak
    ? atCap
      ? 'text-red-300'
      : 'text-orange-300'
    : empty
      ? 'text-gray-300'
      : ratePct >= 60
        ? 'text-green-300'
        : ratePct >= 25
          ? 'text-yellow-300'
          : 'text-red-300';

  const canEditPolicy = isAdmin && !!operationType;

  return (
    <span
      className="relative inline-flex items-center gap-1"
      onMouseEnter={openNow}
      onMouseLeave={scheduleClose}
    >
      <Badge color={color} className="cursor-default">
        {label}
      </Badge>

      {/* Quick-tune gear right on the chip (admins only) — one click jumps
          straight into the per-operation cap/backoff editor in the popover. */}
      {canEditPolicy && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            openNow();
            setEditing(true);
          }}
          title="Tune this operation's auto-retry cap + backoff"
          className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
        >
          <Icon name="sliders" size={12} />
        </button>
      )}

      {open && (
        <div
          // Descendant of the wrapper, so moving badge → popover does NOT fire the
          // wrapper's mouseleave; pointer-events-auto lets it keep itself open.
          className="absolute bottom-full right-0 mb-1 z-tooltip w-64 pointer-events-auto
                     animate-in fade-in duration-150"
          onMouseEnter={openNow}
          onMouseLeave={scheduleClose}
        >
          <div className="rounded-lg border border-gray-700 bg-gray-900/95 px-3 py-2 text-left
                          text-xs text-white shadow-xl backdrop-blur-md space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className={`font-semibold ${headerColor}`}>
                Render-moderation track record
              </span>
            </div>

            {empty ? (
              <div className="opacity-80">
                No recent attempts recorded for this prompt yet. Generate to start
                building a pass/fail history.
              </div>
            ) : (
              <div className="space-y-0.5">
                {piTotal > 0 && (
                  <div className="flex justify-between gap-3 tabular-nums">
                    <span className="opacity-80">Prompt + image</span>
                    <span>
                      {pi!.passed}/{piTotal} · {pct(pi!.rate)}%
                    </span>
                  </div>
                )}
                <div className="flex justify-between gap-3 tabular-nums">
                  <span className="opacity-80">
                    Prompt{piTotal > 0 ? ' (any image)' : ''}
                  </span>
                  <span>
                    {po.passed}/{poTotal} · {pct(po.rate)}%
                  </span>
                </div>
              </div>
            )}

            {hasStreak && (
              <div className="leading-snug">
                {atCap
                  ? `⚠ Fast-filtered ${stats.streak}× in a row — auto-retry has stopped (cap ${cap}). Edit the prompt to reset.`
                  : `Fast-filtered ${stats.streak}× in a row — auto-retry stops at ${cap}. Editing the prompt resets it.`}
              </div>
            )}

            {/* Per-operation auto-retry policy (admin-editable via the gear). */}
            {operationType && (
              <div className="border-t border-white/15 pt-1">
                {editing ? (
                  <PolicyEditor
                    operationType={operationType}
                    currentModel={model}
                    currentDuration={duration}
                    modelOptions={modelOptions}
                    durationOptions={durationOptions}
                    initialCap={cap}
                    initialDefer={defer}
                    onSaved={(next) => {
                      setLocalPolicy(next);
                      setEditing(false);
                    }}
                    onCancel={() => setEditing(false)}
                  />
                ) : (
                  <div className="flex justify-between gap-3 tabular-nums opacity-70">
                    <span>Auto-retry</span>
                    <span>cap {cap} · backoff {defer}s</span>
                  </div>
                )}
              </div>
            )}

            <div className="leading-snug opacity-60 border-t border-white/15 pt-1">
              “Fast-filtered” = the provider rendered the result then moderated it
              away (no video produced). Counts your recent attempts on this prompt.
            </div>
          </div>
        </div>
      )}
    </span>
  );
}

const ANY_SCOPE = '__any__';

/** Inline editor for a filtered-retry policy at a chosen scope (admin only). */
function PolicyEditor({
  operationType,
  currentModel,
  currentDuration,
  modelOptions,
  durationOptions,
  initialCap,
  initialDefer,
  onSaved,
  onCancel,
}: {
  operationType: string;
  currentModel: string | null;
  currentDuration: number | null;
  modelOptions?: string[];
  durationOptions?: number[];
  initialCap: number;
  initialDefer: number;
  onSaved: (next: { cap: number; defer: number }) => void;
  onCancel: () => void;
}) {
  // Fall back to the current value as the only specific option (viewer has no
  // option lists); empty list → that dimension can only be "Any" (op-level).
  const models = modelOptions ?? (currentModel ? [currentModel] : []);
  const durations = durationOptions ?? (currentDuration != null ? [currentDuration] : []);

  // Default the scope to the exact generation being looked at (most specific),
  // so "Save" tunes what you're actually generating; widen to Any to cover all.
  const [scopeModel, setScopeModel] = useState(currentModel ?? ANY_SCOPE);
  const [scopeDuration, setScopeDuration] = useState(
    currentDuration != null ? String(currentDuration) : ANY_SCOPE,
  );
  const [capStr, setCapStr] = useState(String(initialCap));
  const [deferStr, setDeferStr] = useState(String(initialDefer));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const cap = Math.round(Number(capStr));
    const defer = Math.round(Number(deferStr));
    if (!Number.isFinite(cap) || cap < 1 || cap > 100 || !Number.isFinite(defer) || defer < 1 || defer > 600) {
      setError('cap 1–100, backoff 1–600s');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (scopeModel !== ANY_SCOPE) params.set('model', scopeModel);
      if (scopeDuration !== ANY_SCOPE) params.set('duration', scopeDuration);
      const qs = params.toString();
      await pixsimClient.patch(
        `/admin/generation-worker/filtered-retry/${operationType}${qs ? `?${qs}` : ''}`,
        { cap, defer_seconds: defer },
      );
      onSaved({ cap, defer });
    } catch {
      setError('Save failed');
      setSaving(false);
    }
  };

  const selectCls =
    'rounded bg-gray-800 border border-gray-600 px-1 py-0.5 text-white text-[11px]';

  const scopeLabel = [
    operationType,
    scopeModel !== ANY_SCOPE ? `model ${scopeModel}` : 'any model',
    scopeDuration !== ANY_SCOPE ? `${scopeDuration}s` : 'any duration',
  ].join(' · ');

  return (
    <div className="space-y-1">
      {(models.length > 0 || durations.length > 0) && (
        <div className="flex items-center gap-2">
          <span className="opacity-70">scope</span>
          {models.length > 0 && (
            <select
              value={scopeModel}
              onChange={(e) => setScopeModel(e.target.value)}
              className={selectCls}
            >
              <option value={ANY_SCOPE}>any model</option>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          )}
          {durations.length > 0 && (
            <select
              value={scopeDuration}
              onChange={(e) => setScopeDuration(e.target.value)}
              className={selectCls}
            >
              <option value={ANY_SCOPE}>any dur</option>
              {durations.map((d) => (
                <option key={d} value={String(d)}>
                  {d}s
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1">
          <span className="opacity-70">cap</span>
          <input
            type="number"
            min={1}
            max={100}
            value={capStr}
            onChange={(e) => setCapStr(e.target.value)}
            className="w-12 rounded bg-gray-800 border border-gray-600 px-1 py-0.5 text-white tabular-nums"
          />
        </label>
        <label className="flex items-center gap-1">
          <span className="opacity-70">backoff</span>
          <input
            type="number"
            min={1}
            max={600}
            value={deferStr}
            onChange={(e) => setDeferStr(e.target.value)}
            className="w-14 rounded bg-gray-800 border border-gray-600 px-1 py-0.5 text-white tabular-nums"
          />
          <span className="opacity-70">s</span>
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={saving}
          onMouseDown={(e) => e.preventDefault()}
          onClick={save}
          className="rounded bg-accent/80 hover:bg-accent px-2 py-0.5 text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onCancel}
          className="rounded bg-gray-700 hover:bg-gray-600 px-2 py-0.5 text-white"
        >
          Cancel
        </button>
        {error && <span className="text-red-400">{error}</span>}
      </div>
      <div className="opacity-50 leading-snug">
        Applies to <span className="font-mono">{scopeLabel}</span> auto-retries
        (per prompt+image). i2i is opt-in — saving enables its backoff/cap.
      </div>
    </div>
  );
}

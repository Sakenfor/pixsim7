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
 * while you move onto it and only closes after a short grace delay, so it no
 * longer snaps shut the instant the pointer leaves the badge.
 *
 * `grain` controls which scope drives the inline number:
 *  - 'auto'   — prefer prompt+image stats, fall back to prompt-only (default)
 *  - 'prompt' — always show the broader prompt-only track record
 */
import { Badge } from '@pixsim7/shared.ui';
import { useEffect, useRef, useState } from 'react';


import { usePromptModerationStats } from '../hooks/usePromptModerationStats';

export type PromptModerationGrain = 'auto' | 'prompt';

const CLOSE_GRACE_MS = 240;

function pct(rate: number | null): number {
  return rate == null ? 0 : Math.round(rate * 100);
}

export function PromptModerationChip({
  prompt,
  imageAssetId,
  grain = 'auto',
}: {
  prompt: string;
  imageAssetId: number | null;
  grain?: PromptModerationGrain;
}) {
  // Self-contained: fetching here (rather than via a parent hook) means the
  // chip's own updates re-render only the chip, never the heavy composer.
  const stats = usePromptModerationStats(prompt, imageAssetId);

  // Hover-intent: open immediately, but defer close so the pointer can travel
  // the gap onto the popover (a descendant of the wrapper) without it vanishing.
  const [open, setOpen] = useState(false);
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
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_GRACE_MS);
  };
  useEffect(() => cancelClose, []);

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
  const atCap = stats.streak >= stats.cap;
  const near = stats.streak >= Math.ceil(stats.cap * 0.6);
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
  const streakPrefix = hasStreak ? `⟳${stats.streak}/${stats.cap} ` : '';
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

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={openNow}
      onMouseLeave={scheduleClose}
    >
      <Badge color={color} className="cursor-default">
        {label}
      </Badge>

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
            <div className={`font-semibold ${headerColor}`}>
              Render-moderation track record
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
                  ? `⚠ Fast-filtered ${stats.streak}× in a row — auto-retry has stopped (cap ${stats.cap}). Edit the prompt to reset.`
                  : `Fast-filtered ${stats.streak}× in a row — auto-retry stops at ${stats.cap}. Editing the prompt resets it.`}
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

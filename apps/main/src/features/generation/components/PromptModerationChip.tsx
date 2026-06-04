/**
 * PromptModerationChip — persistent render-moderation status shown next to the
 * prompt-box character cap.
 *
 * Always rendered:
 *  - no history yet (new/edited prompt+image): a faint "—"
 *  - has history: the pass rate "✓ NN%" (green/yellow/red) — general track
 *    record, shown even when circling back to an old prompt
 *  - actively failing: prefixes the live "⟳ N/cap" retry-streak (gray → orange
 *    → red toward the auto-retry cap)
 *
 * Grain is prompt + input image (raw prompt text — the same deterministic key
 * the retry cap uses). Prompt-only context lives in the tooltip.
 */
import { Badge } from '@pixsim7/shared.ui';

import { usePromptModerationStats } from '../hooks/usePromptModerationStats';

function pct(rate: number | null): number {
  return rate == null ? 0 : Math.round(rate * 100);
}

export function PromptModerationChip({
  prompt,
  imageAssetId,
}: {
  prompt: string;
  imageAssetId: number | null;
}) {
  // Self-contained: fetching here (rather than via a parent hook) means the
  // chip's own updates re-render only the chip, never the heavy composer.
  const stats = usePromptModerationStats(prompt, imageAssetId);
  // Debug-friendly empty state: tooltip shows what the backend returned so we
  // can tell "no match" from "image-only mismatch" from "not loaded".
  const debugTitle = stats
    ? `No match yet — prompt: ${stats.prompt_only.passed}/${stats.prompt_only.passed + stats.prompt_only.filtered}` +
      `, prompt+image: ${stats.prompt_image ? `${stats.prompt_image.passed}/${stats.prompt_image.passed + stats.prompt_image.filtered}` : 'n/a'}` +
      `, streak ${stats.streak}`
    : 'No render-moderation history for this prompt + image yet.';
  const emptyMarker = (
    <Badge color="gray" title={debugTitle}>
      —
    </Badge>
  );
  if (!stats) return emptyMarker;

  const po = stats.prompt_only;
  const poTotal = po.passed + po.filtered;
  const pi = stats.prompt_image;
  const piTotal = pi ? pi.passed + pi.filtered : 0;

  // Prefer prompt+image stats when they exist; otherwise fall back to the
  // broader prompt-only stats (image filter may not match, but the prompt does).
  const headline = piTotal > 0 ? pi! : po;
  const total = headline.passed + headline.filtered;

  if (total === 0 && stats.streak < 1) return emptyMarker;

  const ratePct = pct(headline.rate);
  const hasStreak = stats.streak >= 1;
  const atCap = stats.streak >= stats.cap;
  const near = stats.streak >= Math.ceil(stats.cap * 0.6);

  // Streak severity drives the color while failing; otherwise the rate does.
  const color = hasStreak
    ? (atCap ? 'red' : near ? 'orange' : 'gray')
    : (ratePct >= 60 ? 'green' : ratePct >= 25 ? 'yellow' : 'red');

  // Rate is the persistent general stat; the streak prefixes it when active.
  const text = `${hasStreak ? `⟳${stats.streak}/${stats.cap} ` : ''}✓${ratePct}%`;

  const usingImage = piTotal > 0;
  const tooltipParts = [
    `${usingImage ? 'Prompt + image' : 'Prompt'}: ${headline.passed}/${total} passed (${ratePct}%)`,
  ];
  if (hasStreak) {
    tooltipParts.push(
      atCap
        ? `Fast-filtered ${stats.streak}× in a row — auto-retry has stopped (cap ${stats.cap}); edit the prompt to reset.`
        : `Fast-filtered ${stats.streak}× in a row — auto-retry stops at ${stats.cap}; editing the prompt resets it.`,
    );
  }
  if (usingImage && poTotal > total) {
    tooltipParts.push(`This prompt, any image: ${po.passed}/${poTotal} (${pct(po.rate)}%)`);
  }

  return (
    <Badge color={color} title={tooltipParts.join(' · ')}>
      {text}
    </Badge>
  );
}

/**
 * Pure helpers for the pause-toast bridge (see `pauseToast.ts`).
 *
 * Kept side-effect-free (no store subscription, no `hmrSingleton`) so the
 * coalescing / labelling logic can be unit-tested in isolation.
 */

import type { GenerationModel } from '../models';

/** Max generation ids spelled out in a toast before we switch to "+N more". */
export const MAX_IDS_SHOWN = 6;

/** A single paused generation as the message builder needs it. */
export interface PausedEntry {
  id: number;
  reason: string;
}

/**
 * Friendly reason for a paused generation, derived from its structured
 * `errorCode`. Mirrors the labels used by the inline ContentModerationWarning
 * strip so the two surfaces stay consistent.
 */
export function pauseReasonLabel(gen: Pick<GenerationModel, 'errorCode'>): string {
  switch (gen.errorCode) {
    case 'provider_concurrent_limit_quarantine':
      return 'Prompt/image quarantine';
    case 'content_filtered':
    case 'content_output_rejected':
    case 'content_render_moderated':
      return 'Content filtered';
    case 'content_prompt_rejected':
    case 'content_text_rejected':
      return 'Prompt rejected';
    case 'content_image_rejected':
      return 'Image rejected';
    default:
      return 'Paused';
  }
}

/** Render an id list, truncating past MAX_IDS_SHOWN. */
export function formatIds(ids: number[]): string {
  const shown = ids.slice(0, MAX_IDS_SHOWN).map((id) => `#${id}`);
  const extra = ids.length - shown.length;
  return extra > 0 ? `${shown.join(', ')} +${extra} more` : shown.join(', ');
}

/** Build the coalesced toast message for a batch of paused generations. */
export function buildPauseMessage(paused: PausedEntry[]): string {
  // Group by reason, preserving first-seen order.
  const byReason = new Map<string, number[]>();
  for (const { id, reason } of paused) {
    const list = byReason.get(reason);
    if (list) list.push(id);
    else byReason.set(reason, [id]);
  }

  if (paused.length === 1) {
    const { id, reason } = paused[0];
    return `Generation #${id} paused — ${reason}`;
  }

  if (byReason.size === 1) {
    const [reason, ids] = [...byReason.entries()][0];
    return `${ids.length} generations paused — ${reason} · ${formatIds(ids)}`;
  }

  // Mixed reasons: lead with the total, then a per-reason breakdown.
  const parts = [...byReason.entries()].map(
    ([reason, ids]) => `${reason} (${ids.length})`,
  );
  return `${paused.length} generations paused · ${parts.join(', ')}`;
}

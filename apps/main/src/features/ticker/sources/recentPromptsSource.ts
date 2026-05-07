/**
 * Recent prompts ticker source — rotating snapshot of the user's prompt
 * history across all scopes.
 *
 * Pure client-side. Reads via `readRecentPrompts()` from the prompts
 * feature (which owns the storage shape — we never touch localStorage
 * directly here).
 *
 * Per-source settings:
 * - `rotationMs`     — how often to advance to the next prompt (default 5min)
 * - `maxPrompts`     — how many recent prompts to rotate through (default 12)
 * - `maxLength`      — truncate prompts longer than this (default 80 chars)
 *
 * No click target — Phase 2 doesn't deep-link prompts (would need a
 * "show in composer" canon that doesn't exist yet).
 */

import { readRecentPrompts } from '@features/prompts/lib/recentPrompts';

import {
  getSourceSettings,
  useTickerSettingsStore,
} from '../stores/tickerSettingsStore';
import type { TickerEvent, TickerSource } from '../lib/sourceRegistry';

const SOURCE_ID = 'recent-prompts';

export interface RecentPromptsSettings {
  rotationMs: number;
  maxPrompts: number;
  maxLength: number;
}

const DEFAULT_SETTINGS: RecentPromptsSettings = {
  rotationMs: 5 * 60 * 1000,
  maxPrompts: 12,
  maxLength: 80,
};

function readSettings(): RecentPromptsSettings {
  return getSourceSettings(
    useTickerSettingsStore.getState(),
    SOURCE_ID,
    DEFAULT_SETTINGS,
  );
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

function buildEvent(
  prompt: { id: string; value: string },
  settings: RecentPromptsSettings,
  rotationCounter: number,
): TickerEvent {
  return {
    // Counter in id keeps each rotation distinct so the buffer doesn't
    // dedupe identical prompts across spins.
    id: `prompt-${prompt.id}-${rotationCounter}`,
    sourceId: SOURCE_ID,
    message: `“${truncate(prompt.value, settings.maxLength)}”`,
    icon: '💭',
    color: 'text-violet-500',
    timestamp: Date.now(),
    // TTL slightly longer than rotation so the previous prompt is still
    // visible briefly when the next one rotates in. Min floor for very
    // short rotation intervals.
    ttl: Math.max(settings.rotationMs * 1.2, 30_000),
  };
}

export const recentPromptsSource: TickerSource = {
  id: SOURCE_ID,
  label: 'Recent prompts',
  description: 'Rotates through your latest prompts as gentle background context',
  defaultEnabled: false,

  subscribe(emit) {
    let cancelled = false;
    let rotationCounter = 0;
    let cursor = 0;

    function step() {
      if (cancelled) return;
      const settings = readSettings();
      const prompts = readRecentPrompts(settings.maxPrompts);
      if (prompts.length > 0) {
        cursor = cursor % prompts.length;
        rotationCounter += 1;
        emit(buildEvent(prompts[cursor], settings, rotationCounter));
        cursor = (cursor + 1) % prompts.length;
      }
      // Re-read interval each tick so a settings change takes effect on
      // the next rotation rather than requiring a re-subscribe.
      const nextSettings = readSettings();
      timer = setTimeout(step, nextSettings.rotationMs);
    }

    let timer = setTimeout(step, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  },
};

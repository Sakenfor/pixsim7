/**
 * AI Assistant "active conversation" tint preference.
 *
 * Drives the soft, fading row tint on chat tabs whose last message is a recent
 * agent reply (your turn). Stored as a *window* in milliseconds: the tint is
 * strongest right after the reply and eases to nothing over this window. `0`
 * disables the tint entirely (the "Off" choice in Appearance → Surfaces).
 *
 * A per-panel appearance pref — same shape and home as `panelSkinStore`. Key
 * owned in the stores registry (see `panelSkins.registrations`).
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const ASSISTANT_TINT_STORE_KEY = 'appearance:assistant-tint:v1';

/** Default reminder window — 10 minutes. */
export const DEFAULT_ASSISTANT_TINT_WINDOW_MS = 10 * 60 * 1000;

/** Selectable windows surfaced in settings (ms). `0` = Off. */
export const ASSISTANT_TINT_WINDOW_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0, label: 'Off' },
  { value: 5 * 60 * 1000, label: '5 minutes' },
  { value: 10 * 60 * 1000, label: '10 minutes' },
  { value: 20 * 60 * 1000, label: '20 minutes' },
  { value: 30 * 60 * 1000, label: '30 minutes' },
];

interface AssistantTintState {
  /** Reminder window in ms; `0` disables the tint. */
  windowMs: number;
  setWindowMs: (windowMs: number) => void;
}

export const useAssistantTintStore = create<AssistantTintState>()(
  persist(
    (set) => ({
      windowMs: DEFAULT_ASSISTANT_TINT_WINDOW_MS,
      setWindowMs: (windowMs) => set({ windowMs: Math.max(0, windowMs) }),
    }),
    { name: ASSISTANT_TINT_STORE_KEY },
  ),
);

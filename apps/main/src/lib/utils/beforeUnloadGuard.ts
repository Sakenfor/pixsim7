/**
 * Shared guard for temporarily suppressing browser beforeunload prompts.
 *
 * Used for forced navigations (for example auth-expiry redirects) where
 * showing an unsaved-change prompt traps the app in an unauthorized state.
 */
const DEFAULT_SUPPRESS_DURATION_MS = 8_000;
let suppressUntilMs = 0;

export function suppressBeforeUnloadPrompt(
  durationMs: number = DEFAULT_SUPPRESS_DURATION_MS,
): void {
  const safeDuration = Number.isFinite(durationMs)
    ? Math.max(0, durationMs)
    : DEFAULT_SUPPRESS_DURATION_MS;
  suppressUntilMs = Math.max(suppressUntilMs, Date.now() + safeDuration);
}

export function isBeforeUnloadPromptSuppressed(nowMs: number = Date.now()): boolean {
  return nowMs < suppressUntilMs;
}

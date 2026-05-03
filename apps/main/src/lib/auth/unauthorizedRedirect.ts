import { suppressBeforeUnloadPrompt } from '@lib/utils/beforeUnloadGuard';

const REDIRECT_GUARD_RESET_MS = 3_000;
let isRedirectingToLogin = false;

/**
 * Redirect to /login after an auth failure.
 *
 * This suppresses beforeunload prompts so unsaved-change confirmation does not
 * block the redirect and leave the app stuck in a repeated 401 state.
 */
export function redirectToLoginOnUnauthorized(): void {
  if (typeof window === 'undefined') return;
  if (window.location.pathname.startsWith('/login')) return;
  if (isRedirectingToLogin) return;

  isRedirectingToLogin = true;
  suppressBeforeUnloadPrompt();
  window.location.assign('/login');

  // If navigation is interrupted for any reason, allow a later retry.
  window.setTimeout(() => {
    if (!window.location.pathname.startsWith('/login')) {
      isRedirectingToLogin = false;
    }
  }, REDIRECT_GUARD_RESET_MS);
}

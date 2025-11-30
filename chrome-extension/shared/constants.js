/**
 * Shared constants used across extension modules
 */

// Storage keys
export const STORAGE_KEYS = {
  PROVIDER_SESSIONS: 'pixsim7ProviderSessions',
  SETTINGS: 'pixsim7Settings',
  AUTH_TOKEN: 'pixsim7Token',
};

// Provider authentication cookie hints
// Used to detect if user is logged into a provider
export const PROVIDER_AUTH_COOKIE_HINTS = {
  pixverse: ['_ai_token'],
  sora: ['__Secure-next-auth.session-token'],
  runway: ['session'],
  pika: ['auth_token'],
};

// Timing constants
export const TIMING = {
  IMPORT_DEBOUNCE_MS: 10000,      // Debounce cookie imports
  LOGOUT_DEBOUNCE_MS: 4000,       // Debounce logout detection
  AUTH_CHECK_INTERVAL_MS: 5000,   // Auth state polling interval
  INITIAL_CHECK_DELAY_MS: 3000,   // Initial page load delay
  BEARER_CAPTURE_DELAY_MS: 1000,  // Wait for bearer token capture
};

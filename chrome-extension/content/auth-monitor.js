/**
 * Auth Monitor - Monitors authentication state and cookie changes
 *
 * Loaded as a plain script - exposes globals.
 * Requires: getAllCookiesSecure, isProviderSessionAuthenticated, hashCookies (from utils.js)
 * Requires: importCookies, getRememberedProviderAccount, clearRememberedProviderAccount (from cookie-import.js)
 * Requires: TIMING (from shared/constants.js)
 *
 * Polls for auth state changes (login/logout/cookie changes) but does NOT
 * detect provider (that's handled by url-monitor.js).
 */

// Debug mode - controlled by extension settings
let DEBUG_AUTH = false;
if (typeof chrome !== 'undefined' && chrome.storage) {
  chrome.storage.local.get({ debugAuth: false, debugAll: false }, (result) => {
    DEBUG_AUTH = result.debugAuth || result.debugAll;
  });
}
const debugLogAuth = (...args) => DEBUG_AUTH && console.log('[PixSim7 Auth Monitor]', ...args);

const authMonitor = {
  currentProvider: null,
  wasLoggedIn: false,
  hasImportedThisSession: false,
  lastCookieSnapshot: null,
  lastImportTimestamp: 0,
  pendingLogoutStartedAt: null,
  pollInterval: null,

  /**
   * Called when URL monitor detects a provider
   */
  onProviderDetected(provider) {
    if (!provider) {
      this.stop();
      return;
    }

    // Provider changed - reset state
    if (this.currentProvider?.providerId !== provider.providerId) {
      debugLogAuth('Provider changed, resetting state');
      this.wasLoggedIn = false;
      this.hasImportedThisSession = false;
      this.lastCookieSnapshot = null;
    }

    this.currentProvider = provider;
    this.start();
  },

  /**
   * Start monitoring auth state
   */
  start() {
    if (this.pollInterval) return; // Already monitoring

    debugLogAuth('Starting auth monitoring for', this.currentProvider.providerId);

    // Initial check
    this.checkAuthState();

    // Poll every 5 seconds for auth/cookie changes
    this.pollInterval = setInterval(() => {
      this.checkAuthState();
    }, TIMING.AUTH_CHECK_INTERVAL_MS);
  },

  /**
   * Stop monitoring
   */
  stop() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      debugLogAuth('Stopped monitoring');
    }
  },

  /**
   * Schedule a cookie import (with debouncing)
   */
  scheduleImport(providerId) {
    const now = Date.now();
    if (now - this.lastImportTimestamp < TIMING.IMPORT_DEBOUNCE_MS) {
      debugLogAuth('Import skipped (debounced)');
      return;
    }
    this.lastImportTimestamp = now;

    // Wait a bit for bearer token to be captured
    setTimeout(() => {
      importCookies(providerId, {});
    }, TIMING.BEARER_CAPTURE_DELAY_MS);
  },

  /**
   * Handle provider logout
   */
  async handleProviderLogout(providerId) {
    try {
      const session = await getRememberedProviderAccount(providerId);
      if (session?.accountId) {
        const accountId = session.accountId;
        // Best-effort: sync credits for the account that is being logged out
        try {
          await chrome.runtime.sendMessage({
            action: 'syncAccountCredits',
            accountId,
            providerId,
          });
        } catch (syncErr) {
          console.warn('[PixSim7 Auth Monitor] Failed to sync credits on logout:', syncErr);
        }
      }
      await clearRememberedProviderAccount(providerId);
    } catch (err) {
      console.warn('[PixSim7 Auth Monitor] Failed to handle logout status update:', err);
    }
  },

  /**
   * Check current auth state
   */
  async checkAuthState() {
    if (!this.currentProvider) return;

    const providerId = this.currentProvider.providerId;
    let cookies = {};

    try {
      cookies = await getAllCookiesSecure(providerId);
    } catch (e) {
      console.warn('[PixSim7 Auth Monitor] Failed to read cookies for session detection:', e);
    }

    const isAuthenticated = isProviderSessionAuthenticated(providerId, cookies);

    // Handle logout
    if (!isAuthenticated) {
      if (this.wasLoggedIn) {
        this.pendingLogoutStartedAt = this.pendingLogoutStartedAt || Date.now();
        const elapsed = Date.now() - this.pendingLogoutStartedAt;
        if (elapsed >= TIMING.LOGOUT_DEBOUNCE_MS) {
          debugLogAuth('*** LOGOUT CONFIRMED ***');
          this.pendingLogoutStartedAt = null;
          await this.handleProviderLogout(providerId);
          this.wasLoggedIn = false;
          this.lastCookieSnapshot = null;
          this.hasImportedThisSession = false;
        }
      } else {
        this.pendingLogoutStartedAt = null;
        this.hasImportedThisSession = false;
        this.lastCookieSnapshot = null;
      }
      return;
    }

    this.pendingLogoutStartedAt = null;

    // Detect cookie changes for re-imports
    try {
      const currentHash = hashCookies(cookies);
      if (currentHash !== null) {
        if (this.lastCookieSnapshot === null) {
          this.lastCookieSnapshot = currentHash;
        } else if (currentHash !== this.lastCookieSnapshot) {
          debugLogAuth('*** COOKIE CHANGE DETECTED - treating as login/update ***');
          this.lastCookieSnapshot = currentHash;
          this.hasImportedThisSession = true;
          this.scheduleImport(providerId);
        }
      }
    } catch (e) {
      console.warn('[PixSim7 Auth Monitor] Cookie change detection failed:', e);
    }

    // Handle initial login
    if (!this.wasLoggedIn && !this.hasImportedThisSession) {
      debugLogAuth('*** LOGIN DETECTED (initial) ***');
      this.hasImportedThisSession = true;
      this.scheduleImport(providerId);
    }

    this.wasLoggedIn = true;
  }
};

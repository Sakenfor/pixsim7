/**
 * Debug Flags System (Unified)
 *
 * All debug flags are now stored in backend user preferences.
 * This provides:
 * - Single source of truth
 * - Remote control capability
 * - Cross-device sync
 * - Both frontend (browser console) and backend (server logs) debug control
 */

import { getUserPreferences, updatePreferenceKey, type DebugPreferences } from '@lib/api/userPreferences';

type DebugCategory = keyof DebugPreferences;

class DebugFlags {
  private flags: DebugPreferences = {};
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize debug flags from user preferences
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        const prefs = await getUserPreferences();
        this.flags = prefs.debug || {};
        this.initialized = true;
      } catch (err) {
        console.warn('[DebugFlags] Failed to load preferences, using defaults:', err);
        this.flags = {};
        this.initialized = true;
      }
    })();

    return this.initPromise;
  }

  /**
   * Check if a debug category is enabled
   * Safe to call before init (returns false)
   */
  isEnabled(category: DebugCategory): boolean {
    return this.flags[category] ?? false;
  }

  /**
   * Enable a debug category
   */
  async enable(category: DebugCategory): Promise<void> {
    this.flags[category] = true;
    try {
      await updatePreferenceKey('debug', this.flags);
      if (import.meta.env.DEV) {
        console.log(`✅ Debug enabled for: ${category}`);
      }
    } catch (err) {
      console.error(`[DebugFlags] Failed to enable ${category}:`, err);
    }
  }

  /**
   * Disable a debug category
   */
  async disable(category: DebugCategory): Promise<void> {
    this.flags[category] = false;
    try {
      await updatePreferenceKey('debug', this.flags);
      if (import.meta.env.DEV) {
        console.log(`❌ Debug disabled for: ${category}`);
      }
    } catch (err) {
      console.error(`[DebugFlags] Failed to disable ${category}:`, err);
    }
  }

  /**
   * Toggle a debug category
   */
  async toggle(category: DebugCategory): Promise<boolean> {
    const newValue = !this.flags[category];
    this.flags[category] = newValue;
    try {
      await updatePreferenceKey('debug', this.flags);
      if (import.meta.env.DEV) {
        console.log(`${newValue ? '✅' : '❌'} Debug ${newValue ? 'enabled' : 'disabled'} for: ${category}`);
      }
      return newValue;
    } catch (err) {
      console.error(`[DebugFlags] Failed to toggle ${category}:`, err);
      return !newValue; // Revert on error
    }
  }

  /**
   * Update internal state from external preferences change
   * Call this when preferences are updated elsewhere
   */
  updateFromPreferences(debug: DebugPreferences): void {
    this.flags = debug;
  }

  /**
   * Get current flags (read-only)
   */
  getFlags(): Readonly<DebugPreferences> {
    return { ...this.flags };
  }

  /**
   * Conditional console.log for a category
   */
  log(category: DebugCategory, ...args: any[]): void {
    if (this.isEnabled(category)) {
      console.log(`[${String(category).toUpperCase()}]`, ...args);
    }
  }

  /**
   * Conditional console.warn for a category
   */
  warn(category: DebugCategory, ...args: any[]): void {
    if (this.isEnabled(category)) {
      console.warn(`[${String(category).toUpperCase()}]`, ...args);
    }
  }

  /**
   * Conditional console.error for a category
   */
  error(category: DebugCategory, ...args: any[]): void {
    if (this.isEnabled(category)) {
      console.error(`[${String(category).toUpperCase()}]`, ...args);
    }
  }

  /**
   * List all debug flags and their status
   */
  listEnabled(): void {
    if (!import.meta.env.DEV) return;

    console.group('🐛 Debug Flags Status');
    const categories: DebugCategory[] = [
      'persistence',
      'rehydration',
      'stores',
      'backend',
      'registry',
      'generation',
      'provider',
      'worker',
      'websocket',
    ];

    categories.forEach(cat => {
      const enabled = this.isEnabled(cat);
      console.log(`${enabled ? '✅' : '❌'} ${cat}: ${enabled ? 'enabled' : 'disabled'}`);
    });

    console.groupEnd();
  }
}

export const debugFlags = new DebugFlags();

// Auto-init when imported
debugFlags.init().catch(err => {
  console.warn('[DebugFlags] Auto-init failed:', err);
});

// Expose to window for easy console access in dev mode
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as any).enableDebug = (category: DebugCategory) => debugFlags.enable(category);
  (window as any).disableDebug = (category: DebugCategory) => debugFlags.disable(category);
  (window as any).toggleDebug = (category: DebugCategory) => debugFlags.toggle(category);
  (window as any).listDebugFlags = () => debugFlags.listEnabled();

  console.log('🐛 Debug system loaded! Use:');
  console.log('  - window.enableDebug("registry") - Enable registry logs');
  console.log('  - window.disableDebug("registry") - Disable registry logs');
  console.log('  - window.toggleDebug("registry") - Toggle registry logs');
  console.log('  - window.listDebugFlags() - Show all debug flags');
}

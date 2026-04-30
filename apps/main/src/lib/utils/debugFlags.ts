/**
 * Debug Flags System (global)
 *
 * Source of truth: global LoggingSettings.log_domain_levels (admin endpoint).
 * A category is "enabled" iff its domain level is DEBUG. Same gate that the
 * backend uses for structlog domain filtering — one config, one model.
 */

import { pixsimClient } from '@lib/api/client';

// Categories are free-form strings. Canonical names live in
// pixsim_logging.spec.DOMAINS, but callers may pass any string; unknown
// categories are always disabled until explicitly set to DEBUG.
export type DebugCategory = string;

interface LoggingConfig {
  log_domain_levels: Record<string, string>;
  log_level: string;
  log_db_min_level: string;
  log_retention_days: number;
}

function hasAuthToken(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  return !!localStorage.getItem('access_token');
}

class DebugFlags {
  private domainLevels: Record<string, string> = {};
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      if (!hasAuthToken()) {
        this.domainLevels = {};
        this.initialized = true;
        return;
      }
      try {
        const cfg = await pixsimClient.get<LoggingConfig>('/admin/logging/config');
        this.domainLevels = cfg.log_domain_levels ?? {};
      } catch (err) {
        console.warn('[DebugFlags] Failed to load logging config:', err);
        this.domainLevels = {};
      }
      this.initialized = true;
    })();

    return this.initPromise;
  }

  isEnabled(category: DebugCategory): boolean {
    return (this.domainLevels[category] ?? '').toUpperCase() === 'DEBUG';
  }

  /** Replace internal cache from a freshly-fetched logging config. */
  updateFromConfig(levels: Record<string, string> | undefined | null): void {
    this.domainLevels = { ...(levels ?? {}) };
  }

  async toggle(category: DebugCategory): Promise<boolean> {
    const next = !this.isEnabled(category);
    const updated = { ...this.domainLevels };
    if (next) updated[category] = 'DEBUG';
    else delete updated[category];

    if (!hasAuthToken()) {
      this.domainLevels = updated;
      if (import.meta.env.DEV) {
        console.log(`${next ? '✅' : '❌'} Debug ${next ? 'enabled' : 'disabled'} for: ${category} (local only)`);
      }
      return next;
    }

    try {
      const cfg = await pixsimClient.patch<LoggingConfig>('/admin/logging/config', {
        log_domain_levels: updated,
      });
      this.domainLevels = cfg.log_domain_levels ?? updated;
      if (import.meta.env.DEV) {
        console.log(`${next ? '✅' : '❌'} Debug ${next ? 'enabled' : 'disabled'} for: ${category}`);
      }
      return this.isEnabled(category);
    } catch (err) {
      console.error(`[DebugFlags] Failed to toggle ${category}:`, err);
      return this.isEnabled(category);
    }
  }

  async enable(category: DebugCategory): Promise<void> {
    if (!this.isEnabled(category)) await this.toggle(category);
  }

  async disable(category: DebugCategory): Promise<void> {
    if (this.isEnabled(category)) await this.toggle(category);
  }

  getFlags(): Readonly<Record<string, string>> {
    return { ...this.domainLevels };
  }

  debug(category: DebugCategory, ...args: any[]): void {
    if (this.isEnabled(category)) console.debug(`[${category}]`, ...args);
  }
  log(category: DebugCategory, ...args: any[]): void {
    if (this.isEnabled(category)) console.log(`[${category}]`, ...args);
  }
  warn(category: DebugCategory, ...args: any[]): void {
    if (this.isEnabled(category)) console.warn(`[${category}]`, ...args);
  }
  error(category: DebugCategory, ...args: any[]): void {
    if (this.isEnabled(category)) console.error(`[${category}]`, ...args);
  }

  listEnabled(): void {
    if (!import.meta.env.DEV) return;
    console.group('🐛 Debug Flags Status (global log_domain_levels)');
    const entries = Object.entries(this.domainLevels);
    if (entries.length === 0) {
      console.log('(no domain overrides set — all inherit global log level)');
    } else {
      entries.forEach(([cat, level]) => {
        const on = level.toUpperCase() === 'DEBUG';
        console.log(`${on ? '✅' : '◽'} ${cat}: ${level}`);
      });
    }
    console.groupEnd();
  }
}

export const debugFlags = new DebugFlags();

// Auto-init when imported
debugFlags.init().catch(err => {
  console.warn('[DebugFlags] Auto-init failed:', err);
});

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as any).enableDebug = (category: DebugCategory) => debugFlags.enable(category);
  (window as any).disableDebug = (category: DebugCategory) => debugFlags.disable(category);
  (window as any).toggleDebug = (category: DebugCategory) => debugFlags.toggle(category);
  (window as any).listDebugFlags = () => debugFlags.listEnabled();

  console.log('🐛 Debug flags loaded (global log_domain_levels). DEBUG = on.');
  console.log('  - window.enableDebug("generation")');
  console.log('  - window.disableDebug("generation")');
  console.log('  - window.toggleDebug("generation")');
  console.log('  - window.listDebugFlags()');
}

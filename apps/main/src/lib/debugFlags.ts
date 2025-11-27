/**
 * Debug Flags System
 *
 * Control debug logging for different categories.
 *
 * Enable/disable in console:
 *   localStorage.setItem('debug:persistence', 'true')
 *   localStorage.setItem('debug:stores', 'true')
 *   localStorage.setItem('debug:*', 'true')  // Enable all
 *
 * Or use helpers:
 *   window.enableDebug('persistence')
 *   window.disableDebug('persistence')
 *   window.enableDebug('*')  // Enable all
 */

type DebugCategory = 'persistence' | 'stores' | 'backend' | 'rehydration' | '*';

class DebugFlags {
  private flags: Map<string, boolean> = new Map();

  constructor() {
    // Load flags from localStorage on init
    if (typeof window !== 'undefined') {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('debug:')) {
          const category = key.replace('debug:', '');
          const value = localStorage.getItem(key) === 'true';
          this.flags.set(category, value);
        }
      }
    }
  }

  isEnabled(category: DebugCategory): boolean {
    // Check if all debugging is enabled
    if (this.flags.get('*')) return true;

    // Check specific category
    return this.flags.get(category) ?? false;
  }

  enable(category: DebugCategory): void {
    this.flags.set(category, true);
    if (typeof window !== 'undefined') {
      localStorage.setItem(`debug:${category}`, 'true');
    }
    console.log(`✅ Debug enabled for: ${category}`);
  }

  disable(category: DebugCategory): void {
    this.flags.set(category, false);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(`debug:${category}`);
    }
    console.log(`❌ Debug disabled for: ${category}`);
  }

  log(category: DebugCategory, ...args: any[]): void {
    if (this.isEnabled(category)) {
      console.log(`[${category.toUpperCase()}]`, ...args);
    }
  }

  warn(category: DebugCategory, ...args: any[]): void {
    if (this.isEnabled(category)) {
      console.warn(`[${category.toUpperCase()}]`, ...args);
    }
  }

  error(category: DebugCategory, ...args: any[]): void {
    if (this.isEnabled(category)) {
      console.error(`[${category.toUpperCase()}]`, ...args);
    }
  }

  listEnabled(): void {
    console.group('🐛 Debug Flags Status');
    const categories: DebugCategory[] = ['persistence', 'stores', 'backend', 'rehydration', '*'];

    categories.forEach(cat => {
      const enabled = this.isEnabled(cat);
      console.log(`${enabled ? '✅' : '❌'} ${cat}: ${enabled ? 'enabled' : 'disabled'}`);
    });

    console.groupEnd();
  }
}

export const debugFlags = new DebugFlags();

// Expose to window for easy console access
if (typeof window !== 'undefined') {
  (window as any).enableDebug = (category: DebugCategory) => debugFlags.enable(category);
  (window as any).disableDebug = (category: DebugCategory) => debugFlags.disable(category);
  (window as any).listDebugFlags = () => debugFlags.listEnabled();

  console.log('🐛 Debug system loaded! Use:');
  console.log('  - window.enableDebug("persistence") - Enable persistence logs');
  console.log('  - window.disableDebug("persistence") - Disable persistence logs');
  console.log('  - window.listDebugFlags() - Show all debug flags');
  console.log('  - window.enableDebug("*") - Enable ALL debug logs');
}

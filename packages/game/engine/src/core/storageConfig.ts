/**
 * Shared KVStorage Configuration
 *
 * Centralizes key-value storage injection for all engine modules that
 * previously accessed `localStorage` directly.  The host environment
 * (browser, Node, React Native, tests) calls `configureKVStorage()`
 * once at startup, and every module in the engine uses `requireKVStorage()`
 * to obtain the injected instance.
 *
 * ```ts
 * import { configureKVStorage } from '@pixsim7/game.engine';
 *
 * // Browser
 * configureKVStorage(window.localStorage);
 *
 * // Tests
 * configureKVStorage(createInMemoryKVStorage());
 * ```
 */

import type { KVStorage } from './types';

let _storage: KVStorage | null = null;

/**
 * Provide the KVStorage implementation for all engine modules.
 *
 * Must be called before any engine module that persists data
 * (session storage, user preferences, theme presets, etc.).
 */
export function configureKVStorage(storage: KVStorage): void {
  _storage = storage;
}

/**
 * Return the configured KVStorage or `null` if not yet configured.
 */
export function getKVStorage(): KVStorage | null {
  return _storage;
}

/**
 * Return the configured KVStorage.
 * Throws if `configureKVStorage()` has not been called.
 */
export function requireKVStorage(): KVStorage {
  if (!_storage) {
    throw new Error(
      'KVStorage not configured. Call configureKVStorage() at startup.',
    );
  }
  return _storage;
}

/**
 * Reset to unconfigured state (for tests).
 */
export function resetKVStorage(): void {
  _storage = null;
}

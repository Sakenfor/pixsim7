/**
 * Reference Registry — features register themselves as referenceable.
 *
 * Instead of the reference system hardcoding sources, any feature can
 * subscribe by calling `referenceRegistry.register(...)`. The @mention
 * picker discovers all registered sources automatically.
 *
 * Pattern: producer-driven (features opt-in) rather than consumer-driven
 * (reference system polls known endpoints).
 *
 * @example
 * // In a feature's module init:
 * import { referenceRegistry } from '@lib/references';
 *
 * referenceRegistry.register({
 *   type: 'character',
 *   icon: 'user',
 *   label: 'Characters',
 *   fetch: async () => {
 *     const res = await pixsimClient.get('/game/characters');
 *     return res.items.map(c => ({ type: 'character', id: c.id, label: c.name }));
 *   },
 * });
 */
import type { IconName } from '@lib/icons';

import type { ReferenceItem } from './types';

export interface ReferenceSourceRegistration {
  /** Unique type key (e.g. 'plan', 'character', 'asset') */
  type: string;
  /** Icon for the picker dropdown */
  icon: IconName;
  /** Human label for the source category */
  label: string;
  /** Fetch items for this source. Called lazily on first @ trigger. */
  fetch: () => Promise<ReferenceItem[]>;
}

class ReferenceRegistry {
  private _sources = new Map<string, ReferenceSourceRegistration>();
  private _listeners: Array<() => void> = [];

  register(source: ReferenceSourceRegistration): void {
    this._sources.set(source.type, source);
    this._listeners.forEach((fn) => fn());
  }

  unregister(type: string): void {
    this._sources.delete(type);
    this._listeners.forEach((fn) => fn());
  }

  getSources(): ReferenceSourceRegistration[] {
    return Array.from(this._sources.values());
  }

  getIcon(type: string): IconName {
    return this._sources.get(type)?.icon ?? 'link';
  }

  /** Subscribe to registry changes (for React useSyncExternalStore) */
  subscribe(listener: () => void): () => void {
    this._listeners.push(listener);
    return () => {
      this._listeners = this._listeners.filter((fn) => fn !== listener);
    };
  }

  getSnapshot(): number {
    return this._sources.size;
  }
}

export const referenceRegistry = new ReferenceRegistry();

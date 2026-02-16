import { assignTags } from './api';
import { assetEvents } from './assetEvents';
import { useQuickTagStore } from './quickTagStore';

export const DEFAULT_NAMESPACE = 'user';

/**
 * Clean a single tag part: lowercase, spaces→underscores, strip non-`[a-z0-9_]`.
 */
export function cleanTagPart(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

/**
 * Normalize user input into a valid tag slug (`namespace:name`).
 *
 * - Trims and lowercases
 * - Replaces spaces/special chars with underscores
 * - Prepends `user:` if no namespace is present
 */
export function normalizeTagInput(raw: string): string {
  const slug = raw.trim().toLowerCase();
  if (!slug) return '';

  // If already has namespace:name format, normalize each part
  if (slug.includes(':')) {
    const [ns, ...rest] = slug.split(':');
    const name = rest.join(':'); // rejoin in case of multiple colons
    const cleanNs = cleanTagPart(ns);
    const cleanName = cleanTagPart(name);
    if (!cleanNs || !cleanName) return '';
    return `${cleanNs}:${cleanName}`;
  }

  // No namespace — auto-prefix with default
  const cleanName = cleanTagPart(slug);
  if (!cleanName) return '';
  return `${DEFAULT_NAMESPACE}:${cleanName}`;
}

/**
 * Apply the given tag(s) to an asset and record them in recent tags.
 */
export async function applyQuickTag(assetId: number, tagSlugs: string[]): Promise<void> {
  // Normalize slugs in case old store data has bad format
  const normalized = tagSlugs.map(normalizeTagInput).filter(Boolean);
  if (normalized.length === 0) return;
  const updated = await assignTags(assetId, { add: normalized });
  assetEvents.emitAssetUpdated(updated);
  const store = useQuickTagStore.getState();
  for (const slug of tagSlugs) {
    store.addRecentTag(slug);
  }
}

/**
 * Dynamic vocabulary sources.
 *
 * On import, fetches the list of vocabulary types from the backend
 * (`GET /api/v1/vocabulary/types`) and registers one reference source per
 * type. The sources use lazy `fetch` closures so each type's items are
 * only retrieved when the picker is actually opened.
 *
 * This replaces the need to hand-register each vocab type (anatomy, poses,
 * moods, locations, camera, etc.) — any new vocab type declared in the
 * backend's `VocabTypeConfig` map shows up automatically.
 *
 * The picker's `disallowedTypes` prop is how consumers opt out of sources
 * they don't want (e.g. the prompt composer excludes entity references
 * like plans/worlds/projects).
 */
import type { IconName } from '@lib/icons';

import { pixsimClient } from '@lib/api/client';

import { referenceRegistry } from './registry';
import type { ReferenceItem } from './types';

interface VocabItem {
  id: string;
  label?: string;
  category?: string;
  scope?: string;
  keywords?: string[];
  latin?: string;
  // Other type-specific fields come through untyped — we don't use them in
  // the picker, so there's no need to model each vocab schema here.
  [k: string]: unknown;
}

interface VocabListResponse {
  type: string;
  count: number;
  items: VocabItem[];
}

// Per-type polish. Missing entries fall back to a generic icon + label.
const TYPE_META: Record<string, { icon: IconName; label: string; color: string }> = {
  parts: { icon: 'user', label: 'Anatomy', color: 'text-rose-400' },
  poses: { icon: 'move', label: 'Poses', color: 'text-amber-400' },
  moods: { icon: 'sparkles', label: 'Moods', color: 'text-violet-400' },
  locations: { icon: 'pin', label: 'Locations', color: 'text-emerald-400' },
  camera: { icon: 'camera', label: 'Camera', color: 'text-sky-400' },
  spatial: { icon: 'target', label: 'Spatial', color: 'text-cyan-400' },
  ratings: { icon: 'shield', label: 'Ratings', color: 'text-red-400' },
  roles: { icon: 'tag', label: 'Roles', color: 'text-indigo-400' },
  species: { icon: 'user', label: 'Species', color: 'text-lime-400' },
  influence_regions: { icon: 'target', label: 'Regions', color: 'text-orange-400' },
  progression: { icon: 'arrowRight', label: 'Progression', color: 'text-teal-400' },
};

const FALLBACK_META = { icon: 'tag' as IconName, color: 'text-neutral-400' };

function humanize(type: string): string {
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function mapVocabItem(type: string, item: VocabItem): ReferenceItem {
  // Strip common prefixes like `part:` for cleaner display; the
  // canonical ID stays in data, but the picker shows the bare form.
  const rawId = String(item.id ?? '');
  const colonIdx = rawId.indexOf(':');
  const id = colonIdx > 0 ? rawId.slice(colonIdx + 1) : rawId;

  const label = (item.label || id || rawId).trim();
  const latin = (item.latin || '').trim();
  // Latin (if present and different from label) wins for detail; otherwise
  // fall back to category so the user has some hint of grouping.
  const detail =
    latin && latin.toLowerCase() !== label.toLowerCase()
      ? latin
      : item.category;

  return {
    type,
    id,
    label,
    detail,
    // Inserted text = lowercase label. Short, model-friendly. The hook's
    // per-item `insertText` overrides `insertMode`, so vocab references
    // always insert as plain text even if a consumer sets insertMode
    // differently for other sources in the same picker.
    insertText: label.toLowerCase(),
  };
}

function registerVocabType(type: string): void {
  const meta = TYPE_META[type];
  referenceRegistry.register({
    type,
    icon: meta?.icon ?? FALLBACK_META.icon,
    color: meta?.color ?? FALLBACK_META.color,
    label: meta?.label ?? humanize(type),
    fetch: () =>
      pixsimClient
        .get<VocabListResponse>(`/vocabulary/${encodeURIComponent(type)}`)
        .then((r) => (r.items ?? []).map((i) => mapVocabItem(type, i)))
        .catch(() => []),
  });
}

// Kick off discovery at import time. The registry is observable, so any
// picker that's already mounted will re-render when these sources arrive.
// Silent-fail: if the endpoint is unreachable, no vocab sources are
// registered and the picker just shows whatever else is there.
pixsimClient
  .get<{ types: string[] }>('/vocabulary/types')
  .then(({ types }) => {
    for (const t of types ?? []) registerVocabType(t);
  })
  .catch(() => {});

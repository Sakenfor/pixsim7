/**
 * Content Source Registry
 *
 * Lightweight registry for content source descriptors — things that provide
 * blocks, primitives, vocabularies, templates, or other authored content.
 *
 * Each descriptor knows where its content lives (disk path, API endpoint)
 * and how to fetch a summary of what it contains.
 */

import type { IconName } from '@lib/icons';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContentSourceCategory =
  | 'content-pack'       // Prompt content packs (blocks, templates, characters)
  | 'primitives'         // Block primitives packs
  | 'vocabulary'         // Plugin vocabularies (tag/role definitions)
  | 'plugin'             // Backend plugin manifests
  | 'template-registry'  // Game template type registry
  | 'style';             // Style foundation primitives

export interface ContentSourceSummary {
  totalEntities: number;
  breakdown: Record<string, number>;   // e.g. { blocks: 42, templates: 3 }
  status: 'healthy' | 'degraded' | 'error' | 'unknown';
  statusDetail?: string;
}

export interface ContentSourceDescriptor {
  id: string;
  label: string;
  description: string;
  icon: IconName;
  category: ContentSourceCategory;
  entityTypes: string[];               // What entity kinds this source provides
  diskPath?: string;                   // Relative path from project root
  apiEndpoint?: string;                // Primary API endpoint
  fetchSummary: () => Promise<ContentSourceSummary>;
  drillDownPanelId?: string;           // Panel to open for detailed view
  tags?: string[];
}

// ---------------------------------------------------------------------------
// Category metadata (for UI rendering)
// ---------------------------------------------------------------------------

export const CONTENT_SOURCE_CATEGORIES: Record<
  ContentSourceCategory,
  { label: string; icon: IconName }
> = {
  'content-pack':      { label: 'Content Packs',      icon: 'package' },
  'primitives':        { label: 'Primitives',         icon: 'layers' },
  'vocabulary':        { label: 'Vocabularies',       icon: 'library' },
  'plugin':            { label: 'Plugins',            icon: 'plug' },
  'template-registry': { label: 'Template Registry',  icon: 'fileCode' },
  'style':             { label: 'Style Foundation',   icon: 'palette' },
};

export const CONTENT_SOURCE_CATEGORY_ORDER: ContentSourceCategory[] = [
  'content-pack',
  'primitives',
  'style',
  'vocabulary',
  'plugin',
  'template-registry',
];

// ---------------------------------------------------------------------------
// Registry (HMR-safe)
// ---------------------------------------------------------------------------

const _hmrKey = Symbol.for('pixsim7:contentSourceRegistry');
const _hmrState: { sources: ContentSourceDescriptor[] } =
  ((globalThis as any)[_hmrKey] ??= { sources: [] });

export function registerContentSource(descriptor: ContentSourceDescriptor): void {
  const idx = _hmrState.sources.findIndex((s) => s.id === descriptor.id);
  if (idx >= 0) {
    _hmrState.sources[idx] = descriptor;
  } else {
    _hmrState.sources.push(descriptor);
  }
}

export function getContentSources(): ContentSourceDescriptor[] {
  return _hmrState.sources;
}

export function getContentSourcesByCategory(
  category: ContentSourceCategory,
): ContentSourceDescriptor[] {
  return _hmrState.sources.filter((s) => s.category === category);
}

export function getContentSource(id: string): ContentSourceDescriptor | undefined {
  return _hmrState.sources.find((s) => s.id === id);
}

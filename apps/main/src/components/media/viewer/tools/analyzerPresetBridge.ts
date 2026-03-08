/**
 * Analyzer → ViewerToolPreset Bridge
 *
 * Maps analyzer catalog entries to ViewerToolPresets when the analyzer
 * can produce mask-like output. This is the Phase 2 bridge — additive,
 * no analyzer schema refactor required.
 *
 * ## How it works
 *
 * The backend analyzer registry has structured metadata (kind, target,
 * task_family, input_modality). This bridge inspects that metadata and
 * produces ViewerToolPresets for analyzers that can contribute to the
 * mask/edit pipeline.
 *
 * ## Current mapping (B1)
 *
 * | task_family | category | outputKind  | outputMapping         |
 * |-------------|----------|-------------|-----------------------|
 * | detection   | mask     | region_set  | guidance_plan.masks   |
 *
 * Future task families (segmentation, tracking) will be added as the
 * backend analyzer registry grows — no frontend changes needed if they
 * follow the same metadata shape.
 */

import type { ViewerToolPreset, ToolSource } from './viewerToolPresets';

// ─────────────────────────────────────────────────────────────────────────────
// Analyzer response shape (mirrors backend AnalyzerResponse — no import dep)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimal shape of an analyzer catalog entry.
 * Kept as a local interface to avoid coupling viewer code to the full backend
 * response type. If backend types are shared via a package, switch to that.
 */
export interface AnalyzerCatalogEntry {
  id: string;
  name: string;
  description?: string;
  kind: string;       // 'parser' | 'llm' | 'vision'
  target: string;     // 'prompt' | 'asset'
  task_family: string; // 'parse' | 'tag' | 'caption' | 'ocr' | 'detection' | 'moderation' | 'embedding' | 'custom'
  input_modality?: string; // 'text' | 'image' | 'video' | 'audio' | 'multimodal'
  enabled: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapping rules
// ─────────────────────────────────────────────────────────────────────────────

/** Task families that can produce mask-relevant output. */
const MASK_CAPABLE_TASK_FAMILIES = new Set(['detection']);

/** Map analyzer kind → ToolSource. */
function kindToSource(kind: string): ToolSource {
  switch (kind) {
    case 'parser':
    case 'llm':
      return 'local';
    case 'vision':
      // Vision analyzers may be local or remote depending on deployment,
      // but from the frontend's perspective they're a local capability.
      return 'local';
    default:
      return 'remote';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bridge function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert an analyzer catalog entry to a ViewerToolPreset, if the analyzer
 * can produce mask-relevant output. Returns null for non-applicable analyzers.
 */
export function analyzerToPreset(analyzer: AnalyzerCatalogEntry): ViewerToolPreset | null {
  // Only asset-target analyzers can produce masks
  if (analyzer.target !== 'asset') return null;

  // Only enabled analyzers
  if (!analyzer.enabled) return null;

  // Only mask-capable task families
  if (!MASK_CAPABLE_TASK_FAMILIES.has(analyzer.task_family)) return null;

  return {
    id: `analyzer:${analyzer.id}`,
    label: analyzer.name,
    icon: 'scan',
    source: kindToSource(analyzer.kind),
    category: 'mask',
    outputKind: 'region_set',
    outputMapping: 'guidance_plan.masks',
    analyzerId: analyzer.id,
    requiresImage: analyzer.input_modality !== 'video',
    requiresVideo: analyzer.input_modality === 'video',
    isAsync: true,
  };
}

/**
 * Batch-convert analyzer catalog entries to ViewerToolPresets.
 * Filters out non-applicable analyzers automatically.
 */
export function analyzersToPresets(analyzers: AnalyzerCatalogEntry[]): ViewerToolPreset[] {
  const presets: ViewerToolPreset[] = [];
  for (const analyzer of analyzers) {
    const preset = analyzerToPreset(analyzer);
    if (preset) presets.push(preset);
  }
  return presets;
}

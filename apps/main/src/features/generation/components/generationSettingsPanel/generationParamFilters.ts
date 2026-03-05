import type { ParamSpec } from '@lib/generation-ui';

import { OPERATION_METADATA, type OperationType } from '@/types/operations';

const PRIMARY_ADVANCED_EXCLUSIONS = new Set([
  'model',
  'quality',
  'duration',
  'aspect_ratio',
  'motion_mode',
  'camera_movement',
]);

const ADVANCED_HIDDEN_DEFAULTS = new Set([
  'image_url',
  'image_urls',
  'prompt',
  'prompts',
  'video_url',
  'original_video_id',
  'source_asset_id',
  'source_asset_ids',
  'composition_assets',
]);

/** Operations that inherit aspect ratio from their source asset */
const INHERITS_ASPECT_RATIO = new Set<OperationType>(['image_to_video', 'video_extend', 'video_modify']);

export function filterQuickGenStyleParamSpecs(
  paramSpecs: ParamSpec[],
  operationType: string,
  excludeParams: Iterable<string> = [],
): ParamSpec[] {
  const hideParams = new Set<string>(excludeParams);

  // Add metadata-driven hidden params
  const meta = OPERATION_METADATA[operationType as OperationType];
  if (meta?.hiddenParams) {
    for (const p of meta.hiddenParams) hideParams.add(p);
  }

  if (INHERITS_ASPECT_RATIO.has(operationType as OperationType)) {
    hideParams.add('aspect_ratio');
  }

  if (hideParams.size === 0) return paramSpecs;
  return paramSpecs.filter((p) => !hideParams.has(p.name));
}

export function getQuickGenStyleAdvancedParamSpecs(filteredParamSpecs: ParamSpec[]): ParamSpec[] {
  return filteredParamSpecs.filter((p) => {
    if (PRIMARY_ADVANCED_EXCLUSIONS.has(p.name)) return false;
    if (ADVANCED_HIDDEN_DEFAULTS.has(p.name)) return false;
    return true;
  });
}

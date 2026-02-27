import type { ParamSpec } from '@lib/generation-ui';

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

export function filterQuickGenStyleParamSpecs(
  paramSpecs: ParamSpec[],
  operationType: string,
  excludeParams: Iterable<string> = [],
): ParamSpec[] {
  const hideParams = new Set<string>(excludeParams);

  if (operationType === 'video_transition') {
    hideParams.add('duration');
  }

  const inheritsAspectRatio = new Set(['image_to_video', 'video_extend']);
  if (inheritsAspectRatio.has(operationType)) {
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

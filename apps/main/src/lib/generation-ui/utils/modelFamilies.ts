import type { ParamSpec } from '../types';

export interface ModelFamilyInfo {
  family: string;
  label: string;
  short: string;
  color: string;
  textColor?: string;
}

/**
 * Extract the model_families lookup from a param specs array.
 * Returns the map from the first `model` param that carries the metadata,
 * or null if none found.
 */
export function getModelFamilies(
  paramSpecs: ParamSpec[],
): Record<string, ModelFamilyInfo> | null {
  const modelParam = paramSpecs.find((p) => p.name === 'model');
  const families = modelParam?.metadata?.model_families as
    | Record<string, ModelFamilyInfo>
    | undefined;
  return families && Object.keys(families).length > 0 ? families : null;
}

/**
 * Look up the family info for a specific model ID.
 */
export function getModelFamily(
  modelId: string,
  paramSpecs: ParamSpec[],
): ModelFamilyInfo | null {
  const families = getModelFamilies(paramSpecs);
  return families?.[modelId] ?? null;
}

import type { CostEstimatorPricingTable } from '../lib/core/types';

export interface LocalCostParams {
  model?: string;
  quality?: string;
  duration?: number | string;
  api_method?: string;
  multi_shot?: boolean;
  audio?: boolean;
  discounts?: Record<string, number>;
  operationType?: string;
}

function normalizeQuality(table: CostEstimatorPricingTable, quality: string): string {
  const lower = quality.toLowerCase();
  return table.quality_aliases[lower] ?? lower;
}

function coerceDuration(value: LocalCostParams['duration']): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.max(1, Math.round(value));
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return Math.max(1, Math.round(numeric));
  }
  return null;
}

/**
 * Mirrors pixverse.pricing.calculate_cost / calculate_image_cost.
 * Returns null when the table lacks data for the given model/quality combo —
 * the server reconciler will fill in.
 */
export function computeLocalCost(
  table: CostEstimatorPricingTable,
  params: LocalCostParams,
): number | null {
  const { operationType, model, quality } = params;
  if (!quality) return null;

  const isImageOp = typeof operationType === 'string' && operationType.includes('image');
  if (isImageOp) {
    if (!model) return null;
    const modelCredits = table.image_credits[model];
    if (!modelCredits) return null;
    const normalized = normalizeQuality(table, quality);
    const direct = modelCredits[normalized] ?? modelCredits[quality.toLowerCase()];
    return typeof direct === 'number' ? direct : null;
  }

  const duration = coerceDuration(params.duration);
  if (duration == null) return null;

  const normalizedQuality = normalizeQuality(table, quality);
  const apiMethod = (params.api_method ?? 'web-api').toLowerCase();

  let baseCost: number | undefined;
  if (apiMethod === 'open-api') {
    const tier = model && table.openapi_base_costs[model] ? model : 'v5';
    baseCost = table.openapi_base_costs[tier]?.[normalizedQuality];
  } else {
    baseCost = table.webapi_base_costs[normalizedQuality];
  }
  if (baseCost == null) return null;

  const multiplier =
    params.discounts && model && typeof params.discounts[model] === 'number'
      ? params.discounts[model]
      : 1;

  let cost = Math.floor((baseCost * multiplier * duration) / table.base_duration_seconds);

  if (params.multi_shot) {
    cost += duration > 5 ? table.multi_shot_long : table.multi_shot_short;
  }
  if (params.audio) {
    cost += table.native_audio;
  }

  return cost;
}

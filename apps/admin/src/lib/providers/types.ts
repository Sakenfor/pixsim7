/**
 * Provider capability types - aligned with backend provider API
 */

export interface OperationParameterSpec {
  name: string;
  type: string;
  required: boolean;
  default: any | null;
  enum: string[] | null;
  description: string | null;
  group: string | null;
  min?: number;
  max?: number;
  step?: number;
}

export interface OperationSpec {
  parameters: OperationParameterSpec[];
}

export interface ProviderFeatures {
  embedded_assets: boolean;
  asset_upload: boolean;
}

export interface ProviderLimits {
  prompt_max_chars?: number;
  max_duration?: number;
  max_resolution?: { width: number; height: number };
  max_variants?: number;
  max_aspect_ratio_width?: number;
  max_aspect_ratio_height?: number;
}

export interface CostHints {
  per_second?: number;
  per_generation?: number;
  currency?: string;
  estimation_note?: string;
}

export interface ProviderCapability {
  provider_id: string;
  name?: string;
  operations: string[];
  features: ProviderFeatures;
  operation_specs: Record<string, OperationSpec>;
  quality_presets?: string[];
  aspect_ratios?: string[];
  parameter_hints?: Record<string, string[]>;
  limits?: ProviderLimits;
  cost_hints?: CostHints;
  // Backend-provided fields (optional)
  dimension_defaults?: { width: number; height: number };
  default_model?: string;
}

export interface ProviderInfo {
  provider_id: string;
  name: string;
  domains: string[];
  supported_operations: string[];
  capabilities?: ProviderCapability;
}

import { pixsimClient } from './client';

export type PromptToolCatalogScope = 'self' | 'shared' | 'builtin' | 'all';

export interface PromptToolPreset {
  id: string;
  label: string;
  description: string;
  source: string;
  category: string;
  enabled: boolean;
  requires: string[];
  defaults: Record<string, unknown>;
  owner_user_id?: number | null;
  owner_ref?: string | null;
  owner_username?: string | null;
}

export interface PromptToolCatalogResponse {
  scope: string;
  presets: PromptToolPreset[];
}

export interface PromptToolExecutionProvenance {
  preset_id: string;
  analyzer_id?: string;
  model_id?: string;
}

export interface PromptToolExecuteRequest {
  preset_id: string;
  prompt_text: string;
  params?: Record<string, unknown>;
  run_context?: Record<string, unknown>;
}

export interface PromptToolExecuteResponse {
  prompt_text: string;
  block_overlay?: Array<Record<string, unknown>>;
  guidance_patch?: Record<string, unknown>;
  composition_assets_patch?: Array<Record<string, unknown>>;
  warnings?: string[];
  provenance: PromptToolExecutionProvenance;
}

function toQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    search.set(key, String(value));
  }
  const serialized = search.toString();
  return serialized ? `?${serialized}` : '';
}

export function listPromptToolCatalog(scope: PromptToolCatalogScope = 'all'): Promise<PromptToolCatalogResponse> {
  return pixsimClient.get<PromptToolCatalogResponse>(`/prompt-tools/catalog${toQueryString({ scope })}`);
}

export function executePromptTool(request: PromptToolExecuteRequest): Promise<PromptToolExecuteResponse> {
  return pixsimClient.post<PromptToolExecuteResponse>('/prompt-tools/execute', request);
}

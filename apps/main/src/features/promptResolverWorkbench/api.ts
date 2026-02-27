import type { ResolutionRequest, ResolutionResult } from './types';

export async function runNextV1ResolutionRemote(request: ResolutionRequest): Promise<ResolutionResult> {
  const response = await fetch('/api/v1/block-templates/dev/resolver-workbench/resolve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // ignore; fallback error below
  }

  if (!response.ok) {
    const detail =
      payload && typeof payload === 'object' && 'detail' in payload
        ? String((payload as { detail?: unknown }).detail ?? response.statusText)
        : response.statusText;
    throw new Error(detail || `HTTP ${response.status}`);
  }

  return payload as ResolutionResult;
}

export async function compileTemplateToResolutionRequestRemote(input: {
  slug?: string;
  template_id?: string;
  candidate_limit?: number;
  control_values?: Record<string, unknown>;
}): Promise<ResolutionRequest> {
  const response = await fetch('/api/v1/block-templates/dev/resolver-workbench/compile-template', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // ignore
  }

  if (!response.ok) {
    const detail =
      payload && typeof payload === 'object' && 'detail' in payload
        ? String((payload as { detail?: unknown }).detail ?? response.statusText)
        : response.statusText;
    throw new Error(detail || `HTTP ${response.status}`);
  }

  return payload as ResolutionRequest;
}

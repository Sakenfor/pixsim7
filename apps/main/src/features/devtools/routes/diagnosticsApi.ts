/**
 * Diagnostics API client + event types.
 *
 * Mirrors the backend wire shape from
 * pixsim7/backend/main/services/diagnostics/base.py — keep these types
 * aligned with `DiagnosticEvent`, `DiagnosticSpec`, `DiagnosticParam`.
 */
import { pixsimClient } from '@lib/api/client';

// ── Wire types (match backend dataclasses) ─────────────────────────────

export type DiagnosticParamKind = 'string' | 'int' | 'float' | 'bool' | 'select';

export interface DiagnosticParamSpec {
  name: string;
  kind: DiagnosticParamKind;
  label: string;
  default: unknown;
  options: string[] | null;
  description: string | null;
  required: boolean;
}

export interface DiagnosticSpec {
  id: string;
  label: string;
  description: string;
  category: string;
  params: DiagnosticParamSpec[];
}

export type DiagnosticEventType =
  | 'phase'
  | 'observation'
  | 'transition'
  | 'summary'
  | 'log'
  | 'terminal'
  | 'error'
  | 'connected'
  | 'pong';

/**
 * Flat event shape over the wire. The backend merges `payload` into the
 * top-level alongside `t_rel` and `type`, so additional diagnostic-specific
 * fields land directly on the object.
 */
export interface DiagnosticEvent {
  t_rel: number;
  type: DiagnosticEventType;
  // Phase event
  phase?: string;
  // Observation event (early-CDN style)
  source?: string;
  raw_status?: number | string | null;
  url?: string | null;
  url_is_retrievable?: boolean;
  url_is_placeholder?: boolean;
  thumbnail_url?: string | null;
  width?: number | null;
  height?: number | null;
  http_status?: number | null;
  // Transition event
  key?: string;
  value?: number;
  // Summary event
  data?: Record<string, unknown>;
  // Log event
  level?: string;
  message?: string;
  // Terminal event
  status?: 'completed' | 'cancelled' | 'errored';
  // Connected (envelope sent on WS open)
  run_id?: string;
  // Permits ad-hoc fields from diagnostic-specific payloads.
  [extra: string]: unknown;
}

export interface DiagnosticRunSummary {
  run_id: string;
  diagnostic_id: string;
  status: 'pending' | 'running' | 'completed' | 'cancelled' | 'errored';
  started_at: string;
  finished_at: string | null;
  started_by: string;
  error: string | null;
  event_count: number;
  params: Record<string, unknown>;
}

export interface DiagnosticRunDetail extends DiagnosticRunSummary {
  events: DiagnosticEvent[];
}

export interface RunStartedResponse {
  run_id: string;
  diagnostic_id: string;
  started_at: string;
}

// ── REST helpers ────────────────────────────────────────────────────────

const BASE = '/dev/testing/diagnostics';

export async function listDiagnostics(): Promise<DiagnosticSpec[]> {
  const res = await pixsimClient.get<{ diagnostics: DiagnosticSpec[]; total: number }>(BASE);
  return res.diagnostics ?? [];
}

export async function startDiagnosticRun(
  diagnosticId: string,
  params: Record<string, unknown>,
): Promise<RunStartedResponse> {
  return pixsimClient.post<RunStartedResponse>(
    `${BASE}/${encodeURIComponent(diagnosticId)}/run`,
    { params },
  );
}

export async function listDiagnosticRuns(limit = 25): Promise<DiagnosticRunSummary[]> {
  const res = await pixsimClient.get<{ runs: DiagnosticRunSummary[]; total: number }>(
    `${BASE}/runs`,
    { params: { limit } },
  );
  return res.runs ?? [];
}

export async function getDiagnosticRun(runId: string): Promise<DiagnosticRunDetail> {
  return pixsimClient.get<DiagnosticRunDetail>(
    `${BASE}/runs/${encodeURIComponent(runId)}`,
  );
}

export async function cancelDiagnosticRun(runId: string): Promise<{ run_id: string; status: string }> {
  return pixsimClient.post<{ run_id: string; status: string }>(
    `${BASE}/runs/${encodeURIComponent(runId)}/cancel`,
    {},
  );
}

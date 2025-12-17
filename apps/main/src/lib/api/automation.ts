import { apiClient } from './client';
import type { ApiComponents, ApiOperations } from '@pixsim7/shared.types';

type RequireId<T extends { id?: number | null }> = Omit<T, 'id'> & { id: number };

function requireId<T extends { id?: number | null }>(value: T, label: string): RequireId<T> {
  if (typeof value.id !== 'number') {
    throw new Error(`[automation] Missing ${label}.id`);
  }
  // Spread to normalize readonly types into mutable objects.
  return { ...(value as any), id: value.id } as RequireId<T>;
}

export type ApiAndroidDevice = ApiComponents['schemas']['AndroidDevice'];
export type AndroidDevice = RequireId<ApiAndroidDevice>;

export type ApiAutomationExecution = ApiComponents['schemas']['AutomationExecution'];
export type AutomationExecution = RequireId<ApiAutomationExecution>;

export type ApiExecutionLoop = ApiComponents['schemas']['ExecutionLoop'];
export type ExecutionLoop = RequireId<ApiExecutionLoop>;

export type ApiAppActionPreset = ApiComponents['schemas']['AppActionPreset'];
export type AppActionPreset = RequireId<ApiAppActionPreset>;

export type CompletePairingRequest = ApiComponents['schemas']['CompletePairingRequest'];
export type ExecutePresetRequest = ApiComponents['schemas']['ExecutePresetRequest'];
export type TestActionsRequest = ApiComponents['schemas']['TestActionsRequest'];

// Response types (from OpenAPI-generated DTOs)
export type DeviceScanResponse = ApiComponents['schemas']['DeviceScanResponse'];
export type CompletePairingResponse = ApiComponents['schemas']['CompletePairingResponse'];
export type ExecutePresetResponse = ApiComponents['schemas']['ExecutePresetResponse'];
export type TestActionsResponse = ApiComponents['schemas']['TestActionsResponse'];
export type ClearExecutionsResponse = ApiComponents['schemas']['ClearExecutionsResponse'];

export type ListExecutionsQuery =
  ApiOperations['list_executions_api_v1_automation_executions_get']['parameters']['query'];

export type ListLoopsQuery =
  ApiOperations['list_loops_api_v1_automation_loops_get']['parameters']['query'];

export async function listDevices(): Promise<AndroidDevice[]> {
  const res = await apiClient.get<ApiAndroidDevice[]>('/automation/devices');
  return (res.data || []).map((d) => requireId(d, 'AndroidDevice'));
}

export async function scanDevices(): Promise<DeviceScanResponse> {
  const res = await apiClient.post<DeviceScanResponse>('/automation/devices/scan');
  return res.data;
}

export async function completePairing(payload: CompletePairingRequest): Promise<CompletePairingResponse> {
  const res = await apiClient.post<CompletePairingResponse>('/automation/agents/complete-pairing', payload);
  return res.data;
}

export async function listPresets(): Promise<AppActionPreset[]> {
  const res = await apiClient.get<ApiAppActionPreset[]>('/automation/presets');
  return (res.data || []).map((p) => requireId(p, 'AppActionPreset'));
}

export async function getPreset(presetId: number): Promise<AppActionPreset> {
  const res = await apiClient.get<ApiAppActionPreset>(`/automation/presets/${presetId}`);
  return requireId(res.data, 'AppActionPreset');
}

export async function createPreset(preset: Partial<ApiAppActionPreset>): Promise<AppActionPreset> {
  const res = await apiClient.post<ApiAppActionPreset>('/automation/presets', preset);
  return requireId(res.data, 'AppActionPreset');
}

export async function updatePreset(
  presetId: number,
  preset: Partial<ApiAppActionPreset>
): Promise<AppActionPreset> {
  const res = await apiClient.put<ApiAppActionPreset>(`/automation/presets/${presetId}`, preset);
  return requireId(res.data, 'AppActionPreset');
}

export async function deletePreset(presetId: number): Promise<void> {
  await apiClient.delete(`/automation/presets/${presetId}`);
}

export async function copyPreset(presetId: number): Promise<AppActionPreset> {
  const res = await apiClient.post<ApiAppActionPreset>(`/automation/presets/${presetId}/copy`);
  return requireId(res.data, 'AppActionPreset');
}

export async function executePreset(request: ExecutePresetRequest): Promise<ExecutePresetResponse> {
  const res = await apiClient.post<ExecutePresetResponse>('/automation/execute-preset', request);
  return res.data;
}

export async function testActions(request: TestActionsRequest): Promise<TestActionsResponse> {
  const res = await apiClient.post<TestActionsResponse>('/automation/test-actions', request);
  return res.data;
}

export async function listExecutions(query?: ListExecutionsQuery): Promise<AutomationExecution[]> {
  const res = await apiClient.get<ApiAutomationExecution[]>('/automation/executions', { params: query });
  return (res.data || []).map((e) => requireId(e, 'AutomationExecution'));
}

export async function clearExecutions(query?: { status?: string | null }): Promise<ClearExecutionsResponse> {
  const res = await apiClient.delete<ClearExecutionsResponse>('/automation/executions/clear', { params: query });
  return res.data;
}

export async function getExecution(executionId: number): Promise<AutomationExecution> {
  const res = await apiClient.get<ApiAutomationExecution>(`/automation/executions/${executionId}`);
  return requireId(res.data, 'AutomationExecution');
}

export async function listLoops(query?: ListLoopsQuery): Promise<ExecutionLoop[]> {
  const res = await apiClient.get<ApiExecutionLoop[]>('/automation/loops', { params: query });
  return (res.data || []).map((l) => requireId(l, 'ExecutionLoop'));
}

export async function getLoop(loopId: number): Promise<ExecutionLoop> {
  // Backend does not currently expose GET /loops/{id} in OpenAPI; keep existing behavior via list+filter if needed.
  const loops = await listLoops();
  const found = loops.find((l) => l.id === loopId);
  if (!found) throw new Error(`[automation] Loop not found: ${loopId}`);
  return found;
}

export async function createLoop(loop: Partial<ApiExecutionLoop>): Promise<ExecutionLoop> {
  const res = await apiClient.post<ApiExecutionLoop>('/automation/loops', loop);
  return requireId(res.data, 'ExecutionLoop');
}

export async function updateLoop(loopId: number, loop: Partial<ApiExecutionLoop>): Promise<ExecutionLoop> {
  // Backend does not currently expose PUT /loops/{id} in OpenAPI; keep existing behavior by using POST+client mapping if needed.
  // If the endpoint exists, this will still work.
  const res = await apiClient.put<ApiExecutionLoop>(`/automation/loops/${loopId}`, loop);
  return requireId(res.data, 'ExecutionLoop');
}

export async function deleteLoop(loopId: number): Promise<void> {
  // Backend does not currently expose DELETE /loops/{id} in OpenAPI; keep existing behavior if endpoint exists.
  await apiClient.delete(`/automation/loops/${loopId}`);
}

export async function startLoop(loopId: number): Promise<ExecutionLoop> {
  const res = await apiClient.post<ApiExecutionLoop>(`/automation/loops/${loopId}/start`);
  return requireId(res.data, 'ExecutionLoop');
}

export async function pauseLoop(loopId: number): Promise<ExecutionLoop> {
  const res = await apiClient.post<ApiExecutionLoop>(`/automation/loops/${loopId}/pause`);
  return requireId(res.data, 'ExecutionLoop');
}

export async function runLoopNow(loopId: number): Promise<AutomationExecution> {
  const res = await apiClient.post<ApiAutomationExecution>(`/automation/loops/${loopId}/run-now`);
  return requireId(res.data, 'AutomationExecution');
}


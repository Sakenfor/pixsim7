import type { PixSimApiClient } from '../client';
import type {
  AndroidDevice as ApiAndroidDevice,
  AppActionPreset as ApiAppActionPreset,
  AutomationExecution as ApiAutomationExecution,
  ClearExecutionsApiV1AutomationExecutionsClearDeleteParams,
  ClearExecutionsResponse,
  CompletePairingRequest,
  CompletePairingResponse,
  DeviceScanResponse,
  ExecutePresetRequest,
  ExecutePresetResponse,
  ExecutionLoop as ApiExecutionLoop,
  ListExecutionsApiV1AutomationExecutionsGetParams,
  ListLoopsApiV1AutomationLoopsGetParams,
  ResetDeviceStatusResponse,
  TestActionsRequest,
  TestActionsResponse,
} from '@pixsim7/shared.api.model';
export type {
  ClearExecutionsResponse,
  CompletePairingRequest,
  CompletePairingResponse,
  DeviceScanResponse,
  ExecutePresetRequest,
  ExecutePresetResponse,
  ResetDeviceStatusResponse,
  TestActionsRequest,
  TestActionsResponse,
};

type RequireId<T extends { id?: number | null }> = Omit<T, 'id'> & { id: number };

function requireId<T extends { id?: number | null }>(value: T, label: string): RequireId<T> {
  if (typeof value.id !== 'number') {
    throw new Error(`[automation] Missing ${label}.id`);
  }
  return { ...(value as any), id: value.id } as RequireId<T>;
}

export type AndroidDevice = RequireId<ApiAndroidDevice>;

export type AutomationExecution = RequireId<ApiAutomationExecution>;

export type ExecutionLoop = RequireId<ApiExecutionLoop>;

export type AppActionPreset = RequireId<ApiAppActionPreset>;

export type ListExecutionsQuery = ListExecutionsApiV1AutomationExecutionsGetParams;
export type ListLoopsQuery = ListLoopsApiV1AutomationLoopsGetParams;

export function createAutomationApi(client: PixSimApiClient) {
  return {
    async listDevices(): Promise<AndroidDevice[]> {
      const devices = await client.get<ApiAndroidDevice[]>('/automation/devices');
      return (devices || []).map((d) => requireId(d, 'AndroidDevice'));
    },

    async scanDevices(): Promise<DeviceScanResponse> {
      return client.post<DeviceScanResponse>('/automation/devices/scan');
    },

    async resetDevice(deviceId: number): Promise<ResetDeviceStatusResponse> {
      return client.post<ResetDeviceStatusResponse>(`/automation/devices/${deviceId}/reset`);
    },

    async completePairing(payload: CompletePairingRequest): Promise<CompletePairingResponse> {
      return client.post<CompletePairingResponse>('/automation/agents/complete-pairing', payload);
    },

    async listPresets(): Promise<AppActionPreset[]> {
      const presets = await client.get<ApiAppActionPreset[]>('/automation/presets');
      return (presets || []).map((p) => requireId(p, 'AppActionPreset'));
    },

    async getPreset(presetId: number): Promise<AppActionPreset> {
      const preset = await client.get<ApiAppActionPreset>(`/automation/presets/${presetId}`);
      return requireId(preset, 'AppActionPreset');
    },

    async createPreset(preset: Partial<ApiAppActionPreset>): Promise<AppActionPreset> {
      const created = await client.post<ApiAppActionPreset>('/automation/presets', preset);
      return requireId(created, 'AppActionPreset');
    },

    async updatePreset(presetId: number, preset: Partial<ApiAppActionPreset>): Promise<AppActionPreset> {
      const updated = await client.put<ApiAppActionPreset>(`/automation/presets/${presetId}`, preset);
      return requireId(updated, 'AppActionPreset');
    },

    async deletePreset(presetId: number): Promise<void> {
      await client.delete<void>(`/automation/presets/${presetId}`);
    },

    async copyPreset(presetId: number): Promise<AppActionPreset> {
      const copied = await client.post<ApiAppActionPreset>(`/automation/presets/${presetId}/copy`);
      return requireId(copied, 'AppActionPreset');
    },

    async executePreset(request: ExecutePresetRequest): Promise<ExecutePresetResponse> {
      return client.post<ExecutePresetResponse>('/automation/execute-preset', request);
    },

    async testActions(request: TestActionsRequest): Promise<TestActionsResponse> {
      return client.post<TestActionsResponse>('/automation/test-actions', request);
    },

    async listExecutions(query?: ListExecutionsQuery): Promise<AutomationExecution[]> {
      const executions = await client.get<ApiAutomationExecution[]>('/automation/executions', { params: query as any });
      return (executions || []).map((e) => requireId(e, 'AutomationExecution'));
    },

    async clearExecutions(
      query?: ClearExecutionsApiV1AutomationExecutionsClearDeleteParams
    ): Promise<ClearExecutionsResponse> {
      return client.delete<ClearExecutionsResponse>('/automation/executions/clear', { params: query as any });
    },

    async getExecution(executionId: number): Promise<AutomationExecution> {
      const execution = await client.get<ApiAutomationExecution>(`/automation/executions/${executionId}`);
      return requireId(execution, 'AutomationExecution');
    },

    async listLoops(query?: ListLoopsQuery): Promise<ExecutionLoop[]> {
      const loops = await client.get<ApiExecutionLoop[]>('/automation/loops', { params: query as any });
      return (loops || []).map((l) => requireId(l, 'ExecutionLoop'));
    },

    async getLoop(loopId: number): Promise<ExecutionLoop> {
      const loops = await client.get<ApiExecutionLoop[]>('/automation/loops');
      const normalized = (loops || []).map((l) => requireId(l, 'ExecutionLoop'));
      const found = normalized.find((l) => l.id === loopId);
      if (!found) throw new Error(`[automation] Loop not found: ${loopId}`);
      return found;
    },

    async createLoop(loop: Partial<ApiExecutionLoop>): Promise<ExecutionLoop> {
      const created = await client.post<ApiExecutionLoop>('/automation/loops', loop);
      return requireId(created, 'ExecutionLoop');
    },

    async updateLoop(loopId: number, loop: Partial<ApiExecutionLoop>): Promise<ExecutionLoop> {
      const updated = await client.put<ApiExecutionLoop>(`/automation/loops/${loopId}`, loop);
      return requireId(updated, 'ExecutionLoop');
    },

    async deleteLoop(loopId: number): Promise<void> {
      await client.delete<void>(`/automation/loops/${loopId}`);
    },

    async startLoop(loopId: number): Promise<ExecutionLoop> {
      const started = await client.post<ApiExecutionLoop>(`/automation/loops/${loopId}/start`);
      return requireId(started, 'ExecutionLoop');
    },

    async pauseLoop(loopId: number): Promise<ExecutionLoop> {
      const paused = await client.post<ApiExecutionLoop>(`/automation/loops/${loopId}/pause`);
      return requireId(paused, 'ExecutionLoop');
    },

    async runLoopNow(loopId: number): Promise<AutomationExecution> {
      const execution = await client.post<ApiAutomationExecution>(`/automation/loops/${loopId}/run-now`);
      return requireId(execution, 'AutomationExecution');
    },
  };
}


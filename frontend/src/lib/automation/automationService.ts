import { apiClient } from '../api/client';
import type {
  AndroidDevice,
  AppActionPreset,
  AutomationExecution,
  ExecutionLoop,
  DeviceScanResult,
} from '../../types/automation';

class AutomationService {
  // ===== Device Management =====

  async getDevices(): Promise<AndroidDevice[]> {
    const response = await apiClient.get<AndroidDevice[]>('/automation/devices');
    return response.data;
  }

  async scanDevices(): Promise<DeviceScanResult> {
    const response = await apiClient.post<DeviceScanResult>('/automation/devices/scan');
    return response.data;
  }

  // ===== Preset Management =====

  async getPresets(): Promise<AppActionPreset[]> {
    const response = await apiClient.get<AppActionPreset[]>('/automation/presets');
    return response.data;
  }

  async getPreset(id: number): Promise<AppActionPreset> {
    const response = await apiClient.get<AppActionPreset>(`/automation/presets/${id}`);
    return response.data;
  }

  async createPreset(preset: Partial<AppActionPreset>): Promise<AppActionPreset> {
    const response = await apiClient.post<AppActionPreset>('/automation/presets', preset);
    return response.data;
  }

  async updatePreset(id: number, preset: Partial<AppActionPreset>): Promise<AppActionPreset> {
    const response = await apiClient.put<AppActionPreset>(`/automation/presets/${id}`, preset);
    return response.data;
  }

  async deletePreset(id: number): Promise<void> {
    await apiClient.delete(`/automation/presets/${id}`);
  }

  async executePreset(presetId: number, accountId: number, priority: number = 1): Promise<{ status: string; execution_id: number; task_id: string }> {
    const response = await apiClient.post('/automation/execute-preset', {
      preset_id: presetId,
      account_id: accountId,
      priority,
    });
    return response.data;
  }

  // ===== Execution Management =====

  async getExecutions(limit: number = 100, status?: string): Promise<AutomationExecution[]> {
    const params: Record<string, any> = { limit };

    if (status) {
      params.status = status;
    }

    const response = await apiClient.get<AutomationExecution[]>(
      '/automation/executions',
      { params },
    );
    return response.data;
  }

  async getExecution(id: number): Promise<AutomationExecution> {
    const response = await apiClient.get<AutomationExecution>(`/automation/executions/${id}`);
    return response.data;
  }

  // ===== Loop Management =====

  async getLoops(): Promise<ExecutionLoop[]> {
    const response = await apiClient.get<ExecutionLoop[]>('/automation/loops');
    return response.data;
  }

  async getLoop(id: number): Promise<ExecutionLoop> {
    const response = await apiClient.get<ExecutionLoop>(`/automation/loops/${id}`);
    return response.data;
  }

  async createLoop(loop: Partial<ExecutionLoop>): Promise<ExecutionLoop> {
    const response = await apiClient.post<ExecutionLoop>('/automation/loops', loop);
    return response.data;
  }

  async updateLoop(id: number, loop: Partial<ExecutionLoop>): Promise<ExecutionLoop> {
    const response = await apiClient.put<ExecutionLoop>(`/automation/loops/${id}`, loop);
    return response.data;
  }

  async deleteLoop(id: number): Promise<void> {
    await apiClient.delete(`/automation/loops/${id}`);
  }

  async startLoop(id: number): Promise<ExecutionLoop> {
    const response = await apiClient.post<ExecutionLoop>(`/automation/loops/${id}/start`);
    return response.data;
  }

  async pauseLoop(id: number): Promise<ExecutionLoop> {
    const response = await apiClient.post<ExecutionLoop>(`/automation/loops/${id}/pause`);
    return response.data;
  }

  async runLoopNow(id: number): Promise<AutomationExecution> {
    const response = await apiClient.post<AutomationExecution>(`/automation/loops/${id}/run-now`);
    return response.data;
  }
}

export const automationService = new AutomationService();

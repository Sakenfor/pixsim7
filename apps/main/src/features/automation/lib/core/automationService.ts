import type {
  AndroidDevice,
  AppActionPreset,
  AutomationExecution,
  ExecutionLoop,
  DeviceScanResult,
  ActionDefinition,
  PresetVariable,
} from '../../types';
import {
  listDevices as apiListDevices,
  scanDevices as apiScanDevices,
  completePairing as apiCompletePairing,
  listPresets as apiListPresets,
  getPreset as apiGetPreset,
  createPreset as apiCreatePreset,
  updatePreset as apiUpdatePreset,
  deletePreset as apiDeletePreset,
  copyPreset as apiCopyPreset,
  executePreset as apiExecutePreset,
  testActions as apiTestActions,
  listExecutions as apiListExecutions,
  clearExecutions as apiClearExecutions,
  getExecution as apiGetExecution,
  listLoops as apiListLoops,
  getLoop as apiGetLoop,
  createLoop as apiCreateLoop,
  updateLoop as apiUpdateLoop,
  deleteLoop as apiDeleteLoop,
  startLoop as apiStartLoop,
  pauseLoop as apiPauseLoop,
  runLoopNow as apiRunLoopNow,
} from '@lib/api/automation';
import type {
  AndroidDevice as ApiAndroidDevice,
  AppActionPreset as ApiAppActionPreset,
  AutomationExecution as ApiAutomationExecution,
  ExecutionLoop as ApiExecutionLoop,
} from '@lib/api/automation';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireNumber(obj: Record<string, unknown>, key: string): number {
  const value = obj[key];
  if (typeof value !== 'number') throw new Error(`[automation] Expected number: ${key}`);
  return value;
}

function requireString(obj: Record<string, unknown>, key: string): string {
  const value = obj[key];
  if (typeof value !== 'string') throw new Error(`[automation] Expected string: ${key}`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function coerceActions(actions: unknown): ActionDefinition[] {
  if (!Array.isArray(actions)) return [];
  return actions.filter((a) => isRecord(a) && typeof a.type === 'string').map((a) => a as unknown as ActionDefinition);
}

function coerceVariables(variables: unknown): PresetVariable[] {
  if (!Array.isArray(variables)) return [];
  return variables.filter((v) => isRecord(v) && typeof v.name === 'string').map((v) => v as unknown as PresetVariable);
}

function toAndroidDevice(device: ApiAndroidDevice): AndroidDevice {
  return {
    id: device.id,
    name: device.name,
    adb_id: device.adb_id,
    device_type: device.device_type as AndroidDevice['device_type'],
    connection_method: device.connection_method as AndroidDevice['connection_method'],
    status: device.status as AndroidDevice['status'],
    is_enabled: device.is_enabled,
    agent_id: device.agent_id ?? undefined,
    device_serial: device.device_serial ?? undefined,
    instance_name: device.instance_name ?? undefined,
    instance_port: device.instance_port ?? undefined,
    assigned_account_id: device.assigned_account_id ?? undefined,
    assigned_at: device.assigned_at ?? undefined,
    primary_device_id: device.primary_device_id ?? undefined,
    error_message: device.error_message ?? undefined,
    created_at: device.created_at ?? undefined,
    updated_at: device.updated_at ?? undefined,
    last_seen: device.last_seen ?? undefined,
    last_used_at: device.last_used_at ?? undefined,
  };
}

function toAutomationExecution(execution: ApiAutomationExecution): AutomationExecution {
  return {
    id: execution.id,
    user_id: execution.user_id,
    preset_id: execution.preset_id ?? undefined,
    account_id: execution.account_id,
    device_id: execution.device_id ?? undefined,
    loop_id: execution.loop_id ?? undefined,
    status: execution.status as AutomationExecution['status'],
    current_action_index: execution.current_action_index ?? undefined,
    total_actions: execution.total_actions ?? undefined,
    error_message: execution.error_message ?? undefined,
    error_action_index: execution.error_action_index ?? undefined,
    error_details: (execution.error_details as any) ?? undefined,
    execution_context: (execution.execution_context as any) ?? undefined,
    retry_count: execution.retry_count,
    max_retries: execution.max_retries,
    task_id: execution.task_id ?? undefined,
    created_at: execution.created_at ?? undefined,
    started_at: execution.started_at ?? undefined,
    completed_at: execution.completed_at ?? undefined,
  };
}

function toExecutionLoop(loop: ApiExecutionLoop): ExecutionLoop {
  return {
    id: loop.id,
    user_id: loop.user_id,
    name: loop.name,
    description: loop.description ?? undefined,
    preset_id: loop.preset_id ?? undefined,
    preset_execution_mode: loop.preset_execution_mode as ExecutionLoop['preset_execution_mode'],
    selection_mode: loop.selection_mode as ExecutionLoop['selection_mode'],
    status: loop.status as ExecutionLoop['status'],
    is_enabled: loop.is_enabled,
    delay_between_executions: loop.delay_between_executions,
    max_executions_per_day: loop.max_executions_per_day ?? undefined,
    max_consecutive_failures: loop.max_consecutive_failures,
    consecutive_failures: loop.consecutive_failures,
    min_credits: loop.min_credits ?? undefined,
    max_credits: loop.max_credits ?? undefined,
    require_online_device: loop.require_online_device,
    preferred_device_id: loop.preferred_device_id ?? undefined,
    skip_accounts_already_ran_today: loop.skip_accounts_already_ran_today,
    skip_google_jwt_accounts: loop.skip_google_jwt_accounts,
    last_execution_at: loop.last_execution_at ?? undefined,
    last_account_id: loop.last_account_id ?? undefined,
    total_executions: loop.total_executions,
    successful_executions: loop.successful_executions,
    failed_executions: loop.failed_executions,
    executions_today: loop.executions_today,
    last_reset_date: loop.last_reset_date ?? undefined,
    created_at: loop.created_at ?? undefined,
    updated_at: loop.updated_at ?? undefined,
    shared_preset_ids: (loop.shared_preset_ids as any) ?? undefined,
    current_preset_index: loop.current_preset_index ?? undefined,
    current_account_id: loop.current_account_id ?? undefined,
    account_preset_config: (loop.account_preset_config as any) ?? undefined,
    default_preset_ids: (loop.default_preset_ids as any) ?? undefined,
    account_ids: (loop.account_ids as any) ?? undefined,
    account_execution_state: (loop.account_execution_state as any) ?? undefined,
  };
}

function toAppActionPreset(preset: ApiAppActionPreset): AppActionPreset {
  const p = preset as unknown as Record<string, unknown>;

  return {
    id: preset.id,
    name: preset.name,
    description: optionalString(preset.description) ?? undefined,
    category: optionalString(preset.category) ?? undefined,
    tags: (preset.tags as any) ?? undefined,
    variables: coerceVariables(p.variables),
    actions: coerceActions(preset.actions ?? p.actions),
    owner_id: preset.owner_id ?? undefined,
    is_shared: preset.is_shared,
    is_system: preset.is_system,
    app_package: preset.app_package ?? undefined,
    requires_password: preset.requires_password ?? undefined,
    requires_google_account: preset.requires_google_account ?? undefined,
    max_retries: preset.max_retries ?? undefined,
    retry_delay_seconds: preset.retry_delay_seconds ?? undefined,
    timeout_seconds: preset.timeout_seconds ?? undefined,
    continue_on_error: preset.continue_on_error ?? undefined,
    usage_count: preset.usage_count,
    last_used: preset.last_used ?? undefined,
    created_at: preset.created_at ?? undefined,
    updated_at: preset.updated_at ?? undefined,
    cloned_from_id: preset.cloned_from_id ?? undefined,
  };
}

class AutomationService {
  // ===== Device Management =====

  async getDevices(): Promise<AndroidDevice[]> {
    const devices = await apiListDevices();
    return devices.map(toAndroidDevice);
  }

  async scanDevices(): Promise<DeviceScanResult> {
    const result = await apiScanDevices();
    if (!isRecord(result)) throw new Error('[automation] Invalid scan result');
    return {
      scanned: requireNumber(result, 'scanned'),
      added: requireNumber(result, 'added'),
      updated: requireNumber(result, 'updated'),
      offline: requireNumber(result, 'offline'),
    };
  }

  async completeDevicePairing(pairingCode: string): Promise<void> {
    await apiCompletePairing({ pairing_code: pairingCode });
  }

  // ===== Preset Management =====

  async getPresets(): Promise<AppActionPreset[]> {
    const presets = await apiListPresets();
    return presets.map(toAppActionPreset);
  }

  async getPreset(id: number): Promise<AppActionPreset> {
    const preset = await apiGetPreset(id);
    return toAppActionPreset(preset);
  }

  async createPreset(preset: Partial<AppActionPreset>): Promise<AppActionPreset> {
    const created = await apiCreatePreset(preset);
    return toAppActionPreset(created);
  }

  async updatePreset(id: number, preset: Partial<AppActionPreset>): Promise<AppActionPreset> {
    const updated = await apiUpdatePreset(id, preset);
    return toAppActionPreset(updated);
  }

  async deletePreset(id: number): Promise<void> {
    await apiDeletePreset(id);
  }

  async copyPreset(id: number): Promise<AppActionPreset> {
    const copied = await apiCopyPreset(id);
    return toAppActionPreset(copied);
  }

  async executePreset(presetId: number, accountId: number, priority: number = 1): Promise<{ status: string; execution_id: number; task_id: string }> {
    const result = await apiExecutePreset({ preset_id: presetId, account_id: accountId, priority });
    if (!isRecord(result)) throw new Error('[automation] Invalid execute-preset response');
    return {
      status: requireString(result, 'status'),
      execution_id: requireNumber(result, 'execution_id'),
      task_id: requireString(result, 'task_id'),
    };
  }

  async testActions(
    accountId: number,
    actions: any[],
    options?: {
      deviceId?: number;
      variables?: any[];
      startIndex?: number;
      endIndex?: number;
    }
  ): Promise<{ status: string; execution_id: number; task_id: string; actions_count: number }> {
    const request = {
      account_id: accountId,
      device_id: options?.deviceId,
      actions,
      variables: options?.variables,
      start_index: options?.startIndex ?? 0,
      end_index: options?.endIndex,
    } as unknown as Parameters<typeof apiTestActions>[0];

    const result = await apiTestActions(request);
    if (!isRecord(result)) throw new Error('[automation] Invalid test-actions response');
    return {
      status: requireString(result, 'status'),
      execution_id: requireNumber(result, 'execution_id'),
      task_id: requireString(result, 'task_id'),
      actions_count: requireNumber(result, 'actions_count'),
    };
  }

  // ===== Execution Management =====

  async getExecutions(limit: number = 100, status?: string): Promise<AutomationExecution[]> {
    const executions = await apiListExecutions({
      limit,
      status: status ?? undefined,
    });
    return executions.map(toAutomationExecution);
  }

  async clearExecutions(status?: string): Promise<{ status: string; deleted: number; filter: string }> {
    const result = await apiClearExecutions({ status: status ?? undefined });
    if (!isRecord(result)) throw new Error('[automation] Invalid clear-executions response');
    return {
      status: requireString(result, 'status'),
      deleted: requireNumber(result, 'deleted'),
      filter: requireString(result, 'filter'),
    };
  }

  async getExecution(id: number): Promise<AutomationExecution> {
    const execution = await apiGetExecution(id);
    return toAutomationExecution(execution);
  }

  // ===== Loop Management =====

  async getLoops(): Promise<ExecutionLoop[]> {
    const loops = await apiListLoops();
    return loops.map(toExecutionLoop);
  }

  async getLoop(id: number): Promise<ExecutionLoop> {
    const loop = await apiGetLoop(id);
    return toExecutionLoop(loop);
  }

  async createLoop(loop: Partial<ExecutionLoop>): Promise<ExecutionLoop> {
    const created = await apiCreateLoop(loop);
    return toExecutionLoop(created);
  }

  async updateLoop(id: number, loop: Partial<ExecutionLoop>): Promise<ExecutionLoop> {
    const updated = await apiUpdateLoop(id, loop);
    return toExecutionLoop(updated);
  }

  async deleteLoop(id: number): Promise<void> {
    await apiDeleteLoop(id);
  }

  async startLoop(id: number): Promise<ExecutionLoop> {
    const updated = await apiStartLoop(id);
    return toExecutionLoop(updated);
  }

  async pauseLoop(id: number): Promise<ExecutionLoop> {
    const updated = await apiPauseLoop(id);
    return toExecutionLoop(updated);
  }

  async runLoopNow(id: number): Promise<AutomationExecution> {
    const execution = await apiRunLoopNow(id);
    return toAutomationExecution(execution);
  }
}

export const automationService = new AutomationService();

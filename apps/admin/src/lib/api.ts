import type {
  APIHealthResponse,
  BuildablesResponse,
  CodegenTasksResponse,
  EventStatsResponse,
  LauncherSettings,
  LauncherSettingsUpdate,
  LogFileResponse,
  LogLevel,
  LogsResponse,
  ServiceDefinition,
  ServicesResponse,
  StatisticsResponse,
} from './types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8100';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.error || error.detail || 'Request failed');
  }

  return response.json();
}

export async function getServices(): Promise<ServicesResponse> {
  return request('/services');
}

export async function startService(serviceKey: string) {
  return request(`/services/${serviceKey}/start`, { method: 'POST' });
}

export async function getServiceDefinition(serviceKey: string): Promise<ServiceDefinition> {
  return request(`/services/${serviceKey}/definition`);
}

export async function stopService(serviceKey: string, graceful = true) {
  return request(`/services/${serviceKey}/stop`, {
    method: 'POST',
    body: JSON.stringify({ graceful }),
  });
}

export async function restartService(serviceKey: string) {
  return request(`/services/${serviceKey}/restart`, { method: 'POST' });
}

export async function startAllServices() {
  return request('/services/start-all', { method: 'POST' });
}

export async function stopAllServices(graceful = true) {
  return request('/services/stop-all', {
    method: 'POST',
    body: JSON.stringify({ graceful }),
  });
}

export async function getBuildables(): Promise<BuildablesResponse> {
  return request('/buildables');
}

export async function getCodegenTasks(): Promise<CodegenTasksResponse> {
  return request('/codegen/tasks');
}

export async function getSettings(): Promise<LauncherSettings> {
  return request('/settings');
}

export async function updateSettings(payload: LauncherSettingsUpdate): Promise<LauncherSettings> {
  return request('/settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

// Logs API
export async function getServiceLogs(
  serviceKey: string,
  options?: { tail?: number; filter_text?: string; filter_level?: LogLevel },
): Promise<LogsResponse> {
  const params = new URLSearchParams();
  if (options?.tail !== undefined) {
    params.set('tail', String(options.tail));
  }
  if (options?.filter_text) {
    params.set('filter_text', options.filter_text);
  }
  if (options?.filter_level) {
    params.set('filter_level', options.filter_level);
  }
  const query = params.toString();
  return request(`/logs/${serviceKey}${query ? `?${query}` : ''}`);
}

export async function clearServiceLogs(serviceKey: string): Promise<{ success: boolean; message: string }> {
  return request(`/logs/${serviceKey}`, { method: 'DELETE' });
}

export async function clearAllLogs(): Promise<{ success: boolean; message: string }> {
  return request('/logs', { method: 'DELETE' });
}

export async function getLogFilePath(serviceKey: string): Promise<LogFileResponse> {
  return request(`/logs/${serviceKey}/file`);
}

// Health API
export async function getAPIHealth(): Promise<APIHealthResponse> {
  return request('/health');
}

export async function getStatistics(): Promise<StatisticsResponse> {
  return request('/stats');
}

// Events API
export async function getEventStats(): Promise<EventStatsResponse> {
  return request('/events/stats');
}

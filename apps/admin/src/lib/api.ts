import type { BuildablesResponse, ServiceDefinition, ServicesResponse, SharedSettings } from './types';

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

export async function getSettings(): Promise<SharedSettings> {
  return request('/settings');
}

export async function updateSettings(payload: Partial<SharedSettings>): Promise<SharedSettings> {
  return request('/settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

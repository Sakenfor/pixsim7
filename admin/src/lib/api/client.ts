// API client for PixSim7 backend
// Uses VITE_BACKEND_URL from .env file (defaults to http://localhost:8001) and appends /api/v1
const BACKEND_ROOT = (import.meta.env.VITE_BACKEND_URL as string) || 'http://localhost:8001';
const API_URL = `${BACKEND_ROOT.replace(/\/$/, '')}/api/v1`;

export interface ServiceStatus {
  name: string;
  status: string;
  healthy: boolean;
  uptime_seconds?: number;
  last_check: string;
  details: Record<string, any>;
}

export interface LogEntry {
  id: number;
  timestamp: string;
  level: string;
  service: string;
  env: string;
  msg: string | null;

  // Legacy fields (for backward compatibility with old logs)
  logger?: string;
  message?: string;
  module?: string;
  function?: string;
  line?: number;
  exception?: string;

  // Correlation fields
  request_id?: string | null;
  job_id?: number | null;
  submission_id?: number | null;
  artifact_id?: number | null;
  provider_job_id?: string | null;

  // Context fields
  provider_id?: string | null;
  operation_type?: string | null;
  stage?: string | null;
  user_id?: number | null;

  // Error fields
  error?: string | null;
  error_type?: string | null;

  // Performance fields
  duration_ms?: number | null;
  attempt?: number | null;

  // Extra fields
  extra?: Record<string, any> | null;
}

export interface LogQueryResponse {
  logs: LogEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface SystemMetrics {
  cpu_percent: number;
  memory_percent: number;
  disk_percent: number;
  timestamp: string;
}

export interface ServiceControlResponse {
  service: string;
  action: string;
  success: boolean;
  message: string;
  pid?: number;
}

export interface ProcessInfo {
  name: string;
  pid: number;
  status: string;
  cpu_percent: number;
  memory_mb: number;
}

export class ApiClient {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
    localStorage.setItem('auth_token', token);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('auth_token');
  }

  getToken(): string | null {
    if (!this.token) {
      this.token = localStorage.getItem('auth_token');
    }
    return this.token;
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    return response.json();
  }

  // Auth
  async login(email: string, password: string) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setToken(data.access_token);
    return data;
  }

  async logout() {
    await this.request('/auth/logout', { method: 'POST' });
    this.clearToken();
  }

  // Admin - Services
  async getServiceStatus(): Promise<ServiceStatus[]> {
    return this.request('/admin/services/status');
  }

  async getSystemMetrics(): Promise<SystemMetrics> {
    return this.request('/admin/system/metrics');
  }

  // Admin - Logs with comprehensive filtering
  async getLogs(params: {
    level?: string;
    logger?: string;
    search?: string;
    user_id?: number;
    job_id?: number;
    start_time?: string;
    end_time?: string;
    limit?: number;
    offset?: number;
  }): Promise<LogQueryResponse> {
    const query = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query.append(key, String(value));
      }
    });

    return this.request(`/admin/logs?${query}`);
  }

  // Service Management
  async controlService(service: string, action: string): Promise<ServiceControlResponse> {
    return this.request('/services/control', {
      method: 'POST',
      body: JSON.stringify({ service, action }),
    });
  }

  async getProcesses(): Promise<ProcessInfo[]> {
    return this.request('/services/processes');
  }

  // Accounts Management
  async getAccounts(provider_id?: string): Promise<any[]> {
    const query = provider_id ? `?provider_id=${provider_id}` : '';
    return this.request(`/accounts${query}`);
  }

  async createAccount(data: {
    email: string;
    provider_id: string;
    jwt_token?: string;
    api_key?: string;
    api_key_paid?: string;
    cookies?: any;
    is_private?: boolean;
  }): Promise<any> {
    return this.request('/accounts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateAccount(account_id: number, data: any): Promise<any> {
    return this.request(`/accounts/${account_id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteAccount(account_id: number): Promise<void> {
    await this.request(`/accounts/${account_id}`, {
      method: 'DELETE',
    });
  }

  async setCredit(account_id: number, credit_type: string, amount: number): Promise<any> {
    return this.request(`/accounts/${account_id}/credits`, {
      method: 'POST',
      body: JSON.stringify({ credit_type, amount }),
    });
  }

  async bulkUpdateCredits(updates: Array<{ email: string; credits: Record<string, number> }>): Promise<any> {
    return this.request('/accounts/credits/bulk-update', {
      method: 'POST',
      body: JSON.stringify(updates),
    });
  }

  // Jobs Management
  async getJobs(params?: {
    status?: string;
    operation_type?: string;
    provider_id?: string;
    workspace_id?: number;
    limit?: number;
    offset?: number;
  }): Promise<any[]> {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query.append(key, String(value));
        }
      });
    }
    return this.request(`/jobs?${query}`);
  }

  async getJob(job_id: number): Promise<any> {
    return this.request(`/jobs/${job_id}`);
  }

  async createJob(data: {
    operation_type: string;
    provider_id: string;
    params: any;
    workspace_id?: number;
    name?: string;
    priority?: number;
  }): Promise<any> {
    return this.request('/jobs', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async cancelJob(job_id: number): Promise<any> {
    return this.request(`/jobs/${job_id}/cancel`, {
      method: 'POST',
    });
  }

  // Assets Management
  async getAssets(params?: {
    media_type?: string;
    provider_id?: string;
    sync_status?: string;
    limit?: number;
    offset?: number;
  }): Promise<any[]> {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query.append(key, String(value));
        }
      });
    }
    return this.request(`/assets?${query}`);
  }

  async getAsset(asset_id: number): Promise<any> {
    return this.request(`/assets/${asset_id}`);
  }

  async deleteAsset(asset_id: number): Promise<void> {
    await this.request(`/assets/${asset_id}`, {
      method: 'DELETE',
    });
  }

  // Health check
  async getHealth(): Promise<any> {
    const baseUrl = API_URL.replace('/api/v1', '');
    return fetch(`${baseUrl}/health`).then(r => r.json());
  }
}

export const api = new ApiClient();

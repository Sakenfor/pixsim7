/**
 * Admin API Domain Client
 *
 * Provides typed access to admin endpoints for system monitoring,
 * plugin management, and service health.
 */
import type { PixSimApiClient } from '../client';

// ===== Service Health Types =====

export interface ServiceStatus {
  name: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  latency_ms?: number;
  error?: string;
}

export interface ServicesStatusResponse {
  services: ServiceStatus[];
  overall_healthy: boolean;
}

// ===== System Metrics Types =====

export interface SystemMetrics {
  cpu_percent: number;
  memory_percent: number;
  memory_used_mb: number;
  memory_total_mb: number;
  disk_percent: number;
  disk_used_gb: number;
  disk_total_gb: number;
}

// ===== Event Metrics Types =====

export interface EventMetrics {
  total_events: number;
  events_by_type: Record<string, number>;
  processing_rate: number;
  error_rate: number;
}

// ===== Plugin Admin Types =====

export interface PluginMetricsData {
  request_count: number;
  error_count: number;
  avg_latency_ms: number;
  condition_evaluations: number;
  condition_failures: number;
  effect_applications: number;
  effect_failures: number;
  is_healthy: boolean;
  last_health_check: string | null;
}

export interface PluginMetricsSummary {
  total_plugins: number;
  healthy_plugins: number;
  unhealthy_plugins: number;
  total_requests: number;
  total_errors: number;
}

export interface PluginMetricsResponse {
  summary: PluginMetricsSummary;
  plugins: Record<string, PluginMetricsData>;
}

export interface PluginHealthStatus {
  is_healthy: boolean;
  last_check: string | null;
  error_count: number;
  request_error_rate: number;
  condition_failure_rate: number;
  effect_failure_rate: number;
}

export interface PluginHealthResponse {
  overall_healthy: boolean;
  unhealthy_plugins: string[];
  health_status: Record<string, PluginHealthStatus>;
}

export interface PluginListItem {
  plugin_id: string;
  name: string;
  version: string;
  enabled: boolean;
  kind: string;
}

export interface PluginListResponse {
  feature_plugins: PluginListItem[];
  route_plugins: PluginListItem[];
  total: number;
}

export interface PluginDetails {
  plugin_id: string;
  name: string;
  version: string;
  description: string | null;
  author: string | null;
  kind: string;
  enabled: boolean;
  permissions: string[];
  dependencies: string[];
  requires_db: boolean;
  requires_redis: boolean;
  metrics: PluginMetricsData | null;
  behavior_extensions: {
    conditions: string[];
    effects: string[];
  };
}

// ===== Behavior Extensions Types =====

export interface ConditionInfo {
  condition_id: string;
  plugin_id: string;
  description: string;
  required_context: string[];
}

export interface EffectInfo {
  effect_id: string;
  plugin_id: string;
  description: string;
  default_params: Record<string, unknown>;
}

export interface SimulationConfigProvider {
  provider_id: string;
  plugin_id: string;
  description: string;
  priority: number;
}

export interface BehaviorExtensionsResponse {
  registry_locked: boolean;
  conditions: {
    total: number;
    by_plugin: Record<string, number>;
    list: ConditionInfo[];
  };
  effects: {
    total: number;
    by_plugin: Record<string, number>;
    list: EffectInfo[];
  };
  simulation_configs: {
    total: number;
    by_plugin: Record<string, number>;
    providers: SimulationConfigProvider[];
  };
}

// ===== Admin API Factory =====

export function createAdminApi(client: PixSimApiClient) {
  return {
    // ===== Service Health =====

    async getServicesStatus(): Promise<ServicesStatusResponse> {
      return client.get<ServicesStatusResponse>('/admin/services/status');
    },

    // ===== System Metrics =====

    async getSystemMetrics(): Promise<SystemMetrics> {
      return client.get<SystemMetrics>('/admin/system/metrics');
    },

    // ===== Event Metrics =====

    async getEventMetrics(): Promise<EventMetrics> {
      return client.get<EventMetrics>('/admin/events/metrics');
    },

    // ===== Plugin Management =====

    async listPlugins(): Promise<PluginListResponse> {
      return client.get<PluginListResponse>('/admin/plugins/list');
    },

    async getPluginMetrics(): Promise<PluginMetricsResponse> {
      return client.get<PluginMetricsResponse>('/admin/plugins/metrics');
    },

    async getPluginMetricsById(pluginId: string): Promise<PluginMetricsData> {
      return client.get<PluginMetricsData>(
        `/admin/plugins/metrics/${encodeURIComponent(pluginId)}`
      );
    },

    async getPluginHealth(): Promise<PluginHealthResponse> {
      return client.get<PluginHealthResponse>('/admin/plugins/health');
    },

    async getPluginDetails(pluginId: string): Promise<PluginDetails> {
      return client.get<PluginDetails>(
        `/admin/plugins/${encodeURIComponent(pluginId)}/details`
      );
    },

    async resetPluginMetrics(pluginId?: string): Promise<{ status: string; message: string }> {
      return client.post<{ status: string; message: string }>(
        '/admin/plugins/metrics/reset',
        pluginId ? { plugin_id: pluginId } : undefined
      );
    },

    // ===== Behavior Extensions =====

    async getBehaviorExtensions(): Promise<BehaviorExtensionsResponse> {
      return client.get<BehaviorExtensionsResponse>('/admin/plugins/behavior-extensions');
    },
  };
}

/**
 * Admin API Domain Client
 *
 * Strict OpenAPI-backed client for admin monitoring and plugin endpoints.
 */
import type { PixSimApiClient } from '../client';
import type {
  BehaviorExtensionsResponse,
  ConditionInfo,
  EffectInfo,
  EventMetricsResponse,
  Pixsim7BackendMainApiV1AdminPluginsPluginListResponse,
  PluginDetailsResponse,
  PluginHealthResponse,
  PluginHealthStatus,
  PluginListItem,
  PluginMetricsData,
  PluginMetricsResponse,
  PluginMetricsSummary,
  ResetPluginMetricsApiV1AdminPluginsMetricsResetPostParams,
  ResetPluginMetricsResponse,
  ServiceStatus,
  SimulationConfigProviderInfo,
  SystemMetrics,
} from '@pixsim7/shared.api.model';
export type {
  BehaviorExtensionsResponse,
  ConditionInfo,
  EffectInfo,
  PluginHealthResponse,
  PluginHealthStatus,
  PluginListItem,
  PluginMetricsData,
  PluginMetricsResponse,
  PluginMetricsSummary,
  ServiceStatus,
  SystemMetrics,
};

// ===== Admin Types =====

export type ServicesStatusResponse = readonly ServiceStatus[];
export type EventMetrics = EventMetricsResponse;
export type PluginListResponse = Pixsim7BackendMainApiV1AdminPluginsPluginListResponse;
export type PluginDetails = PluginDetailsResponse;
export type SimulationConfigProvider = SimulationConfigProviderInfo;
type ResetPluginMetricsQuery = ResetPluginMetricsApiV1AdminPluginsMetricsResetPostParams;

// ===== Admin API Factory =====

export function createAdminApi(client: PixSimApiClient) {
  return {
    async getServicesStatus(): Promise<ServicesStatusResponse> {
      const response = await client.get<readonly ServiceStatus[]>('/admin/services/status');
      return [...response];
    },

    async getSystemMetrics(): Promise<SystemMetrics> {
      return client.get<SystemMetrics>('/admin/system/metrics');
    },

    async getEventMetrics(): Promise<EventMetrics> {
      return client.get<EventMetrics>('/admin/events/metrics');
    },

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
      return client.get<PluginDetails>(`/admin/plugins/${encodeURIComponent(pluginId)}/details`);
    },

    async resetPluginMetrics(
      options?: ResetPluginMetricsQuery
    ): Promise<ResetPluginMetricsResponse> {
      return client.post<ResetPluginMetricsResponse>(
        '/admin/plugins/metrics/reset',
        undefined,
        { params: options }
      );
    },

    async getBehaviorExtensions(): Promise<BehaviorExtensionsResponse> {
      return client.get<BehaviorExtensionsResponse>('/admin/plugins/behavior-extensions');
    },
  };
}


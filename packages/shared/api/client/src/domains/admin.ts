/**
 * Admin API Domain Client
 *
 * Strict OpenAPI-backed client for admin monitoring and plugin endpoints.
 */
import type { PixSimApiClient } from '../client';
import type { ApiComponents, ApiOperations } from '@pixsim7/shared.types';

type Schemas = ApiComponents['schemas'];
type AdminPluginListResponseSchema =
  Schemas['pixsim7__backend__main__api__v1__admin_plugins__PluginListResponse'];

// ===== Admin Types =====

export type ServiceStatus = Schemas['ServiceStatus'];
export type ServicesStatusResponse =
  ApiOperations['get_services_status_api_v1_admin_services_status_get']['responses'][200]['content']['application/json'];
export type SystemMetrics = Schemas['SystemMetrics'];
export type EventMetrics = Schemas['EventMetricsResponse'];
export type PluginMetricsData = Schemas['PluginMetricsData'];
export type PluginMetricsSummary = Schemas['PluginMetricsSummary'];
export type PluginMetricsResponse = Schemas['PluginMetricsResponse'];
export type PluginHealthStatus = Schemas['PluginHealthStatus'];
export type PluginHealthResponse = Schemas['PluginHealthResponse'];
export type PluginListItem = Schemas['PluginListItem'];
export type PluginListResponse = AdminPluginListResponseSchema;
export type PluginDetails = Schemas['PluginDetailsResponse'];
export type ConditionInfo = Schemas['ConditionInfo'];
export type EffectInfo = Schemas['EffectInfo'];
export type SimulationConfigProvider = Schemas['SimulationConfigProviderInfo'];
export type BehaviorExtensionsResponse = Schemas['BehaviorExtensionsResponse'];
type ResetPluginMetricsQuery =
  ApiOperations['reset_plugin_metrics_api_v1_admin_plugins_metrics_reset_post']['parameters']['query'];
type ResetPluginMetricsResponse = Schemas['ResetPluginMetricsResponse'];

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

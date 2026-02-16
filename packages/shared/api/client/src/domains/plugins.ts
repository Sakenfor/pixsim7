import type { PixSimApiClient } from '../client';
import type { ApiComponents, ApiOperations } from '@pixsim7/shared.types';

type Schemas = ApiComponents['schemas'];

export type SceneViewMetadata = Schemas['SceneViewMetadata'];
export type ControlCenterMetadata = Schemas['ControlCenterMetadata'];
export type PluginMetadata = Schemas['PluginMetadata'];
export type PluginInfo = Schemas['PluginResponse'];
export type PluginListResponse =
  ApiOperations['list_plugins_api_v1_plugins_get']['responses'][200]['content']['application/json'];
export type PluginStateResponse = Schemas['PluginStateResponse'];
export type PluginSyncItem = Schemas['PluginSyncItem'];
export type PluginSyncResponse = Schemas['PluginSyncResponse'];

type PluginSyncRequestSchema = Schemas['PluginSyncRequest'];
export type PluginSyncRequest =
  Omit<PluginSyncRequestSchema, 'plugins'> & {
    plugins: PluginSyncItem[];
  };

export function createPluginsApi(client: PixSimApiClient) {
  return {
    async getPlugins(options?: { family?: string; enabledOnly?: boolean }): Promise<PluginInfo[]> {
      const params: Record<string, string | boolean> = {};
      if (options?.family) params.family = options.family;
      if (options?.enabledOnly) params.enabled_only = true;

      const response = await client.get<PluginListResponse>('/plugins', {
        params: Object.keys(params).length ? params : undefined,
      });
      return [...response.plugins];
    },

    async getEnabledPlugins(family?: string): Promise<PluginInfo[]> {
      const response = await client.get<PluginListResponse>('/plugins/enabled/list', {
        params: family ? { family } : undefined,
      });
      return [...response.plugins];
    },

    async getPlugin(pluginId: string): Promise<PluginInfo> {
      return client.get<PluginInfo>(`/plugins/${encodeURIComponent(pluginId)}`);
    },

    async enablePlugin(pluginId: string): Promise<PluginStateResponse> {
      return client.post<PluginStateResponse>(`/plugins/${encodeURIComponent(pluginId)}/enable`);
    },

    async disablePlugin(pluginId: string): Promise<PluginStateResponse> {
      return client.post<PluginStateResponse>(`/plugins/${encodeURIComponent(pluginId)}/disable`);
    },

    async syncPlugins(payload: PluginSyncRequest): Promise<PluginSyncResponse> {
      return client.post<PluginSyncResponse>('/plugins/sync', payload);
    },
  };
}

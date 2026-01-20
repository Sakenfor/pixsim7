import type { PixSimApiClient } from '../client';

/**
 * Scene view specific metadata
 */
export interface SceneViewMetadata {
  scene_view_id: string;
  surfaces: string[];
  default: boolean;
}

/**
 * Control center specific metadata
 */
export interface ControlCenterMetadata {
  control_center_id: string;
  display_name?: string | null;
  features: string[];
  preview?: string | null;
  default: boolean;
}

/**
 * Plugin metadata from backend
 *
 * Maps to `UnifiedPluginDescriptor.extensions` on frontend:
 * - scene_view → extensions.sceneView
 * - control_center → extensions.controlCenter
 */
export interface PluginMetadata {
  permissions: string[];
  surfaces: string[];
  default: boolean;
  scene_view?: SceneViewMetadata | null;
  control_center?: ControlCenterMetadata | null;
}

/**
 * Plugin info from backend catalog
 *
 * Use `fromBackendPlugin()` from `@lib/plugins/types` to convert
 * to the canonical `UnifiedPluginDescriptor` type.
 */
export interface PluginInfo {
  plugin_id: string;
  name: string;
  description: string | null;
  version: string;
  author: string | null;
  icon: string | null;
  family: string;
  plugin_type: string;
  tags: string[];
  bundle_url: string;
  manifest_url: string | null;
  is_builtin: boolean;
  is_enabled: boolean;
  metadata: PluginMetadata;
}

export interface PluginListResponse {
  plugins: PluginInfo[];
  total: number;
}

export interface PluginStateResponse {
  plugin_id: string;
  is_enabled: boolean;
  message: string;
}

export function createPluginsApi(client: PixSimApiClient) {
  return {
    async getPlugins(options?: { family?: string; enabledOnly?: boolean }): Promise<PluginInfo[]> {
      const params: Record<string, string | boolean> = {};
      if (options?.family) params.family = options.family;
      if (options?.enabledOnly) params.enabled_only = true;

      const response = await client.get<PluginListResponse>('/plugins', {
        params: Object.keys(params).length ? params : undefined,
      });
      return response.plugins;
    },

    async getEnabledPlugins(family?: string): Promise<PluginInfo[]> {
      const response = await client.get<PluginListResponse>('/plugins/enabled/list', {
        params: family ? { family } : undefined,
      });
      return response.plugins;
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
  };
}


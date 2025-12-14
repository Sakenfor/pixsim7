/**
 * Plugin Catalog API Client
 *
 * API for managing UI plugin discovery and state.
 */
import { apiClient } from './client';

// ===== TYPES =====

export interface PluginMetadata {
  permissions: string[];
  surfaces: string[];
  default: boolean;
}

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

// ===== API FUNCTIONS =====

/**
 * Get all available plugins with user's enabled state
 */
export async function getPlugins(options?: {
  family?: string;
  enabledOnly?: boolean;
}): Promise<PluginInfo[]> {
  const params = new URLSearchParams();

  if (options?.family) {
    params.set('family', options.family);
  }
  if (options?.enabledOnly) {
    params.set('enabled_only', 'true');
  }

  const queryString = params.toString();
  const url = queryString ? `/plugins?${queryString}` : '/plugins';

  const response = await apiClient.get<PluginListResponse>(url);
  return response.data.plugins;
}

/**
 * Get only enabled plugins for the current user
 */
export async function getEnabledPlugins(family?: string): Promise<PluginInfo[]> {
  const params = family ? `?family=${family}` : '';
  const response = await apiClient.get<PluginListResponse>(`/plugins/enabled/list${params}`);
  return response.data.plugins;
}

/**
 * Get a single plugin by ID
 */
export async function getPlugin(pluginId: string): Promise<PluginInfo> {
  const response = await apiClient.get<PluginInfo>(`/plugins/${encodeURIComponent(pluginId)}`);
  return response.data;
}

/**
 * Enable a plugin for the current user
 */
export async function enablePlugin(pluginId: string): Promise<PluginStateResponse> {
  const response = await apiClient.post<PluginStateResponse>(
    `/plugins/${encodeURIComponent(pluginId)}/enable`
  );
  return response.data;
}

/**
 * Disable a plugin for the current user
 */
export async function disablePlugin(pluginId: string): Promise<PluginStateResponse> {
  const response = await apiClient.post<PluginStateResponse>(
    `/plugins/${encodeURIComponent(pluginId)}/disable`
  );
  return response.data;
}

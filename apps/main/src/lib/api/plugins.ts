/**
 * Plugin Catalog API Client (web wrapper)
 *
 * Delegates to environment-neutral domain client in @pixsim7/api-client.
 */
import { pixsimClient } from './client';
import { createPluginsApi } from '@pixsim7/api-client/domains';

export type {
  PluginMetadata,
  PluginInfo,
  PluginListResponse,
  PluginStateResponse,
} from '@pixsim7/api-client/domains';

const pluginsApi = createPluginsApi(pixsimClient);

export const getPlugins = pluginsApi.getPlugins;
export const getEnabledPlugins = pluginsApi.getEnabledPlugins;
export const getPlugin = pluginsApi.getPlugin;
export const enablePlugin = pluginsApi.enablePlugin;
export const disablePlugin = pluginsApi.disablePlugin;


/**
 * Plugin Catalog API Client (web wrapper)
 *
 * Delegates to environment-neutral domain client in @pixsim7/shared.api.client.
 */
import { createPluginsApi } from '@pixsim7/shared.api.client/domains';

import { pixsimClient } from './client';

export type {
  PluginMetadata,
  PluginInfo,
  PluginListResponse,
  PluginStateResponse,
  PluginSyncItem,
  PluginSyncRequest,
  PluginSyncResponse,
} from '@pixsim7/shared.api.client/domains';

const pluginsApi = createPluginsApi(pixsimClient);

export const getPlugins = pluginsApi.getPlugins;
export const getEnabledPlugins = pluginsApi.getEnabledPlugins;
export const getPlugin = pluginsApi.getPlugin;
export const enablePlugin = pluginsApi.enablePlugin;
export const disablePlugin = pluginsApi.disablePlugin;
export const syncPlugins = pluginsApi.syncPlugins;

/**
 * Discovery configurations for all plugin families
 *
 * This centralizes the discovery patterns for each plugin type,
 * making it easy to add new plugin families without duplicating logic.
 */

import type { PluginDiscoveryConfig } from './pluginSystem';

/**
 * Helper plugins discovery config
 *
 * Looks for registerXxxHelper functions in plugins/helpers/**
 */
export const helperDiscoveryConfig: PluginDiscoveryConfig = {
  family: 'helper',
  patterns: ['/src/plugins/helpers/**/*.{ts,tsx,js,jsx}'],
  origin: 'plugin-dir',
  extractionMode: 'named-export',
  exportPattern: 'register*Helper',
  eager: false,
};

/**
 * Interaction plugins discovery config
 *
 * Looks for objects with 'id' and 'execute' properties in plugins/interactions/**
 */
export const interactionDiscoveryConfig: PluginDiscoveryConfig = {
  family: 'interaction',
  patterns: ['/src/plugins/interactions/**/*.{ts,tsx,js,jsx}'],
  origin: 'plugin-dir',
  extractionMode: 'auto-detect',
  requiredProperties: ['id', 'execute'],
  eager: false,
};

/**
 * Gallery tool plugins discovery config
 *
 * Looks for registerXxxTool functions in plugins/galleryTools/**
 */
export const galleryToolDiscoveryConfig: PluginDiscoveryConfig = {
  family: 'gallery-tool',
  patterns: ['/src/plugins/galleryTools/**/*.{ts,tsx,js,jsx}'],
  origin: 'plugin-dir',
  extractionMode: 'named-export',
  exportPattern: 'register*Tool',
  eager: false,
};

/**
 * Node type plugins discovery config
 *
 * Looks for registerXxxNode functions in lib/plugins/**/*Node.{ts,tsx}
 */
export const nodeTypeDiscoveryConfig: PluginDiscoveryConfig = {
  family: 'node-type',
  patterns: ['/src/lib/plugins/**/*Node.{ts,tsx,js,jsx}'],
  origin: 'plugin-dir',
  extractionMode: 'named-export',
  exportPattern: 'register*Node',
  eager: false,
};

/**
 * World tool plugins discovery config
 *
 * Looks for objects with 'id' and 'render' properties in plugins/worldTools/**
 */
export const worldToolDiscoveryConfig: PluginDiscoveryConfig = {
  family: 'world-tool',
  patterns: ['/src/plugins/worldTools/**/*.{ts,tsx,js,jsx}'],
  origin: 'plugin-dir',
  extractionMode: 'auto-detect',
  requiredProperties: ['id', 'render'],
  eager: false,
};

/**
 * All discovery configurations
 */
export const allDiscoveryConfigs: PluginDiscoveryConfig[] = [
  helperDiscoveryConfig,
  interactionDiscoveryConfig,
  galleryToolDiscoveryConfig,
  nodeTypeDiscoveryConfig,
  worldToolDiscoveryConfig,
];

/**
 * Get discovery config by family
 */
export function getDiscoveryConfig(family: string): PluginDiscoveryConfig | undefined {
  return allDiscoveryConfigs.find(config => config.family === family);
}

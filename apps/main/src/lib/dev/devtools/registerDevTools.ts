/**
 * Register Dev Tools
 *
 * Central initialization for all built-in developer tools (registers in the plugin catalog).
 * This should be called once at app startup.
 *
 * Dev tools can be registered in two ways:
 * 1. Explicit definitions in `features/devtools/plugins/tools.ts`
 * 2. Auto-discovered from modules with `page.devTool` config
 *
 * See docs/PLUGIN_ARCHITECTURE.md for more details.
 */

import { devToolSelectors } from '@lib/plugins/catalogSelectors';
import { registerPluginDefinition } from '@lib/plugins/pluginRuntime';

import { builtInDevTools } from '@features/devtools';

import { moduleRegistry } from '@app/modules';

import type { DevToolDefinition } from './types';

/**
 * Register all built-in dev tools
 */
export async function registerDevTools(): Promise<void> {
  // 1. Register explicit tool definitions from plugins folder
  for (const tool of builtInDevTools) {
    if (!devToolSelectors.get(tool.id)) {
      await registerPluginDefinition({
        id: tool.id,
        family: 'dev-tool',
        origin: 'builtin',
        source: 'source',
        plugin: tool,
        canDisable: false,
      });
    }
  }

  // 2. Auto-register dev tools from modules with page.devTool config
  const modulesWithDevTools = moduleRegistry.getModulesWithDevTools();

  // Warn if called before modules are registered (common ordering mistake)
  if (modulesWithDevTools.length === 0 && moduleRegistry.list().length === 0) {
    console.warn(
      '[DevToolRegistry] registerDevTools() called before any modules are registered. ' +
        'Auto-discovered dev tools from page.devTool will not be available. ' +
        'Ensure registerModules() is called before registerDevTools().'
    );
  }

  for (const module of modulesWithDevTools) {
    const page = module.page!;
    const devToolConfig = page.devTool!;

    // Warn if devTool config lacks both panel component and route
    if (!devToolConfig.panelComponent && !page.route) {
      console.warn(
        `[DevToolRegistry] Module '${module.id}' has page.devTool but no panelComponent or route. ` +
          'The dev tool will not be usable.'
      );
    }

    // Use featureId as the dev tool id (canonical identifier), fallback to module.id
    const devToolId = page.featureId ?? module.id;

    // Skip if already registered (explicit definition takes precedence)
    if (devToolSelectors.get(devToolId)) {
      continue;
    }

    // Build DevToolDefinition from module + devTool config
    const devTool: DevToolDefinition = {
      id: devToolId,
      label: module.name,
      description: page.description,
      icon: page.icon,
      category: devToolConfig.category ?? 'misc',
      panelComponent: devToolConfig.panelComponent,
      routePath: page.route,
      tags: devToolConfig.tags,
      safeForNonDev: devToolConfig.safeForNonDev,
    };

    await registerPluginDefinition({
      id: devTool.id,
      family: 'dev-tool',
      origin: 'builtin',
      source: 'source',
      plugin: devTool,
      canDisable: false,
    });
  }

  console.log(`[DevToolRegistry] Registered ${devToolSelectors.getAll().length} dev tools`);
}

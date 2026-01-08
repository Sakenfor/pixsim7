/**
 * Register Dev Tools
 *
 * Central initialization for all built-in developer tools.
 * This should be called once at app startup.
 *
 * Dev tools can be registered in two ways:
 * 1. Explicit definitions in `features/devtools/plugins/tools.ts`
 * 2. Auto-discovered from modules with `page.devTool` config
 *
 * See docs/PLUGIN_ARCHITECTURE.md for more details.
 */

import { builtInDevTools } from '@features/devtools';

import { moduleRegistry } from '@app/modules';

import { devToolRegistry } from './devToolRegistry';
import type { DevToolDefinition } from './types';

/**
 * Register all built-in dev tools
 */
export function registerDevTools(): void {
  // 1. Register explicit tool definitions from plugins folder
  builtInDevTools.forEach(tool => {
    if (!devToolRegistry.get(tool.id)) {
      devToolRegistry.register(tool);
    }
  });

  // 2. Auto-register dev tools from modules with page.devTool config
  const modulesWithDevTools = moduleRegistry.getModulesWithDevTools();
  for (const module of modulesWithDevTools) {
    const page = module.page!;
    const devToolConfig = page.devTool!;

    // Use featureId as the dev tool id (canonical identifier), fallback to module.id
    const devToolId = page.featureId ?? module.id;

    // Skip if already registered (explicit definition takes precedence)
    if (devToolRegistry.get(devToolId)) {
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

    devToolRegistry.register(devTool);
  }

  console.log(`[DevToolRegistry] Registered ${devToolRegistry.getAll().length} dev tools`);
}

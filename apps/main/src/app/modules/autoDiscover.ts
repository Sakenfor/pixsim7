// Feature Module Auto-Discovery

import { isValidModule } from '@pixsim7/shared.modules.core';

import type { Module } from './contracts';
import { moduleRegistry } from './registry';

interface ModuleExport {
  default?: Module;
  [key: string]: Module | undefined;
}

// Import all feature modules using Vite's glob import (evaluated at build time)
const featureModuleImports = import.meta.glob<ModuleExport>(
  '../../features/*/module.ts',
  { eager: true }
);

export function getDiscoveredFeatureModules(): Module[] {
  const modules: Module[] = [];

  for (const [path, moduleExports] of Object.entries(featureModuleImports)) {
    const featureName = path.match(/features\/([^/]+)\/module\.ts/)?.[1] ?? 'unknown';
    const moduleExport = findModuleExport(moduleExports, featureName);

    if (moduleExport) {
      modules.push(moduleExport);
    } else {
      console.warn(`[autoDiscover] No valid module export found in ${featureName}/module.ts`);
    }
  }

  return modules;
}

/**
 * Find the module export from a module file.
 * Preferred order:
 * 1. Named export matching ${featureName}Module (convention)
 * 2. default export
 * 3. Any export ending in 'Module'
 * 4. Any valid module export (fallback)
 *
 * Warns when multiple valid exports exist to encourage single-export convention.
 */
function findModuleExport(exports: ModuleExport, featureName: string): Module | null {
  // Collect all valid module exports for warning detection
  const validExports: { name: string; module: Module }[] = [];
  for (const [name, value] of Object.entries(exports)) {
    if (value && isValidModule(value)) {
      validExports.push({ name, module: value });
    }
  }

  if (validExports.length === 0) {
    return null;
  }

  // Warn if multiple valid exports exist
  if (validExports.length > 1) {
    const exportNames = validExports.map((e) => e.name).join(', ');
    console.warn(
      `[autoDiscover] Multiple valid module exports in ${featureName}/module.ts: ${exportNames}. ` +
        `Prefer a single named export: ${featureName}Module`
    );
  }

  // 1. Prefer ${featureName}Module (convention)
  const conventionName = `${featureName}Module`;
  const conventionExport = validExports.find((e) => e.name === conventionName);
  if (conventionExport) {
    return conventionExport.module;
  }

  // 2. Try default export
  const defaultExport = validExports.find((e) => e.name === 'default');
  if (defaultExport) {
    return defaultExport.module;
  }

  // 3. Try any *Module export
  const moduleExport = validExports.find((e) => e.name.endsWith('Module'));
  if (moduleExport) {
    return moduleExport.module;
  }

  // 4. Fallback to first valid export
  return validExports[0].module;
}

export function registerDiscoveredFeatureModules(): void {
  const modules = getDiscoveredFeatureModules();
  modules.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  for (const mod of modules) {
    try {
      moduleRegistry.register(mod);
      console.log(`[autoDiscover] Registered: ${mod.name} (${mod.id})`);
    } catch (error) {
      console.error(`[autoDiscover] Failed to register ${mod.id}:`, error);
    }
  }

  console.log(`[autoDiscover] Registered ${modules.length} feature modules`);
}

export function getDiscoveredFeatureModuleIds(): string[] {
  return getDiscoveredFeatureModules().map((m) => m.id);
}

/**
 * Dev-only HMR entrypoint. When a feature's module.ts file is edited, Vite
 * re-executes this self-accepting boundary (rather than full-reloading the
 * page). We re-glob the modules, diff them against the registry by identity,
 * and hot-replace only the ones whose definition object actually changed.
 *
 * A live module that lacks a `cleanup` hook can't undo its `initialize()` side
 * effects, so hot re-init would duplicate them — for those we invalidate, which
 * bubbles to a full reload (and runs cleanupAll via vite:beforeFullReload).
 */
export function syncDiscoveredFeatureModulesForHmr(): void {
  const changed = getDiscoveredFeatureModules().filter(
    (mod) => moduleRegistry.get(mod.id) !== mod,
  );
  if (changed.length === 0) {
    return;
  }

  const ids = changed.map((m) => m.id).join(', ');
  const needsFullReload = changed.some((mod) => {
    const existing = moduleRegistry.get(mod.id);
    return existing != null && !existing.cleanup && moduleRegistry.isModuleInitialized(mod.id);
  });

  if (needsFullReload) {
    console.info(`[autoDiscover] HMR: ${ids} changed but a live module has no cleanup hook — full reload`);
    import.meta.hot?.invalidate();
    return;
  }

  console.info(`[autoDiscover] HMR: hot-replacing ${ids}`);
  void moduleRegistry.hotReplaceModules(changed);
}

if (import.meta.hot) {
  // Self-accepting boundary: a change to any glob-imported feature module
  // propagates here. Re-run discovery from the *new* module so the fresh glob
  // (with the edited module's new code) is used.
  import.meta.hot.accept((newModule) => {
    const next = newModule as unknown as
      | { syncDiscoveredFeatureModulesForHmr?: () => void }
      | undefined;
    next?.syncDiscoveredFeatureModulesForHmr?.();
  });
}

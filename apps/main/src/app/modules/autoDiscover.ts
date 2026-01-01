// Feature Module Auto-Discovery

import { moduleRegistry, type Module } from './types';

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
    const moduleExport = findModuleExport(moduleExports);

    if (moduleExport) {
      modules.push(moduleExport);
    } else {
      console.warn(`[autoDiscover] No valid module export found in ${featureName}/module.ts`);
    }
  }

  return modules;
}

function findModuleExport(exports: ModuleExport): Module | null {
  if (exports.default && isValidModule(exports.default)) {
    return exports.default;
  }

  for (const [name, value] of Object.entries(exports)) {
    if (name.endsWith('Module') && value && isValidModule(value)) {
      return value;
    }
  }

  for (const value of Object.values(exports)) {
    if (value && isValidModule(value)) {
      return value;
    }
  }

  return null;
}

function isValidModule(obj: unknown): obj is Module {
  if (!obj || typeof obj !== 'object') return false;
  const mod = obj as Record<string, unknown>;
  return typeof mod.id === 'string' && typeof mod.name === 'string';
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

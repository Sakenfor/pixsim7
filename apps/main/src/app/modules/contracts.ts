import type { DevToolCategory } from '@pixsim7/shared.devtools.core';
import type { ModuleDefinition } from '@pixsim7/shared.modules.core';
import type { BasePanelDefinition } from '@pixsim7/shared.ui.panels';

import type { FeatureCapability } from '@lib/capabilities';

export { PAGE_CATEGORIES } from '@pixsim7/shared.modules.core';
export type { PageCategory } from '@pixsim7/shared.modules.core';

type CapabilityCategory = FeatureCapability['category'];

export type Module = ModuleDefinition<BasePanelDefinition, DevToolCategory, CapabilityCategory>;

/**
 * Options accepted by {@link defineModule}.
 *
 * `updatedAt` / `changeNote` are inherited (optional) from `PluginMeta` via
 * `Module`. They surface in the App Map / plugin catalog when present, but are
 * no longer mandatory — the original hard requirement only produced frozen
 * boilerplate that nobody maintained.
 */
export type DefineModuleOptions<TModule extends Module = Module> = TModule;

/**
 * Helper for defining modules. Pass `updatedAt` / `changeNote` when a change is
 * worth surfacing in the App Map; otherwise omit them.
 */
export function defineModule<TModule extends Module>(
  options: DefineModuleOptions<TModule>
): TModule {
  return options;
}

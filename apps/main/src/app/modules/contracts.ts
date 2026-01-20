import type { DevToolCategory } from '@pixsim7/shared.devtools';
import type { ModuleDefinition } from '@pixsim7/shared.modules';
import type { BasePanelDefinition } from '@pixsim7/shared.ui.panels';

import type { FeatureCapability } from '@lib/capabilities';

export { PAGE_CATEGORIES } from '@pixsim7/shared.modules';
export type { PageCategory } from '@pixsim7/shared.modules';

type CapabilityCategory = FeatureCapability['category'];

export type Module = ModuleDefinition<BasePanelDefinition, DevToolCategory, CapabilityCategory>;

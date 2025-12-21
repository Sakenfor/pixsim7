import { BaseRegistry } from "@lib/core/BaseRegistry";
import type { PanelSettingsFormSchema } from "@features/panels";

export interface ComponentDefinition<TSettings = any> {
  id: string;
  title: string;
  description?: string;
  settingsForm?: PanelSettingsFormSchema;
  defaultSettings?: TSettings;
}

export class ComponentRegistry extends BaseRegistry<ComponentDefinition> {}

export const componentRegistry = new ComponentRegistry();

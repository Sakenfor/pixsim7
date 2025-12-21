import type { ReactNode } from "react";
import { BaseRegistry } from "@lib/core/BaseRegistry";

export type PanelSettingsScopeMode = "global" | "local";

export interface PanelSettingsScopeDefinition {
  id: string;
  label: string;
  description?: string;
  defaultMode?: PanelSettingsScopeMode;
  /**
   * Optional provider wrapper for enabling scope-specific overrides.
   * Used to apply local scope behavior without hard-coding panel types.
   */
  renderProvider?: (scopeId: string, children: ReactNode) => ReactNode;
}

export class PanelSettingsScopeRegistry extends BaseRegistry<PanelSettingsScopeDefinition> {}

export const panelSettingsScopeRegistry = new PanelSettingsScopeRegistry();

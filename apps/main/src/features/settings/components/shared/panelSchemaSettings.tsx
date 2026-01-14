import type { ComponentType } from 'react';

import type { PanelSettingsProps } from '@features/panels/lib/panelRegistry';

import { DynamicSettingsPanel } from './DynamicSettingsPanel';

export function createPanelSchemaSettingsSection(
  categoryId: string,
  tabId: string,
): ComponentType<PanelSettingsProps> {
  function SchemaSettingsSection() {
    return <DynamicSettingsPanel categoryId={categoryId} tabId={tabId} />;
  }

  return SchemaSettingsSection;
}

/**
 * Nodes Settings Module
 *
 * Settings for graph node behavior (video nodes, choice nodes, generation nodes, etc.).
 * Auto-generates tabs and sub-sections from node types that have settingsSchema defined.
 */

import { useMemo } from 'react';

import { getNodeTypesWithSettings } from '@lib/nodeSettings';

import { settingsRegistry, type SettingsSubSection } from '../../lib/core/registry';
import { registerNodeSettings } from '../../lib/schemas/nodes.settings';
import { DynamicSettingsPanel } from '../shared/DynamicSettingsPanel';

// Auto-register schema-based settings when module loads
registerNodeSettings();

/**
 * Create a settings component for a specific node type.
 */
function createNodeSettingsComponent(nodeTypeId: string) {
  return function NodeSettingsTab() {
    return (
      <div className="flex-1 overflow-auto p-4">
        <DynamicSettingsPanel categoryId="nodes" tabId={nodeTypeId} />
      </div>
    );
  };
}

/**
 * Get all node types with settings schemas and generate sub-sections.
 */
function getNodeSubSections(): SettingsSubSection[] {
  const nodeTypesWithSettings = getNodeTypesWithSettings();

  return nodeTypesWithSettings.map(nodeType => ({
    id: nodeType.id,
    label: nodeType.name,
    icon: nodeType.icon,
    component: createNodeSettingsComponent(nodeType.id),
  }));
}

/** Default component - shows first node type's settings or empty state */
export function NodesSettings() {
  const nodeTypesWithSettings = useMemo(
    () => getNodeTypesWithSettings(),
    []
  );

  if (nodeTypesWithSettings.length === 0) {
    return (
      <div className="flex-1 overflow-auto p-4 text-xs text-neutral-500">
        No node types with configurable settings found.
      </div>
    );
  }

  // Show first node type by default
  const firstNodeTypeId = nodeTypesWithSettings[0].id;
  return (
    <div className="flex-1 overflow-auto p-4">
      <DynamicSettingsPanel categoryId="nodes" tabId={firstNodeTypeId} />
    </div>
  );
}

// Build sub-sections dynamically from registry
const subSections = getNodeSubSections();

// Register this module with auto-generated sub-sections
settingsRegistry.register({
  id: 'nodes',
  label: 'Nodes',
  icon: '🔷',
  component: NodesSettings,
  order: 26, // After Widgets (25), before Library (35)
  subSections: subSections.length > 0 ? subSections : undefined,
});

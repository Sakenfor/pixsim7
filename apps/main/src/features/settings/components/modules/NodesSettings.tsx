/**
 * Nodes Settings Module (Bridge Pattern)
 *
 * Settings for graph node behavior (video nodes, choice nodes, generation nodes, etc.).
 * Auto-generates tabs and sub-sections from node types that have settingsSchema defined.
 * Uses DynamicSettingsPanel with schema from nodes.settings.tsx.
 *
 * NOTE: Schema registration is deferred to avoid circular dependency with nodeTypeRegistry.
 * The initial registration (no subSections) happens at import time. Once the component
 * mounts (after node types are registered), it re-registers with dynamic subSections.
 */

import { useEffect, useRef } from 'react';

import { getNodeTypesWithSettings } from '@lib/nodeSettings';

import { settingsRegistry, type SettingsSubSection } from '../../lib/core/registry';
import { registerNodeSettings } from '../../lib/schemas/nodes.settings';
import { DynamicSettingsPanel } from '../shared/DynamicSettingsPanel';

// Track if settings have been registered (deferred to avoid circular deps)
let nodeSettingsRegistered = false;

/** Factory: create a sub-section component for a specific node type */
function createNodeSettingsComponent(nodeTypeId: string) {
  return function NodeTypeSettings() {
    return (
      <div className="flex-1 overflow-auto p-4">
        <DynamicSettingsPanel categoryId="nodes" tabId={nodeTypeId} />
      </div>
    );
  };
}

/** Default component - shows first node type's settings or empty state */
export function NodesSettings() {
  const registeredRef = useRef(false);
  useEffect(() => {
    if (!nodeSettingsRegistered && !registeredRef.current) {
      registeredRef.current = true;
      nodeSettingsRegistered = true;

      // Register schema-based settings (tabs in settingsSchemaRegistry)
      registerNodeSettings();

      // Build sub-sections from discovered node types and re-register
      const nodeTypes = getNodeTypesWithSettings();
      if (nodeTypes.length > 0) {
        const subSections: SettingsSubSection[] = nodeTypes.map((nt) => ({
          id: nt.id,
          label: nt.name,
          icon: nt.icon,
          component: createNodeSettingsComponent(nt.id),
        }));

        settingsRegistry.register({
          id: 'nodes',
          label: 'Nodes',
          icon: '🔷',
          component: NodesSettings,
          order: 26,
          subSections,
        });
      }
    }
  }, []);

  const nodeTypes = getNodeTypesWithSettings();

  if (nodeTypes.length === 0) {
    return (
      <div className="flex-1 overflow-auto p-4 text-xs text-neutral-500">
        No node types with configurable settings found.
      </div>
    );
  }

  // Default view: show all node type tabs with internal navigation
  return <DynamicSettingsPanel categoryId="nodes" />;
}

// Initial registration (no subSections yet - node types aren't registered at import time)
settingsRegistry.register({
  id: 'nodes',
  label: 'Nodes',
  icon: '🔷',
  component: NodesSettings,
  order: 26,
});

/**
 * Nodes Settings Module (Bridge Pattern)
 *
 * Settings for graph node behavior (video nodes, choice nodes, generation nodes, etc.).
 * Auto-generates tabs and sub-sections from node types that have settingsSchema defined.
 * Uses DynamicSettingsPanel with schema from nodes.settings.tsx.
 *
 * NOTE: Schema registration is deferred to avoid circular dependency with nodeTypeRegistry.
 */

import { useMemo, useEffect, useRef } from 'react';

import { getNodeTypesWithSettings } from '@lib/nodeSettings';

import { settingsRegistry } from '../../lib/core/registry';
import { registerNodeSettings } from '../../lib/schemas/nodes.settings';
import { DynamicSettingsPanel } from '../shared/DynamicSettingsPanel';

// Track if settings have been registered (deferred to avoid circular deps)
let nodeSettingsRegistered = false;

/** Default component - shows first node type's settings or empty state */
export function NodesSettings() {
  // Deferred registration to avoid circular dependency with nodeTypeRegistry
  const registeredRef = useRef(false);
  useEffect(() => {
    if (!nodeSettingsRegistered && !registeredRef.current) {
      registeredRef.current = true;
      nodeSettingsRegistered = true;
      registerNodeSettings();
    }
  }, []);

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

// Register this module (sub-sections built dynamically inside component to avoid circular deps)
settingsRegistry.register({
  id: 'nodes',
  label: 'Nodes',
  icon: '🔷',
  component: NodesSettings,
  order: 26, // After Widgets (25), before Library (35)
  // Note: subSections not used here - component handles dynamic node type display
});

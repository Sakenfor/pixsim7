/**
 * Inspector Module System
 *
 * Provides a registration pattern for inspector panel tabs.
 * This is designed for the upcoming Model Inspector and other inspector panels.
 *
 * @example
 * ```ts
 * // Create a custom inspector module
 * import { createInspectorModule, registerInspectorTab } from './inspectorModule';
 *
 * const myInspectorModule = createInspectorModule({
 *   id: 'model-inspector',
 *   name: 'Model Inspector',
 *   tabs: [
 *     { id: 'transform', label: 'Transform', priority: 1, component: TransformTab },
 *     { id: 'materials', label: 'Materials', priority: 2, component: MaterialsTab },
 *   ],
 * });
 *
 * // Register with module registry
 * moduleRegistry.register(myInspectorModule);
 *
 * // Or register tabs dynamically
 * registerInspectorTab('model-inspector', {
 *   id: 'custom-tab',
 *   label: 'Custom',
 *   component: CustomTab,
 * });
 * ```
 */

import type { ConsoleModule } from '../moduleRegistry';

// =============================================================================
// Inspector Tab Types
// =============================================================================

/**
 * Inspector tab definition.
 */
export interface InspectorTab {
  /** Unique tab identifier */
  id: string;
  /** Display label */
  label: string;
  /** Optional icon (emoji or icon component) */
  icon?: string | React.ComponentType;
  /** Sort priority (lower = first) */
  priority?: number;
  /** Tab component to render */
  component: React.ComponentType<InspectorTabProps>;
  /** Whether tab is visible */
  visible?: boolean | (() => boolean);
  /** Whether tab is disabled */
  disabled?: boolean | (() => boolean);
}

/**
 * Props passed to inspector tab components.
 */
export interface InspectorTabProps {
  /** Currently selected object/entity ID */
  selectedId?: string | number;
  /** Selection type (e.g., 'npc', 'prop', 'model') */
  selectionType?: string;
  /** Read-only mode */
  readOnly?: boolean;
  /** Callback when changes are made */
  onUpdate?: (updates: Record<string, unknown>) => void;
}

/**
 * Inspector panel configuration.
 */
export interface InspectorConfig {
  /** Panel identifier */
  id: string;
  /** Panel display name */
  name: string;
  /** Panel description */
  description?: string;
  /** Initial tabs to register */
  tabs?: InspectorTab[];
  /** Default tab ID to show */
  defaultTabId?: string;
}

// =============================================================================
// Inspector Tab Registry
// =============================================================================

/** Map of inspector ID -> tabs */
const inspectorTabs = new Map<string, Map<string, InspectorTab>>();

/**
 * Register an inspector tab.
 *
 * @param inspectorId - ID of the inspector panel
 * @param tab - Tab definition
 */
export function registerInspectorTab(inspectorId: string, tab: InspectorTab): void {
  if (!inspectorTabs.has(inspectorId)) {
    inspectorTabs.set(inspectorId, new Map());
  }

  const tabs = inspectorTabs.get(inspectorId)!;
  if (tabs.has(tab.id)) {
    console.warn(`[Inspector] Tab "${tab.id}" already registered for "${inspectorId}"`);
    return;
  }

  tabs.set(tab.id, tab);
  console.debug(`[Inspector] Registered tab "${tab.id}" for "${inspectorId}"`);
}

/**
 * Unregister an inspector tab.
 *
 * @param inspectorId - ID of the inspector panel
 * @param tabId - Tab ID to remove
 */
export function unregisterInspectorTab(inspectorId: string, tabId: string): void {
  const tabs = inspectorTabs.get(inspectorId);
  if (tabs) {
    tabs.delete(tabId);
  }
}

/**
 * Get all tabs for an inspector, sorted by priority.
 *
 * @param inspectorId - ID of the inspector panel
 * @returns Sorted array of tabs
 */
export function getInspectorTabs(inspectorId: string): InspectorTab[] {
  const tabs = inspectorTabs.get(inspectorId);
  if (!tabs) return [];

  return Array.from(tabs.values())
    .filter((tab) => {
      if (typeof tab.visible === 'function') return tab.visible();
      return tab.visible !== false;
    })
    .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
}

/**
 * Get a specific tab.
 *
 * @param inspectorId - ID of the inspector panel
 * @param tabId - Tab ID
 * @returns Tab or undefined
 */
export function getInspectorTab(inspectorId: string, tabId: string): InspectorTab | undefined {
  return inspectorTabs.get(inspectorId)?.get(tabId);
}

/**
 * Clear all tabs for an inspector.
 *
 * @param inspectorId - ID of the inspector panel
 */
export function clearInspectorTabs(inspectorId: string): void {
  inspectorTabs.delete(inspectorId);
}

// =============================================================================
// Module Factory
// =============================================================================

/**
 * Create a console module for an inspector panel.
 *
 * @param config - Inspector configuration
 * @returns Console module
 */
export function createInspectorModule(config: InspectorConfig): ConsoleModule {
  return {
    id: config.id,
    name: config.name,
    description: config.description,
    dependencies: ['core'],

    register: () => {
      // Initialize tab registry
      if (!inspectorTabs.has(config.id)) {
        inspectorTabs.set(config.id, new Map());
      }

      // Register initial tabs
      if (config.tabs) {
        for (const tab of config.tabs) {
          registerInspectorTab(config.id, tab);
        }
      }

      console.debug(`[Inspector] Initialized "${config.id}" with ${config.tabs?.length ?? 0} tabs`);
    },

    unregister: () => {
      clearInspectorTabs(config.id);
      console.debug(`[Inspector] Cleared "${config.id}"`);
    },
  };
}

// =============================================================================
// Example: Model Inspector Module
// =============================================================================

/**
 * Placeholder component for Transform tab.
 */
const TransformTabPlaceholder: React.FC<InspectorTabProps> = ({ selectedId }) => {
  return null; // Placeholder - will be implemented
};

/**
 * Placeholder component for Materials tab.
 */
const MaterialsTabPlaceholder: React.FC<InspectorTabProps> = ({ selectedId }) => {
  return null; // Placeholder - will be implemented
};

/**
 * Placeholder component for Animation tab.
 */
const AnimationTabPlaceholder: React.FC<InspectorTabProps> = ({ selectedId }) => {
  return null; // Placeholder - will be implemented
};

/**
 * Example Model Inspector module.
 *
 * This demonstrates the pattern for creating inspector modules.
 * The actual implementation will replace placeholder components.
 *
 * @example
 * ```ts
 * import { moduleRegistry } from '@lib/console';
 * import { modelInspectorModule } from './inspectorModule';
 *
 * // Register the model inspector
 * moduleRegistry.register(modelInspectorModule);
 *
 * // Later, get tabs for rendering
 * const tabs = getInspectorTabs('model-inspector');
 * ```
 */
export const modelInspectorModule = createInspectorModule({
  id: 'model-inspector',
  name: 'Model Inspector',
  description: 'Inspector panel for 3D model properties (transform, materials, animation)',
  tabs: [
    {
      id: 'transform',
      label: 'Transform',
      icon: '📐',
      priority: 1,
      component: TransformTabPlaceholder,
    },
    {
      id: 'materials',
      label: 'Materials',
      icon: '🎨',
      priority: 2,
      component: MaterialsTabPlaceholder,
    },
    {
      id: 'animation',
      label: 'Animation',
      icon: '🎬',
      priority: 3,
      component: AnimationTabPlaceholder,
    },
  ],
  defaultTabId: 'transform',
});

// =============================================================================
// React Hook for Inspector Tabs
// =============================================================================

import { useSyncExternalStore, useCallback } from 'react';

// Simple event system for tab changes
type Listener = () => void;
const listeners = new Set<Listener>();

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyListeners(): void {
  listeners.forEach((l) => l());
}

// Wrap register/unregister to notify
const originalRegister = registerInspectorTab;
(registerInspectorTab as any) = (inspectorId: string, tab: InspectorTab) => {
  originalRegister(inspectorId, tab);
  notifyListeners();
};

const originalUnregister = unregisterInspectorTab;
(unregisterInspectorTab as any) = (inspectorId: string, tabId: string) => {
  originalUnregister(inspectorId, tabId);
  notifyListeners();
};

/**
 * React hook to get inspector tabs with automatic re-render on changes.
 *
 * @param inspectorId - ID of the inspector panel
 * @returns Array of tabs
 *
 * @example
 * ```tsx
 * function ModelInspector() {
 *   const tabs = useInspectorTabs('model-inspector');
 *   const [activeTabId, setActiveTabId] = useState(tabs[0]?.id);
 *
 *   return (
 *     <div>
 *       <div className="tabs">
 *         {tabs.map(tab => (
 *           <button key={tab.id} onClick={() => setActiveTabId(tab.id)}>
 *             {tab.icon} {tab.label}
 *           </button>
 *         ))}
 *       </div>
 *       <div className="tab-content">
 *         {tabs.map(tab => (
 *           activeTabId === tab.id && <tab.component key={tab.id} />
 *         ))}
 *       </div>
 *     </div>
 *   );
 * }
 * ```
 */
export function useInspectorTabs(inspectorId: string): InspectorTab[] {
  const getSnapshot = useCallback(() => {
    return getInspectorTabs(inspectorId);
  }, [inspectorId]);

  // useSyncExternalStore for proper React 18 concurrent mode support
  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot // Server snapshot (same for now)
  );
}

// Re-export types
export type { ConsoleModule };

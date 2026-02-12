/**
 * Plugin Manager UI Component
 *
 * Shows all plugins from the unified plugin catalog (Vite-discovered + backend).
 * Allows users to view plugin details and toggle activation state.
 */

import type {
  PluginFamily,
  PluginCapabilityHints,
  ExtendedPluginMetadata,
} from '@pixsim7/shared.plugins';
import { CAPABILITY_LABELS } from '@pixsim7/shared.plugins';
import { Button, Panel, Badge } from '@pixsim7/shared.ui';
import { useState, useSyncExternalStore, useMemo, useCallback, useRef } from 'react';

import { Icon } from '@lib/icons';
import { pluginCatalog, pluginActivationManager, pluginSettingsRegistry } from '@lib/plugins';
import type { SettingGroup, SettingStoreAdapter } from '@lib/settingsSchema/types';

import { SettingFieldRenderer } from '@features/settings/components/shared/SettingFieldRenderer';


import { usePluginConfigStoreInternal } from '@/stores/pluginConfigStore';

// ===== Hooks =====

function useCatalogPlugins() {
  const versionRef = useRef(0);
  const snapshotRef = useRef<{ version: number; value: ExtendedPluginMetadata[] }>({
    version: -1,
    value: [],
  });

  const subscribe = useCallback((onStoreChange: () => void) => {
    return pluginCatalog.subscribe(() => {
      versionRef.current += 1;
      onStoreChange();
    });
  }, []);

  const getSnapshot = useCallback(() => {
    if (snapshotRef.current.version !== versionRef.current) {
      snapshotRef.current = {
        version: versionRef.current,
        value: pluginCatalog.getAll(),
      };
    }
    return snapshotRef.current.value;
  }, []);

  const plugins = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot,
  );
  return plugins;
}

function usePluginSettingsSchema(pluginId: string): SettingGroup[] | undefined {
  const versionRef = useRef(0);
  const snapshotRef = useRef<{ version: number; value: SettingGroup[] | undefined }>({
    version: -1,
    value: undefined,
  });

  const subscribe = useCallback((onStoreChange: () => void) => {
    return pluginSettingsRegistry.subscribe(() => {
      versionRef.current += 1;
      onStoreChange();
    });
  }, []);

  const getSnapshot = useCallback(() => {
    if (snapshotRef.current.version !== versionRef.current) {
      snapshotRef.current = {
        version: versionRef.current,
        value: pluginSettingsRegistry.get(pluginId),
      };
    }
    return snapshotRef.current.value;
   
  }, [pluginId]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

const EMPTY_CONFIG: Record<string, any> = {};

function usePluginConfigStoreAdapter(pluginId: string): SettingStoreAdapter {
  const configs = usePluginConfigStoreInternal(
    useCallback((s: { configs: Record<string, Record<string, any>> }) => s.configs[pluginId] ?? EMPTY_CONFIG, [pluginId]),
  );
  const setConfig = usePluginConfigStoreInternal(s => s.setConfig);

  return useMemo(() => ({
    get: (fieldId: string) => configs[fieldId],
    set: (fieldId: string, value: any) => setConfig(pluginId, { [fieldId]: value }),
    getAll: () => configs,
  }), [configs, setConfig, pluginId]);
}

// ===== Families for display grouping =====

const FAMILY_LABELS: Partial<Record<PluginFamily, string>> = {
  'gallery-tool': 'Gallery Tools',
  'world-tool': 'World Tools',
  'brain-tool': 'Brain Tools',
  'helper': 'Helpers',
  'interaction': 'Interactions',
  'scene-view': 'Scene Views',
  'control-center': 'Control Center',
  'ui-plugin': 'UI Plugins',
  'generation-ui': 'Generation UI',
  'node-type': 'Node Types',
  'renderer': 'Renderers',
  'graph-editor': 'Graph Editors',
  'workspace-panel': 'Workspace Panels',
  'dock-widget': 'Dock Widgets',
  'gizmo-surface': 'Gizmo Surfaces',
  'panel-group': 'Panel Groups',
  'dev-tool': 'Dev Tools',
};

// ===== Family metadata field labels =====

const FAMILY_FIELD_LABELS: Partial<Record<string, string>> = {
  sceneViewId: 'Scene View ID',
  surfaces: 'Surfaces',
  default: 'Default',
  controlCenterId: 'Control Center ID',
  displayName: 'Display Name',
  preview: 'Preview',
  features: 'Features',
  scope: 'Scope',
  userCreatable: 'User Creatable',
  preloadPriority: 'Preload Priority',
  nodeType: 'Node Type',
  storeId: 'Store ID',
  supportsMultiScene: 'Multi-Scene',
  supportsWorldContext: 'World Context',
  supportsPlayback: 'Playback',
  panelId: 'Panel ID',
  supportsCompactMode: 'Compact Mode',
  supportsMultipleInstances: 'Multiple Instances',
  widgetId: 'Widget ID',
  dockviewId: 'Dockview ID',
  presetScope: 'Preset Scope',
  panelScope: 'Panel Scope',
  storageKey: 'Storage Key',
  allowedPanels: 'Allowed Panels',
  defaultPanels: 'Default Panels',
  gizmoSurfaceId: 'Gizmo Surface ID',
  supportsContexts: 'Supported Contexts',
  groupId: 'Group ID',
  slots: 'Slots',
  presets: 'Presets',
  defaultScopes: 'Default Scopes',
  hasOverlays: 'Has Overlays',
  hasMenuItems: 'Has Menu Items',
  pluginType: 'Plugin Type',
  bundleFamily: 'Bundle Family',
  providerId: 'Provider ID',
  operations: 'Operations',
  priority: 'Priority',
  category: 'Category',
  icon: 'Icon',
};

/** Keys from PluginMetadata that should not be shown in family metadata */
const BASE_METADATA_KEYS = new Set([
  'id', 'name', 'family', 'origin', 'activationState', 'canDisable',
  'version', 'description', 'author', 'icon', 'tags', 'capabilities',
  'providesFeatures', 'consumesFeatures', 'consumesActions', 'consumesState',
  'experimental', 'deprecated', 'deprecationMessage', 'replaces', 'configurable',
]);

// ===== Component =====

export function PluginManagerUI() {
  const allPlugins = useCatalogPlugins();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [familyFilter, setFamilyFilter] = useState<string | null>(null);

  // Sorted plugins, optionally filtered by family
  const plugins = useMemo(() => {
    let list = [...allPlugins];
    if (familyFilter) {
      list = list.filter(p => p.family === familyFilter);
    }
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [allPlugins, familyFilter]);

  // Available families for filter
  const families = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of allPlugins) {
      counts.set(p.family, (counts.get(p.family) || 0) + 1);
    }
    return Array.from(counts.entries())
      .sort(([a], [b]) => a.localeCompare(b));
  }, [allPlugins]);

  const selected = plugins.find(p => p.id === selectedId);
  const summary = pluginCatalog.getSummary();

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Plugin Manager</h1>
        <div className="text-sm text-neutral-500">
          {summary.total} plugins ({summary.active} active)
        </div>
      </div>

      {/* Family filter */}
      {families.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            className={`px-2 py-1 text-xs rounded border transition-colors ${
              !familyFilter
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 hover:border-blue-400'
            }`}
            onClick={() => setFamilyFilter(null)}
          >
            All ({allPlugins.length})
          </button>
          {families.map(([family, count]) => (
            <button
              key={family}
              className={`px-2 py-1 text-xs rounded border transition-colors ${
                familyFilter === family
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 hover:border-blue-400'
              }`}
              onClick={() => setFamilyFilter(family)}
            >
              {FAMILY_LABELS[family as PluginFamily] ?? family} ({count})
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Plugin List */}
        <Panel className="lg:col-span-1 space-y-3 max-h-[75vh] overflow-y-auto">
          <h2 className="text-sm font-semibold">
            {familyFilter
              ? `${FAMILY_LABELS[familyFilter as PluginFamily] ?? familyFilter} (${plugins.length})`
              : `All Plugins (${plugins.length})`}
          </h2>
          {plugins.length === 0 ? (
            <p className="text-xs text-neutral-500">No plugins found</p>
          ) : (
            <div className="space-y-2">
              {plugins.map(plugin => (
                <button
                  key={plugin.id}
                  className={`w-full text-left px-3 py-2 rounded border transition-colors ${
                    selectedId === plugin.id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 hover:border-blue-400'
                  }`}
                  onClick={() => setSelectedId(plugin.id)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium truncate">
                      {plugin.icon && <Icon name={plugin.icon as string} size={14} className="mr-1.5" />}
                      {plugin.name}
                    </span>
                    <Badge
                      color={plugin.activationState === 'active' ? 'green' : 'gray'}
                      className="text-[10px] ml-2 shrink-0"
                    >
                      {plugin.activationState}
                    </Badge>
                  </div>
                  <p className={`text-xs truncate ${
                    selectedId === plugin.id ? 'text-blue-200' : 'text-neutral-500'
                  }`}>
                    {plugin.family}
                    {plugin.origin !== 'builtin' && ` · ${plugin.origin}`}
                  </p>
                </button>
              ))}
            </div>
          )}
        </Panel>

        {/* Plugin Details */}
        <Panel className="lg:col-span-2 space-y-3 max-h-[75vh] overflow-y-auto">
          {selected ? (
            <PluginDetails plugin={selected} />
          ) : (
            <div className="flex items-center justify-center h-64 text-neutral-500">
              Select a plugin to view details
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

// ===== Detail Sections =====

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
      {children}
    </h3>
  );
}

function PluginDetails({ plugin }: { plugin: ExtendedPluginMetadata }) {
  const canToggle = pluginCatalog.canDisable(plugin.id);
  const isActive = plugin.activationState === 'active';

  const handleToggle = () => {
    pluginActivationManager.toggle(plugin.id);
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {plugin.icon && <Icon name={plugin.icon as string} size={16} className="mr-2" />}
          {plugin.name}
        </h2>
        {canToggle && (
          <Button
            size="sm"
            variant={isActive ? 'secondary' : 'primary'}
            onClick={handleToggle}
          >
            {isActive ? 'Deactivate' : 'Activate'}
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {plugin.description && (
          <div>
            <SectionHeading>Description</SectionHeading>
            <p className="text-sm">{plugin.description}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <SectionHeading>Family</SectionHeading>
            <p>{FAMILY_LABELS[plugin.family] ?? plugin.family}</p>
          </div>
          <div>
            <SectionHeading>Origin</SectionHeading>
            <p className="capitalize">{plugin.origin}</p>
          </div>
          {plugin.version && (
            <div>
              <SectionHeading>Version</SectionHeading>
              <p>{plugin.version}</p>
            </div>
          )}
          {plugin.author && (
            <div>
              <SectionHeading>Author</SectionHeading>
              <p>{plugin.author}</p>
            </div>
          )}
          <div>
            <SectionHeading>State</SectionHeading>
            <Badge color={isActive ? 'green' : 'gray'}>
              {plugin.activationState}
            </Badge>
          </div>
          <div>
            <SectionHeading>Can Disable</SectionHeading>
            <p>{canToggle ? 'Yes' : 'No (required)'}</p>
          </div>
        </div>

        {plugin.tags && plugin.tags.length > 0 && (
          <div>
            <SectionHeading>Tags</SectionHeading>
            <div className="flex flex-wrap gap-1">
              {plugin.tags.map(tag => (
                <Badge key={tag} color="blue" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {plugin.providesFeatures && plugin.providesFeatures.length > 0 && (
          <div>
            <SectionHeading>Provides</SectionHeading>
            <div className="flex flex-wrap gap-1">
              {plugin.providesFeatures.map(f => (
                <Badge key={f} color="green" className="text-xs">
                  {f}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Capabilities */}
        <CapabilitiesSection capabilities={plugin.capabilities} />

        {/* Dependencies */}
        <DependenciesSection plugin={plugin} />

        {/* Family-specific metadata */}
        <FamilyMetadataSection plugin={plugin} />

        {plugin.experimental && (
          <Badge color="yellow" className="text-xs">Experimental</Badge>
        )}

        {plugin.deprecated && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded p-3">
            <p className="text-sm text-yellow-700 dark:text-yellow-400">
              Deprecated{plugin.deprecationMessage ? `: ${plugin.deprecationMessage}` : ''}
            </p>
          </div>
        )}

        {/* Inline settings */}
        <PluginSettingsSection pluginId={plugin.id} />
      </div>
    </>
  );
}

function CapabilitiesSection({ capabilities }: { capabilities?: PluginCapabilityHints }) {
  if (!capabilities) return null;

  const entries = Object.entries(capabilities).filter(
    ([key, value]) => value !== undefined && value !== false && key !== 'providerId',
  ) as [keyof PluginCapabilityHints, boolean | string][];

  if (entries.length === 0) return null;

  return (
    <div>
      <SectionHeading>Capabilities</SectionHeading>
      <div className="flex flex-wrap gap-1">
        {entries.map(([key, value]) => {
          if (typeof value === 'string') return null;
          return (
            <Badge
              key={key}
              color={key === 'hasRisk' ? 'yellow' : 'purple'}
              className="text-xs"
            >
              {CAPABILITY_LABELS[key] ?? key}
            </Badge>
          );
        })}
      </div>
      {capabilities.providerId && (
        <p className="text-xs text-neutral-500 mt-1">
          Provider: <span className="font-mono">{capabilities.providerId}</span>
        </p>
      )}
    </div>
  );
}

function DependenciesSection({ plugin }: { plugin: ExtendedPluginMetadata }) {
  const { consumesFeatures, consumesActions, consumesState, replaces } = plugin;
  const hasAny =
    (consumesFeatures && consumesFeatures.length > 0) ||
    (consumesActions && consumesActions.length > 0) ||
    (consumesState && consumesState.length > 0) ||
    replaces;

  if (!hasAny) return null;

  return (
    <div>
      <SectionHeading>Dependencies</SectionHeading>
      <div className="space-y-1.5 text-xs">
        {consumesFeatures && consumesFeatures.length > 0 && (
          <div>
            <span className="text-neutral-500">Consumes features: </span>
            <span className="font-mono">{consumesFeatures.join(', ')}</span>
          </div>
        )}
        {consumesActions && consumesActions.length > 0 && (
          <div>
            <span className="text-neutral-500">Consumes actions: </span>
            <span className="font-mono">{consumesActions.join(', ')}</span>
          </div>
        )}
        {consumesState && consumesState.length > 0 && (
          <div>
            <span className="text-neutral-500">Consumes state: </span>
            <span className="font-mono">{consumesState.join(', ')}</span>
          </div>
        )}
        {replaces && (
          <div>
            <span className="text-neutral-500">Replaces: </span>
            <span className="font-mono">{replaces}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function FamilyMetadataSection({ plugin }: { plugin: ExtendedPluginMetadata }) {
  // Extract family-specific fields by filtering out base PluginMetadata keys
  const extensionEntries = Object.entries(plugin).filter(
    ([key, value]) => !BASE_METADATA_KEYS.has(key) && value !== undefined,
  );

  if (extensionEntries.length === 0) return null;

  return (
    <div>
      <SectionHeading>{FAMILY_LABELS[plugin.family] ?? plugin.family} Details</SectionHeading>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        {extensionEntries.map(([key, value]) => (
          <div key={key}>
            <span className="text-neutral-500">{FAMILY_FIELD_LABELS[key] ?? key}: </span>
            <span className="font-mono">{formatMetadataValue(value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatMetadataValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return String(value);
}

function PluginSettingsSection({ pluginId }: { pluginId: string }) {
  const schema = usePluginSettingsSchema(pluginId);
  const store = usePluginConfigStoreAdapter(pluginId);

  if (!schema || schema.length === 0) return null;

  const allValues = store.getAll();

  return (
    <div className="border-t border-neutral-200 dark:border-neutral-700 pt-3">
      <SectionHeading>Settings</SectionHeading>
      <div className="space-y-4">
        {schema.map(group => {
          if (group.showWhen && !group.showWhen(allValues)) return null;
          return (
            <div key={group.id} className="space-y-2">
              {group.title && (
                <p className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                  {group.title}
                </p>
              )}
              {group.description && (
                <p className="text-[10px] text-neutral-500">{group.description}</p>
              )}
              <div className="space-y-2">
                {group.fields.map(field => (
                  <SettingFieldRenderer
                    key={field.id}
                    field={field}
                    value={store.get(field.id)}
                    onChange={(v) => store.set(field.id, v)}
                    allValues={allValues}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

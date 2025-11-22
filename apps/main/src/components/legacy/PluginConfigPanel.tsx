/**
 * Plugin Configuration Panel
 *
 * Displays and allows configuration of helper and interaction plugins.
 * Shows metadata (name, description, category, version, tags, experimental status)
 * and provides UI controls for configurable options.
 */

import { useState, useEffect } from 'react';
import {
  sessionHelperRegistry,
  interactionRegistry,
  type HelperDefinition,
  type InteractionPlugin,
  type ConfigField,
  type InteractionCapabilities,
} from '../lib/registries';
import {
  pluginConfigStore,
  getPluginConfigWithDefaults,
  setPluginConfig,
  resetPluginConfig,
  togglePluginEnabled,
  isPluginEnabled,
} from '../stores/pluginConfigStore';
import { pluginCatalog, type PluginOrigin } from '../lib/plugins/pluginSystem';

type PluginType = 'helper' | 'interaction';

interface PluginInfo {
  type: PluginType;
  id: string;
  name: string;
  description?: string;
  category?: string;
  version?: string;
  tags?: string[];
  experimental?: boolean;
  configFields?: ConfigField[];
  defaultConfig?: Record<string, any>;
  origin?: PluginOrigin;
  capabilities?: InteractionCapabilities;
  hasCustomConfig?: boolean;
}

export function PluginConfigPanel() {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(null);
  const [configs, setConfigs] = useState<Record<string, Record<string, any>>>({});
  const [filter, setFilter] = useState<'all' | 'helpers' | 'interactions'>('all');
  const [originFilter, setOriginFilter] = useState<'all' | PluginOrigin>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Load plugins from registries
  useEffect(() => {
    loadPlugins();

    // Subscribe to config store changes
    const unsubscribe = pluginConfigStore.subscribe(($configs) => {
      setConfigs($configs);
    });

    return () => unsubscribe();
  }, []);

  // Reload plugins when configs change (to update hasCustomConfig)
  useEffect(() => {
    loadPlugins();
  }, [configs]);

  const loadPlugins = () => {
    const allPlugins: PluginInfo[] = [];

    // Load helpers
    const helpers = sessionHelperRegistry.getAll();
    helpers.forEach((helper: HelperDefinition) => {
      const configFields = helper.configSchema
        ? Object.values(helper.configSchema)
        : [];

      const pluginId = helper.id || helper.name;
      const catalogEntry = pluginCatalog.get(pluginId);
      const hasCustomConfig = configs[pluginId] && Object.keys(configs[pluginId]).length > 0;

      allPlugins.push({
        type: 'helper',
        id: pluginId,
        name: helper.name,
        description: helper.description,
        category: helper.category,
        version: helper.version,
        tags: helper.tags,
        experimental: helper.experimental,
        configFields,
        defaultConfig: helper.configSchema
          ? Object.fromEntries(
              Object.entries(helper.configSchema).map(([key, field]) => [
                key,
                field.default,
              ])
            )
          : undefined,
        origin: catalogEntry?.origin || 'builtin',
        hasCustomConfig,
      });
    });

    // Load interactions
    const interactions = interactionRegistry.getAll();
    interactions.forEach((plugin: InteractionPlugin<any>) => {
      const configFields = plugin.configFields || [];
      const catalogEntry = pluginCatalog.get(plugin.id);
      const hasCustomConfig = configs[plugin.id] && Object.keys(configs[plugin.id]).length > 0;

      allPlugins.push({
        type: 'interaction',
        id: plugin.id,
        name: plugin.name,
        description: plugin.description,
        category: plugin.category,
        version: plugin.version,
        tags: plugin.tags,
        experimental: plugin.experimental,
        configFields,
        defaultConfig: plugin.defaultConfig,
        origin: catalogEntry?.origin || 'builtin',
        capabilities: plugin.capabilities,
        hasCustomConfig,
      });
    });

    setPlugins(allPlugins);
  };

  // Filter plugins based on type, origin, and search
  const filteredPlugins = plugins.filter((plugin) => {
    // Type filter
    if (filter !== 'all' && plugin.type !== filter.slice(0, -1)) return false;

    // Origin filter
    if (originFilter !== 'all' && plugin.origin !== originFilter) return false;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        plugin.name.toLowerCase().includes(query) ||
        plugin.description?.toLowerCase().includes(query) ||
        plugin.category?.toLowerCase().includes(query) ||
        plugin.tags?.some((tag) => tag.toLowerCase().includes(query))
      );
    }
    return true;
  });

  const selectedPlugin = plugins.find((p) => p.id === selectedPluginId);

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Plugin Configuration</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
            Configure helpers and interaction plugins
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-neutral-600 dark:text-neutral-400">
            {filteredPlugins.length} plugin{filteredPlugins.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                filter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('helpers')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                filter === 'helpers'
                  ? 'bg-blue-600 text-white'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
              }`}
            >
              Helpers
            </button>
            <button
              onClick={() => setFilter('interactions')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                filter === 'interactions'
                  ? 'bg-blue-600 text-white'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
              }`}
            >
              Interactions
            </button>
          </div>
          <div className="h-6 w-px bg-neutral-300 dark:bg-neutral-700" />
          <div className="flex gap-2">
            <button
              onClick={() => setOriginFilter('all')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                originFilter === 'all'
                  ? 'bg-purple-600 text-white'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
              }`}
            >
              All Sources
            </button>
            <button
              onClick={() => setOriginFilter('builtin')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                originFilter === 'builtin'
                  ? 'bg-purple-600 text-white'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
              }`}
            >
              Builtin
            </button>
            <button
              onClick={() => setOriginFilter('plugin-dir')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                originFilter === 'plugin-dir'
                  ? 'bg-purple-600 text-white'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
              }`}
            >
              Plugins
            </button>
            <button
              onClick={() => setOriginFilter('dev-project')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                originFilter === 'dev-project'
                  ? 'bg-purple-600 text-white'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
              }`}
            >
              Dev
            </button>
          </div>
          <input
            type="text"
            placeholder="Search plugins..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 px-3 py-1.5 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Plugin List */}
        <div className="lg:col-span-1 space-y-2 max-h-[70vh] overflow-y-auto">
          {filteredPlugins.length === 0 ? (
            <div className="text-center py-8 text-neutral-500">
              {searchQuery ? 'No plugins match your search' : 'No plugins found'}
            </div>
          ) : (
            filteredPlugins.map((plugin) => (
              <PluginListItem
                key={plugin.id}
                plugin={plugin}
                selected={selectedPluginId === plugin.id}
                enabled={isPluginEnabled(plugin.id)}
                onClick={() => setSelectedPluginId(plugin.id)}
                onToggle={() => togglePluginEnabled(plugin.id)}
              />
            ))
          )}
        </div>

        {/* Plugin Details & Config */}
        <div className="lg:col-span-2">
          {selectedPlugin ? (
            <PluginDetailPanel plugin={selectedPlugin} config={configs[selectedPlugin.id] || {}} />
          ) : (
            <div className="bg-neutral-50 dark:bg-neutral-800 rounded-lg border border-neutral-300 dark:border-neutral-700 p-8 flex items-center justify-center h-full">
              <p className="text-neutral-500">Select a plugin to view details and configure</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PluginListItem({
  plugin,
  selected,
  enabled,
  onClick,
  onToggle,
}: {
  plugin: PluginInfo;
  selected: boolean;
  enabled: boolean;
  onClick: () => void;
  onToggle: () => void;
}) {
  // Format origin label
  const getOriginLabel = (origin?: PluginOrigin): string => {
    if (!origin) return 'Builtin';
    switch (origin) {
      case 'builtin': return 'Builtin';
      case 'plugin-dir': return 'Plugin';
      case 'dev-project': return 'Dev';
      case 'ui-bundle': return 'UI Bundle';
      default: return origin;
    }
  };

  // Format kind label
  const getKindLabel = (type: PluginType): string => {
    return type === 'helper' ? 'Helper' : 'Interaction';
  };

  // Get capability badges for interactions
  const getCapabilityBadges = () => {
    if (plugin.type !== 'interaction' || !plugin.capabilities) return null;

    const badges: Array<{ label: string; icon: string; color: string }> = [];

    if (plugin.capabilities.opensDialogue) {
      badges.push({ label: 'Dialogue', icon: '💬', color: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400' });
    }
    if (plugin.capabilities.modifiesInventory) {
      badges.push({ label: 'Inventory', icon: '🎒', color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' });
    }
    if (plugin.capabilities.affectsRelationship) {
      badges.push({ label: 'Relationship', icon: '💕', color: 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400' });
    }
    if (plugin.capabilities.hasRisk) {
      badges.push({ label: 'Risk', icon: '⚠️', color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' });
    }
    if (plugin.capabilities.canBeDetected) {
      badges.push({ label: 'Stealth', icon: '👁️', color: 'bg-slate-100 dark:bg-slate-900/30 text-slate-700 dark:text-slate-400' });
    }

    return badges.length > 0 ? badges : null;
  };

  const capabilityBadges = getCapabilityBadges();

  return (
    <div
      onClick={onClick}
      className={`relative p-3 rounded-lg border cursor-pointer transition-all ${
        selected
          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500'
          : 'bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 hover:border-blue-400'
      }`}
    >
      <div className="flex items-start justify-between mb-1">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-medium">{plugin.name}</h3>
            {plugin.experimental && (
              <span className="text-xs px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded">
                BETA
              </span>
            )}
            {plugin.hasCustomConfig && (
              <span className="text-xs px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded font-medium">
                ⚙️ Custom
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {/* Kind Badge */}
            <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded font-medium">
              {getKindLabel(plugin.type)}
            </span>
            {/* Origin Badge */}
            <span className="text-xs px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded font-medium">
              {getOriginLabel(plugin.origin)}
            </span>
            {/* Capability Badges */}
            {capabilityBadges && capabilityBadges.map((badge) => (
              <span
                key={badge.label}
                className={`text-xs px-1.5 py-0.5 rounded font-medium ${badge.color}`}
                title={badge.label}
              >
                {badge.icon}
              </span>
            ))}
          </div>
          {plugin.category && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              {plugin.category}
            </p>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            enabled
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
              : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400'
          }`}
        >
          {enabled ? 'ON' : 'OFF'}
        </button>
      </div>
      {plugin.version && (
        <p className="text-xs text-neutral-400 dark:text-neutral-500">v{plugin.version}</p>
      )}
    </div>
  );
}

function PluginDetailPanel({
  plugin,
  config,
}: {
  plugin: PluginInfo;
  config: Record<string, any>;
}) {
  const currentConfig = plugin.defaultConfig
    ? getPluginConfigWithDefaults(plugin.id, plugin.defaultConfig)
    : config;

  const handleConfigChange = (key: string, value: any) => {
    setPluginConfig(plugin.id, { [key]: value });
  };

  const handleReset = () => {
    if (confirm(`Reset ${plugin.name} to default configuration?`)) {
      resetPluginConfig(plugin.id, plugin.defaultConfig);
    }
  };

  // Format origin label
  const getOriginLabel = (origin?: PluginOrigin): string => {
    if (!origin) return 'Builtin';
    switch (origin) {
      case 'builtin': return 'Builtin';
      case 'plugin-dir': return 'Plugin';
      case 'dev-project': return 'Dev';
      case 'ui-bundle': return 'UI Bundle';
      default: return origin;
    }
  };

  // Get capability badges for interactions
  const getCapabilityBadges = () => {
    if (plugin.type !== 'interaction' || !plugin.capabilities) return null;

    const badges: Array<{ label: string; icon: string; color: string }> = [];

    if (plugin.capabilities.opensDialogue) {
      badges.push({ label: 'Opens Dialogue', icon: '💬', color: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400' });
    }
    if (plugin.capabilities.modifiesInventory) {
      badges.push({ label: 'Modifies Inventory', icon: '🎒', color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' });
    }
    if (plugin.capabilities.affectsRelationship) {
      badges.push({ label: 'Affects Relationship', icon: '💕', color: 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400' });
    }
    if (plugin.capabilities.triggersEvents) {
      badges.push({ label: 'Triggers Events', icon: '⚡', color: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400' });
    }
    if (plugin.capabilities.hasRisk) {
      badges.push({ label: 'Has Risk', icon: '⚠️', color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' });
    }
    if (plugin.capabilities.canBeDetected) {
      badges.push({ label: 'Can Be Detected', icon: '👁️', color: 'bg-slate-100 dark:bg-slate-900/30 text-slate-700 dark:text-slate-400' });
    }
    if (plugin.capabilities.requiresItems) {
      badges.push({ label: 'Requires Items', icon: '📦', color: 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400' });
    }
    if (plugin.capabilities.consumesItems) {
      badges.push({ label: 'Consumes Items', icon: '🔥', color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' });
    }

    return badges.length > 0 ? badges : null;
  };

  const capabilityBadges = getCapabilityBadges();

  return (
    <div className="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-300 dark:border-neutral-700 p-6 space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <h2 className="text-xl font-semibold">{plugin.name}</h2>
          {plugin.experimental && (
            <span className="px-2 py-1 text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded font-medium">
              EXPERIMENTAL
            </span>
          )}
          {plugin.hasCustomConfig && (
            <span className="px-2 py-1 text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded font-medium">
              ⚙️ Custom Config
            </span>
          )}
        </div>
        {plugin.description && (
          <p className="text-sm text-neutral-600 dark:text-neutral-400">{plugin.description}</p>
        )}
      </div>

      {/* Badges */}
      <div>
        <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 mb-2">
          Details
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {/* Type Badge */}
          <span className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded font-medium">
            {plugin.type === 'helper' ? 'Helper' : 'Interaction'}
          </span>
          {/* Origin Badge */}
          <span className="px-2 py-1 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded font-medium">
            {getOriginLabel(plugin.origin)}
          </span>
          {/* Capability Badges */}
          {capabilityBadges && capabilityBadges.map((badge) => (
            <span
              key={badge.label}
              className={`px-2 py-1 text-xs rounded font-medium ${badge.color}`}
              title={badge.label}
            >
              {badge.icon} {badge.label}
            </span>
          ))}
        </div>
      </div>

      {/* Metadata */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 mb-1">
            Type
          </h3>
          <p className="capitalize">{plugin.type}</p>
        </div>
        {plugin.category && (
          <div>
            <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 mb-1">
              Category
            </h3>
            <p className="capitalize">{plugin.category}</p>
          </div>
        )}
        {plugin.version && (
          <div>
            <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 mb-1">
              Version
            </h3>
            <p>{plugin.version}</p>
          </div>
        )}
        <div>
          <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 mb-1">ID</h3>
          <p className="text-xs font-mono">{plugin.id}</p>
        </div>
      </div>

      {/* Tags */}
      {plugin.tags && plugin.tags.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 mb-2">
            Tags
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {plugin.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Configuration */}
      {plugin.configFields && plugin.configFields.length > 0 && (
        <div className="border-t border-neutral-200 dark:border-neutral-700 pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Configuration</h3>
            <button
              onClick={handleReset}
              className="px-3 py-1 text-xs bg-neutral-100 dark:bg-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-600 rounded transition-colors"
            >
              Reset to Defaults
            </button>
          </div>
          <div className="space-y-4">
            {plugin.configFields.map((field) => (
              <ConfigFieldInput
                key={field.key}
                field={field}
                value={currentConfig[field.key]}
                onChange={(value) => handleConfigChange(field.key, value)}
              />
            ))}
          </div>
        </div>
      )}

      {(!plugin.configFields || plugin.configFields.length === 0) && (
        <div className="text-center py-8 text-neutral-500 text-sm">
          No configuration options available
        </div>
      )}
    </div>
  );
}

function ConfigFieldInput({
  field,
  value,
  onChange,
}: {
  field: ConfigField;
  value: any;
  onChange: (value: any) => void;
}) {
  const renderInput = () => {
    switch (field.type) {
      case 'boolean':
        return (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={value ?? field.default ?? false}
              onChange={(e) => onChange(e.target.checked)}
              className="w-4 h-4 rounded border-neutral-300 dark:border-neutral-600 text-blue-600 focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm">{field.label}</span>
          </label>
        );

      case 'number':
      case 'slider':
        return (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">{field.label}</label>
              <span className="text-sm text-neutral-600 dark:text-neutral-400">
                {value ?? field.default ?? 0}
              </span>
            </div>
            {field.type === 'slider' ? (
              <input
                type="range"
                min={field.min}
                max={field.max}
                step={field.step || 1}
                value={value ?? field.default ?? 0}
                onChange={(e) => onChange(Number(e.target.value))}
                className="w-full"
              />
            ) : (
              <input
                type="number"
                min={field.min}
                max={field.max}
                step={field.step || 1}
                value={value ?? field.default ?? 0}
                onChange={(e) => onChange(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
          </div>
        );

      case 'select':
        return (
          <div className="space-y-2">
            <label className="text-sm font-medium block">{field.label}</label>
            <select
              value={value ?? field.default ?? ''}
              onChange={(e) => onChange(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {field.options?.map((opt) => (
                <option key={String(opt.value)} value={String(opt.value)}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        );

      case 'text':
      case 'string':
      default:
        return (
          <div className="space-y-2">
            <label className="text-sm font-medium block">{field.label}</label>
            <input
              type="text"
              placeholder={field.placeholder}
              value={value ?? field.default ?? ''}
              onChange={(e) => onChange(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        );
    }
  };

  return (
    <div className="space-y-1">
      {renderInput()}
      {field.description && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">{field.description}</p>
      )}
    </div>
  );
}

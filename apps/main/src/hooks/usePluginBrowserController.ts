/**
 * Plugin Browser Controller Hook
 *
 * Centralizes all plugin browsing logic for both plugins and workspace panels.
 * Provides a single source of truth for:
 * - Plugin loading and filtering
 * - Workspace panel activation/deactivation
 * - Tab management
 *
 * This follows the controller + presentational component pattern used throughout the app.
 */

import { useState, useEffect, useMemo } from 'react';
import type { UnifiedPluginDescriptor, UnifiedPluginFamily } from '../lib/plugins/types';
import { fromPluginSystemMetadata } from '../lib/plugins/types';
import {
  pluginCatalog,
  pluginActivationManager,
  type ExtendedPluginMetadata,
} from '../lib/plugins/pluginSystem';

// ============================================================================
// Types
// ============================================================================

export type BrowserTab = 'plugins' | 'workspace-panels';

export type PanelCategory = 'all' | 'core' | 'development' | 'game' | 'tools' | 'custom';
export type PanelOrigin = 'all' | 'builtin' | 'plugin-dir' | 'ui-bundle';

/**
 * Controller state and actions for the Plugin Browser
 */
export interface PluginBrowserController {
  // Tab management
  activeTab: BrowserTab;
  setActiveTab: (tab: BrowserTab) => void;

  // Plugins state
  plugins: UnifiedPluginDescriptor[];
  filteredPlugins: UnifiedPluginDescriptor[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  familyFilter: UnifiedPluginFamily | 'all';
  setFamilyFilter: (family: UnifiedPluginFamily | 'all') => void;
  categoryFilter: string;
  setCategoryFilter: (category: string) => void;
  featureFilter: string;
  setFeatureFilter: (feature: string) => void;
  categories: string[];
  features: string[];
  families: UnifiedPluginFamily[];
  hasControlCenterPlugins: boolean;

  // Workspace panels state
  panelPlugins: ExtendedPluginMetadata<'workspace-panel'>[];
  filteredPanelPlugins: ExtendedPluginMetadata<'workspace-panel'>[];
  panelSearchQuery: string;
  setPanelSearchQuery: (query: string) => void;
  panelCategoryFilter: PanelCategory;
  setPanelCategoryFilter: (category: PanelCategory) => void;
  panelOriginFilter: PanelOrigin;
  setPanelOriginFilter: (origin: PanelOrigin) => void;
  handleTogglePanelActivation: (panelId: string) => Promise<void>;
}

// ============================================================================
// Controller Hook
// ============================================================================

/**
 * Plugin Browser Controller
 *
 * Manages all state and logic for the Plugin Browser component.
 * Handles both plugin catalog entries and workspace panels.
 */
export function usePluginBrowserController(): PluginBrowserController {
  // Tab state
  const [activeTab, setActiveTab] = useState<BrowserTab>('plugins');

  // Plugins state
  const [plugins, setPlugins] = useState<UnifiedPluginDescriptor[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [familyFilter, setFamilyFilter] = useState<UnifiedPluginFamily | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [featureFilter, setFeatureFilter] = useState<string>('all');

  // Workspace panels state
  const [panelPlugins, setPanelPlugins] = useState<ExtendedPluginMetadata<'workspace-panel'>[]>([]);
  const [panelSearchQuery, setPanelSearchQuery] = useState('');
  const [panelCategoryFilter, setPanelCategoryFilter] = useState<PanelCategory>('all');
  const [panelOriginFilter, setPanelOriginFilter] = useState<PanelOrigin>('all');

  // ========================================================================
  // Plugins Logic
  // ========================================================================

  // Load plugins from unified catalog
  useEffect(() => {
    const loadPlugins = () => {
      const catalogPlugins = pluginCatalog
        .getAll()
        .filter((plugin) => plugin.family !== 'workspace-panel' && plugin.family !== 'renderer');
      setPlugins(catalogPlugins.map(fromPluginSystemMetadata));
    };

    loadPlugins();
    const unsubscribe = pluginCatalog.subscribe(loadPlugins);

    return () => {
      unsubscribe();
    };
  }, []);

  // Get unique categories and features
  const categories = useMemo(() => getUniqueCategories(plugins), [plugins]);
  const features = useMemo(() => getUniqueFeatures(plugins), [plugins]);
  const families = useMemo(() => getUniqueFamilies(plugins), [plugins]);

  // Apply filters to plugins
  const filteredPlugins = useMemo(() => {
    let filtered = plugins;

    // Search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((plugin) => matchesSearch(plugin, query));
    }

    // Family filter
    if (familyFilter !== 'all') {
      filtered = filtered.filter((plugin) => plugin.family === familyFilter);
    }

    // Category filter
    if (categoryFilter !== 'all') {
      filtered = filtered.filter((plugin) => plugin.category === categoryFilter);
    }

    // Feature filter
    if (featureFilter !== 'all') {
      filtered = filtered.filter((plugin) =>
        plugin.consumesFeatures?.includes(featureFilter) ||
        plugin.providesFeatures?.includes(featureFilter)
      );
    }

    return filtered;
  }, [plugins, searchQuery, familyFilter, categoryFilter, featureFilter]);

  // Check if there are any control center plugins
  const hasControlCenterPlugins = useMemo(
    () =>
      filteredPlugins.some(
        (p) =>
          p.family === 'control-center' ||
          p.providesFeatures?.includes('control-center')
      ),
    [filteredPlugins]
  );

  // ========================================================================
  // Workspace Panels Logic
  // ========================================================================

  // Load workspace panel plugins and subscribe to changes
  useEffect(() => {
    const loadPanels = () => {
      const panels = pluginCatalog.getByFamily('workspace-panel');
      setPanelPlugins(panels);
    };

    // Initial load
    loadPanels();

    // Subscribe to catalog changes
    const unsubscribe = pluginCatalog.subscribe(loadPanels);

    return () => {
      unsubscribe();
    };
  }, []);

  // Apply filters to workspace panels
  const filteredPanelPlugins = useMemo(() => {
    let filtered = panelPlugins;

    // Search
    if (panelSearchQuery.trim()) {
      const query = panelSearchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.id.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query) ||
          p.tags?.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    // Category filter
    if (panelCategoryFilter !== 'all') {
      filtered = filtered.filter((p) => p.category === panelCategoryFilter);
    }

    // Origin filter
    if (panelOriginFilter !== 'all') {
      filtered = filtered.filter((p) => p.origin === panelOriginFilter);
    }

    return filtered;
  }, [panelPlugins, panelSearchQuery, panelCategoryFilter, panelOriginFilter]);

  // Handle panel activation toggle
  const handleTogglePanelActivation = async (panelId: string) => {
    const panel = pluginCatalog.get(panelId);
    if (!panel) return;

    if (panel.activationState === 'active') {
      await pluginActivationManager.deactivate(panelId);
    } else {
      await pluginActivationManager.activate(panelId);
    }
    // Panel list will update automatically via subscription
  };

  // ========================================================================
  // Return controller interface
  // ========================================================================

  return {
    // Tab management
    activeTab,
    setActiveTab,

    // Plugins
    plugins,
    filteredPlugins,
    searchQuery,
    setSearchQuery,
    familyFilter,
    setFamilyFilter,
    categoryFilter,
    setCategoryFilter,
    featureFilter,
    setFeatureFilter,
    categories,
    features,
    families,
    hasControlCenterPlugins,

    // Workspace panels
    panelPlugins,
    filteredPanelPlugins,
    panelSearchQuery,
    setPanelSearchQuery,
    panelCategoryFilter,
    setPanelCategoryFilter,
    panelOriginFilter,
    setPanelOriginFilter,
    handleTogglePanelActivation,
  };
}

// ========================================================================
// Helpers
// ========================================================================

function matchesSearch(plugin: UnifiedPluginDescriptor, query: string): boolean {
  if (plugin.name.toLowerCase().includes(query)) return true;
  if (plugin.id.toLowerCase().includes(query)) return true;
  if (plugin.description?.toLowerCase().includes(query)) return true;
  if (plugin.category?.toLowerCase().includes(query)) return true;
  if (plugin.author?.toLowerCase().includes(query)) return true;
  if (plugin.tags?.some((tag) => tag.toLowerCase().includes(query))) return true;
  return false;
}

function getUniqueCategories(plugins: UnifiedPluginDescriptor[]): string[] {
  const categories = new Set<string>();
  plugins.forEach((plugin) => {
    if (plugin.category) {
      categories.add(plugin.category);
    }
  });
  return Array.from(categories).sort();
}

function getUniqueFeatures(plugins: UnifiedPluginDescriptor[]): string[] {
  const features = new Set<string>();
  plugins.forEach((plugin) => {
    plugin.consumesFeatures?.forEach((feature) => features.add(feature));
    plugin.providesFeatures?.forEach((feature) => features.add(feature));
  });
  return Array.from(features).sort();
}

function getUniqueFamilies(plugins: UnifiedPluginDescriptor[]): UnifiedPluginFamily[] {
  const families = new Set<UnifiedPluginFamily>();
  plugins.forEach((plugin) => families.add(plugin.family));
  return Array.from(families).sort();
}

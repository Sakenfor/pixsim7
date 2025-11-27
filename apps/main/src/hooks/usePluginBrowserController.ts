/**
 * Plugin Browser Controller Hook
 *
 * Centralizes all plugin browsing logic for both legacy plugins and workspace panels.
 * Provides a single source of truth for:
 * - Plugin loading and filtering
 * - Workspace panel activation/deactivation
 * - Tab management
 *
 * This follows the controller + presentational component pattern used throughout the app.
 */

import { useState, useEffect, useMemo } from 'react';
import {
  listAllPlugins,
  searchPlugins,
  filterByKind,
  filterByCategory,
  filterByFeature,
  getUniqueCategories,
  getUniqueFeatures,
  type PluginMeta,
  type PluginKind,
} from '../lib/plugins/catalog';
import {
  pluginCatalog,
  pluginActivationManager,
  type ExtendedPluginMetadata,
} from '../lib/plugins/pluginSystem';

// ============================================================================
// Types
// ============================================================================

export type BrowserTab = 'legacy' | 'workspace-panels';

export type PanelCategory = 'all' | 'core' | 'development' | 'game' | 'tools' | 'custom';
export type PanelOrigin = 'all' | 'builtin' | 'plugin-dir' | 'ui-bundle';

/**
 * Controller state and actions for the Plugin Browser
 */
export interface PluginBrowserController {
  // Tab management
  activeTab: BrowserTab;
  setActiveTab: (tab: BrowserTab) => void;

  // Legacy plugins state
  plugins: PluginMeta[];
  filteredPlugins: PluginMeta[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  kindFilter: PluginKind | 'all';
  setKindFilter: (kind: PluginKind | 'all') => void;
  categoryFilter: string;
  setCategoryFilter: (category: string) => void;
  featureFilter: string;
  setFeatureFilter: (feature: string) => void;
  categories: string[];
  features: string[];
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
 * Handles both legacy plugins and workspace panels.
 */
export function usePluginBrowserController(): PluginBrowserController {
  // Tab state
  const [activeTab, setActiveTab] = useState<BrowserTab>('legacy');

  // Legacy plugins state
  const [plugins, setPlugins] = useState<PluginMeta[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<PluginKind | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [featureFilter, setFeatureFilter] = useState<string>('all');

  // Workspace panels state
  const [panelPlugins, setPanelPlugins] = useState<ExtendedPluginMetadata<'workspace-panel'>[]>([]);
  const [panelSearchQuery, setPanelSearchQuery] = useState('');
  const [panelCategoryFilter, setPanelCategoryFilter] = useState<PanelCategory>('all');
  const [panelOriginFilter, setPanelOriginFilter] = useState<PanelOrigin>('all');

  // ========================================================================
  // Legacy Plugins Logic
  // ========================================================================

  // Load legacy plugins
  useEffect(() => {
    const allPlugins = listAllPlugins();
    setPlugins(allPlugins);
  }, []);

  // Get unique categories and features
  const categories = useMemo(() => getUniqueCategories(plugins), [plugins]);
  const features = useMemo(() => getUniqueFeatures(plugins), [plugins]);

  // Apply filters to legacy plugins
  const filteredPlugins = useMemo(() => {
    let filtered = plugins;

    // Search
    if (searchQuery.trim()) {
      filtered = searchPlugins(searchQuery, filtered);
    }

    // Kind filter
    if (kindFilter !== 'all') {
      filtered = filterByKind(kindFilter, filtered);
    }

    // Category filter
    if (categoryFilter !== 'all') {
      filtered = filterByCategory(categoryFilter, filtered);
    }

    // Feature filter
    if (featureFilter !== 'all') {
      filtered = filterByFeature(featureFilter, filtered);
    }

    return filtered;
  }, [plugins, searchQuery, kindFilter, categoryFilter, featureFilter]);

  // Check if there are any control center plugins
  const hasControlCenterPlugins = useMemo(
    () => filteredPlugins.some((p) => p.providesFeatures?.includes('control-center')),
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

    // Legacy plugins
    plugins,
    filteredPlugins,
    searchQuery,
    setSearchQuery,
    kindFilter,
    setKindFilter,
    categoryFilter,
    setCategoryFilter,
    featureFilter,
    setFeatureFilter,
    categories,
    features,
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

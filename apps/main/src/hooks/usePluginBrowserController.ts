/**
 * Plugin Browser Controller Hook
 *
 * Centralizes plugin browser state and logic for both legacy plugins
 * and workspace panel plugins. Separates business logic from presentation.
 *
 * Usage:
 * ```tsx
 * function PluginBrowser() {
 *   const controller = usePluginBrowserController();
 *   // Use controller fields/callbacks in JSX
 * }
 * ```
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
import { pluginCatalog, pluginActivationManager } from '../lib/plugins/pluginSystem';
import type { ExtendedPluginMetadata } from '../lib/plugins/pluginSystem';

/**
 * Browser tab discriminator
 */
export type BrowserTab = 'legacy' | 'workspace-panels';

/**
 * Category filter for workspace panels
 */
export type PanelCategory = 'all' | 'core' | 'development' | 'game' | 'tools' | 'custom';

/**
 * Origin filter for workspace panels
 */
export type PanelOrigin = 'all' | 'builtin' | 'plugin-dir' | 'ui-bundle';

/**
 * Controller return type
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

  // Workspace panels actions
  handleTogglePanelActivation: (panelId: string) => Promise<void>;
}

/**
 * Plugin Browser Controller Hook
 */
export function usePluginBrowserController(): PluginBrowserController {
  // ============================================================================
  // Tab State
  // ============================================================================
  const [activeTab, setActiveTab] = useState<BrowserTab>('legacy');

  // ============================================================================
  // Legacy Plugins State (Phase 70.1)
  // ============================================================================
  const [plugins, setPlugins] = useState<PluginMeta[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<PluginKind | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [featureFilter, setFeatureFilter] = useState<string>('all');

  // Load plugins
  useEffect(() => {
    const allPlugins = listAllPlugins();
    setPlugins(allPlugins);
  }, []);

  // Get unique categories and features
  const categories = useMemo(() => getUniqueCategories(plugins), [plugins]);
  const features = useMemo(() => getUniqueFeatures(plugins), [plugins]);

  // Apply filters
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
    () => filteredPlugins.some(p => p.providesFeatures?.includes('control-center')),
    [filteredPlugins]
  );

  // ============================================================================
  // Workspace Panels State (Phase 70.2)
  // ============================================================================
  const [panelPlugins, setPanelPlugins] = useState<ExtendedPluginMetadata<'workspace-panel'>[]>([]);
  const [panelSearchQuery, setPanelSearchQuery] = useState('');
  const [panelCategoryFilter, setPanelCategoryFilter] = useState<PanelCategory>('all');
  const [panelOriginFilter, setPanelOriginFilter] = useState<PanelOrigin>('all');

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

  // ============================================================================
  // Workspace Panels Actions
  // ============================================================================
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

  // ============================================================================
  // Return Controller Interface
  // ============================================================================
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

    // Workspace panels actions
    handleTogglePanelActivation,
  };
}

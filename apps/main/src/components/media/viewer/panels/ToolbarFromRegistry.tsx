/**
 * ToolbarFromRegistry
 *
 * Example component showing how to build a dynamic toolbar
 * from the region drawer registry. This replaces hardcoded buttons
 * with drawers discovered from the registry.
 *
 * This is a reference implementation - integrate into your
 * existing toolbar as needed.
 */

import { useMemo } from 'react';

import { getToolbarButtonClass } from '../overlays';
import { useRegionDrawerRegistry, type RegionDrawer } from '../tools';

// ============================================================================
// Types
// ============================================================================

interface ToolbarFromRegistryProps {
  /** Currently active drawer ID */
  activeDrawerId: string | null;
  /** Called when a drawer is selected */
  onDrawerSelect: (drawerId: string) => void;
  /** Filter to specific categories */
  categories?: RegionDrawer['category'][];
  /** Show select mode button */
  showSelectMode?: boolean;
  /** Currently in select mode */
  isSelectMode?: boolean;
  /** Called when select mode is toggled */
  onSelectModeToggle?: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function ToolbarFromRegistry({
  activeDrawerId,
  onDrawerSelect,
  categories,
  showSelectMode = true,
  isSelectMode = false,
  onSelectModeToggle,
}: ToolbarFromRegistryProps) {
  const { drawers } = useRegionDrawerRegistry();

  // Filter drawers by category if specified
  const filteredDrawers = useMemo(() => {
    if (!categories) return drawers;
    return drawers.filter((d) => categories.includes(d.category));
  }, [drawers, categories]);

  // Group drawers by category
  const groupedDrawers = useMemo(() => {
    const groups = new Map<RegionDrawer['category'], RegionDrawer[]>();

    for (const drawer of filteredDrawers) {
      const existing = groups.get(drawer.category) || [];
      existing.push(drawer);
      groups.set(drawer.category, existing);
    }

    return groups;
  }, [filteredDrawers]);

  return (
    <div className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800/90 border-b border-neutral-700 text-xs">
      <span className="text-neutral-400 mr-2">Draw:</span>

      {/* Drawer buttons grouped by category */}
      {Array.from(groupedDrawers.entries()).map(([category, categoryDrawers], groupIndex) => (
        <div key={category} className="flex items-center gap-0.5">
          {groupIndex > 0 && <div className="w-px h-4 bg-neutral-600 mx-1" />}

          {categoryDrawers.map((drawer) => (
            <button
              key={drawer.id}
              onClick={() => onDrawerSelect(drawer.id)}
              className={getToolbarButtonClass(activeDrawerId === drawer.id && !isSelectMode)}
              title={`${drawer.description} (${drawer.shortcut?.toUpperCase()})`}
            >
              {typeof drawer.icon === 'string' ? drawer.icon : null} {drawer.name}
            </button>
          ))}
        </div>
      ))}

      {/* Select mode button */}
      {showSelectMode && onSelectModeToggle && (
        <>
          <div className="w-px h-4 bg-neutral-600 mx-1" />
          <button
            onClick={onSelectModeToggle}
            className={getToolbarButtonClass(isSelectMode)}
            title="Select and edit regions (S)"
          >
            Select
          </button>
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Help text */}
      <span className="text-neutral-500 text-[10px]">
        {isSelectMode && 'Click region to select'}
        {!isSelectMode && activeDrawerId && getDrawerHelpText(drawers.find((d) => d.id === activeDrawerId))}
      </span>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function getDrawerHelpText(drawer: RegionDrawer | undefined): string {
  if (!drawer) return '';

  switch (drawer.category) {
    case 'shape':
      return 'Drag to draw shape';
    case 'path':
      return 'Click points, double-click to finish';
    case '3d':
      return 'Drag to draw 3D box';
    case 'point':
      return 'Click to place point';
    default:
      return drawer.description;
  }
}

// ============================================================================
// Category Selector
// ============================================================================

interface CategorySelectorProps {
  categories: RegionDrawer['category'][];
  activeCategory: RegionDrawer['category'] | null;
  onCategorySelect: (category: RegionDrawer['category']) => void;
}

/**
 * Optional category tabs for organizing many drawers
 */
export function CategorySelector({
  categories,
  activeCategory,
  onCategorySelect,
}: CategorySelectorProps) {
  const labels: Record<RegionDrawer['category'], string> = {
    shape: 'Shapes',
    path: 'Paths',
    '3d': '3D',
    point: 'Points',
    custom: 'Custom',
  };

  const icons: Record<RegionDrawer['category'], string> = {
    shape: '▭',
    path: '〰',
    '3d': '⬡',
    point: '•',
    custom: '★',
  };

  return (
    <div className="flex gap-1 p-1 bg-neutral-900 rounded-lg">
      {categories.map((cat) => (
        <button
          key={cat}
          onClick={() => onCategorySelect(cat)}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            activeCategory === cat
              ? 'bg-neutral-700 text-white'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          {icons[cat]} {labels[cat]}
        </button>
      ))}
    </div>
  );
}

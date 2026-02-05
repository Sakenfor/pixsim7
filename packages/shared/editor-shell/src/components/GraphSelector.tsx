/**
 * Graph Selector Component
 *
 * Dropdown for selecting which graph to edit.
 * Common pattern used across all graph-based editors.
 */

import { clsx } from 'clsx';
import { Plus, Copy, Trash2, MoreVertical } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface GraphItem {
  id: string;
  name: string;
}

export interface GraphSelectorProps<T extends GraphItem = GraphItem> {
  /** List of available graphs */
  graphs: T[];

  /** Currently selected graph ID */
  currentGraphId: string | null;

  /** Callback when a graph is selected */
  onSelect: (graphId: string | null) => void;

  /** Callback to create a new graph */
  onNew?: () => void;

  /** Callback to duplicate a graph */
  onDuplicate?: (graphId: string) => void;

  /** Callback to delete a graph */
  onDelete?: (graphId: string) => void;

  /** Placeholder text when no graph is selected */
  placeholder?: string;

  /** Label for the new button */
  newLabel?: string;

  /** Additional class name */
  className?: string;

  /** Whether to show the action menu */
  showActions?: boolean;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Graph selector with dropdown and action buttons
 *
 * @example
 * ```tsx
 * <GraphSelector
 *   graphs={graphs}
 *   currentGraphId={currentGraphId}
 *   onSelect={setCurrentGraph}
 *   onNew={createGraph}
 *   onDuplicate={duplicateGraph}
 *   onDelete={deleteGraph}
 * />
 * ```
 */
export function GraphSelector<T extends GraphItem = GraphItem>({
  graphs,
  currentGraphId,
  onSelect,
  onNew,
  onDuplicate,
  onDelete,
  placeholder = 'Select graph...',
  newLabel = 'New',
  className,
  showActions = true,
}: GraphSelectorProps<T>) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu]);

  const currentGraph = graphs.find((g) => g.id === currentGraphId);

  return (
    <div
      className={clsx(
        'flex items-center gap-2 p-2 bg-white dark:bg-neutral-800 rounded-lg shadow-lg',
        'border border-neutral-200 dark:border-neutral-700',
        className
      )}
    >
      {/* Graph dropdown */}
      <select
        value={currentGraphId ?? ''}
        onChange={(e) => onSelect(e.target.value || null)}
        className={clsx(
          'text-xs px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600',
          'bg-white dark:bg-neutral-700 min-w-[150px]',
          'focus:outline-none focus:ring-1 focus:ring-blue-500'
        )}
      >
        <option value="">{placeholder}</option>
        {graphs.map((graph) => (
          <option key={graph.id} value={graph.id}>
            {graph.name}
          </option>
        ))}
      </select>

      {/* New button */}
      {onNew && (
        <button
          onClick={onNew}
          className={clsx(
            'px-2 py-1 text-xs font-medium rounded transition-colors',
            'bg-blue-500 text-white hover:bg-blue-600'
          )}
        >
          <Plus size={12} className="inline mr-1" />
          {newLabel}
        </button>
      )}

      {/* Actions menu */}
      {showActions && currentGraphId && (onDuplicate || onDelete) && (
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className={clsx(
              'p-1 rounded transition-colors',
              'hover:bg-neutral-100 dark:hover:bg-neutral-700',
              'text-neutral-600 dark:text-neutral-400'
            )}
            title="More actions"
          >
            <MoreVertical size={14} />
          </button>

          {/* Dropdown menu */}
          {showMenu && (
            <div
              className={clsx(
                'absolute right-0 top-full mt-1 z-50',
                'bg-white dark:bg-neutral-800 rounded-lg shadow-lg',
                'border border-neutral-200 dark:border-neutral-700',
                'py-1 min-w-[140px]'
              )}
            >
              {onDuplicate && (
                <button
                  onClick={() => {
                    onDuplicate(currentGraphId);
                    setShowMenu(false);
                  }}
                  className={clsx(
                    'w-full px-3 py-1.5 text-xs text-left',
                    'hover:bg-neutral-100 dark:hover:bg-neutral-700',
                    'flex items-center gap-2'
                  )}
                >
                  <Copy size={12} />
                  Duplicate
                </button>
              )}
              {onDelete && (
                <button
                  onClick={() => {
                    if (confirm(`Delete "${currentGraph?.name}"?`)) {
                      onDelete(currentGraphId);
                      setShowMenu(false);
                    }
                  }}
                  className={clsx(
                    'w-full px-3 py-1.5 text-xs text-left text-red-600',
                    'hover:bg-red-50 dark:hover:bg-red-900/20',
                    'flex items-center gap-2'
                  )}
                >
                  <Trash2 size={12} />
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Compact Variant
// ============================================================================

/**
 * Compact graph selector for use in tight spaces
 */
export function GraphSelectorCompact<T extends GraphItem = GraphItem>({
  graphs,
  currentGraphId,
  onSelect,
  placeholder = 'Select...',
  className,
}: Pick<GraphSelectorProps<T>, 'graphs' | 'currentGraphId' | 'onSelect' | 'placeholder' | 'className'>) {
  return (
    <select
      value={currentGraphId ?? ''}
      onChange={(e) => onSelect(e.target.value || null)}
      className={clsx(
        'text-xs px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600',
        'bg-white dark:bg-neutral-700',
        'focus:outline-none focus:ring-1 focus:ring-blue-500',
        className
      )}
    >
      <option value="">{placeholder}</option>
      {graphs.map((graph) => (
        <option key={graph.id} value={graph.id}>
          {graph.name}
        </option>
      ))}
    </select>
  );
}

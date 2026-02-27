import { PortalFloat, Tooltip, useHoverExpand } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Icon } from '@lib/icons';
import { panelSelectors } from '@lib/plugins/catalogSelectors';

import { CATEGORY_LABELS, CATEGORY_ORDER } from '@features/panels';
import { openWorkspacePanel, useWorkspaceStore } from '@features/workspace';

import { NavIcon } from './ActivityBar';

function formatCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS]
    ?? category.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * "More panels" flyout button for the ActivityBar.
 * Shows a categorized list of all public panels with pin/unpin toggle.
 */
export function MorePanelsFlyout() {
  const triggerRef = useRef<HTMLDivElement>(null);
  const { isExpanded, handlers } = useHoverExpand({
    expandDelay: 300,
    collapseDelay: 200,
  });

  const [triggerHovered, setTriggerHovered] = useState(false);

  return (
    <div
      ref={triggerRef}
      {...handlers}
      onMouseEnter={(e) => {
        handlers.onMouseEnter(e);
        setTriggerHovered(true);
      }}
      onMouseLeave={(e) => {
        handlers.onMouseLeave(e);
        setTriggerHovered(false);
      }}
    >
      <div className="relative flex items-center justify-center">
        <button
          className="w-10 h-10 flex items-center justify-center rounded-lg text-neutral-500 hover:text-neutral-200 hover:bg-neutral-700/50 transition-colors"
          aria-label="More panels"
        >
          <NavIcon name="layoutGrid" size={18} />
        </button>
        {!isExpanded && (
          <Tooltip content="More panels" position="right" show={triggerHovered} delay={400} />
        )}
      </div>

      {isExpanded && (
        <PortalFloat
          anchor={triggerRef.current}
          placement="right"
          align="start"
          offset={4}
          clamp
          className="py-2 w-[220px] max-h-[min(500px,80vh)] bg-neutral-900/95 border border-neutral-700/60 rounded-lg shadow-xl backdrop-blur-sm flex flex-col"
          onMouseEnter={handlers.onMouseEnter}
          onMouseLeave={handlers.onMouseLeave}
        >
          <FlyoutContent />
        </PortalFloat>
      )}
    </div>
  );
}

function FlyoutContent() {
  const togglePin = useWorkspaceStore((s) => s.toggleQuickAddPin);
  const pinnedIds = useWorkspaceStore((s) => s.pinnedQuickAddPanels);
  const [search, setSearch] = useState('');

  // Re-render when plugin catalog changes
  const [, setVersion] = useState(0);
  useEffect(() => {
    return panelSelectors.subscribe(() => setVersion((v) => v + 1));
  }, []);

  const allPanels = useMemo(() => panelSelectors.getPublicPanels(), []);

  const filtered = useMemo(() => {
    if (!search.trim()) return allPanels;
    const q = search.toLowerCase();
    return allPanels.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q),
    );
  }, [allPanels, search]);

  const grouped = useMemo(
    () => {
      const byCategory = new Map<string, typeof filtered>();
      for (const panel of filtered) {
        const category = panel.category ?? 'uncategorized';
        const arr = byCategory.get(category);
        if (arr) {
          arr.push(panel);
        } else {
          byCategory.set(category, [panel]);
        }
      }

      const orderedCategories = [
        ...CATEGORY_ORDER.filter((cat) => byCategory.has(cat)),
        ...Array.from(byCategory.keys())
          .filter((cat) => !CATEGORY_ORDER.includes(cat as any))
          .sort((a, b) => a.localeCompare(b)),
      ];

      return orderedCategories.map((category) => ({
        category,
        panels: byCategory.get(category) ?? [],
      }));
    },
    [filtered],
  );

  const handleOpen = useCallback(
    (panelId: string) => {
      openWorkspacePanel(panelId);
    },
    [],
  );

  return (
    <>
      {/* Search */}
      <div className="px-2 pb-1.5">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search panels..."
          className="w-full px-2 py-1 text-xs bg-neutral-800 border border-neutral-700/60 rounded text-neutral-200 placeholder:text-neutral-500 outline-none focus:border-accent/50"
          autoFocus
        />
      </div>

      {/* Panel list */}
      <div className="flex-1 overflow-y-auto px-1">
        {grouped.length === 0 && (
          <div className="text-xs text-neutral-500 px-2 py-3 text-center">No panels found</div>
        )}
        {grouped.map(({ category, panels }) => (
            <div key={category} className="mb-2 last:mb-0">
              <div className="text-[10px] uppercase font-semibold text-neutral-500 px-2 py-1">
                {formatCategoryLabel(category)}
              </div>
            {panels.map((panel) => {
              const isPinned = pinnedIds.includes(panel.id);
              return (
                <div
                  key={panel.id}
                  className="group/row flex items-center gap-1.5 px-2 py-1.5 rounded text-sm text-neutral-300 hover:text-neutral-100 hover:bg-neutral-700/50 transition-colors cursor-pointer"
                  onClick={() => handleOpen(panel.id)}
                >
                  {panel.icon && <NavIcon name={panel.icon} size={14} />}
                  <span className="flex-1 truncate text-xs">{panel.title}</span>
                  <button
                    className={`flex-shrink-0 p-0.5 rounded transition-colors ${
                      isPinned
                        ? 'text-accent opacity-100'
                        : 'text-neutral-500 opacity-0 group-hover/row:opacity-100 hover:text-neutral-200'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePin(panel.id);
                    }}
                    title={isPinned ? 'Unpin from sidebar' : 'Pin to sidebar'}
                  >
                    <Icon name="pin" size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}

import { Tooltip, useHoverExpand } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Icon } from '@lib/icons';
import { panelSelectors } from '@lib/plugins/catalogSelectors';

import { CATEGORY_LABELS, CATEGORY_ORDER } from '@features/panels';
import { useWorkspaceStore } from '@features/workspace';

import { NavIcon } from './ActivityBar';

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

  const rect = triggerRef.current?.getBoundingClientRect();

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

      {isExpanded &&
        rect &&
        createPortal(
          <FlyoutContent
            top={rect.top}
            left={rect.right + 4}
            onMouseEnter={handlers.onMouseEnter}
            onMouseLeave={handlers.onMouseLeave}
          />,
          document.body,
        )}
    </div>
  );
}

function FlyoutContent({
  top,
  left,
  onMouseEnter,
  onMouseLeave,
}: {
  top: number;
  left: number;
  onMouseEnter: React.MouseEventHandler;
  onMouseLeave: React.MouseEventHandler;
}) {
  const restorePanel = useWorkspaceStore((s) => s.restorePanel);
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
    () =>
      CATEGORY_ORDER.map((cat) => ({
        category: cat,
        panels: filtered.filter((p) => p.category === cat),
      })).filter((g) => g.panels.length > 0),
    [filtered],
  );

  const handleOpen = useCallback(
    (panelId: string) => {
      restorePanel(panelId);
    },
    [restorePanel],
  );

  // Clamp so the flyout doesn't go off-screen
  const maxTop = Math.max(0, Math.min(top, window.innerHeight - 400));

  return (
    <div
      className="fixed z-50 py-2 w-[220px] max-h-[min(500px,80vh)] bg-neutral-900/95 border border-neutral-700/60 rounded-lg shadow-xl backdrop-blur-sm flex flex-col"
      style={{ top: maxTop, left }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
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
              {CATEGORY_LABELS[category]}
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
    </div>
  );
}

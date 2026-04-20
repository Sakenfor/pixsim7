import { PortalFloat, Tooltip, useHoverExpand } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Icon } from '@lib/icons';
import { panelSelectors } from '@lib/plugins/catalogSelectors';

import { CATEGORY_LABELS, CATEGORY_ORDER } from '@features/panels/lib/panelConstants';
import type { PanelDefinition } from '@features/panels/lib/panelRegistry';
import { openWorkspacePanel, useWorkspaceStore } from '@features/workspace';

import { useActivityBarStore } from '@/stores/activityBarStore';

import { NavIcon } from './ActivityBar';
import { DRAG_MIME, pinnedPanelIdsFrom } from './shortcutDrag';

const ROLE_ICONS: Record<string, string> = {
  "context-picker": "mouse-pointer",
  "sub-panel": "layers",
  reference: "book-open",
  container: "layout",
  debug: "code",
  editor: "edit",
};

function formatCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS]
    ?? category.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function getCapabilityLabel(cap: unknown): string {
  if (typeof cap === "string") return cap;
  if (typeof cap === "object" && cap !== null && "key" in cap) {
    return (cap as { key: string }).key;
  }
  return String(cap);
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
  const pinnedShortcuts = useWorkspaceStore((s) => s.pinnedShortcuts);
  const pinnedIds = useMemo(() => pinnedPanelIdsFrom(pinnedShortcuts), [pinnedShortcuts]);
  const [search, setSearch] = useState('');
  const [showAuxiliary, setShowAuxiliary] = useState(false);

  // Ensure workspace panel definitions are available when flyout is opened.
  useEffect(() => {
    void import('@features/panels/lib/initializePanels')
      .then(({ initializePanels }) => initializePanels({ contexts: ['workspace'] }))
      .catch((error) => {
        console.warn('[MorePanelsFlyout] Failed to initialize workspace panels:', error);
      });
  }, []);

  // Re-render when plugin catalog changes
  const [version, setVersion] = useState(0);
  useEffect(() => {
    return panelSelectors.subscribe(() => setVersion((v) => v + 1));
  }, []);

  const browsablePanels = useMemo(() => panelSelectors.getBrowsablePanels(), [version]);
  const publicPanels = useMemo(() => panelSelectors.getPublicPanels(), [version]);

  const allPanels = showAuxiliary ? publicPanels : browsablePanels;

  const auxiliaryIds = useMemo(() => {
    const browsableIds = new Set(browsablePanels.map((p) => p.id));
    return new Set(publicPanels.filter((p) => !browsableIds.has(p.id)).map((p) => p.id));
  }, [browsablePanels, publicPanels]);

  const auxiliaryCount = auxiliaryIds.size;

  const filtered = useMemo(() => {
    if (!search.trim()) return allPanels;
    const q = search.toLowerCase();
    return allPanels.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.panelRole?.toLowerCase().includes(q),
    );
  }, [allPanels, search]);

  const grouped = useMemo(
    () => {
      const byCategory = new Map<string, PanelDefinition[]>();
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
              const isAux = auxiliaryIds.has(panel.id);
              const roleIcon = panel.panelRole ? ROLE_ICONS[panel.panelRole] : undefined;
              return (
                <div
                  key={panel.id}
                  className={`group/row flex items-center gap-1.5 px-2 py-1.5 rounded text-sm transition-colors cursor-pointer ${
                    isAux
                      ? 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-700/30'
                      : 'text-neutral-300 hover:text-neutral-100 hover:bg-neutral-700/50'
                  }`}
                  onClick={() => handleOpen(panel.id)}
                  title={panel.description ?? undefined}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'copy';
                    e.dataTransfer.setData(DRAG_MIME, `panel:${panel.id}`);
                  }}
                >
                  {panel.icon && <NavIcon name={panel.icon} size={14} />}
                  <span className="flex-1 truncate text-xs">{panel.title}</span>
                  {/* Relationship hints */}
                  <RelationshipDots panel={panel} />
                  {roleIcon && isAux && (
                    <Icon name={roleIcon} size={10} className="shrink-0 text-neutral-600" />
                  )}
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

      {/* Footer: auxiliary toggle + hidden-pages restore */}
      <div className="border-t border-neutral-700/60 px-2 pt-1.5 mt-1 flex flex-col gap-0.5 empty:hidden">
        {auxiliaryCount > 0 && (
            <button
              className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-[11px] transition-colors ${
                showAuxiliary
                  ? 'text-accent bg-accent/10'
                  : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-700/40'
              }`}
              onClick={() => setShowAuxiliary((v) => !v)}
            >
              <Icon name={showAuxiliary ? 'eye' : 'eye-off'} size={11} className="shrink-0" />
              <span>Auxiliary panels</span>
              <span className="ml-auto text-[10px] opacity-60">{auxiliaryCount}</span>
            </button>
          )}
        <HiddenPagesFooterRow />
      </div>
    </>
  );
}

function HiddenPagesFooterRow() {
  const hiddenPageIds = useActivityBarStore((s) => s.hiddenPageIds);
  const unhideAllPages = useActivityBarStore((s) => s.unhideAllPages);
  if (hiddenPageIds.length === 0) return null;
  return (
    <button
      className="w-full flex items-center gap-1.5 px-2 py-1 rounded text-[11px] text-neutral-500 hover:text-neutral-300 hover:bg-neutral-700/40 transition-colors"
      onClick={() => unhideAllPages()}
      title="Restore all pages hidden from the sidebar"
    >
      <Icon name="eye" size={11} className="shrink-0" />
      <span>Restore hidden pages</span>
      <span className="ml-auto text-[10px] opacity-60">{hiddenPageIds.length}</span>
    </button>
  );
}

/**
 * Tiny colored dots indicating panel relationships.
 * Keeps the flyout compact while hinting at connections.
 */
function RelationshipDots({ panel }: { panel: PanelDefinition }) {
  const dots: Array<{ color: string; title: string }> = [];

  if (panel.availableIn?.length) {
    dots.push({
      color: 'bg-violet-400',
      title: `In: ${panel.availableIn.join(', ')}`,
    });
  }

  if (panel.consumesCapabilities?.length) {
    dots.push({
      color: 'bg-amber-400',
      title: `Needs: ${panel.consumesCapabilities.map(getCapabilityLabel).join(', ')}`,
    });
  }

  if (panel.providesCapabilities?.length) {
    dots.push({
      color: 'bg-emerald-400',
      title: `Provides: ${panel.providesCapabilities.map(getCapabilityLabel).join(', ')}`,
    });
  }

  if (panel.siblings?.length) {
    dots.push({
      color: 'bg-blue-400',
      title: `Siblings: ${panel.siblings.join(', ')}`,
    });
  }

  if (dots.length === 0) return null;

  return (
    <span className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity">
      {dots.map((dot, i) => (
        <span
          key={i}
          className={`w-1.5 h-1.5 rounded-full ${dot.color}`}
          title={dot.title}
        />
      ))}
    </span>
  );
}

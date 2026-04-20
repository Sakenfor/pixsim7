import type { SubNavItem } from '@pixsim7/shared.modules.core';
import { Tooltip } from '@pixsim7/shared.ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { panelSelectors } from '@lib/plugins/catalogSelectors';

import { openWorkspacePanel, useWorkspaceStore } from '@features/workspace';
import type { ShortcutGroupRecord } from '@features/workspace/stores/workspaceStore';

import { moduleRegistry } from '@app/modules';


import { NavIcon } from './ActivityBar';
import { DRAG_MIME, parseShortcutKey } from './shortcutDrag';
import { ShortcutGroupButton } from './ShortcutGroupButton';
import { SubNavFlyout, type NavFlyoutAction } from './SubNavFlyout';

interface ResolvedShortcut {
  key: string;
  kind: 'panel' | 'page';
  id: string;
  icon: string;
  title: string;
  route?: string; // for pages
}

type PinnedEntry =
  | { type: 'shortcut'; key: string; data: ResolvedShortcut }
  | { type: 'group'; key: string; data: ShortcutGroupRecord };

type DropAction = { key: string; mode: 'before' | 'merge' } | 'end';

const MERGE_ZONE_PX = 14; // height of central merge zone in a 40px-tall button

/**
 * Pinned shortcut buttons rendered in the ActivityBar.
 * Holds panels, pages, and user-created groups (iOS-style folders).
 * - Click a shortcut: panel opens / page navigates.
 * - Drag-reorder: drop on top edge of another item = place before it.
 * - Drag-merge: drop in center of another item = create group (or add to group).
 * - Drag outside: unpin.
 * - Drop external (MorePanels / NavButton / Recent) → pin at position.
 */
export function PanelShortcuts() {
  const pinnedShortcuts = useWorkspaceStore((s) => s.pinnedShortcuts);
  const shortcutGroups = useWorkspaceStore((s) => s.shortcutGroups);
  const reorderShortcutPin = useWorkspaceStore((s) => s.reorderShortcutPin);
  const toggleShortcutPin = useWorkspaceStore((s) => s.toggleShortcutPin);
  const mergeShortcutsIntoGroup = useWorkspaceStore((s) => s.mergeShortcutsIntoGroup);
  const removeFromShortcutGroup = useWorkspaceStore((s) => s.removeFromShortcutGroup);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    void import('@features/panels/lib/initializePanels')
      .then(({ initializePanels }) => initializePanels({ contexts: ['workspace'] }))
      .catch((error) => {
        console.warn('[PanelShortcuts] Failed to initialize workspace panels:', error);
      });
  }, []);

  const [version, setVersion] = useState(0);
  useEffect(() => {
    const off1 = panelSelectors.subscribe(() => setVersion((v) => v + 1));
    const off2 = moduleRegistry.subscribe(() => setVersion((v) => v + 1));
    return () => {
      off1();
      off2();
    };
  }, []);

  const entries = useMemo<PinnedEntry[]>(() => {
    void version;
    const pages = moduleRegistry.getPages({ includeHidden: true });
    const pageMap = new Map(pages.map((p) => [p.id, p]));
    const out: PinnedEntry[] = [];
    for (const key of pinnedShortcuts) {
      const parsed = parseShortcutKey(key);
      if (!parsed) continue;
      if (parsed.kind === 'group') {
        const group = shortcutGroups[parsed.id];
        if (!group) continue;
        // Skip groups whose childKeys all fail to resolve (stale refs from prior state).
        // Note: we still render single-resolved-child groups; the rehydrate cleanup will
        // collapse those to flat pins asynchronously.
        const anyResolvable = group.childKeys.some((ck) => {
          const p = parseShortcutKey(ck);
          if (!p) return false;
          if (p.kind === 'panel') return panelSelectors.get(p.id) != null;
          if (p.kind === 'page') return pageMap.has(p.id);
          return false;
        });
        if (!anyResolvable) continue;
        out.push({ type: 'group', key, data: group });
      } else if (parsed.kind === 'panel') {
        const panel = panelSelectors.get(parsed.id);
        if (!panel) continue;
        out.push({
          type: 'shortcut',
          key,
          data: {
            key,
            kind: 'panel',
            id: parsed.id,
            icon: panel.icon ?? 'layout',
            title: panel.title,
          },
        });
      } else {
        const page = pageMap.get(parsed.id);
        if (!page) continue;
        out.push({
          type: 'shortcut',
          key,
          data: { key, kind: 'page', id: parsed.id, icon: page.icon, title: page.name, route: page.route },
        });
      }
    }
    return out;
  }, [pinnedShortcuts, shortcutGroups, version]);

  // Async self-heal: once registries are loaded, dissolve any group whose resolved
  // children have dropped below 2 (either because keys became stale, or because
  // the v10→v11 rehydrate didn't catch it).
  const dissolveShortcutGroup = useWorkspaceStore((s) => s.dissolveShortcutGroup);
  useEffect(() => {
    void version;
    const pages = moduleRegistry.getPages({ includeHidden: true });
    const pageMap = new Map(pages.map((p) => [p.id, p.id]));
    for (const [groupId, group] of Object.entries(shortcutGroups)) {
      const resolvedCount = group.childKeys.reduce((n, ck) => {
        const p = parseShortcutKey(ck);
        if (!p) return n;
        if (p.kind === 'panel' && panelSelectors.get(p.id)) return n + 1;
        if (p.kind === 'page' && pageMap.has(p.id)) return n + 1;
        return n;
      }, 0);
      if (resolvedCount < 2) {
        dissolveShortcutGroup(groupId, { flatten: true });
      }
    }
  }, [shortcutGroups, version, dissolveShortcutGroup]);

  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [dropAction, setDropAction] = useState<DropAction | null>(null);
  const [isDragOverEmpty, setIsDragOverEmpty] = useState(false);
  const dropHandledRef = useRef(false);

  const handleOpen = (s: ResolvedShortcut) => {
    if (s.kind === 'page' && s.route) {
      navigate(s.route);
    } else {
      openWorkspacePanel(s.id);
    }
  };

  /**
   * Handle a drop landing in the pinned zone. The source might be from a group
   * flyout — we detect that and route to the correct store action.
   */
  const handleContainerDrop = (e: React.DragEvent<HTMLDivElement>, action: DropAction) => {
    const fromKey = e.dataTransfer.getData(DRAG_MIME);
    const sourceGroupId = e.dataTransfer.getData('application/x-pixsim7-group-source');
    if (!fromKey || !parseShortcutKey(fromKey)) return;
    e.preventDefault();
    dropHandledRef.current = true;

    // Drag source was a group member being pulled out → remove from group first.
    if (sourceGroupId) {
      removeFromShortcutGroup(sourceGroupId, fromKey, { promoteToPinned: false });
    }

    if (action !== 'end' && action.mode === 'merge') {
      mergeShortcutsIntoGroup(fromKey, action.key);
    } else if (action !== 'end') {
      reorderShortcutPin(fromKey, action.key);
    } else {
      reorderShortcutPin(fromKey, null);
    }
    setDraggingKey(null);
    setDropAction(null);
  };

  // Empty-state drop slot — always rendered so users always have a target.
  if (entries.length === 0) {
    return (
      <div
        className={`w-10 h-10 mx-1 flex items-center justify-center rounded-lg border border-dashed transition-colors ${
          isDragOverEmpty
            ? 'border-accent/80 bg-accent/10 text-accent'
            : 'border-neutral-700/60 text-neutral-600 hover:text-neutral-400'
        }`}
        title="Drop here to pin"
        onDragEnter={(e) => {
          if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
          setIsDragOverEmpty(true);
        }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setIsDragOverEmpty(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setIsDragOverEmpty(false);
        }}
        onDrop={(e) => {
          handleContainerDrop(e, 'end');
          setIsDragOverEmpty(false);
        }}
      >
        <NavIcon name="pin" size={12} />
      </div>
    );
  }

  return (
    <div
      className="flex flex-col items-center gap-0.5"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDropAction((prev) => prev ?? 'end');
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDropAction(null);
      }}
      onDrop={(e) => handleContainerDrop(e, dropAction ?? 'end')}
    >
      {entries.map((entry) => {
        if (entry.type === 'group') {
          return (
            <ShortcutGroupButton
              key={entry.key}
              group={entry.data}
              isDragging={draggingKey === entry.key}
              isMergeTarget={false /* group absorbs via its own onDrop */}
              isDropTarget={
                dropAction !== null && dropAction !== 'end' && dropAction.key === entry.key && dropAction.mode === 'before'
              }
              onReorderDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData(DRAG_MIME, entry.key);
                dropHandledRef.current = false;
                setDraggingKey(entry.key);
              }}
              onReorderDragEnter={() => {
                if (draggingKey && draggingKey !== entry.key) {
                  setDropAction({ key: entry.key, mode: 'before' });
                }
              }}
              onReorderDragOver={(e) => {
                if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
                // Only reorder hint when source is itself a group (can't merge into group-of-group).
                const fromKey = draggingKey;
                if (fromKey && parseShortcutKey(fromKey)?.kind === 'group') {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                }
              }}
              onReorderDragEnd={() => {
                if (!dropHandledRef.current && pinnedShortcuts.includes(entry.key)) {
                  // Drag-out of a group: dissolve it entirely (keep children pinned).
                  useWorkspaceStore.getState().dissolveShortcutGroup(entry.data.id, { flatten: true });
                }
                dropHandledRef.current = false;
                setDraggingKey(null);
                setDropAction(null);
              }}
            />
          );
        }

        const s = entry.data;
        const isActive = s.kind === 'page' && s.route ? location.pathname.startsWith(s.route) : false;
        const isMerge =
          dropAction !== null && dropAction !== 'end' && dropAction.key === s.key && dropAction.mode === 'merge';
        const isBefore =
          dropAction !== null && dropAction !== 'end' && dropAction.key === s.key && dropAction.mode === 'before';
        const flyoutItems = resolveShortcutFlyoutItems(s);
        const pageActions: NavFlyoutAction[] = [
          {
            id: 'unpin',
            label: 'Unpin from shortcuts',
            icon: 'pin',
            danger: true,
            onClick: () => toggleShortcutPin(s.key),
          },
        ];
        return (
          <SubNavFlyout
            key={s.key}
            items={flyoutItems}
            route={s.route ?? '/'}
            pageActions={pageActions}
          >
            <ShortcutButton
              shortcut={s}
              isActive={isActive}
              isDragging={draggingKey === s.key}
              isDropBefore={isBefore}
              isMergeTarget={isMerge}
              onClick={() => handleOpen(s)}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData(DRAG_MIME, s.key);
                dropHandledRef.current = false;
                setDraggingKey(s.key);
              }}
              onDragEnter={() => {
                if (draggingKey && draggingKey !== s.key) {
                  setDropAction({ key: s.key, mode: 'before' });
                }
              }}
              onDragOver={(e, relativeY, height) => {
                if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                // Position detection: center = merge; edges = reorder before.
                const mergeZoneStart = (height - MERGE_ZONE_PX) / 2;
                const mergeZoneEnd = mergeZoneStart + MERGE_ZONE_PX;
                const wantMerge = relativeY >= mergeZoneStart && relativeY <= mergeZoneEnd;
                setDropAction({ key: s.key, mode: wantMerge ? 'merge' : 'before' });
              }}
              onDragEnd={() => {
                if (!dropHandledRef.current && pinnedShortcuts.includes(s.key)) {
                  toggleShortcutPin(s.key);
                }
                dropHandledRef.current = false;
                setDraggingKey(null);
                setDropAction(null);
              }}
            />
          </SubNavFlyout>
        );
      })}
    </div>
  );
}

/** Pull any cascade children the pinned target exposes (panel children or manual page subnav). */
function resolveShortcutFlyoutItems(s: ResolvedShortcut): SubNavItem[] {
  if (s.kind === 'panel') {
    const panel = panelSelectors.get(s.id);
    const children = panel?.navigation?.children;
    if (!children) return [];
    try {
      return typeof children === 'function' ? children() : children;
    } catch {
      return [];
    }
  }
  // For pages, forward only manually-authored subnav (auto-computed subnav lives
  // in ActivityBar and isn't duplicated here to avoid heavy recomputation).
  const pages = moduleRegistry.getPages({ includeHidden: true });
  const page = pages.find((p) => p.id === s.id);
  if (!page?.subNav) return [];
  try {
    return typeof page.subNav === 'function' ? page.subNav() : page.subNav;
  } catch {
    return [];
  }
}

function ShortcutButton({
  shortcut,
  isActive,
  isDragging,
  isDropBefore,
  isMergeTarget,
  onClick,
  onDragStart,
  onDragEnter,
  onDragOver,
  onDragEnd,
}: {
  shortcut: ResolvedShortcut;
  isActive: boolean;
  isDragging: boolean;
  isDropBefore: boolean;
  isMergeTarget: boolean;
  onClick: () => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnter: () => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>, relativeY: number, height: number) => void;
  onDragEnd: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const btnRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={btnRef}
      className="relative flex items-center justify-center"
      draggable
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragOver={(e) => {
        const rect = btnRef.current?.getBoundingClientRect();
        if (!rect) return;
        onDragOver(e, e.clientY - rect.top, rect.height);
      }}
      onDragEnd={onDragEnd}
      data-shortcut-key={shortcut.key}
    >
      {isDropBefore && (
        <div className="absolute -top-0.5 left-1 right-1 h-0.5 rounded-full bg-accent" />
      )}
      {isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r bg-accent-muted" />
      )}
      <button
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`w-10 h-10 flex items-center justify-center rounded-lg transition-all ${
          isDragging
            ? 'opacity-40 text-neutral-400'
            : isMergeTarget
              ? 'bg-accent/20 ring-2 ring-accent scale-110 text-accent'
              : isActive
                ? 'text-accent bg-accent/15'
                : 'text-neutral-500 hover:text-neutral-200 hover:bg-neutral-700/50'
        }`}
        aria-label={`Open ${shortcut.title}`}
      >
        <NavIcon name={shortcut.icon} size={18} />
      </button>
      <Tooltip content={shortcut.title} position="right" show={hovered && !isDragging} delay={400} />
    </div>
  );
}

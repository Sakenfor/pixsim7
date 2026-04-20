import { PortalFloat, useHoverExpand } from '@pixsim7/shared.ui';
import { useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { panelSelectors } from '@lib/plugins/catalogSelectors';

import { openWorkspacePanel, useWorkspaceStore } from '@features/workspace';
import type { ShortcutGroupRecord } from '@features/workspace/stores/workspaceStore';

import { moduleRegistry } from '@app/modules';

import { NavIcon } from './ActivityBar';
import { DRAG_MIME, parseShortcutKey } from './shortcutDrag';

export interface ResolvedChild {
  key: string;
  kind: 'panel' | 'page';
  id: string;
  icon: string;
  title: string;
  route?: string;
}

interface Props {
  group: ShortcutGroupRecord;
  isDragging: boolean;
  isMergeTarget: boolean;
  isDropTarget: boolean;
  /** External drag is currently hovering this group (for showing absorb hint). */
  onReorderDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
  onReorderDragEnter: () => void;
  onReorderDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onReorderDragEnd: () => void;
}

/**
 * iOS-style folder button: 2×2 mini-grid of child icons.
 * Hover → flyout with members (click to open, drag out to remove).
 * Accepts drops to add members (handled in parent via onDragOver on the button wrapper).
 */
export function ShortcutGroupButton({
  group,
  isDragging,
  isMergeTarget,
  isDropTarget,
  onReorderDragStart,
  onReorderDragEnter,
  onReorderDragOver,
  onReorderDragEnd,
}: Props) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const addToShortcutGroup = useWorkspaceStore((s) => s.addToShortcutGroup);
  const removeFromShortcutGroup = useWorkspaceStore((s) => s.removeFromShortcutGroup);
  const renameShortcutGroup = useWorkspaceStore((s) => s.renameShortcutGroup);
  const dissolveShortcutGroup = useWorkspaceStore((s) => s.dissolveShortcutGroup);

  const { isExpanded, handlers } = useHoverExpand({
    expandDelay: 300,
    collapseDelay: 200,
  });

  const [renaming, setRenaming] = useState(false);
  const [labelDraft, setLabelDraft] = useState(group.label);
  const [isDragOverBtn, setIsDragOverBtn] = useState(false);

  const children: ResolvedChild[] = useMemo(() => {
    const pages = moduleRegistry.getPages({ includeHidden: true });
    const pageMap = new Map(pages.map((p) => [p.id, p]));
    const out: ResolvedChild[] = [];
    for (const key of group.childKeys) {
      const parsed = parseShortcutKey(key);
      if (!parsed || parsed.kind === 'group') continue;
      if (parsed.kind === 'panel') {
        const panel = panelSelectors.get(parsed.id);
        if (!panel) continue;
        out.push({
          key,
          kind: 'panel',
          id: parsed.id,
          icon: panel.icon ?? 'layout',
          title: panel.title,
        });
      } else {
        const page = pageMap.get(parsed.id);
        if (!page) continue;
        out.push({ key, kind: 'page', id: parsed.id, icon: page.icon, title: page.name, route: page.route });
      }
    }
    return out;
  }, [group.childKeys]);

  const miniIcons = children.slice(0, 4);
  const groupKey = `group:${group.id}`;

  const handleChildClick = (c: ResolvedChild) => {
    if (c.kind === 'page' && c.route) navigate(c.route);
    else openWorkspacePanel(c.id);
  };

  const commitRename = () => {
    const trimmed = labelDraft.trim();
    if (trimmed && trimmed !== group.label) renameShortcutGroup(group.id, trimmed);
    setRenaming(false);
  };

  return (
    <div
      ref={triggerRef}
      className="relative flex items-center justify-center"
      draggable
      onDragStart={onReorderDragStart}
      onDragEnter={onReorderDragEnter}
      onDragOver={(e) => {
        onReorderDragOver(e);
        if (e.dataTransfer.types.includes(DRAG_MIME)) {
          setIsDragOverBtn(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setIsDragOverBtn(false);
      }}
      onDrop={(e) => {
        const fromKey = e.dataTransfer.getData(DRAG_MIME);
        setIsDragOverBtn(false);
        const parsed = parseShortcutKey(fromKey);
        if (!parsed || parsed.kind === 'group') return;
        e.preventDefault();
        e.stopPropagation();
        addToShortcutGroup(group.id, fromKey);
      }}
      onDragEnd={onReorderDragEnd}
      {...handlers}
    >
      {isDropTarget && (
        <div className="absolute -top-0.5 left-1 right-1 h-0.5 rounded-full bg-accent" />
      )}
      <button
        className={`w-10 h-10 p-1 flex items-center justify-center rounded-lg transition-all ${
          isDragging
            ? 'opacity-40'
            : isMergeTarget || isDragOverBtn
              ? 'bg-accent/20 ring-2 ring-accent scale-110'
              : 'bg-neutral-800/60 hover:bg-neutral-700/60'
        }`}
        aria-label={`Group: ${group.label}`}
      >
        <div className="grid grid-cols-2 grid-rows-2 gap-0.5 w-full h-full">
          {Array.from({ length: 4 }).map((_, i) => {
            const child = miniIcons[i];
            return (
              <div
                key={i}
                className={`flex items-center justify-center rounded ${
                  child ? 'bg-neutral-700/60 text-neutral-300' : 'bg-transparent'
                }`}
              >
                {child && <NavIcon name={child.icon} size={8} />}
              </div>
            );
          })}
        </div>
      </button>

      {isExpanded && (
        <PortalFloat
          anchor={triggerRef.current}
          placement="right"
          align="start"
          offset={4}
          className="py-1.5 min-w-[200px] bg-neutral-900/95 border border-neutral-700/60 rounded-lg shadow-xl backdrop-blur-sm"
          onMouseEnter={handlers.onMouseEnter}
          onMouseLeave={handlers.onMouseLeave}
        >
          {/* Group header: name (editable) */}
          <div className="px-3 py-1 flex items-center gap-2 border-b border-neutral-700/40 mb-1">
            {renaming ? (
              <input
                autoFocus
                value={labelDraft}
                onChange={(e) => setLabelDraft(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  else if (e.key === 'Escape') {
                    setLabelDraft(group.label);
                    setRenaming(false);
                  }
                }}
                className="flex-1 bg-neutral-800 border border-neutral-700 rounded px-1.5 py-0.5 text-xs text-neutral-100 outline-none focus:border-accent/50"
              />
            ) : (
              <button
                onClick={() => {
                  setLabelDraft(group.label);
                  setRenaming(true);
                }}
                className="flex-1 text-left text-xs font-medium text-neutral-200 hover:text-accent truncate"
                title="Click to rename"
              >
                {group.label}
              </button>
            )}
            <button
              onClick={() => dissolveShortcutGroup(group.id, { flatten: true })}
              className="text-[10px] text-neutral-500 hover:text-neutral-300 px-1.5 py-0.5 rounded hover:bg-neutral-700/50"
              title="Dissolve group (keep all members pinned)"
            >
              ungroup
            </button>
          </div>

          {/* Group members (draggable) */}
          {children.map((c) => {
            const isActive = c.kind === 'page' && c.route ? location.pathname.startsWith(c.route) : false;
            return (
              <div
                key={c.key}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData(DRAG_MIME, c.key);
                  e.dataTransfer.setData('application/x-pixsim7-group-source', group.id);
                }}
                onClick={() => handleChildClick(c)}
                className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm transition-colors cursor-pointer ${
                  isActive
                    ? 'text-accent bg-accent/15'
                    : 'text-neutral-300 hover:text-neutral-100 hover:bg-neutral-700/50'
                }`}
              >
                <NavIcon name={c.icon} size={14} />
                <span className="truncate">{c.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFromShortcutGroup(group.id, c.key, { promoteToPinned: true });
                  }}
                  className="ml-auto opacity-0 group-hover/row:opacity-100 hover:opacity-100 text-neutral-500 hover:text-neutral-200 text-xs"
                  title="Remove from group"
                >
                  −
                </button>
              </div>
            );
          })}
          <div className="px-3 py-1 text-[10px] text-neutral-600 italic">
            Drag members out to promote, or drop another shortcut on this folder to add.
          </div>
          <input type="hidden" value={groupKey} />
        </PortalFloat>
      )}
    </div>
  );
}

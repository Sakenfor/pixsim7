import { Tooltip } from '@pixsim7/shared.ui';
import { useEffect, useMemo, useState } from 'react';

import { panelSelectors } from '@lib/plugins/catalogSelectors';

import { openWorkspacePanel, useWorkspaceStore } from '@features/workspace';
import { getFloatingDefinitionId } from '@features/workspace/lib/floatingPanelUtils';

import { NavIcon } from './ActivityBar';
import { DRAG_MIME, pinnedPanelIdsFrom } from './shortcutDrag';

const MAX_RECENT = 3;

/**
 * Auto-populated "recent" shortcuts below pinned shortcuts.
 * Derived from currently-open floating panels + previously-floated panels.
 * Not editable — surface only. Drag one onto PanelShortcuts to pin it.
 */
export function RecentShortcuts() {
  const floatingPanels = useWorkspaceStore((s) => s.floatingPanels);
  const lastFloatingPanelStates = useWorkspaceStore((s) => s.lastFloatingPanelStates);
  const pinnedShortcuts = useWorkspaceStore((s) => s.pinnedShortcuts);
  const pinnedIds = useMemo(() => pinnedPanelIdsFrom(pinnedShortcuts), [pinnedShortcuts]);

  // Re-render when plugin catalog changes
  const [version, setVersion] = useState(0);
  useEffect(() => {
    return panelSelectors.subscribe(() => setVersion((v) => v + 1));
  }, []);

  const recentIds = useMemo(() => {
    void version;
    const pinned = new Set(pinnedIds);
    const seen = new Set<string>();
    const out: string[] = [];
    // Currently-open floats take priority
    for (const panel of floatingPanels) {
      const defId = getFloatingDefinitionId(panel.id);
      if (pinned.has(defId) || seen.has(defId)) continue;
      seen.add(defId);
      out.push(defId);
      if (out.length >= MAX_RECENT) return out;
    }
    // Then previously-floated (reverse = most recent first)
    const historical = Object.keys(lastFloatingPanelStates).reverse();
    for (const defId of historical) {
      if (pinned.has(defId) || seen.has(defId)) continue;
      seen.add(defId);
      out.push(defId);
      if (out.length >= MAX_RECENT) return out;
    }
    return out;
  }, [floatingPanels, lastFloatingPanelStates, pinnedIds, version]);

  const panels = useMemo(
    () =>
      recentIds
        .map((id) => panelSelectors.get(id))
        .filter((p): p is NonNullable<typeof p> => p != null),
    [recentIds],
  );

  if (panels.length === 0) return null;

  return (
    <div className="flex flex-col items-center gap-0.5">
      {panels.map((panel) => (
        <RecentShortcutButton
          key={panel.id}
          id={panel.id}
          icon={panel.icon ?? 'layout'}
          title={panel.title}
          onClick={() => openWorkspacePanel(panel.id)}
        />
      ))}
    </div>
  );
}

function RecentShortcutButton({
  id,
  icon,
  title,
  onClick,
}: {
  id: string;
  icon: string;
  title: string;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div
      className="relative flex items-center justify-center"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData(DRAG_MIME, `panel:${id}`);
        setIsDragging(true);
      }}
      onDragEnd={() => setIsDragging(false)}
    >
      <button
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
          isDragging
            ? 'opacity-40 text-neutral-400'
            : 'text-neutral-600/70 hover:text-neutral-300 hover:bg-neutral-700/40'
        }`}
        aria-label={`Open ${title}`}
      >
        <NavIcon name={icon} size={16} />
      </button>
      <Tooltip
        content={`${title} (recent — drag to pin)`}
        position="right"
        show={hovered && !isDragging}
        delay={400}
      />
    </div>
  );
}

import { Tooltip } from '@pixsim7/shared.ui';
import { useEffect, useMemo, useState } from 'react';

import { panelSelectors } from '@lib/plugins/catalogSelectors';

import { useWorkspaceStore } from '@features/workspace';

import { NavIcon } from './ActivityBar';

/**
 * Pinned panel shortcut buttons rendered in the ActivityBar.
 * Each button opens/focuses the corresponding panel in workspace dockview.
 */
export function PanelShortcuts() {
  const pinnedIds = useWorkspaceStore((s) => s.pinnedQuickAddPanels);
  const restorePanel = useWorkspaceStore((s) => s.restorePanel);

  // Re-render when plugin catalog changes (panels registered/unregistered)
  const [, setVersion] = useState(0);
  useEffect(() => {
    return panelSelectors.subscribe(() => setVersion((v) => v + 1));
  }, []);

  const panels = useMemo(
    () =>
      pinnedIds
        .map((id) => panelSelectors.get(id))
        .filter((p): p is NonNullable<typeof p> => p != null),
    [pinnedIds],
  );

  if (panels.length === 0) return null;

  return (
    <div className="flex flex-col items-center gap-0.5">
      {panels.map((panel) => (
        <PanelShortcutButton
          key={panel.id}
          icon={panel.icon ?? 'layout'}
          title={panel.title}
          onClick={() => restorePanel(panel.id)}
        />
      ))}
    </div>
  );
}

function PanelShortcutButton({
  icon,
  title,
  onClick,
}: {
  icon: string;
  title: string;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div className="relative flex items-center justify-center">
      <button
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="w-10 h-10 flex items-center justify-center rounded-lg text-neutral-500 hover:text-neutral-200 hover:bg-neutral-700/50 transition-colors"
        aria-label={`Open ${title}`}
      >
        <NavIcon name={icon} size={18} />
      </button>
      <Tooltip content={title} position="right" show={hovered} delay={400} />
    </div>
  );
}

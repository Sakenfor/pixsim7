/**
 * SiblingPanelsDropdown
 *
 * Rendered in the right side of each dockview group header.
 * Shows a "+" button that opens a dropdown of sibling panels
 * (related panels that can be quickly added as a tab in the same group).
 */

import { DropdownItem, Popover } from '@pixsim7/shared.ui';
import { resolvePanelDefinitionId, addDockviewPanel } from '@pixsim7/shared.ui.dockview';
import type { IDockviewHeaderActionsProps } from 'dockview-core';
import { useCallback, useMemo, useRef, useState } from 'react';

import { panelSelectors } from '@lib/plugins/catalogSelectors';

import { resolveSiblings, filterOpenSiblings } from '@features/panels';

export function SiblingPanelsDropdown({
  containerApi,
  activePanel,
  panels,
}: IDockviewHeaderActionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const activePanelDefId = activePanel
    ? resolvePanelDefinitionId(activePanel)
    : undefined;

  const allSiblings = useMemo(() => {
    if (!activePanelDefId) return [];
    return resolveSiblings(activePanelDefId, panelSelectors.getPublicPanels());
  }, [activePanelDefId]);

  const openInGroup = useMemo(() => {
    const ids = new Set<string>();
    for (const p of panels) {
      const defId = resolvePanelDefinitionId(p);
      if (defId) ids.add(defId);
    }
    return ids;
  }, [panels]);

  const available = useMemo(
    () => filterOpenSiblings(allSiblings, openInGroup),
    [allSiblings, openInGroup],
  );

  const handleAdd = useCallback(
    (siblingId: string) => {
      if (!activePanel) return;
      addDockviewPanel(containerApi, siblingId, {
        position: { direction: 'within', referencePanel: activePanel.id },
      });
      setIsOpen(false);
    },
    [containerApi, activePanel],
  );

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  // Nothing to show — no siblings at all for this panel
  if (allSiblings.length === 0) return null;

  return (
    <div className="flex items-center h-full px-0.5">
      <button
        ref={buttonRef}
        onClick={handleToggle}
        disabled={available.length === 0}
        className="flex items-center justify-center w-5 h-5 rounded text-neutral-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-colors"
        title={available.length > 0 ? 'Add sibling panel' : 'All sibling panels already open'}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      <Popover
        open={isOpen}
        onClose={() => setIsOpen(false)}
        anchor={buttonRef.current}
        placement="bottom"
        align="end"
        offset={2}
        triggerRef={buttonRef}
        className="min-w-[140px] rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl p-1"
      >
        {available.map((s) => (
          <DropdownItem key={s.id} onClick={() => handleAdd(s.id)}>
            {s.title}
          </DropdownItem>
        ))}
      </Popover>
    </div>
  );
}

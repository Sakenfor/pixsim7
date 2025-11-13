import React from 'react';
import clsx from 'clsx';
import { useLayoutStore } from '../../stores/layoutStore';

interface PanelChromeProps {
  panelId: string;
  title?: string;
  children: React.ReactNode;
}

export const PanelChrome: React.FC<PanelChromeProps> = ({ panelId, title, children }) => {
  const active = useLayoutStore(s => s.activePanelId === panelId);
  const setActive = useLayoutStore(s => s.setActive);

  return (
    <div
      data-panel-id={panelId}
      className={clsx('flex flex-col h-full border rounded bg-white dark:bg-neutral-900 overflow-hidden',
        active ? 'border-blue-400 shadow-sm' : 'border-neutral-200 dark:border-neutral-700')}
      onClick={() => setActive(panelId)}
    >
      <div className={clsx('px-2 py-1 text-xs font-medium flex items-center justify-between select-none', active ? 'bg-blue-50 dark:bg-blue-900/30' : 'bg-neutral-50 dark:bg-neutral-800')}>
        <span className="truncate">{title || panelId}</span>
        <div className="flex gap-1">
          {/* future: actions like close, popout, minimize */}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">{children}</div>
    </div>
  );
};

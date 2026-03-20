/**
 * QuickLauncherFace
 *
 * Cube face component: grid of quick-launch panel buttons.
 */

import { useMemo } from 'react';

import { Icon } from '@lib/icons';
import { panelSelectors } from '@lib/plugins/catalogSelectors';

import { openWorkspacePanel } from '@features/workspace';

import type { CubeFaceComponentProps } from '../../lib/cubeFaceRegistry';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function QuickLauncherFace(props: CubeFaceComponentProps) {
  const panels = useMemo(() => panelSelectors.getPublicPanels().slice(0, 12), []);

  return (
    <div className="p-2 w-[200px]">
      <div className="px-1 pb-1.5 text-[10px] uppercase tracking-wider text-neutral-500 font-medium">
        Quick Launch
      </div>
      <div className="grid grid-cols-3 gap-1">
        {panels.map((panel) => (
          <button
            key={panel.id}
            type="button"
            onClick={() => openWorkspacePanel(panel.id)}
            className="flex flex-col items-center gap-1 px-1 py-2 rounded-md text-neutral-300 hover:bg-cyan-600/20 hover:text-cyan-300 transition-colors"
            title={panel.title}
          >
            <Icon name={panel.icon ?? 'layoutGrid'} size={16} className="shrink-0" />
            <span className="text-[9px] truncate w-full text-center">{panel.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

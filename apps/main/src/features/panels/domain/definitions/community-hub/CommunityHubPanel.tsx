import clsx from 'clsx';
import { useState } from 'react';

import { Icon } from '@lib/icons';

import { COMMUNITY_VIEWS, DEFAULT_VIEW_ID, type CommunityView } from './sidebar';

// ---------------------------------------------------------------------------
// Sidebar button
// ---------------------------------------------------------------------------

function SidebarButton({
  view,
  active,
  onClick,
}: {
  view: CommunityView;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={view.label}
      className={clsx(
        'flex items-center justify-center w-8 h-8 rounded-md transition-colors',
        active
          ? 'bg-indigo-600/20 text-indigo-400'
          : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-700/50',
      )}
    >
      <Icon name={view.icon} size={16} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Host panel
// ---------------------------------------------------------------------------

export function CommunityHubPanel() {
  const [activeId, setActiveId] = useState(DEFAULT_VIEW_ID);
  const activeView = COMMUNITY_VIEWS.find((v) => v.id === activeId) ?? COMMUNITY_VIEWS[0];
  const ActiveComponent = activeView.component;

  return (
    <div className="flex h-full overflow-hidden bg-neutral-900">
      {/* Sidebar rail */}
      <div className="flex flex-col items-center gap-1 py-2 px-1 border-r border-neutral-800 bg-neutral-900/80">
        {COMMUNITY_VIEWS.map((view) => (
          <SidebarButton
            key={view.id}
            view={view}
            active={view.id === activeId}
            onClick={() => setActiveId(view.id)}
          />
        ))}
      </div>

      {/* Content area */}
      <div className="flex-1 min-w-0 overflow-auto">
        <ActiveComponent />
      </div>
    </div>
  );
}

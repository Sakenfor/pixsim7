import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

import { getDockviewApi, subscribeToDockviewRegistry, addDockviewPanel, focusPanel } from '@lib/dockview';

import { DockviewWorkspace } from "../components/DockviewWorkspace";
import { WorkspaceToolbar } from "../components/WorkspaceToolbar";

/**
 * Reads `openPanel` from URL query params, waits for the workspace dockview
 * to be ready, then opens (or focuses) the requested panel.
 */
function useOpenPanelFromQuery() {
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const panelId = searchParams.get('openPanel');
    if (!panelId) return;

    function tryOpenPanel(): boolean {
      const api = getDockviewApi('workspace');
      if (!api) return false;

      const focused = focusPanel(api, panelId!);
      if (!focused) {
        addDockviewPanel(api, panelId!);
      }

      // Clean up the query param
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('openPanel');
        return next;
      }, { replace: true });

      return true;
    }

    // Try immediately — workspace may already be ready
    if (tryOpenPanel()) return;

    // Otherwise wait for the registry to report it
    const unsubscribe = subscribeToDockviewRegistry(() => {
      if (tryOpenPanel()) {
        unsubscribe();
      }
    });

    return unsubscribe;
  }, [searchParams, setSearchParams]);
}

export function WorkspaceRoute() {
  useOpenPanelFromQuery();

  return (
    <div className="h-screen flex flex-col bg-neutral-100 dark:bg-neutral-950">
      <WorkspaceToolbar />
      <div className="flex-1 min-h-0">
        <DockviewWorkspace />
      </div>
    </div>
  );
}

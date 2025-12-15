import { DockviewWorkspace } from "../components/DockviewWorkspace";
import { WorkspaceToolbar } from "../components/WorkspaceToolbar";

export function WorkspaceRoute() {
  return (
    <div className="h-screen flex flex-col pb-60 bg-neutral-100 dark:bg-neutral-950">
      <WorkspaceToolbar />
      <div className="flex-1 min-h-0">
        <DockviewWorkspace />
      </div>
    </div>
  );
}

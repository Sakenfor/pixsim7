import { MosaicWorkspace } from '../components/layout/MosaicWorkspace';
import { WorkspaceToolbar } from '../components/layout/WorkspaceToolbar';

export function WorkspaceRoute() {
  return (
    <div className="h-screen flex flex-col pb-60 bg-neutral-100 dark:bg-neutral-950">
      <WorkspaceToolbar />
      <div className="flex-1 min-h-0">
        <MosaicWorkspace />
      </div>
    </div>
  );
}

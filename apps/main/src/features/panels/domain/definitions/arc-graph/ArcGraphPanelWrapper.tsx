import { ReactFlowProvider } from 'reactflow';

import { ArcGraphPanel } from '@features/graph';

export function ArcGraphPanelWrapper() {
  return (
    <ReactFlowProvider>
      <ArcGraphPanel />
    </ReactFlowProvider>
  );
}

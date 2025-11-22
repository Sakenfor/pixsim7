import { ReactFlowProvider } from 'reactflow';
import { ArcGraphPanel } from '../components/arc-graph/ArcGraphPanel';

/**
 * Arc Graph Route
 *
 * Main route for the arc/quest graph editor.
 * Provides a higher-level view of story arcs and quests
 * that sits above the scene graph.
 */
export function ArcGraphRoute() {
  return (
    <div className="h-screen flex flex-col">
      <ReactFlowProvider>
        <ArcGraphPanel />
      </ReactFlowProvider>
    </div>
  );
}

import { useParams } from 'react-router-dom';
import { useLineageGraph } from '../hooks/useLineageGraph';

export function GraphRoute() {
  const { id } = useParams();
  const numericId = id ? Number(id) : null;
  const { graph, loading, error } = useLineageGraph(numericId, 2);
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Lineage Graph (Stub)</h1>
      {loading && <div>Loading graph...</div>}
      {error && <div className="text-red-600 text-sm">{error}</div>}
      {graph && (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h2 className="font-medium mb-2 text-sm">Nodes</h2>
            <pre className="text-xs bg-neutral-100 p-3 rounded max-h-64 overflow-auto">{JSON.stringify(graph.nodes, null, 2)}</pre>
          </div>
          <div>
            <h2 className="font-medium mb-2 text-sm">Edges</h2>
            <pre className="text-xs bg-neutral-100 p-3 rounded max-h-64 overflow-auto">{JSON.stringify(graph.edges, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

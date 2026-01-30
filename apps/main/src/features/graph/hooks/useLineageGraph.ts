import { useEffect, useState } from 'react';

import { pixsimClient } from '@lib/api/client';

export interface GraphNode { id: number; media_type: string; provider_id: string; thumbnail_url: string; duration_sec?: number | null }
export interface GraphEdge { source: number; target: number; relation_type: string }
export interface LineageGraph { root_asset_id: number; depth: number; nodes: GraphNode[]; edges: GraphEdge[] }

export function useLineageGraph(assetId: number | null, depth = 2) {
  const [graph, setGraph] = useState<LineageGraph | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!assetId) return;
    let active = true;
    async function run() {
      setLoading(true); setError(null);
      try {
        const data = await pixsimClient.get<LineageGraph>(`/lineage/graph/${assetId}?depth=${depth}`);
        if (active) setGraph(data);
      } catch (e: unknown) {
        if (active) setError(e instanceof Error ? e.message : 'Failed to load lineage graph');
      } finally { if (active) setLoading(false); }
    }
    run();
    return () => { active = false; };
  }, [assetId, depth]);

  return { graph, loading, error };
}

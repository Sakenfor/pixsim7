/**
 * Architecture Graph loader.
 *
 * Fetches the canonical ArchitectureGraphV1 from the backend,
 * with offline fallback to the local generated artifact.
 */

import { createDevArchitectureApi } from '@pixsim7/shared.api.client/domains';
import type { ArchitectureGraphV1 } from '@pixsim7/shared.api.model';
import { pixsimClient } from '@lib/api/client';

const devArchitectureApi = createDevArchitectureApi(pixsimClient);

export type GraphLoadSource = 'backend' | 'fallback_local';

export interface GraphLoadResult {
  graph: ArchitectureGraphV1;
  loadSource: GraphLoadSource;
  error?: string;
}

/**
 * Load the architecture graph.
 *
 * Fallback order:
 * 1. Backend `/dev/architecture/graph` endpoint (live data).
 * 2. Local generated artifact `docs/app_map.generated.json` +
 *    stub backend section (marked `fallback_local`).
 */
export async function loadArchitectureGraph(): Promise<GraphLoadResult> {
  // Try backend first
  try {
    const graph = await devArchitectureApi.getArchitectureGraph();
    return { graph, loadSource: 'backend' };
  } catch {
    // Backend unreachable — fall through to local fallback
  }

  // Fallback: build a minimal graph from the local artifact
  return buildFallbackGraph();
}

async function buildFallbackGraph(): Promise<GraphLoadResult> {
  const now = new Date().toISOString();
  let entries: NonNullable<ArchitectureGraphV1['frontend']['entries']> = [];
  let frontendKind: 'generated_artifact' | 'fallback_local' = 'fallback_local';
  let generatedAt: string | null = null;
  let error: string | undefined;

  try {
    const res = await fetch('/docs/app_map.generated.json');
    if (res.ok) {
      const data = await res.json();
      entries = data.entries ?? [];
      generatedAt = data.generatedAt ?? null;
      frontendKind = 'generated_artifact';
    } else {
      error = 'Backend offline and local artifact not available';
    }
  } catch {
    error = 'Backend offline and local artifact not available';
  }

  const graph: ArchitectureGraphV1 = {
    version: '1.0.0',
    generated_at: now,
    sources: {
      frontend: { kind: frontendKind, path: 'docs/app_map.generated.json', generated_at: generatedAt },
      backend: { kind: 'runtime_introspection', generated_at: now },
    },
    frontend: { entries },
    backend: { routes: [], plugins: [], services: [], capability_apis: [] },
    links: [],
    metrics: {
      total_frontend_features: entries.length,
      total_backend_routes: 0,
      drift_warnings: [
        ...(error
          ? [{ code: 'backend_offline', message: error, severity: 'warning' as const }]
          : []),
      ],
    },
  };

  return { graph, loadSource: 'fallback_local', error };
}

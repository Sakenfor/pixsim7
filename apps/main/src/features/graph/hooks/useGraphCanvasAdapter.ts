import { useMemo, type DependencyList } from 'react';

import type {
  GraphCanvasAdapter,
  GraphDomainAdapter,
} from '@/features/graph/components/graph/graphDomainAdapter';

type AnyGraphAdapter = GraphCanvasAdapter & Partial<GraphDomainAdapter>;

export function useGraphCanvasAdapter<TAdapter extends AnyGraphAdapter>(
  factory: () => TAdapter,
  deps: DependencyList,
): TAdapter {
  return useMemo(factory, deps);
}

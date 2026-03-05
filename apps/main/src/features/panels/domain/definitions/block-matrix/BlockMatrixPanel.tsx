/**
 * BlockMatrixPanel - Standalone panel wrapper for BlockMatrixView.
 *
 * Provides full controls for exploring block coverage matrices.
 * Can also receive initial context from panel open calls.
 */
import { useEffect, useMemo, useState } from 'react';

import { listContentPackManifests } from '@lib/api/blockTemplates';

import { BlockMatrixView, type BlockMatrixViewProps } from './BlockMatrixView';
import {
  DEFAULT_BLOCK_MATRIX_PRESETS,
  mergeBlockMatrixPresets,
  readContentPackMatrixPresets,
  type BlockMatrixPreset,
} from './presets';

interface BlockMatrixPanelProps {
  context?: Record<string, unknown>;
}

export function BlockMatrixPanel({ context }: BlockMatrixPanelProps) {
  const [packPresets, setPackPresets] = useState<BlockMatrixPreset[]>([]);

  const initialQuery = useMemo((): BlockMatrixViewProps['initialQuery'] => {
    if (!context) return undefined;
    const q: BlockMatrixViewProps['initialQuery'] = {};
    if (typeof context.row_key === 'string') q.row_key = context.row_key;
    if (typeof context.col_key === 'string') q.col_key = context.col_key;
    if (typeof context.package_name === 'string') q.package_name = context.package_name;
    if (typeof context.composition_role === 'string') q.composition_role = context.composition_role;
    if (typeof context.role === 'string' && !q.composition_role) q.composition_role = context.role;
    if (typeof context.category === 'string') q.category = context.category;
    if (typeof context.tags === 'string') q.tags = context.tags;
    return Object.keys(q).length > 0 ? q : undefined;
  }, [context]);

  const contextPresets = useMemo(() => {
    const raw = context?.presets;
    if (!Array.isArray(raw)) return undefined;
    const out: BlockMatrixPreset[] = [];
    for (let i = 0; i < raw.length; i += 1) {
      const item = raw[i];
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      if (typeof rec.label !== 'string' || !rec.label.trim()) continue;
      if (!rec.query || typeof rec.query !== 'object') continue;
      out.push({
        id: typeof rec.id === 'string' ? rec.id : `context-${i}`,
        label: rec.label.trim(),
        description: typeof rec.description === 'string' ? rec.description : undefined,
        query: rec.query as BlockMatrixPreset['query'],
        source: 'context',
      });
    }
    return out.length > 0 ? out : undefined;
  }, [context]);

  const contextPackageName = useMemo(
    () => (typeof context?.package_name === 'string' && context.package_name.trim() ? context.package_name.trim() : null),
    [context],
  );

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const manifests = await listContentPackManifests();
        if (!alive) return;
        setPackPresets(readContentPackMatrixPresets(manifests, { packName: contextPackageName }));
      } catch {
        if (!alive) return;
        setPackPresets([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [contextPackageName]);

  return (
    <BlockMatrixView
      initialQuery={initialQuery}
      presets={mergeBlockMatrixPresets(DEFAULT_BLOCK_MATRIX_PRESETS, packPresets, contextPresets)}
    />
  );
}

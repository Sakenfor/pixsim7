/**
 * BlockAuthoringPanel
 *
 * Generic shell for authoring block primitives. Hosts pluggable
 * "authoring methods" — different ways to author blocks — via the
 * method registry in methods/registry.ts.
 *
 * v1 ships a single CUE Pack method backed by the existing
 * /prompt-packs/drafts API. Future methods (e.g. AI-assisted, direct
 * canonical-pack editing) plug in by registering themselves; no
 * panel-shell changes required.
 *
 * Composition with Block Explorer:
 *   The shell can split its surface to embed BlockExplorerPanel as a
 *   "reference" pane. The Explorer reads compiled blocks from the
 *   runtime; the method-side editor authors new ones. Selection from
 *   Explorer is forwarded into the active method as a hint via
 *   BlockAuthoringMethodContext.
 *
 *   Selection is shared via the `CAP_BLOCK_SELECTION` capability
 *   (registered in features/contextHub). Block Explorer is the
 *   provider; the active method receives the currently-focused
 *   block id through BlockAuthoringMethodContext.
 */

import { useMemo, useState } from 'react';

import {
  CAP_BLOCK_SELECTION,
  useCapability,
  type BlockSelection,
} from '@features/contextHub';

// Registers the cue-pack method as a side effect of import.
import './methods/cue-pack';

import { BlockExplorerPanel } from '../block-explorer';

import { listBlockAuthoringMethods } from './methods/registry';

type ExplorerVisibility = 'hidden' | 'side';

export function BlockAuthoringPanel() {
  const methods = useMemo(() => listBlockAuthoringMethods(), []);
  const [methodId, setMethodId] = useState<string>(() => methods[0]?.id ?? '');
  const [explorer, setExplorer] = useState<ExplorerVisibility>('hidden');

  // Subscribe to the shared block selection. When the user clicks a
  // block in the embedded (or any other) Block Explorer instance, the
  // active method gets the id as a hint via its context prop.
  const { value: blockSelection } = useCapability<BlockSelection>(CAP_BLOCK_SELECTION);
  const selectedBlockId = blockSelection?.block?.blockId ?? null;

  const activeMethod = methods.find((m) => m.id === methodId) ?? methods[0];

  if (!activeMethod) {
    // No methods registered — should never happen in practice because
    // cue-pack registers itself on import above.
    return (
      <div className="h-full flex items-center justify-center bg-neutral-900">
        <p className="text-xs text-neutral-500">
          No authoring methods registered.
        </p>
      </div>
    );
  }

  const Editor = activeMethod.Editor;

  return (
    <div className="h-full flex flex-col bg-neutral-900">
      {/* Top bar: method picker + explorer toggle */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-neutral-800">
        <span className="text-[10px] uppercase tracking-wider text-neutral-500">
          Method
        </span>
        <select
          value={activeMethod.id}
          onChange={(e) => setMethodId(e.target.value)}
          className="text-[11px] bg-neutral-950 border border-neutral-800 text-neutral-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-neutral-600"
        >
          {methods.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <span className="text-[11px] text-neutral-500 truncate flex-1 min-w-0">
          {activeMethod.description}
        </span>
        <button
          type="button"
          onClick={() => setExplorer((v) => (v === 'side' ? 'hidden' : 'side'))}
          className={`text-[10px] px-2 py-1 rounded border ${
            explorer === 'side'
              ? 'border-blue-700/60 bg-blue-600/20 text-blue-100'
              : 'border-neutral-700 text-neutral-300 hover:bg-neutral-800'
          }`}
          title="Toggle the Block Explorer reference pane"
        >
          {explorer === 'side' ? 'Hide Explorer' : 'Show Explorer'}
        </button>
      </div>

      {/* Body: optional explorer pane + active method's editor */}
      <div className="flex-1 min-h-0 flex">
        {explorer === 'side' && (
          <div className="w-[420px] shrink-0 border-r border-neutral-800 min-w-0">
            <BlockExplorerPanel />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <Editor context={{ selectedBlockId }} />
        </div>
      </div>
    </div>
  );
}

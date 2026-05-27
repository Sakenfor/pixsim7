/**
 * AuthoringPanel
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
 *   AuthoringMethodContext.
 *
 *   Selection is shared via the `CAP_BLOCK_SELECTION` capability
 *   (registered in features/contextHub). Block Explorer is the
 *   provider; the active method receives the currently-focused
 *   block id through AuthoringMethodContext.
 *
 * Auth gating:
 *   Methods can opt into a user-availability predicate via
 *   `AuthoringMethod.isAvailable`. The shell filters the
 *   registry against the current user and falls back to the first
 *   available method if the previously-selected one is gated out.
 *   When zero methods are available, the shell renders a sign-in /
 *   upgrade hint. The frontend filter is a UX courtesy; backend
 *   endpoints behind admin-only methods enforce auth themselves.
 */

import { useAuthStore } from '@pixsim7/shared.auth.core';
import { useEffect, useMemo, useState } from 'react';

import {
  CAP_BLOCK_SELECTION,
  useCapability,
  type BlockSelection,
} from '@features/contextHub';

// Registers the cue-pack method as a side effect of import.
import './methods/cue-pack';

import { BlockExplorerPanel } from '../block-explorer';

import { listAvailableAuthoringMethods } from './methods/registry';

type ExplorerVisibility = 'hidden' | 'side';

export function AuthoringPanel() {
  // Re-filter the registry whenever the current user changes — methods
  // with an `isAvailable` predicate may swap in/out on login/logout.
  const currentUser = useAuthStore((s) => s.user);
  const methods = useMemo(
    () => listAvailableAuthoringMethods(currentUser),
    [currentUser],
  );
  const [methodId, setMethodId] = useState<string>(() => methods[0]?.id ?? '');
  const [explorer, setExplorer] = useState<ExplorerVisibility>('hidden');

  // If the currently selected method becomes unavailable (e.g. an
  // admin signs out), fall back to the first one that is.
  useEffect(() => {
    if (methods.length === 0) return;
    if (!methods.some((m) => m.id === methodId)) {
      setMethodId(methods[0].id);
    }
  }, [methods, methodId]);

  // Subscribe to the shared block selection. When the user clicks a
  // block in the embedded (or any other) Block Explorer instance, the
  // active method gets the id as a hint via its context prop.
  const { value: blockSelection } = useCapability<BlockSelection>(CAP_BLOCK_SELECTION);
  const selectedBlockId = blockSelection?.block?.blockId ?? null;

  const activeMethod = methods.find((m) => m.id === methodId) ?? methods[0];

  if (!activeMethod) {
    // Two paths land here:
    //   - the registry is empty (shouldn't happen — cue-pack registers
    //     itself on import above), or
    //   - every registered method is gated and the current user passes
    //     none of the gates (e.g. signed-out, viewing an admin-only build).
    return (
      <div className="h-full flex flex-col items-center justify-center gap-1.5 bg-neutral-900 px-6 text-center">
        <p className="text-xs text-neutral-400">No authoring methods available.</p>
        <p className="text-[11px] text-neutral-500">
          {currentUser
            ? 'Your account does not have access to any registered authoring methods.'
            : 'Sign in to access block authoring.'}
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

/**
 * Pack Hints Drawer
 *
 * Displays semantic pack and category discovery results.
 */

import clsx from 'clsx';
import { Button } from '@pixsim7/shared.ui';
import { Icon } from '@lib/icons';
import type { PromptBlockCandidate } from '@features/prompts';

// ============================================================================
// Types
// ============================================================================

interface CategoryDiscoveryResponse {
  prompt_text: string;
  candidates: PromptBlockCandidate[];
  existing_ontology_ids: string[];
  suggestions?: Record<string, unknown>;
  suggested_ontology_ids: Array<{
    id: string;
    label: string;
    description?: string;
    kind: string;
    confidence: number;
  }>;
  suggested_packs: Array<{
    pack_id: string;
    pack_label: string;
    parser_hints: Record<string, string[]>;
    notes?: string;
  }>;
  suggested_candidates: PromptBlockCandidate[];
}

interface PackHintsDrawerProps {
  open: boolean;
  onClose: () => void;
  packHints: CategoryDiscoveryResponse | null;
  isDevMode: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function PackHintsDrawer({
  open,
  onClose,
  packHints,
  isDevMode,
}: PackHintsDrawerProps) {
  if (!open) return null;

  const hasData = packHints !== null;
  const hasOntology = (packHints?.suggested_ontology_ids?.length ?? 0) > 0;
  const hasPacks = (packHints?.suggested_packs?.length ?? 0) > 0;
  const hasCandidates = (packHints?.suggested_candidates?.length ?? 0) > 0;
  const hasExisting = (packHints?.existing_ontology_ids?.length ?? 0) > 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className={clsx(
          'fixed right-0 top-0 h-full w-[28rem] max-w-[90vw]',
          'bg-white dark:bg-neutral-900',
          'border-l border-neutral-200 dark:border-neutral-700',
          'shadow-xl z-50',
          'flex flex-col',
          'transform transition-transform duration-200',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-700">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Icon name="folder" className="h-5 w-5" />
            Pack Hints
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
            aria-label="Close"
          >
            <Icon name="x" className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!hasData ? (
            <div className="text-center py-8">
              <Icon
                name="folder"
                className="h-12 w-12 mx-auto mb-4 text-neutral-300 dark:text-neutral-600"
              />
              <h3 className="text-lg font-medium mb-2">No Pack Hints</h3>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                {isDevMode
                  ? 'Run pack discovery to see semantic suggestions.'
                  : 'Pack hints require dev mode.'}
              </p>
            </div>
          ) : (
            <>
              {/* Dev-only notice */}
              {!isDevMode && (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-xs text-amber-700 dark:text-amber-300 mb-4">
                  <Icon name="info" className="h-3 w-3 inline mr-1" />
                  This is a development feature. Some actions may not be available.
                </div>
              )}

              {/* Existing Ontology IDs */}
              {hasExisting && (
                <section>
                  <h3 className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
                    Existing Categories
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {packHints!.existing_ontology_ids.map((id) => (
                      <span
                        key={id}
                        className="px-2 py-0.5 bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200 rounded text-xs font-mono"
                      >
                        {id}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {/* Suggested Ontology IDs */}
              {hasOntology && (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-neutral-600 dark:text-neutral-400">
                    Suggested Categories ({packHints!.suggested_ontology_ids.length})
                  </h3>
                  {packHints!.suggested_ontology_ids.map((suggestion) => (
                    <div
                      key={suggestion.id}
                      className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg"
                    >
                      <div className="flex items-start justify-between mb-1">
                        <code className="text-xs font-mono text-blue-800 dark:text-blue-200">
                          {suggestion.id}
                        </code>
                        <span className="text-xs text-neutral-500">
                          {Math.round(suggestion.confidence * 100)}%
                        </span>
                      </div>
                      <div className="text-sm font-medium text-blue-900 dark:text-blue-100">
                        {suggestion.label}
                      </div>
                      {suggestion.description && (
                        <div className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                          {suggestion.description}
                        </div>
                      )}
                      <div className="text-xs text-neutral-500 mt-1">Kind: {suggestion.kind}</div>
                    </div>
                  ))}
                </section>
              )}

              {/* Suggested Packs */}
              {hasPacks && (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-neutral-600 dark:text-neutral-400">
                    Suggested Semantic Packs ({packHints!.suggested_packs.length})
                  </h3>
                  {packHints!.suggested_packs.map((pack) => (
                    <div
                      key={pack.pack_id}
                      className="p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg"
                    >
                      <div className="font-medium text-sm text-purple-900 dark:text-purple-100 mb-1">
                        {pack.pack_label}
                      </div>
                      <code className="text-xs font-mono text-purple-700 dark:text-purple-300">
                        {pack.pack_id}
                      </code>
                      {pack.notes && (
                        <div className="text-xs text-purple-600 dark:text-purple-400 mt-2">
                          {pack.notes}
                        </div>
                      )}
                      <div className="mt-2 text-xs">
                        <div className="font-medium text-purple-800 dark:text-purple-200 mb-1">
                          Parser Hints:
                        </div>
                        {Object.entries(pack.parser_hints).map(([key, values]) => (
                          <div key={key} className="text-purple-700 dark:text-purple-300">
                            {key}: {values.join(', ')}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </section>
              )}

              {/* Suggested Candidates */}
              {hasCandidates && (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-neutral-600 dark:text-neutral-400">
                    Suggested Candidates ({packHints!.suggested_candidates.length})
                  </h3>
                  {packHints!.suggested_candidates.map((candidate, idx) => (
                    <div
                      key={candidate.block_id ?? `${candidate.text}-${idx}`}
                      className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg"
                    >
                      {candidate.block_id && (
                        <code className="text-xs font-mono text-amber-800 dark:text-amber-200">
                          {candidate.block_id}
                        </code>
                      )}
                      <div className="text-sm text-amber-900 dark:text-amber-100 mt-1 font-mono">
                        {candidate.text}
                      </div>
                      {candidate.notes && (
                        <div className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                          {candidate.notes}
                        </div>
                      )}
                      {candidate.tags && Object.keys(candidate.tags).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {Object.entries(candidate.tags).map(([key, value]) => (
                            <span
                              key={key}
                              className="px-1.5 py-0.5 bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 rounded text-xs"
                            >
                              {key}: {JSON.stringify(value)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </section>
              )}

              {/* No suggestions */}
              {!hasOntology && !hasPacks && !hasCandidates && (
                <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
                  No suggestions found for this prompt.
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-200 dark:border-neutral-700">
          <Button onClick={onClose} variant="outline" className="w-full">
            Close
          </Button>
        </div>
      </div>
    </>
  );
}

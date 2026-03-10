import {
  DEFAULT_PROMPT_ROLE,
  deriveBlocksFromCandidates,
  ensurePromptBlocks,
} from '@pixsim7/core.prompt';
import type { PromptBlockCandidate } from '@pixsim7/shared.types/prompt';
import clsx from 'clsx';
import { useMemo, useState } from 'react';

import { ActionBlockGraphSurface } from '@features/graph/components/graph/ActionBlockGraphSurface';
import { PromptBlockGraphSurface } from '@features/graph/components/graph/PromptBlockGraphSurface';
import { useShadowAnalysis } from '@features/prompts/hooks/useShadowAnalysis';
import { extractPrimitiveMatches } from '@features/prompts/lib/parsePrimitiveMatch';
import { usePromptSettingsStore } from '@features/prompts/stores/promptSettingsStore';

import { getPromptRoleBadgeClass, getPromptRoleLabel } from '@/lib/promptRoleUi';

import {
  clampScore,
  filterPrimitiveMatchesByScore,
  groupCandidatesByRole,
  mapMatchesToSyntheticActionBlocks,
  mapPrimitiveMatchesForTable,
  summarizeInteractionData,
} from './promptInteractionsModel';

const MIN_ANALYZE_CHARS = 8;
const EMPTY_CANDIDATES: PromptBlockCandidate[] = [];

export function PromptInteractionsWorkbench() {
  const promptRoleColors = usePromptSettingsStore((state) => state.promptRoleColors);
  const defaultAnalyzer = usePromptSettingsStore((state) => state.defaultAnalyzer);

  const [promptText, setPromptText] = useState('');
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [minScore, setMinScore] = useState(0.45);
  const [minScoreInput, setMinScoreInput] = useState('0.45');

  const analysis = useShadowAnalysis(promptText, {
    enabled: autoAnalyze,
    analyzerId: defaultAnalyzer,
  });
  const candidates = analysis.result?.candidates ?? EMPTY_CANDIDATES;

  const primitiveMatches = useMemo(
    () => extractPrimitiveMatches(candidates),
    [candidates],
  );
  const filteredMatches = useMemo(
    () => filterPrimitiveMatchesByScore(primitiveMatches, minScore),
    [minScore, primitiveMatches],
  );
  const groupedCandidates = useMemo(
    () => groupCandidatesByRole(candidates),
    [candidates],
  );
  const primitiveMatchRows = useMemo(
    () => mapPrimitiveMatchesForTable(filteredMatches),
    [filteredMatches],
  );
  const syntheticActionBlocks = useMemo(
    () => mapMatchesToSyntheticActionBlocks(filteredMatches),
    [filteredMatches],
  );
  const derivedBlocks = useMemo(() => {
    const normalizedPrompt = promptText.trim();
    if (!normalizedPrompt && candidates.length === 0) return [];
    const derived = deriveBlocksFromCandidates(candidates, {
      defaultRole: DEFAULT_PROMPT_ROLE,
      fallbackText: normalizedPrompt,
    });
    return ensurePromptBlocks(derived, normalizedPrompt, DEFAULT_PROMPT_ROLE);
  }, [candidates, promptText]);
  const summary = useMemo(
    () =>
      summarizeInteractionData({
        candidates,
        primitiveMatches,
        filteredMatches,
        derivedBlocks,
      }),
    [candidates, derivedBlocks, filteredMatches, primitiveMatches],
  );

  const normalizedPrompt = promptText.trim();
  const canAnalyze = normalizedPrompt.length >= MIN_ANALYZE_CHARS;
  const isStale = Boolean(
    normalizedPrompt &&
      analysis.result?.analyzedPrompt &&
      analysis.result.analyzedPrompt !== normalizedPrompt,
  );

  const applyMinScore = (value: number) => {
    const clamped = clampScore(value);
    setMinScore(clamped);
    setMinScoreInput(clamped.toFixed(2));
  };

  return (
    <div className="h-full min-h-0 overflow-y-auto p-3 space-y-3 bg-neutral-50 dark:bg-neutral-900">
      <section className="rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 p-3 space-y-2">
        <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
          raw prompt -&gt; parsed candidates -&gt; primitive matches -&gt; derived blocks -&gt; graph view
        </div>
        <textarea
          value={promptText}
          onChange={(event) => setPromptText(event.target.value)}
          rows={4}
          placeholder="Paste a prompt to inspect interactions..."
          className="w-full rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-xs font-mono text-neutral-800 dark:text-neutral-100 resize-y min-h-24"
        />

        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 text-xs text-neutral-700 dark:text-neutral-300">
            <input
              type="checkbox"
              checked={autoAnalyze}
              onChange={(event) => setAutoAnalyze(event.target.checked)}
              className="rounded border-neutral-300 dark:border-neutral-600"
            />
            Auto analyze
          </label>
          <button
            type="button"
            onClick={analysis.refresh}
            disabled={!canAnalyze || analysis.loading}
            className={clsx(
              'text-xs px-2 py-1 rounded border',
              !canAnalyze || analysis.loading
                ? 'border-neutral-200 dark:border-neutral-700 text-neutral-400 cursor-not-allowed'
                : 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800/60 dark:bg-blue-900/20 dark:text-blue-300',
            )}
          >
            {analysis.result ? 'Refresh' : 'Analyze'}
          </button>
          <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
            {analysis.loading
              ? 'Analyzing...'
              : canAnalyze
                ? `Analyzed: ${analysis.result?.analyzedPrompt ? 'yes' : 'no'}`
                : `Enter at least ${MIN_ANALYZE_CHARS} chars`}
          </span>
          {isStale && !autoAnalyze && (
            <span className="text-[11px] px-1.5 py-0.5 rounded border border-amber-200 text-amber-700 dark:border-amber-800/40 dark:text-amber-300">
              Prompt edited since last analysis
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-600 dark:text-neutral-300">Min score</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={minScore}
            onChange={(event) => applyMinScore(Number(event.target.value))}
            className="flex-1"
          />
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={minScoreInput}
            onChange={(event) => {
              const nextValue = event.target.value;
              setMinScoreInput(nextValue);
              const parsed = Number(nextValue);
              if (Number.isFinite(parsed)) {
                setMinScore(clampScore(parsed));
              }
            }}
            onBlur={() => {
              const parsed = Number(minScoreInput);
              if (!Number.isFinite(parsed)) {
                setMinScoreInput(minScore.toFixed(2));
                return;
              }
              applyMinScore(parsed);
            }}
            className="w-20 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-1.5 py-1 text-xs text-neutral-700 dark:text-neutral-200"
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <SummaryMetric label="Candidates" value={summary.candidateCount} />
          <SummaryMetric label="Roles" value={summary.roleGroupCount} />
          <SummaryMetric label="Matches" value={summary.primitiveMatchCount} />
          <SummaryMetric label="Filtered" value={summary.filteredMatchCount} />
          <SummaryMetric label="Derived blocks" value={summary.derivedBlockCount} />
        </div>
      </section>

      <section className="rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 p-3">
        <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-200 mb-2">
          Parsed candidates (grouped by role)
        </div>
        {groupedCandidates.length === 0 ? (
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            No candidates yet.
          </div>
        ) : (
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {groupedCandidates.map((group) => (
              <div
                key={group.role}
                className="rounded border border-neutral-200 dark:border-neutral-700"
              >
                <div className="px-2 py-1 border-b border-neutral-200 dark:border-neutral-700 text-xs flex items-center gap-1.5">
                  <span
                    className={clsx(
                      'w-2 h-2 rounded-full',
                      getPromptRoleBadgeClass(group.role, promptRoleColors),
                    )}
                  />
                  <span className="font-medium">{getPromptRoleLabel(group.role)}</span>
                  <span className="text-neutral-400 dark:text-neutral-500 ml-auto">
                    {group.candidates.length}
                  </span>
                </div>
                <div className="p-2 space-y-1">
                  {group.candidates.map((candidate, index) => (
                    <div
                      key={`${group.role}-${index}-${candidate.text.slice(0, 32)}`}
                      className="text-[11px] rounded border border-neutral-100 dark:border-neutral-800 px-2 py-1 text-neutral-700 dark:text-neutral-200"
                    >
                      <span className="text-neutral-400 dark:text-neutral-500 mr-1">
                        {index + 1}.
                      </span>
                      {candidate.text}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">
            Primitive matches
          </div>
          <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
            score &gt;= {minScore.toFixed(2)} | showing {primitiveMatchRows.length} / {primitiveMatches.length}
          </div>
        </div>
        <div className="overflow-auto max-h-64 rounded border border-neutral-200 dark:border-neutral-700">
          <table className="w-full text-[11px]">
            <thead className="bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
              <tr>
                <th className="text-left px-2 py-1 font-medium">block_id</th>
                <th className="text-left px-2 py-1 font-medium">score</th>
                <th className="text-left px-2 py-1 font-medium">role/category</th>
                <th className="text-left px-2 py-1 font-medium">overlap tokens</th>
                <th className="text-left px-2 py-1 font-medium">op/signature</th>
              </tr>
            </thead>
            <tbody>
              {primitiveMatchRows.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-2 py-3 text-center text-neutral-500 dark:text-neutral-400"
                  >
                    No primitive matches for the current score filter.
                  </td>
                </tr>
              )}
              {primitiveMatchRows.map((row) => (
                <tr
                  key={`${row.blockId}:${row.candidateIndex}`}
                  title={row.candidateText}
                  className="border-t border-neutral-100 dark:border-neutral-800"
                >
                  <td className="px-2 py-1.5 font-mono text-violet-700 dark:text-violet-300">
                    {row.blockId}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums text-neutral-700 dark:text-neutral-200">
                    {row.score.toFixed(2)}
                  </td>
                  <td className="px-2 py-1.5 text-neutral-700 dark:text-neutral-200">
                    <div>{row.role}</div>
                    <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                      {row.category}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-neutral-600 dark:text-neutral-300">
                    {row.overlapTokens.length > 0 ? row.overlapTokens.join(', ') : '-'}
                  </td>
                  <td className="px-2 py-1.5 text-neutral-600 dark:text-neutral-300">
                    <div>{row.opId ?? '-'}</div>
                    <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                      {row.signatureId ?? '-'}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 p-3">
        <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-200 mb-2">
          Derived blocks
        </div>
        {derivedBlocks.length === 0 ? (
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            No blocks derived yet.
          </div>
        ) : (
          <div className="space-y-1 max-h-44 overflow-y-auto">
            {derivedBlocks.map((block, index) => (
              <div
                key={`${block.role}-${index}`}
                className="flex items-start gap-2 rounded border border-neutral-100 dark:border-neutral-800 px-2 py-1"
              >
                <span className="text-[10px] px-1 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 shrink-0">
                  {block.role}
                </span>
                <span className="text-[11px] text-neutral-700 dark:text-neutral-200">
                  {block.text}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <div className="rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 p-2 flex flex-col min-h-[300px]">
          <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-200 mb-2">
            Prompt graph
          </div>
          <div className="flex-1 min-h-[240px] rounded border border-neutral-200 dark:border-neutral-800 overflow-hidden">
            <PromptBlockGraphSurface
              key={`prompt-graph-${analysis.result?.analyzedPrompt ?? 'empty'}-${candidates.length}`}
              candidates={candidates}
              promptTitle="Interaction prompt"
              includeRoleGroups
            />
          </div>
        </div>

        <div className="rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 p-2 flex flex-col min-h-[300px]">
          <div className="text-xs font-semibold text-neutral-700 dark:text-neutral-200 mb-2">
            Action graph (synthetic from matches)
          </div>
          <div className="flex-1 min-h-[240px] rounded border border-neutral-200 dark:border-neutral-800 overflow-hidden">
            {syntheticActionBlocks.length > 0 ? (
              <ActionBlockGraphSurface
                key={`action-graph-${syntheticActionBlocks.length}-${minScore.toFixed(2)}`}
                blocks={syntheticActionBlocks}
                includePackages
              />
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-neutral-500 dark:text-neutral-400">
                No filtered primitive matches to project.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function SummaryMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </div>
      <div className="text-sm font-semibold text-neutral-800 dark:text-neutral-100 tabular-nums">
        {value}
      </div>
    </div>
  );
}

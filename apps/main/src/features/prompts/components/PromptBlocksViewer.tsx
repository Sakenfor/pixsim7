/**
 * PromptCandidatesViewer Component
 *
 * Reusable UI for displaying prompt text and parsed candidates.
 * Pure presentational component - no data fetching.
 */

import { useState } from 'react';
import { Panel } from '@pixsim7/shared.ui';
import { Icon } from '@lib/icons';
import type { PromptBlockCandidate } from '../types';
import { getPromptRoleBadgeClass, getPromptRoleLabel, getPromptRolePanelClass } from '@/lib/promptRoleUi';
import { usePromptSettingsStore } from '../stores/promptSettingsStore';

// Re-export for convenience
export type { PromptBlockCandidate } from '../types';

export interface PromptCandidatesViewerProps {
  prompt: string;
  candidates: PromptBlockCandidate[];
  collapsible?: boolean;   // default false
  initialOpen?: boolean;   // default true
}

export function PromptCandidatesViewer({
  prompt,
  candidates,
  collapsible = false,
  initialOpen = true,
}: PromptCandidatesViewerProps) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const promptRoleColors = usePromptSettingsStore((state) => state.promptRoleColors);

  // Group candidates by role
  const groupedCandidates = candidates.reduce((acc, candidate) => {
    const roleKey = candidate.role ?? 'other';
    if (!acc[roleKey]) {
      acc[roleKey] = [];
    }
    acc[roleKey].push(candidate);
    return acc;
  }, {} as Record<string, PromptBlockCandidate[]>);

  // If collapsible, render with header
  if (collapsible) {
    return (
      <div className="border border-neutral-200 dark:border-neutral-800 rounded">
        {/* Collapsible Header */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full px-4 py-3 flex items-center justify-between bg-neutral-50 dark:bg-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        >
          <span className="font-semibold flex items-center gap-2">
            <Icon name="search" className="h-4 w-4" />
            Prompt Analysis
          </span>
          <Icon
            name="chevron-down"
            className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {/* Collapsible Content */}
        {isOpen && (
          <div className="p-4 space-y-4">
            <PromptCandidatesContent
              prompt={prompt}
              groupedCandidates={groupedCandidates}
              promptRoleColors={promptRoleColors}
            />
          </div>
        )}
      </div>
    );
  }

  // Non-collapsible render
  return (
    <div className="grid grid-cols-2 gap-6">
      <PromptCandidatesContent
        prompt={prompt}
        groupedCandidates={groupedCandidates}
        promptRoleColors={promptRoleColors}
      />
    </div>
  );
}

interface PromptCandidatesContentProps {
  prompt: string;
  groupedCandidates: Record<string, PromptBlockCandidate[]>;
  promptRoleColors: Record<string, string>;
}

function PromptCandidatesContent({ prompt, groupedCandidates, promptRoleColors }: PromptCandidatesContentProps) {
  const totalCandidates = Object.values(groupedCandidates).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <>
      {/* Left: Original Prompt */}
      <Panel className="p-6">
        <h2 className="text-lg font-semibold mb-4">Original Prompt</h2>
        <textarea
          readOnly
          value={prompt}
          className="w-full h-96 p-4 bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded font-mono text-sm resize-none"
        />
      </Panel>

      {/* Right: Parsed Candidates */}
      <Panel className="p-6">
        <h2 className="text-lg font-semibold mb-4">
          Parsed Candidates ({totalCandidates})
        </h2>
        <div className="space-y-4 overflow-y-auto h-96">
          {(Object.entries(groupedCandidates) as [string, PromptBlockCandidate[]][]).map(([role, segs]) => (
            <div key={role}>
              <h3 className="text-sm font-semibold capitalize mb-2 flex items-center gap-2">
                <span className={`inline-block w-3 h-3 rounded-full ${getPromptRoleBadgeClass(role, promptRoleColors)}`} />
                {getPromptRoleLabel(role)} ({segs.length})
              </h3>
              <div className="space-y-2 ml-5">
                {segs.map((segment, idx) => (
                  <div
                    key={idx}
                    className={`p-3 border rounded ${getPromptRolePanelClass(role, promptRoleColors)}`}
                  >
                    <div className="font-medium text-sm">{segment.text}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {totalCandidates === 0 && (
            <div className="text-center text-neutral-500 dark:text-neutral-400 py-8">
              No candidates parsed
            </div>
          )}
        </div>
      </Panel>
    </>
  );
}

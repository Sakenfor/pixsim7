/**
 * PromptSegmentsViewer Component
 *
 * Reusable UI for displaying prompt text and parsed segments.
 * Pure presentational component - no data fetching.
 */

import { useState } from 'react';
import { Panel } from '@pixsim7/shared.ui';
import { Icon } from '@lib/icons';
import type { PromptSegment, PromptSegmentRole } from '../types';

// Re-export for convenience
export type { PromptSegment, PromptSegmentRole } from '../types';

export interface PromptSegmentsViewerProps {
  prompt: string;
  segments: PromptSegment[];
  collapsible?: boolean;   // default false
  initialOpen?: boolean;   // default true
}

// Role colors for visual distinction
const roleColors: Record<PromptSegmentRole, string> = {
  character: 'bg-blue-100 dark:bg-blue-900 border-blue-300 dark:border-blue-700',
  action: 'bg-green-100 dark:bg-green-900 border-green-300 dark:border-green-700',
  setting: 'bg-purple-100 dark:bg-purple-900 border-purple-300 dark:border-purple-700',
  mood: 'bg-yellow-100 dark:bg-yellow-900 border-yellow-300 dark:border-yellow-700',
  romance: 'bg-pink-100 dark:bg-pink-900 border-pink-300 dark:border-pink-700',
  other: 'bg-gray-100 dark:bg-gray-900 border-gray-300 dark:border-gray-700',
};

export function PromptSegmentsViewer({
  prompt,
  segments,
  collapsible = false,
  initialOpen = true,
}: PromptSegmentsViewerProps) {
  const [isOpen, setIsOpen] = useState(initialOpen);

  // Group segments by role
  const groupedSegments = segments.reduce((acc, segment) => {
    if (!acc[segment.role]) {
      acc[segment.role] = [];
    }
    acc[segment.role].push(segment);
    return acc;
  }, {} as Partial<Record<PromptSegmentRole, PromptSegment[]>>);

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
            <PromptSegmentsContent prompt={prompt} groupedSegments={groupedSegments} />
          </div>
        )}
      </div>
    );
  }

  // Non-collapsible render
  return (
    <div className="grid grid-cols-2 gap-6">
      <PromptSegmentsContent prompt={prompt} groupedSegments={groupedSegments} />
    </div>
  );
}

interface PromptSegmentsContentProps {
  prompt: string;
  groupedSegments: Partial<Record<PromptSegmentRole, PromptSegment[]>>;
}

function PromptSegmentsContent({ prompt, groupedSegments }: PromptSegmentsContentProps) {
  const totalSegments = Object.values(groupedSegments).reduce((sum, arr) => sum + arr.length, 0);

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

      {/* Right: Parsed Segments */}
      <Panel className="p-6">
        <h2 className="text-lg font-semibold mb-4">
          Parsed Segments ({totalSegments})
        </h2>
        <div className="space-y-4 overflow-y-auto h-96">
          {(Object.entries(groupedSegments) as [PromptSegmentRole, PromptSegment[]][]).map(([role, segs]) => (
            <div key={role}>
              <h3 className="text-sm font-semibold capitalize mb-2 flex items-center gap-2">
                <span className={`inline-block w-3 h-3 rounded-full ${roleColors[role]}`} />
                {role} ({segs.length})
              </h3>
              <div className="space-y-2 ml-5">
                {segs.map((segment, idx) => (
                  <div
                    key={idx}
                    className={`p-3 border rounded ${roleColors[role]}`}
                  >
                    <div className="font-medium text-sm">{segment.text}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {totalSegments === 0 && (
            <div className="text-center text-neutral-500 dark:text-neutral-400 py-8">
              No segments parsed
            </div>
          )}
        </div>
      </Panel>
    </>
  );
}

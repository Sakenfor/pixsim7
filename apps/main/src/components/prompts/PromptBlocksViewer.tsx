/**
 * PromptBlocksViewer Component
 *
 * Reusable UI for displaying prompt text and parsed blocks.
 * Pure presentational component - no data fetching.
 */

import { useState } from 'react';
import { Panel } from '@pixsim7/shared.ui';
import { Icon } from '@/lib/icons';
import type { PromptBlock, PromptBlockRole } from '@/types/prompts';

// Re-export for backwards compatibility
export type { PromptBlock } from '@/types/prompts';

export interface PromptBlocksViewerProps {
  prompt: string;
  blocks: PromptBlock[];
  collapsible?: boolean;   // default false
  initialOpen?: boolean;   // default true
}

// Role colors for visual distinction
const roleColors: Record<PromptBlockRole, string> = {
  character: 'bg-blue-100 dark:bg-blue-900 border-blue-300 dark:border-blue-700',
  action: 'bg-green-100 dark:bg-green-900 border-green-300 dark:border-green-700',
  setting: 'bg-purple-100 dark:bg-purple-900 border-purple-300 dark:border-purple-700',
  mood: 'bg-yellow-100 dark:bg-yellow-900 border-yellow-300 dark:border-yellow-700',
  romance: 'bg-pink-100 dark:bg-pink-900 border-pink-300 dark:border-pink-700',
  other: 'bg-gray-100 dark:bg-gray-900 border-gray-300 dark:border-gray-700',
};

export function PromptBlocksViewer({
  prompt,
  blocks,
  collapsible = false,
  initialOpen = true,
}: PromptBlocksViewerProps) {
  const [isOpen, setIsOpen] = useState(initialOpen);

  // Group blocks by role
  const groupedBlocks = blocks.reduce((acc, block) => {
    if (!acc[block.role]) {
      acc[block.role] = [];
    }
    acc[block.role].push(block);
    return acc;
  }, {} as Partial<Record<PromptBlockRole, PromptBlock[]>>);

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
            <PromptBlocksContent prompt={prompt} groupedBlocks={groupedBlocks} />
          </div>
        )}
      </div>
    );
  }

  // Non-collapsible render
  return (
    <div className="grid grid-cols-2 gap-6">
      <PromptBlocksContent prompt={prompt} groupedBlocks={groupedBlocks} />
    </div>
  );
}

interface PromptBlocksContentProps {
  prompt: string;
  groupedBlocks: Partial<Record<PromptBlockRole, PromptBlock[]>>;
}

function PromptBlocksContent({ prompt, groupedBlocks }: PromptBlocksContentProps) {
  const totalBlocks = Object.values(groupedBlocks).reduce((sum, arr) => sum + arr.length, 0);

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

      {/* Right: Parsed Blocks */}
      <Panel className="p-6">
        <h2 className="text-lg font-semibold mb-4">
          Parsed Components ({totalBlocks})
        </h2>
        <div className="space-y-4 overflow-y-auto h-96">
          {(Object.entries(groupedBlocks) as [PromptBlockRole, PromptBlock[]][]).map(([role, blocks]) => (
            <div key={role}>
              <h3 className="text-sm font-semibold capitalize mb-2 flex items-center gap-2">
                <span className={`inline-block w-3 h-3 rounded-full ${roleColors[role]}`} />
                {role} ({blocks.length})
              </h3>
              <div className="space-y-2 ml-5">
                {blocks.map((block, idx) => (
                  <div
                    key={idx}
                    className={`p-3 border rounded ${roleColors[role]}`}
                  >
                    <div className="font-medium text-sm">{block.text}</div>
                    {block.component_type && (
                      <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                        {block.component_type}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {totalBlocks === 0 && (
            <div className="text-center text-neutral-500 dark:text-neutral-400 py-8">
              No components parsed
            </div>
          )}
        </div>
      </Panel>
    </>
  );
}

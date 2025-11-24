/**
 * Prompt Inspector Dev Page
 *
 * Development tool to inspect and analyze prompts used in generations.
 * Shows structured breakdown of prompt components without modifying database.
 */

import { useState } from 'react';
import { Panel, Button, Input } from '@pixsim7/shared.ui';
import { Icon } from '../lib/icons';
import { useApi } from '../hooks/useApi';

interface Block {
  role: 'character' | 'action' | 'setting' | 'mood' | 'romance' | 'other';
  text: string;
  component_type?: string;
}

interface InspectResult {
  prompt: string;
  blocks: Block[];
}

export function PromptInspectorDev() {
  const [assetId, setAssetId] = useState('');
  const [jobId, setJobId] = useState('');
  const [result, setResult] = useState<InspectResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const api = useApi();

  const handleInspect = async () => {
    // Validation
    if (!assetId && !jobId) {
      setError('Please provide either an Asset ID or Job ID');
      return;
    }

    if (assetId && jobId) {
      setError('Please provide only one of Asset ID or Job ID, not both');
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      // Build query params
      const params = new URLSearchParams();
      if (assetId) {
        params.set('asset_id', assetId);
      }
      if (jobId) {
        params.set('job_id', jobId);
      }

      // Call API
      const response = await api.get(`/dev/prompt-inspector?${params.toString()}`);
      setResult(response);
    } catch (err: any) {
      setError(err.message || 'Failed to inspect prompt');
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Group blocks by role
  const groupedBlocks = result?.blocks.reduce((acc, block) => {
    if (!acc[block.role]) {
      acc[block.role] = [];
    }
    acc[block.role].push(block);
    return acc;
  }, {} as Record<string, Block[]>);

  // Role colors for visual distinction
  const roleColors: Record<string, string> = {
    character: 'bg-blue-100 dark:bg-blue-900 border-blue-300 dark:border-blue-700',
    action: 'bg-green-100 dark:bg-green-900 border-green-300 dark:border-green-700',
    setting: 'bg-purple-100 dark:bg-purple-900 border-purple-300 dark:border-purple-700',
    mood: 'bg-yellow-100 dark:bg-yellow-900 border-yellow-300 dark:border-yellow-700',
    romance: 'bg-pink-100 dark:bg-pink-900 border-pink-300 dark:border-pink-700',
    other: 'bg-gray-100 dark:bg-gray-900 border-gray-300 dark:border-gray-700',
  };

  return (
    <div className="mx-auto max-w-7xl p-6 space-y-6 content-with-dock min-h-screen">
      {/* Header */}
      <header className="border-b border-neutral-200 dark:border-neutral-800 pb-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Icon name="search" className="h-6 w-6" />
              Prompt Inspector
            </h1>
            <p className="text-neutral-600 dark:text-neutral-400">
              Inspect and analyze prompt structure for assets and generations
            </p>
          </div>
        </div>
      </header>

      {/* Input Section */}
      <Panel className="p-6">
        <h2 className="text-lg font-semibold mb-4">Inspect Prompt</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Asset ID
              </label>
              <Input
                type="number"
                placeholder="Enter asset ID"
                value={assetId}
                onChange={(e) => setAssetId(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Job ID (Generation ID)
              </label>
              <Input
                type="number"
                placeholder="Enter job/generation ID"
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700 rounded text-red-800 dark:text-red-200">
              {error}
            </div>
          )}

          <Button
            onClick={handleInspect}
            disabled={isLoading || (!assetId && !jobId)}
            className="w-full"
          >
            {isLoading ? 'Inspecting...' : 'Inspect'}
          </Button>
        </div>
      </Panel>

      {/* Results Section */}
      {result && (
        <div className="grid grid-cols-2 gap-6">
          {/* Left: Original Prompt */}
          <Panel className="p-6">
            <h2 className="text-lg font-semibold mb-4">Original Prompt</h2>
            <textarea
              readOnly
              value={result.prompt}
              className="w-full h-96 p-4 bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded font-mono text-sm"
            />
          </Panel>

          {/* Right: Parsed Blocks */}
          <Panel className="p-6">
            <h2 className="text-lg font-semibold mb-4">
              Parsed Components ({result.blocks.length})
            </h2>
            <div className="space-y-4 overflow-y-auto h-96">
              {Object.entries(groupedBlocks || {}).map(([role, blocks]) => (
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
            </div>
          </Panel>
        </div>
      )}

      {/* Empty State */}
      {!result && !error && (
        <Panel className="p-12 text-center">
          <Icon name="search" className="h-12 w-12 mx-auto mb-4 text-neutral-400" />
          <h3 className="text-lg font-semibold mb-2">No Prompt Inspected</h3>
          <p className="text-neutral-600 dark:text-neutral-400">
            Enter an Asset ID or Job ID above to inspect the prompt structure
          </p>
        </Panel>
      )}
    </div>
  );
}

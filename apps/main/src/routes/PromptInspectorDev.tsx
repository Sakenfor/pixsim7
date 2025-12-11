/**
 * Prompt Inspector Dev Page
 *
 * Development tool to inspect and analyze prompts used in generations.
 * Shows structured breakdown of prompt components without modifying database.
 */

import { useState } from 'react';
import { Panel, Button, Input } from '@pixsim7/shared.ui';
import { Icon } from '../lib/icons';
import { PromptSegmentsViewer, usePromptInspection } from '@features/prompts';

export function PromptInspectorDev() {
  // Input field values (strings)
  const [assetId, setAssetId] = useState('');
  const [jobId, setJobId] = useState('');

  // Active IDs for inspection (numbers, controlled by button click)
  const [activeAssetId, setActiveAssetId] = useState<number | undefined>(undefined);
  const [activeJobId, setActiveJobId] = useState<number | undefined>(undefined);

  // Local validation error
  const [validationError, setValidationError] = useState<string | null>(null);

  // Use the hook for data fetching
  const { prompt, segments, loading, error } = usePromptInspection({
    assetId: activeAssetId,
    jobId: activeJobId,
  });

  const handleInspect = () => {
    // Validation
    if (!assetId && !jobId) {
      setValidationError('Please provide either an Asset ID or Job ID');
      return;
    }

    if (assetId && jobId) {
      setValidationError('Please provide only one of Asset ID or Job ID, not both');
      return;
    }

    // Clear validation error
    setValidationError(null);

    // Parse and set active IDs (this will trigger the hook)
    if (assetId) {
      setActiveAssetId(parseInt(assetId, 10));
      setActiveJobId(undefined);
    } else if (jobId) {
      setActiveJobId(parseInt(jobId, 10));
      setActiveAssetId(undefined);
    }
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
                disabled={loading}
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
                disabled={loading}
              />
            </div>
          </div>

          {(validationError || error) && (
            <div className="p-3 bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700 rounded text-red-800 dark:text-red-200">
              {validationError || error}
            </div>
          )}

          <Button
            onClick={handleInspect}
            disabled={loading || (!assetId && !jobId)}
            className="w-full"
          >
            {loading ? 'Inspecting...' : 'Inspect'}
          </Button>
        </div>
      </Panel>

      {/* Results Section */}
      {prompt && (
        <PromptSegmentsViewer
          prompt={prompt}
          segments={segments}
        />
      )}

      {/* Empty State */}
      {!prompt && !error && !validationError && (
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

/**
 * Block Fit Inspector Dev Page
 *
 * Development tool to inspect and rate how well ActionBlocks fit specific assets.
 * Computes heuristic fit scores based on ontology tag alignment.
 */

import { useState } from 'react';
import { Panel, Button, Input } from '@pixsim7/shared.ui';
import { Icon } from '../lib/icons';

interface FitScoreDetails {
  score: number;
  block_ontology_ids: string[];
  asset_ontology_ids: string[];
  required_matches: string[];
  required_misses: string[];
  soft_matches: string[];
  scoring: {
    required_ids_count: number;
    required_matches_count: number;
    required_misses_count: number;
    soft_ids_count: number;
    soft_matches_count: number;
  };
}

interface FitScoreResponse {
  heuristic_score: number;
  details: FitScoreDetails;
  explanation: string;
}

export function BlockFitDev() {
  // Input fields
  const [blockId, setBlockId] = useState('');
  const [assetId, setAssetId] = useState('');
  const [generationId, setGenerationId] = useState('');
  const [roleInSequence, setRoleInSequence] = useState<string>('unspecified');
  const [fitRating, setFitRating] = useState<number>(3);
  const [notes, setNotes] = useState('');

  // Results
  const [fitScore, setFitScore] = useState<FitScoreResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ratingSuccess, setRatingSuccess] = useState(false);

  const handleComputeFit = async () => {
    if (!blockId || !assetId) {
      setError('Please provide both Block ID and Asset ID');
      return;
    }

    setLoading(true);
    setError(null);
    setRatingSuccess(false);

    try {
      const response = await fetch('/api/v1/dev/block-fit/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          block_id: blockId,
          asset_id: parseInt(assetId, 10),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to compute fit score');
      }

      const data = await response.json();
      setFitScore(data);
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      setFitScore(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitRating = async () => {
    if (!blockId || !assetId) {
      setError('Please provide both Block ID and Asset ID');
      return;
    }

    setLoading(true);
    setError(null);
    setRatingSuccess(false);

    try {
      const response = await fetch('/api/v1/dev/block-fit/rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          block_id: blockId,
          asset_id: parseInt(assetId, 10),
          generation_id: generationId ? parseInt(generationId, 10) : null,
          role_in_sequence: roleInSequence,
          fit_rating: fitRating,
          notes: notes || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to submit rating');
      }

      setRatingSuccess(true);
      // Also compute fit to show the scores
      await handleComputeFit();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl p-6 space-y-6 content-with-dock min-h-screen">
      {/* Header */}
      <header className="border-b border-neutral-200 dark:border-neutral-800 pb-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Icon name="target" className="h-6 w-6" />
              Block ↔ Image Fit Inspector
            </h1>
            <p className="text-neutral-600 dark:text-neutral-400">
              Compute and rate how well ActionBlocks fit specific assets
            </p>
          </div>
        </div>
      </header>

      {/* Input Section */}
      <Panel className="p-6">
        <h2 className="text-lg font-semibold mb-4">Block & Asset Selection</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Block ID (UUID) <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                placeholder="Enter block UUID"
                value={blockId}
                onChange={(e) => setBlockId(e.target.value)}
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Asset ID <span className="text-red-500">*</span>
              </label>
              <Input
                type="number"
                placeholder="Enter asset ID"
                value={assetId}
                onChange={(e) => setAssetId(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Generation ID (optional)
              </label>
              <Input
                type="number"
                placeholder="Enter generation ID"
                value={generationId}
                onChange={(e) => setGenerationId(e.target.value)}
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Role in Sequence
              </label>
              <select
                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-md bg-white dark:bg-neutral-900"
                value={roleInSequence}
                onChange={(e) => setRoleInSequence(e.target.value)}
                disabled={loading}
              >
                <option value="unspecified">Unspecified</option>
                <option value="initial">Initial</option>
                <option value="continuation">Continuation</option>
                <option value="transition">Transition</option>
              </select>
            </div>
          </div>

          <Button
            onClick={handleComputeFit}
            disabled={loading || !blockId || !assetId}
            className="w-full"
            variant="primary"
          >
            {loading ? 'Computing...' : 'Compute Fit Score'}
          </Button>
        </div>
      </Panel>

      {/* Error Display */}
      {error && (
        <div className="p-3 bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700 rounded text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      {/* Success Display */}
      {ratingSuccess && (
        <div className="p-3 bg-green-100 dark:bg-green-900 border border-green-300 dark:border-green-700 rounded text-green-800 dark:text-green-200">
          Rating submitted successfully!
        </div>
      )}

      {/* Fit Score Results */}
      {fitScore && (
        <Panel className="p-6">
          <h2 className="text-lg font-semibold mb-4">Fit Score Results</h2>

          {/* Score Bar */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Heuristic Score</span>
              <span className="text-2xl font-bold">{(fitScore.heuristic_score * 100).toFixed(0)}%</span>
            </div>
            <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-4">
              <div
                className="bg-blue-500 h-4 rounded-full transition-all"
                style={{ width: `${fitScore.heuristic_score * 100}%` }}
              />
            </div>
          </div>

          {/* Explanation */}
          <div className="mb-6 p-4 bg-neutral-100 dark:bg-neutral-800 rounded">
            <pre className="whitespace-pre-wrap text-sm">{fitScore.explanation}</pre>
          </div>

          {/* Tags Comparison */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <h3 className="text-sm font-semibold mb-2">Block Ontology IDs</h3>
              <div className="flex flex-wrap gap-2">
                {fitScore.details.block_ontology_ids.map((id, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded text-xs"
                  >
                    {id}
                  </span>
                ))}
                {fitScore.details.block_ontology_ids.length === 0 && (
                  <span className="text-sm text-neutral-500">No ontology IDs</span>
                )}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-2">Asset Ontology IDs</h3>
              <div className="flex flex-wrap gap-2">
                {fitScore.details.asset_ontology_ids.map((id, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded text-xs"
                  >
                    {id}
                  </span>
                ))}
                {fitScore.details.asset_ontology_ids.length === 0 && (
                  <span className="text-sm text-neutral-500">No ontology IDs</span>
                )}
              </div>
            </div>
          </div>
        </Panel>
      )}

      {/* Rating Section */}
      {fitScore && (
        <Panel className="p-6">
          <h2 className="text-lg font-semibold mb-4">Submit Your Rating</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Fit Rating (1-5)
              </label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((rating) => (
                  <button
                    key={rating}
                    onClick={() => setFitRating(rating)}
                    className={`px-4 py-2 rounded ${
                      fitRating === rating
                        ? 'bg-blue-500 text-white'
                        : 'bg-neutral-200 dark:bg-neutral-700'
                    }`}
                    disabled={loading}
                  >
                    {rating}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Notes (optional)
              </label>
              <textarea
                className="w-full px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-md bg-white dark:bg-neutral-900"
                rows={3}
                placeholder="Optional notes about the fit..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={loading}
              />
            </div>

            <Button
              onClick={handleSubmitRating}
              disabled={loading || !blockId || !assetId}
              className="w-full"
              variant="secondary"
            >
              {loading ? 'Submitting...' : 'Submit Rating'}
            </Button>
          </div>
        </Panel>
      )}

      {/* Empty State */}
      {!fitScore && !error && (
        <Panel className="p-12 text-center">
          <Icon name="target" className="h-12 w-12 mx-auto mb-4 text-neutral-400" />
          <h3 className="text-lg font-semibold mb-2">No Fit Score Computed</h3>
          <p className="text-neutral-600 dark:text-neutral-400">
            Enter a Block ID and Asset ID above to compute the fit score
          </p>
        </Panel>
      )}
    </div>
  );
}

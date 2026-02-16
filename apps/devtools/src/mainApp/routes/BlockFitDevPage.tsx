/**
 * Block Fit Inspector Dev Page
 *
 * Development tool to inspect and rate how well ActionBlocks fit specific assets.
 * Computes heuristic fit scores based on ontology tag alignment.
 */

import { useState, useEffect, useRef } from 'react';
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

  // Prompt Lab integration
  const [promptVersionId, setPromptVersionId] = useState<string | null>(null);
  const [promptText, setPromptText] = useState<string | null>(null);
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);

  // Video/timestamp support
  const videoRef = useRef<HTMLVideoElement>(null);
  const [assetInfo, setAssetInfo] = useState<{ remote_url: string; content_type: string } | null>(null);
  const [currentVideoTime, setCurrentVideoTime] = useState<number>(0);
  const [timestampSec, setTimestampSec] = useState<number | null>(null);
  const [useCurrentTime, setUseCurrentTime] = useState(false);

  // Existing ratings
  const [existingRatings, setExistingRatings] = useState<any[]>([]);
  const [ratingsLoading, setRatingsLoading] = useState(false);

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
          timestamp_sec: timestampSec,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to submit rating');
      }

      setRatingSuccess(true);
      // Refresh ratings list and compute fit to show the scores
      await fetchExistingRatings();
      await handleComputeFit();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Parse query params on mount and fetch prompt version if provided
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const promptVersionIdParam = params.get('prompt_version_id');
    const assetIdParam = params.get('asset_id');
    const blockIdParam = params.get('block_id');
    const roleParam = params.get('role_in_sequence');

    // Pre-fill form fields from query params
    if (assetIdParam) {
      setAssetId(assetIdParam);
    }
    if (blockIdParam) {
      setBlockId(blockIdParam);
    }
    if (roleParam) {
      setRoleInSequence(roleParam);
    }

    // Fetch prompt version if provided
    if (promptVersionIdParam) {
      setPromptVersionId(promptVersionIdParam);
      setPromptLoading(true);
      setPromptError(null);

      fetch(`/api/v1/dev/prompt-library/versions/${promptVersionIdParam}`)
        .then((response) => {
          if (!response.ok) {
            throw new Error('Failed to fetch prompt version');
          }
          return response.json();
        })
        .then((data) => {
          setPromptText(data.prompt_text);
        })
        .catch((err) => {
          console.error('Error fetching prompt version:', err);
          setPromptError(err.message || 'Failed to load prompt version');
        })
        .finally(() => {
          setPromptLoading(false);
        });
    }
  }, []);

  // Fetch asset info when assetId changes
  useEffect(() => {
    if (!assetId) {
      setAssetInfo(null);
      return;
    }

    fetch(`/api/v1/assets/${assetId}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to fetch asset');
        }
        return response.json();
      })
      .then((data) => {
        setAssetInfo({
          remote_url: data.remote_url,
          content_type: data.content_type || '',
        });
      })
      .catch((err) => {
        console.error('Error fetching asset:', err);
        setAssetInfo(null);
      });
  }, [assetId]);

  // Update current video time and handle auto-capture
  useEffect(() => {
    if (useCurrentTime && videoRef.current) {
      setTimestampSec(Math.round(videoRef.current.currentTime * 10) / 10);
    } else if (!useCurrentTime) {
      setTimestampSec(null);
    }
  }, [useCurrentTime, currentVideoTime]);

  const handleVideoTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentVideoTime(videoRef.current.currentTime);
    }
  };

  const handleCaptureTimestamp = () => {
    if (videoRef.current) {
      const time = Math.round(videoRef.current.currentTime * 10) / 10;
      setTimestampSec(time);
      setUseCurrentTime(true);
    }
  };

  const isVideoAsset = assetInfo?.content_type?.startsWith('video/');

  // Fetch existing ratings when blockId and assetId are set
  const fetchExistingRatings = async () => {
    if (!blockId || !assetId) {
      setExistingRatings([]);
      return;
    }

    setRatingsLoading(true);
    try {
      const params = new URLSearchParams({
        block_id: blockId,
        asset_id: assetId,
      });
      const response = await fetch(`/api/v1/dev/block-fit/list?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch ratings');
      }
      const data = await response.json();
      setExistingRatings(data.ratings || []);
    } catch (err) {
      console.error('Error fetching ratings:', err);
      setExistingRatings([]);
    } finally {
      setRatingsLoading(false);
    }
  };

  useEffect(() => {
    fetchExistingRatings();
  }, [blockId, assetId]);

  const handleSeekToTimestamp = (timestamp: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = timestamp;
      videoRef.current.play();
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

      {/* Prompt Lab Context */}
      {promptVersionId && (
        <Panel className="p-6 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <Icon name="link" className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h2 className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                Loaded from Prompt Lab
              </h2>
            </div>
            <span className="text-xs text-blue-700 dark:text-blue-300 font-mono">
              Version ID: {promptVersionId}
            </span>
          </div>

          {promptLoading ? (
            <div className="text-sm text-blue-800 dark:text-blue-200">
              Loading prompt text...
            </div>
          ) : promptError ? (
            <div className="text-sm text-red-800 dark:text-red-200">
              Error: {promptError}
            </div>
          ) : promptText ? (
            <>
              <p className="text-xs text-blue-800 dark:text-blue-200 mb-3">
                This prompt version is being tested for fit. Enter a Block ID below to test a specific block.
              </p>
              <div className="bg-white dark:bg-neutral-900 rounded-md p-4 border border-blue-200 dark:border-blue-700">
                <h3 className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
                  Prompt Text (Read-Only)
                </h3>
                <div className="bg-neutral-100 dark:bg-neutral-800 rounded p-3 font-mono text-xs whitespace-pre-wrap max-h-[200px] overflow-y-auto text-neutral-900 dark:text-neutral-100">
                  {promptText}
                </div>
              </div>
            </>
          ) : null}
        </Panel>
      )}

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

      {/* Video Player (if asset is a video) */}
      {isVideoAsset && assetInfo && (
        <Panel className="p-6">
          <h2 className="text-lg font-semibold mb-4">Video Preview</h2>
          <div className="space-y-4">
            <video
              ref={videoRef}
              src={assetInfo.remote_url}
              controls
              onTimeUpdate={handleVideoTimeUpdate}
              className="w-full max-h-96 rounded bg-black"
            />
            <div className="flex items-center justify-between p-3 bg-neutral-100 dark:bg-neutral-800 rounded">
              <div className="text-sm">
                <span className="font-medium">Current Time: </span>
                <span className="font-mono">{currentVideoTime.toFixed(1)}s</span>
              </div>
              <Button
                onClick={handleCaptureTimestamp}
                variant="primary"
                size="sm"
              >
                Capture Current Time
              </Button>
            </div>
            {timestampSec !== null && (
              <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded">
                <div className="flex items-center gap-2">
                  <Icon name="clock" className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-sm text-blue-900 dark:text-blue-100">
                    <span className="font-medium">Rating at: </span>
                    <span className="font-mono">{timestampSec}s</span>
                  </span>
                </div>
                <button
                  onClick={() => {
                    setTimestampSec(null);
                    setUseCurrentTime(false);
                  }}
                  className="text-xs text-blue-700 dark:text-blue-300 hover:underline"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        </Panel>
      )}

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

      {/* Existing Ratings */}
      {blockId && assetId && existingRatings.length > 0 && (
        <Panel className="p-6">
          <h2 className="text-lg font-semibold mb-4">Existing Ratings for This Block + Asset</h2>
          {ratingsLoading ? (
            <div className="text-sm text-neutral-600 dark:text-neutral-400">Loading...</div>
          ) : (
            <div className="space-y-3">
              {existingRatings.map((rating) => (
                <div
                  key={rating.id}
                  className="p-4 border border-neutral-200 dark:border-neutral-700 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Icon
                            key={star}
                            name="star"
                            className={`h-4 w-4 ${
                              star <= rating.fit_rating
                                ? 'text-yellow-500 fill-yellow-500'
                                : 'text-neutral-300 dark:text-neutral-600'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-sm font-medium">
                        {rating.fit_rating}/5
                      </span>
                      <span className="text-xs text-neutral-500">
                        Heuristic: {(rating.heuristic_score * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="text-xs text-neutral-500">
                      {new Date(rating.created_at).toLocaleString()}
                    </div>
                  </div>

                  {rating.timestamp_sec !== null && (
                    <div className="flex items-center gap-2 mb-2">
                      <Icon name="clock" className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      <span className="text-sm text-blue-900 dark:text-blue-100">
                        Timestamp: <span className="font-mono">{rating.timestamp_sec}s</span>
                      </span>
                      {isVideoAsset && (
                        <button
                          onClick={() => handleSeekToTimestamp(rating.timestamp_sec)}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline ml-2"
                        >
                          Jump to time
                        </button>
                      )}
                    </div>
                  )}

                  {rating.role_in_sequence && rating.role_in_sequence !== 'unspecified' && (
                    <div className="text-xs text-neutral-600 dark:text-neutral-400 mb-2">
                      Role: <span className="font-medium">{rating.role_in_sequence}</span>
                    </div>
                  )}

                  {rating.notes && (
                    <div className="text-sm text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-800 p-2 rounded mt-2">
                      {rating.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
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

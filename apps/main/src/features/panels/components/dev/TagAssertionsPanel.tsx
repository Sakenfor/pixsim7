/**
 * Tag Assertions Panel
 *
 * Dev tool for inspecting and mutating tag assertions for assets and prompt versions.
 */

import { useCallback, useState } from 'react';

import { Icon } from '@lib/icons';

import { useApi } from '@/hooks/useApi';

type TargetType = 'asset' | 'prompt_version';
type MutationMode = 'add' | 'remove' | 'replace' | 'sync_source';

interface TagSummary {
  id: number;
  slug: string;
  namespace: string;
  name: string;
  display_name?: string | null;
}

interface TagAssertionRecord {
  tag: TagSummary;
  source: string;
  confidence?: number | null;
  created_at?: string | null;
}

interface TagAssertionListResponse {
  target_type: TargetType;
  target_id: string;
  assertions: TagAssertionRecord[];
  total: number;
}

interface TagAssertionMutationPayload {
  mode: MutationMode;
  tag_slugs: string[];
  source?: string;
  auto_create?: boolean;
  confidence?: number;
}

const RUN_MODES: Array<{ id: MutationMode; label: string; description: string }> = [
  { id: 'add', label: 'add', description: 'Append assertions for listed slugs.' },
  { id: 'remove', label: 'remove', description: 'Remove assertions for listed slugs.' },
  { id: 'replace', label: 'replace', description: 'Replace target assertions with listed slugs.' },
  { id: 'sync_source', label: 'sync_source', description: 'Sync all assertions for a source.' },
];

function parseTagSlugs(input: string): string[] {
  const parts = input
    .split(/[\n,]/g)
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
  return Array.from(new Set(parts));
}

function formatCell(value: unknown): string {
  if (value == null) return '-';
  if (typeof value === 'string') return value;
  return String(value);
}

export function TagAssertionsPanel() {
  const api = useApi();

  const [targetType, setTargetType] = useState<TargetType>('asset');
  const [targetId, setTargetId] = useState('');
  const [response, setResponse] = useState<TagAssertionListResponse | null>(null);
  const [mode, setMode] = useState<MutationMode>('add');
  const [tagInput, setTagInput] = useState('');
  const [source, setSource] = useState('manual');
  const [autoCreate, setAutoCreate] = useState(true);
  const [confidence, setConfidence] = useState('');
  const [loading, setLoading] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const canLoad = targetId.trim().length > 0;
  const requiresSource = mode === 'sync_source';

  const buildEndpoint = useCallback(
    (id: string) => `/tags/assertions/${targetType}/${encodeURIComponent(id)}`,
    [targetType]
  );

  const loadAssertions = useCallback(async () => {
    const id = targetId.trim();
    if (!id) return;
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const data = await api.get<TagAssertionListResponse>(buildEndpoint(id));
      setResponse(data);
      setInfo(`Loaded ${data.total} assertion${data.total === 1 ? '' : 's'}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load assertions');
    } finally {
      setLoading(false);
    }
  }, [api, buildEndpoint, targetId]);

  const applyMutation = useCallback(async () => {
    const id = targetId.trim();
    if (!id) {
      setError('Target ID is required.');
      return;
    }

    if (requiresSource && !source.trim()) {
      setError("Source is required for 'sync_source'.");
      return;
    }

    const tagSlugs = parseTagSlugs(tagInput);
    if (!requiresSource && tagSlugs.length === 0) {
      setError('At least one tag slug is required for this mode.');
      return;
    }

    const payload: TagAssertionMutationPayload = {
      mode,
      tag_slugs: tagSlugs,
      auto_create: autoCreate,
    };

    const normalizedSource = source.trim();
    if (normalizedSource) payload.source = normalizedSource;

    const normalizedConfidence = confidence.trim();
    if (normalizedConfidence.length > 0) {
      const value = Number(normalizedConfidence);
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        setError('Confidence must be a number between 0 and 1.');
        return;
      }
      payload.confidence = value;
    }

    setMutating(true);
    setError(null);
    setInfo(null);
    try {
      const data = await api.post<TagAssertionListResponse>(buildEndpoint(id), payload);
      setResponse(data);
      setInfo(`Applied '${mode}'. Current assertions: ${data.total}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to mutate assertions');
    } finally {
      setMutating(false);
    }
  }, [api, autoCreate, buildEndpoint, confidence, mode, requiresSource, source, tagInput, targetId]);

  return (
    <div className="h-full flex flex-col bg-gray-900 text-gray-100">
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Icon name="tags" size={20} />
          Tag Assertions
        </h2>
        <p className="text-sm text-gray-400 mt-1">
          Inspect and mutate assertions for asset and prompt_version targets.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <section className="border border-gray-700 rounded bg-gray-900/60 p-3 space-y-3">
          <h3 className="text-sm font-semibold text-gray-300">Target</h3>
          <div className="flex items-center gap-2">
            <select
              value={targetType}
              onChange={(e) => setTargetType(e.target.value as TargetType)}
              className="bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-200"
            >
              <option value="asset">asset</option>
              <option value="prompt_version">prompt_version</option>
            </select>
            <input
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              placeholder={targetType === 'asset' ? 'asset id (int)' : 'prompt_version id (uuid)'}
              className="flex-1 bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-200"
            />
            <button
              onClick={loadAssertions}
              disabled={!canLoad || loading}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 rounded text-sm font-medium"
            >
              {loading ? 'Loading...' : 'Load'}
            </button>
          </div>
        </section>

        <section className="border border-gray-700 rounded bg-gray-900/60 p-3 space-y-3">
          <h3 className="text-sm font-semibold text-gray-300">Mutation</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <label className="text-xs text-gray-400 space-y-1">
              <div>Mode</div>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as MutationMode)}
                className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-200"
              >
                {RUN_MODES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
              <div className="text-[11px] text-gray-500">
                {RUN_MODES.find((item) => item.id === mode)?.description}
              </div>
            </label>

            <label className="text-xs text-gray-400 space-y-1">
              <div>Source</div>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm text-gray-200"
              >
                <option value="">(default/manual)</option>
                <option value="manual">manual</option>
                <option value="system">system</option>
                <option value="analyzer">analyzer</option>
                <option value="unknown">unknown</option>
              </select>
            </label>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-gray-300">
              <input
                type="checkbox"
                checked={autoCreate}
                onChange={(e) => setAutoCreate(e.target.checked)}
                className="rounded"
              />
              auto_create
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-300">
              confidence
              <input
                value={confidence}
                onChange={(e) => setConfidence(e.target.value)}
                placeholder="0..1"
                className="w-24 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-gray-200"
              />
            </label>
          </div>

          <div className="space-y-1">
            <div className="text-xs text-gray-400">Tag slugs (comma or newline separated)</div>
            <textarea
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              rows={4}
              className="w-full rounded bg-gray-800 border border-gray-600 px-2 py-1.5 text-sm text-gray-200 resize-y"
              placeholder="camera:closeup, mood:tense"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={applyMutation}
              disabled={!canLoad || mutating}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-700 rounded text-sm font-medium"
            >
              {mutating ? 'Applying...' : 'Apply'}
            </button>
            <button
              onClick={loadAssertions}
              disabled={!canLoad || loading}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-700 rounded text-sm font-medium"
            >
              Refresh
            </button>
          </div>
        </section>

        {error && (
          <div className="p-3 rounded border border-red-700 bg-red-900/30 text-sm text-red-300">
            {error}
          </div>
        )}

        {info && (
          <div className="p-3 rounded border border-blue-700 bg-blue-900/30 text-sm text-blue-300">
            {info}
          </div>
        )}

        {response && (
          <section className="border border-gray-700 rounded bg-gray-900/60 p-3 space-y-2">
            <div className="text-xs text-gray-400">
              target_type=<span className="text-gray-200">{response.target_type}</span>{' '}
              target_id=<span className="text-gray-200">{response.target_id}</span>{' '}
              total=<span className="text-gray-200">{response.total}</span>
            </div>

            {response.assertions.length === 0 ? (
              <div className="text-sm text-gray-500">No assertions.</div>
            ) : (
              <div className="max-h-80 overflow-auto border border-gray-700 rounded">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-800 border-b border-gray-700">
                    <tr className="text-gray-300">
                      <th className="text-left px-2 py-1.5">Tag</th>
                      <th className="text-left px-2 py-1.5">Source</th>
                      <th className="text-left px-2 py-1.5">Confidence</th>
                      <th className="text-left px-2 py-1.5">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {response.assertions.map((row) => (
                      <tr key={`${row.tag.id}-${row.source}-${row.created_at ?? ''}`} className="border-b border-gray-800">
                        <td className="px-2 py-1.5 text-gray-200">{row.tag.slug}</td>
                        <td className="px-2 py-1.5 text-gray-300">{row.source}</td>
                        <td className="px-2 py-1.5 text-gray-300">{formatCell(row.confidence)}</td>
                        <td className="px-2 py-1.5 text-gray-500">{formatCell(row.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

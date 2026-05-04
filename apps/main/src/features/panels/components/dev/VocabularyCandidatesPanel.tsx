/**
 * Vocabulary Candidates Panel
 *
 * Review tool for keywords harvested by the parser that lack ontology mappings.
 * Workflow: harvest (auto, on asset analysis) → propose (LLM batch) → review (here).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Icon } from '@lib/icons';

import { useApi } from '@/hooks/useApi';

interface Candidate {
  id: number;
  term: string;
  inferred_role: string | null;
  frequency: number;
  first_seen: string;
  last_seen: string;
  sample_contexts: string[];
  status: string;
  proposed_tag: string | null;
  proposed_at: string | null;
  reviewed_at: string | null;
  reviewed_by: number | null;
}

interface CandidatesListResponse {
  candidates: Candidate[];
  total: number;
}

interface StatsResponse {
  by_status: Array<{ status: string; count: number }>;
  total: number;
}

interface ProposeResponse {
  batch_size: number;
  proposed: number;
}

interface PruneResponse {
  deleted: number;
}

const STATUS_FILTERS = [
  { id: '', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'proposed', label: 'Proposed' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'blocklisted', label: 'Blocklisted' },
] as const;

const STATUS_PILL: Record<string, string> = {
  pending: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
  proposed: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  accepted: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  rejected: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
  blocklisted: 'bg-rose-200 text-rose-900 dark:bg-rose-900/50 dark:text-rose-200',
};

const TAG_RE = /^[a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*$/;

export function VocabularyCandidatesPanel() {
  const api = useApi();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('proposed');
  const [minFrequency, setMinFrequency] = useState<number>(2);
  const [loading, setLoading] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [pruning, setPruning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTag, setEditTag] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, statsResp] = await Promise.all([
        api.get<CandidatesListResponse>('/dev/vocab/candidates', {
          params: {
            status: statusFilter || undefined,
            min_frequency: minFrequency,
            limit: 200,
          },
        }),
        api.get<StatsResponse>('/dev/vocab/stats'),
      ]);
      setCandidates(list.candidates);
      setStats(statsResp);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [api, statusFilter, minFrequency]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const propose = useCallback(async () => {
    setProposing(true);
    setError(null);
    try {
      const resp = await api.post<ProposeResponse>('/dev/vocab/candidates/propose', {
        limit: 25,
        min_frequency: 3,
      });
      // After proposal, switch to 'proposed' to see the results
      if (resp.proposed > 0) {
        setStatusFilter('proposed');
      }
      await refresh();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
    } finally {
      setProposing(false);
    }
  }, [api, refresh]);

  const prune = useCallback(async () => {
    if (!window.confirm(
      'Drop low-signal pending candidates older than 30 days with frequency < 3? Reviewer state on accepted/rejected/blocklisted rows is preserved.'
    )) {
      return;
    }
    setPruning(true);
    setError(null);
    setNotice(null);
    try {
      const resp = await api.post<PruneResponse>('/dev/vocab/candidates/prune', {
        max_frequency: 3,
        min_age_days: 30,
      });
      setNotice(`Pruned ${resp.deleted} stale candidate${resp.deleted === 1 ? '' : 's'}.`);
      await refresh();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
    } finally {
      setPruning(false);
    }
  }, [api, refresh]);

  const review = useCallback(
    async (id: number, action: string, tag?: string) => {
      setError(null);
      try {
        await api.patch<Candidate>(`/dev/vocab/candidates/${id}`, {
          action,
          tag,
        });
        setEditingId(null);
        setEditTag('');
        await refresh();
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        setError(message);
      }
    },
    [api, refresh]
  );

  const startRemap = useCallback((c: Candidate) => {
    setEditingId(c.id);
    setEditTag(c.proposed_tag || '');
  }, []);

  const totalLabel = useMemo(() => {
    if (!stats) return '';
    const parts = stats.by_status.map((s) => `${s.status}: ${s.count}`);
    return `${stats.total} total — ${parts.join(', ')}`;
  }, [stats]);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-neutral-900 text-sm">
      {/* Header */}
      <div className="p-3 border-b border-neutral-200 dark:border-neutral-700 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
              Vocabulary Candidates
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Parser keywords lacking ontology mappings — review for vocabulary growth.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              disabled={loading}
              className="px-2.5 py-1 text-xs rounded border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
            >
              <Icon name="refresh" size={12} className="inline mr-1" />
              Refresh
            </button>
            <button
              onClick={propose}
              disabled={proposing}
              className="px-2.5 py-1 text-xs rounded bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
            >
              <Icon name="sparkles" size={12} className="inline mr-1" />
              {proposing ? 'Proposing…' : 'Propose batch (LLM)'}
            </button>
            <button
              onClick={prune}
              disabled={pruning}
              title="Drop pending candidates older than 30 days with frequency < 3"
              className="px-2.5 py-1 text-xs rounded border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
            >
              <Icon name="trash" size={12} className="inline mr-1" />
              {pruning ? 'Pruning…' : 'Cleanup'}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id)}
                className={`px-2 py-0.5 text-xs rounded border ${
                  statusFilter === f.id
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1 text-xs text-neutral-600 dark:text-neutral-400">
            min freq:
            <input
              type="number"
              min={1}
              value={minFrequency}
              onChange={(e) => setMinFrequency(Math.max(1, Number(e.target.value) || 1))}
              className="w-12 px-1 py-0.5 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800"
            />
          </label>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">{totalLabel}</span>
        </div>
      </div>

      {error && (
        <div className="p-2 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 text-xs border-b border-rose-200 dark:border-rose-900/40">
          {error}
        </div>
      )}

      {notice && (
        <div className="p-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 text-xs border-b border-emerald-200 dark:border-emerald-900/40 flex items-center justify-between">
          <span>{notice}</span>
          <button
            onClick={() => setNotice(null)}
            className="text-emerald-700 dark:text-emerald-300 hover:opacity-70"
          >
            <Icon name="x" size={12} />
          </button>
        </div>
      )}

      {/* Candidate list */}
      <div className="flex-1 overflow-auto">
        {loading && candidates.length === 0 && (
          <div className="p-3 text-xs text-neutral-500 dark:text-neutral-400">Loading…</div>
        )}
        {!loading && candidates.length === 0 && (
          <div className="p-3 text-xs text-neutral-500 dark:text-neutral-400">
            No candidates match the current filter.
          </div>
        )}

        <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {candidates.map((c) => {
            const isEditing = editingId === c.id;
            const editTagValid = TAG_RE.test(editTag.trim().toLowerCase());
            return (
              <li key={c.id} className="px-3 py-2 hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        {c.term}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          STATUS_PILL[c.status] || STATUS_PILL.pending
                        }`}
                      >
                        {c.status}
                      </span>
                      {c.inferred_role && (
                        <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                          role: <span className="font-mono">{c.inferred_role}</span>
                        </span>
                      )}
                      <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                        ×{c.frequency}
                      </span>
                      {c.proposed_tag && !isEditing && (
                        <span className="px-1.5 py-0.5 text-[11px] rounded bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-mono">
                          → {c.proposed_tag}
                        </span>
                      )}
                    </div>
                    {c.sample_contexts.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {c.sample_contexts.slice(0, 2).map((ctx, i) => (
                          <div
                            key={i}
                            className="text-[11px] text-neutral-500 dark:text-neutral-400 italic truncate"
                          >
                            "{ctx}"
                          </div>
                        ))}
                      </div>
                    )}
                    {isEditing && (
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="text"
                          value={editTag}
                          onChange={(e) => setEditTag(e.target.value)}
                          placeholder="namespace:value"
                          className={`flex-1 px-2 py-1 text-xs font-mono rounded border ${
                            editTagValid || !editTag
                              ? 'border-neutral-300 dark:border-neutral-600'
                              : 'border-rose-400'
                          } bg-white dark:bg-neutral-800`}
                          autoFocus
                        />
                        <button
                          onClick={() => review(c.id, 'remap', editTag.trim().toLowerCase())}
                          disabled={!editTagValid}
                          className="px-2 py-1 text-xs rounded bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setEditingId(null);
                            setEditTag('');
                          }}
                          className="px-2 py-1 text-xs rounded border border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-300"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>

                  {!isEditing && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {c.proposed_tag && c.status !== 'accepted' && (
                        <button
                          onClick={() => review(c.id, 'accept')}
                          title="Accept proposed mapping"
                          className="px-2 py-1 text-xs rounded bg-emerald-500 text-white hover:bg-emerald-600"
                        >
                          Accept
                        </button>
                      )}
                      <button
                        onClick={() => startRemap(c)}
                        title="Edit / remap to a different tag"
                        className="px-2 py-1 text-xs rounded border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                      >
                        Edit
                      </button>
                      {c.status !== 'rejected' && (
                        <button
                          onClick={() => review(c.id, 'reject')}
                          title="Reject — won't be re-proposed"
                          className="px-2 py-1 text-xs rounded border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                        >
                          Reject
                        </button>
                      )}
                      {c.status !== 'blocklisted' && (
                        <button
                          onClick={() => review(c.id, 'blocklist')}
                          title="Blocklist — also stops harvesting this term"
                          className="px-2 py-1 text-xs rounded border border-rose-400 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                        >
                          Block
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export default VocabularyCandidatesPanel;

/**
 * Prompt Family Candidates Panel
 *
 * Review surface for clusters of near-duplicate / minor-tweak prompt versions
 * (the QuickGen probing leaves thousands of ungrouped one-off versions). Calls
 * GET /prompts/family-candidates (two-signal embedding+lexical clustering, see
 * plan prompt-family-candidates) and lists candidate families ranked by
 * groupable success.
 *
 * - Explicit-scan (not auto-run): a full-library scan is on demand and can take
 *   a while, so the user triggers it with Scan and tunes the thresholds.
 * - Scan results live in a module store (promptFamilyCandidatesStore) so they
 *   survive the tab unmounting — reopening shows the last scan instantly.
 * - Confirm actions: promote a cluster into a NEW family, merge into an existing
 *   one, or dismiss it from the list (plan checkpoint confirm-into-family).
 */
import { useCallback, useMemo, useState } from 'react';

import { Icon } from '@lib/icons';

import { useApi } from '@/hooks/useApi';

import {
  LEXICAL_METHODS,
  usePromptFamilyCandidatesStore,
  type FamilyCandidate,
  type FamilyCandidatesResponse,
  type InducedTemplate,
  type LexicalMethod,
} from './promptFamilyCandidatesStore';

type TemplateState = InducedTemplate | { loading: true } | { error: string };

/**
 * Build a copy-pasteable parameterized template from an induced one: the
 * skeleton with each slot replaced by a bare uppercase variable token (the
 * format the prompt tokenizer recognizes — no {{}}), followed by a legend
 * mapping each token to its sampled value-set. Paste into the composer and bind
 * each token's value via the VAR-token popover (the system holds one value per
 * variable, so the set is shown for you to choose from).
 */
function buildExtractedTemplate(tmpl: InducedTemplate): string {
  const promptParts: string[] = [];
  const legend: string[] = [];
  for (const seg of tmpl.segments) {
    if (seg.kind === 'text') {
      promptParts.push(seg.text);
    } else {
      const name = `SLOT_${seg.index}`;
      promptParts.push(name);
      const extra = seg.total > seg.values.length ? ` | …(+${seg.total - seg.values.length})` : '';
      legend.push(`# ${name}: ${seg.values.join(' | ')}${extra}`);
    }
  }
  return `${promptParts.join(' ')}\n\n# Variable slots (bind each in the composer):\n${legend.join('\n')}`;
}

const LABEL_PILL: Record<FamilyCandidate['label'], string> = {
  tweak_family: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  template_cluster: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
};

const LABEL_TEXT: Record<FamilyCandidate['label'], string> = {
  tweak_family: 'tweak family',
  template_cluster: 'template cluster',
};

interface PromoteResult {
  family_id: string;
  title: string;
  created: boolean;
  assigned: number;
  skipped_grouped: number;
  skipped_duplicate: number;
}

export function PromptFamilyCandidatesPanel() {
  const api = useApi();
  const store = usePromptFamilyCandidatesStore();
  const {
    cosineFloor,
    lexicalFloor,
    lexicalMethod,
    seedLimit,
    includeGrouped,
    candidates,
    loading,
    error,
    notice,
    setControls,
    setLoading,
    setError,
    setNotice,
    setCandidates,
    removeCandidate,
  } = store;

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  // Induced templates per cluster (lazy, toggled). Keyed by representative id.
  const [templates, setTemplates] = useState<Record<string, TemplateState>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyTemplate = useCallback((id: string, tmpl: InducedTemplate) => {
    void navigator.clipboard?.writeText(buildExtractedTemplate(tmpl)).then(
      () => {
        setCopiedId(id);
        window.setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 2000);
      },
      () => {
        /* clipboard blocked — ignore */
      },
    );
  }, []);

  const scan = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const resp = await api.get<FamilyCandidatesResponse>('/prompts/family-candidates', {
        params: {
          cosine_floor: cosineFloor,
          lexical_floor: lexicalFloor,
          lexical_method: lexicalMethod,
          seed_limit: seedLimit,
          include_grouped: includeGrouped,
          max_clusters: 100,
          member_limit: 25,
        },
        // Full-library scans (seed_limit=0) over ~21k versions can exceed the
        // 30s default; this is an explicit on-demand action.
        timeout: 120000,
      });
      setCandidates(resp.candidates);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setLoading(false);
    }
  }, [
    api,
    cosineFloor,
    lexicalFloor,
    lexicalMethod,
    seedLimit,
    includeGrouped,
    setLoading,
    setError,
    setNotice,
    setCandidates,
  ]);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Toggle the induced-template view for a cluster (lazy fetch, then cached).
  const toggleTemplate = useCallback(
    async (c: FamilyCandidate) => {
      const id = c.representative_version_id;
      if (templates[id]) {
        setTemplates((p) => {
          const next = { ...p };
          delete next[id];
          return next;
        });
        return;
      }
      setTemplates((p) => ({ ...p, [id]: { loading: true } }));
      try {
        const t = await api.post<InducedTemplate>(
          '/prompts/family-candidates/template',
          { version_ids: c.member_version_ids },
          { timeout: 60000 },
        );
        setTemplates((p) => ({ ...p, [id]: t }));
      } catch (e) {
        setTemplates((p) => ({
          ...p,
          [id]: { error: e instanceof Error ? e.message : 'Template failed' },
        }));
      }
    },
    [api, templates],
  );

  const reportPromotion = useCallback(
    (r: PromoteResult) => {
      const verb = r.created ? 'Created' : 'Merged into';
      const skipped = r.skipped_grouped + r.skipped_duplicate;
      const tail = skipped > 0 ? ` (skipped ${skipped})` : '';
      setNotice(`${verb} "${r.title}" — grouped ${r.assigned} version${r.assigned === 1 ? '' : 's'}${tail}`);
    },
    [setNotice],
  );

  const promote = useCallback(
    async (c: FamilyCandidate, title: string) => {
      if (!title.trim()) return;
      setBusyId(c.representative_version_id);
      setError(null);
      try {
        const r = await api.post<PromoteResult>('/prompts/family-candidates/promote', {
          version_ids: c.member_version_ids,
          title: title.trim(),
        });
        reportPromotion(r);
        removeCandidate(c.representative_version_id);
        setPromotingId(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Promote failed');
      } finally {
        setBusyId(null);
      }
    },
    [api, reportPromotion, removeCandidate, setError],
  );

  const merge = useCallback(
    async (c: FamilyCandidate, familyId: string) => {
      setBusyId(c.representative_version_id);
      setError(null);
      try {
        const r = await api.post<PromoteResult>('/prompts/family-candidates/promote', {
          version_ids: c.member_version_ids,
          family_id: familyId,
        });
        reportPromotion(r);
        removeCandidate(c.representative_version_id);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Merge failed');
      } finally {
        setBusyId(null);
      }
    },
    [api, reportPromotion, removeCandidate, setError],
  );

  const dismiss = useCallback(
    (c: FamilyCandidate) => {
      removeCandidate(c.representative_version_id);
      setNotice('Dismissed (this scan only).');
    },
    [removeCandidate, setNotice],
  );

  const summary = useMemo(() => {
    if (!candidates) return null;
    const groupable = candidates.reduce((acc, c) => acc + c.size, 0);
    const tweak = candidates.filter((c) => c.label === 'tweak_family').length;
    return { clusters: candidates.length, groupable, tweak, template: candidates.length - tweak };
  }, [candidates]);

  return (
    <div className="flex flex-col h-full text-neutral-800 dark:text-neutral-200">
      {/* Controls */}
      <div className="shrink-0 border-b border-neutral-200 dark:border-neutral-800 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Icon name="layers" size={14} />
          <span className="text-[12px] font-medium">Prompt family candidates</span>
          <button
            type="button"
            onClick={() => void scan()}
            disabled={loading}
            className="ml-auto flex items-center gap-1 rounded bg-accent px-2 py-1 text-[11px] font-medium text-white hover:bg-accent/90 disabled:opacity-50"
          >
            <Icon name={loading ? 'refresh' : 'search'} size={11} className={loading ? 'animate-spin' : undefined} />
            {loading ? 'Scanning…' : 'Scan'}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[10px] text-neutral-500 dark:text-neutral-400">
          <label className="flex items-center gap-2">
            <span className="w-20 shrink-0">Min cosine</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={cosineFloor}
              onChange={(e) => setControls({ cosineFloor: Number(e.target.value) })}
              className="flex-1 h-1 accent-accent cursor-pointer"
            />
            <span className="w-7 tabular-nums text-right">{cosineFloor.toFixed(2)}</span>
          </label>
          <label className="flex items-center gap-2">
            <span className="w-20 shrink-0">Min lexical</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={lexicalFloor}
              onChange={(e) => setControls({ lexicalFloor: Number(e.target.value) })}
              className="flex-1 h-1 accent-accent cursor-pointer"
            />
            <span className="w-7 tabular-nums text-right">{lexicalFloor.toFixed(2)}</span>
          </label>
          <label className="flex items-center gap-2">
            <span className="w-20 shrink-0">Lexical method</span>
            <select
              value={lexicalMethod}
              onChange={(e) => setControls({ lexicalMethod: e.target.value as LexicalMethod })}
              className="flex-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-1 py-0.5 cursor-pointer"
            >
              {LEXICAL_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2" title="0 = full library (slower)">
            <span className="w-20 shrink-0">Seed limit</span>
            <input
              type="number"
              min={0}
              step={500}
              value={seedLimit}
              onChange={(e) => setControls({ seedLimit: Math.max(0, Number(e.target.value)) })}
              className="flex-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-1 py-0.5"
            />
            <span className="text-neutral-400">{seedLimit === 0 ? 'all' : 'newest'}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none col-span-2">
            <input
              type="checkbox"
              checked={includeGrouped}
              onChange={(e) => setControls({ includeGrouped: e.target.checked })}
              className="accent-accent cursor-pointer"
            />
            Include versions already in a family
          </label>
        </div>

        {summary && (
          <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
            {summary.clusters} clusters · {summary.groupable} versions · {summary.tweak} tweak ·{' '}
            {summary.template} template
          </div>
        )}
        {notice && <div className="text-[10px] text-emerald-600 dark:text-emerald-400">{notice}</div>}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {error && <div className="px-2 py-3 text-[11px] text-rose-500">{error}</div>}

        {!error && candidates === null && !loading && (
          <div className="px-3 py-8 text-center text-[11px] text-neutral-400 dark:text-neutral-500">
            Press <span className="font-medium">Scan</span> to find candidate prompt families.
          </div>
        )}

        {!error && candidates !== null && candidates.length === 0 && !loading && (
          <div className="px-3 py-8 text-center text-[11px] text-neutral-400 dark:text-neutral-500">
            No candidate families left. Try lowering Min lexical / Min cosine and re-scan.
          </div>
        )}

        {candidates?.map((c) => {
          const open = expanded.has(c.representative_version_id);
          const busy = busyId === c.representative_version_id;
          const promoting = promotingId === c.representative_version_id;
          const mergeTarget = c.existing_families.length === 1 ? c.existing_families[0] : null;
          return (
            <div
              key={c.representative_version_id}
              className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900"
            >
              <button
                type="button"
                onClick={() => toggle(c.representative_version_id)}
                className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/50 rounded-t-lg"
              >
                <Icon
                  name={open ? 'chevronDown' : 'chevronRight'}
                  size={12}
                  className="mt-1 shrink-0 text-neutral-400"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-[9px] px-1 rounded ${LABEL_PILL[c.label]}`}>
                      {LABEL_TEXT[c.label]}
                    </span>
                    <span className="text-[12px] font-medium truncate">{c.suggested_title}</span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-neutral-500 dark:text-neutral-400 flex items-center gap-2 flex-wrap">
                    <span>{c.size} versions</span>
                    <span className="text-emerald-600 dark:text-emerald-400">
                      {c.total_successful_assets}✓
                    </span>
                    <span>{c.total_generation_count} gens</span>
                    {c.existing_families.length > 0 && (
                      <span className="text-amber-600 dark:text-amber-400">
                        in {c.existing_families.map((f) => `${f.title ?? 'family'}×${f.count}`).join(', ')}
                      </span>
                    )}
                  </div>
                </div>
              </button>

              {open && (
                <div className="px-3 pb-1 pl-7 space-y-1">
                  {c.members.map((m) => (
                    <div key={m.version_id} className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0 text-[9px] tabular-nums px-1 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        {m.successful_assets}✓
                      </span>
                      {m.is_representative && (
                        <span className="mt-0.5 shrink-0 text-[9px] px-1 rounded bg-accent/10 text-accent">
                          rep
                        </span>
                      )}
                      <span className="text-[10px] text-neutral-600 dark:text-neutral-300 line-clamp-2">
                        {m.prompt_preview}
                      </span>
                    </div>
                  ))}
                  {c.members_truncated && (
                    <div className="text-[10px] text-neutral-400 dark:text-neutral-500 pl-1">
                      … and {c.size - c.members.length} more
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="px-3 py-2 pl-7 border-t border-neutral-100 dark:border-neutral-800/60">
                {promoting ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={titleDraft}
                      onChange={(e) => setTitleDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void promote(c, titleDraft);
                        if (e.key === 'Escape') setPromotingId(null);
                      }}
                      placeholder="Family title"
                      className="flex-1 min-w-0 text-[11px] rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-1.5 py-1"
                    />
                    <button
                      type="button"
                      onClick={() => void promote(c, titleDraft)}
                      disabled={busy || !titleDraft.trim()}
                      className="text-[10px] rounded bg-accent px-2 py-1 text-white hover:bg-accent/90 disabled:opacity-50"
                    >
                      {busy ? '…' : 'Create'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPromotingId(null)}
                      className="text-[10px] rounded px-2 py-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-[10px]">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setPromotingId(c.representative_version_id);
                        setTitleDraft(c.suggested_title);
                      }}
                      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-accent hover:bg-accent/10 disabled:opacity-50"
                    >
                      <Icon name="layers" size={10} />
                      Create family
                    </button>
                    {mergeTarget && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void merge(c, mergeTarget.family_id)}
                        className="rounded px-1.5 py-0.5 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 disabled:opacity-50"
                      >
                        Merge into {mergeTarget.title ?? 'family'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void toggleTemplate(c)}
                      className={`flex items-center gap-1 rounded px-1.5 py-0.5 ${
                        templates[c.representative_version_id]
                          ? 'bg-accent/10 text-accent'
                          : 'text-neutral-500 hover:text-accent hover:bg-accent/10'
                      }`}
                      title="Induce a template (stable skeleton + variable slots) from this cluster"
                    >
                      <Icon name="wand" size={10} />
                      Template
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => dismiss(c)}
                      className="ml-auto rounded px-1.5 py-0.5 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>

              {(() => {
                const tmpl = templates[c.representative_version_id];
                if (!tmpl) return null;
                return (
                  <div className="px-3 pb-2 pl-7 border-t border-neutral-100 dark:border-neutral-800/60 pt-1.5">
                    {'loading' in tmpl ? (
                      <div className="text-[10px] text-neutral-400 dark:text-neutral-500">
                        Inducing template…
                      </div>
                    ) : 'error' in tmpl ? (
                      <div className="text-[10px] text-rose-500">{tmpl.error}</div>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-[10px] text-neutral-500 dark:text-neutral-400">
                          <span>
                            {tmpl.stable_pct}% stable · {tmpl.slot_count} slot
                            {tmpl.slot_count === 1 ? '' : 's'} · {tmpl.member_count} members
                          </span>
                          {tmpl.slot_count > 0 && (
                            <button
                              type="button"
                              onClick={() => copyTemplate(c.representative_version_id, tmpl)}
                              title="Copy the skeleton with SLOT_n tokens + a value legend — paste into the composer and bind each via the VAR popover"
                              className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-accent hover:bg-accent/10"
                            >
                              <Icon name={copiedId === c.representative_version_id ? 'check' : 'copy'} size={10} />
                              {copiedId === c.representative_version_id ? 'Copied' : 'Copy as template'}
                            </button>
                          )}
                        </div>
                        <div className="text-[10px] leading-relaxed text-neutral-600 dark:text-neutral-300">
                          {tmpl.segments.map((seg, i) =>
                            seg.kind === 'text' ? (
                              <span key={i}>{seg.text} </span>
                            ) : (
                              <span
                                key={i}
                                className="rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 px-1 mx-0.5"
                                title={seg.values.join('  |  ')}
                              >
                                ⟨{seg.index}: {seg.values.slice(0, 2).join(' | ')}
                                {seg.total > 2 ? ` +${seg.total - 2}` : ''}⟩
                              </span>
                            ),
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );
}

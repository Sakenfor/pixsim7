/**
 * SignalReferencePanel — the curated `signalref:*` reference library.
 *
 * Lives in Video Health → References. Lists every clip tagged `signalref:*`
 * (the templates the broken-audio matcher cross-correlates against), grouped by
 * voice, with each clip's chroma heatmap + melody playback so you can hear/trim
 * the reference set. Removing a voice untags the clip; afterwards run
 * Scan & reprobe → Rescore to re-apply the matcher across the library.
 */

import { LoadingSpinner } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { getSignalReferences, type SignalReferenceItem } from '@lib/api/assets';
import { Icon, type IconName } from '@lib/icons';
import { createBadgeWidget, BADGE_SLOT, BADGE_PRIORITY, type OverlayWidget } from '@lib/ui/overlay';

import { fromAssetResponse, type AssetModel } from '@features/assets';
import { ChromaFingerprint } from '@features/assets/components/ChromaFingerprint';
import { SIGNAL_REF_PRESETS, signalRefTags, setSignalRefTag } from '@features/assets/lib/signalRefTag';

import { MediaCard } from '@/components/media/MediaCard';
import { MEDIA_CARD_WIDGET_IDS, type MediaCardWidgetVisibility } from '@/components/media/mediaCardWidgetIds';

import { extractErrorMessage } from './maintenanceShared';

// Custom overlay-badge ids rendered on the card the same way a gallery card
// shows its badges: the per-clip analysis metrics (match + dyn in one row) and
// the remove-ref action.
const REF_BADGE_METRICS = 'ref-metrics';
const REF_BADGE_REMOVE = 'ref-remove';

// Reference tiles reuse the shared MediaCard (scrub + hover-play + battle-tested
// video handling) trimmed to just the scrubber + duration + our metric/action
// badges. `only` also gates custom widget ids, so the badge ids are whitelisted
// here too.
const REF_CLIP_WIDGETS: MediaCardWidgetVisibility = {
  only: [
    MEDIA_CARD_WIDGET_IDS.videoScrubber,
    MEDIA_CARD_WIDGET_IDS.duration,
    REF_BADGE_METRICS,
    REF_BADGE_REMOVE,
  ],
};

const PRESET_BY_TAG = new Map(SIGNAL_REF_PRESETS.map((p) => [p.tag, p]));

/** Display form of a `signalref:<voice>` tag (preset label/glyph, or the raw voice). */
function voiceDisplay(tag: string): { glyph: string; label: string } {
  const preset = PRESET_BY_TAG.get(tag);
  if (preset) return { glyph: preset.glyph, label: preset.label };
  return { glyph: '•', label: tag.split(':').slice(1).join(':') || tag };
}

interface RefRow {
  item: SignalReferenceItem;
  model: AssetModel;
  voices: string[];
}

// What each reference card shows: the hover-playable clip, the chroma spectrum,
// or both side-by-side. Panel-wide, persisted so it survives a reopen.
type RefView = 'both' | 'video' | 'spectrum';
const REF_VIEW_KEY = 'maintenance:signalref-view:v1';
const REF_VIEW_OPTIONS: { value: RefView; icon: IconName; label: string }[] = [
  { value: 'video', icon: 'video', label: 'Video only' },
  { value: 'spectrum', icon: 'barChart', label: 'Spectrum only' },
  { value: 'both', icon: 'columns', label: 'Video + spectrum' },
];

function readRefView(): RefView {
  if (typeof window === 'undefined') return 'both';
  const v = window.localStorage.getItem(REF_VIEW_KEY);
  return v === 'video' || v === 'spectrum' || v === 'both' ? v : 'both';
}

// Category filter: null = All voices, otherwise a specific `signalref:*` tag.
// Persisted so the chosen category survives a reopen.
const REF_CATEGORY_KEY = 'maintenance:signalref-category:v1';
function readRefCategory(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(REF_CATEGORY_KEY) || null;
}

/** This clip's leave-one-out match to the rest of `tag`'s group (0..1), or null. */
function cohesionFor(row: RefRow, tag: string): number | null {
  const v = row.item.cohesion?.[tag];
  return typeof v === 'number' ? v : null;
}

// Thresholds mirror the scorer's match bands (weak 0.50 / strong 0.60): below
// the weak band a clip barely resembles its own group, so it's flagged.
const COHESION_WEAK = 0.5;
const COHESION_OFF = 0.4;

/** Badge style for a cohesion score — null when it fits the group (no badge). */
function cohesionBadge(c: number | null): { label: string; className: string } | null {
  if (c == null) return null;
  if (c < COHESION_OFF)
    return {
      label: `off-group ${c.toFixed(2)}`,
      className: 'border-red-500/50 bg-red-500/10 text-red-600',
    };
  if (c < COHESION_WEAK)
    return {
      label: `weak fit ${c.toFixed(2)}`,
      className: 'border-amber-500/50 bg-amber-500/10 text-amber-600',
    };
  return null;
}

export function SignalReferencePanel() {
  const [rows, setRows] = useState<RefRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [view, setView] = useState<RefView>(readRefView);
  const [category, setCategory] = useState<string | null>(readRefCategory);

  const changeView = useCallback((next: RefView) => {
    setView(next);
    try {
      window.localStorage.setItem(REF_VIEW_KEY, next);
    } catch {
      // localStorage may be unavailable (private mode); ignore
    }
  }, []);

  const changeCategory = useCallback((next: string | null) => {
    setCategory(next);
    try {
      if (next) window.localStorage.setItem(REF_CATEGORY_KEY, next);
      else window.localStorage.removeItem(REF_CATEGORY_KEY);
    } catch {
      // localStorage may be unavailable (private mode); ignore
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getSignalReferences();
      setRows(
        res.items.map((item) => {
          const model = fromAssetResponse(item.asset);
          return { item, model, voices: signalRefTags(model) };
        }),
      );
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Untag a voice from a clip (removes it as a reference for that voice). Reloads
  // so a clip that loses its last signalref:* tag drops out of the library.
  const removeVoice = useCallback(
    async (model: AssetModel, tag: string) => {
      setBusyId(model.id);
      try {
        await setSignalRefTag(model.id, tag, false);
        await load();
      } catch (e) {
        setError(extractErrorMessage(e));
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  // Group clips under each voice they carry (a multi-voice clip appears in each).
  const groups = useMemo(() => {
    if (!rows) return [];
    const byVoice = new Map<string, RefRow[]>();
    for (const row of rows) {
      for (const tag of row.voices) {
        const list = byVoice.get(tag) ?? [];
        list.push(row);
        byVoice.set(tag, list);
      }
    }
    // Presets first (in their canonical order), then any custom voices.
    const order = (tag: string) => {
      const i = SIGNAL_REF_PRESETS.findIndex((p) => p.tag === tag);
      return i === -1 ? SIGNAL_REF_PRESETS.length : i;
    };
    return [...byVoice.entries()]
      .sort((a, b) => order(a[0]) - order(b[0]) || a[0].localeCompare(b[0]))
      .map(([tag, list]) => ({
        tag,
        ...voiceDisplay(tag),
        // Odd-one-out first: lowest cohesion at the top, clips without a score last.
        rows: [...list].sort((a, b) => {
          const ca = cohesionFor(a, tag);
          const cb = cohesionFor(b, tag);
          if (ca == null) return cb == null ? 0 : 1;
          if (cb == null) return -1;
          return ca - cb;
        }),
      }));
  }, [rows]);

  const total = rows?.length ?? 0;

  // Fall back to All when the selected category no longer has any references
  // (e.g. its last clip was just untagged).
  const activeCategory = category && groups.some((g) => g.tag === category) ? category : null;
  const visibleGroups = activeCategory ? groups.filter((g) => g.tag === activeCategory) : groups;

  return (
    <section className="space-y-3">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Reference library</h3>
          <p className="mt-0.5 max-w-xl text-[11px] leading-snug text-muted-foreground">
            Clips tagged <code>signalref:*</code> are the templates the broken-audio matcher
            scores against. Trim/curate here, then run{' '}
            <strong>Scan &amp; reprobe → Rescore</strong> to re-apply the matcher.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* View toggle — segmented control choosing what each card shows. */}
          <div className="flex items-center rounded border border-border p-0.5" role="group" aria-label="Reference card view">
            {REF_VIEW_OPTIONS.map((opt) => {
              const active = view === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => changeView(opt.value)}
                  title={opt.label}
                  aria-label={opt.label}
                  aria-pressed={active}
                  className={`inline-flex items-center justify-center rounded p-1 transition-colors ${
                    active
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-muted/60'
                  }`}
                >
                  <Icon name={opt.icon} size={13} />
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded border border-border px-2 py-1 text-[11px] disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
      </header>

      {error && <p className="text-[11px] text-red-500 break-words">{error}</p>}

      {loading && rows === null ? (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <LoadingSpinner /> Loading references…
        </div>
      ) : total === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          No references yet. Tag broken clips with the <em>ref</em> buttons on a Triage card
          (♪ Melody / ▲ Pitch / ? Investigate) to seed the matcher.
        </p>
      ) : (
        <div className="space-y-3">
          {/* Category filter — pick a single voice or All. Only meaningful when
              there's more than one category present. */}
          {groups.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <CategoryChip
                active={activeCategory == null}
                label="All"
                count={total}
                onClick={() => changeCategory(null)}
              />
              {groups.map((g) => (
                <CategoryChip
                  key={g.tag}
                  active={activeCategory === g.tag}
                  glyph={g.glyph}
                  label={g.label}
                  count={g.rows.length}
                  onClick={() => changeCategory(g.tag)}
                />
              ))}
            </div>
          )}
          <div className="space-y-4">
          {visibleGroups.map((g) => (
            <div key={g.tag} className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <span className="text-base leading-none">{g.glyph}</span>
                <span>{g.label}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                  {g.rows.length}
                </span>
                <span className="font-mono text-[10px] font-normal text-muted-foreground">{g.tag}</span>
              </div>
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                {g.rows.map((row) => (
                  <ReferenceCard
                    key={`${g.tag}:${row.model.id}`}
                    row={row}
                    voiceTag={g.tag}
                    view={view}
                    busy={busyId === row.model.id}
                    onRemove={() => void removeVoice(row.model, g.tag)}
                  />
                ))}
              </div>
            </div>
          ))}
          </div>
        </div>
      )}
    </section>
  );
}

/** Compact metric chip — icon + value, no text label (the label lives in the
 *  tooltip). Keeps the reference card's stats row scannable and dense. */
function MetaBadge({ icon, value, title }: { icon: IconName; value: ReactNode; title: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
    >
      <Icon name={icon} size={10} className="shrink-0 opacity-70" />
      <span className="font-mono tabular-nums">{value}</span>
    </span>
  );
}

/** Category filter pill — glyph + label + count. Selecting one narrows the panel
 *  to a single voice; "All" clears the filter. */
function CategoryChip({
  active,
  glyph,
  label,
  count,
  onClick,
}: {
  active: boolean;
  glyph?: string;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
        active
          ? 'border-accent bg-accent text-accent-foreground'
          : 'border-border bg-transparent text-muted-foreground hover:bg-muted/50'
      }`}
    >
      {glyph && <span className="text-sm leading-none">{glyph}</span>}
      <span>{label}</span>
      <span
        className={`rounded-full px-1.5 text-[10px] tabular-nums ${
          active ? 'bg-black/15' : 'bg-muted text-muted-foreground'
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function ReferenceCard({
  row,
  voiceTag,
  view,
  busy,
  onRemove,
}: {
  row: RefRow;
  voiceTag: string;
  view: RefView;
  busy: boolean;
  onRemove: () => void;
}) {
  const { item, model, voices } = row;
  const otherVoices = voices.filter((v) => v !== voiceTag);
  const cohesion = cohesionFor(row, voiceTag);
  const badge = cohesionBadge(cohesion);
  const showVideo = view !== 'spectrum';
  const showSpectrum = view !== 'video';

  // Keep the remove handler fresh without making it a memo dep (the parent
  // recreates it each render).
  const onRemoveRef = useRef(onRemove);
  onRemoveRef.current = onRemove;

  // Analysis metrics (fit + dyn, side-by-side) + the remove action rendered as
  // real MediaCard overlay badges. Solid fills (like the built-in duration badge)
  // so they read over the video; the pale shared <Badge> palette washes out.
  //
  // NB: we show *fit* (leave-one-out cohesion), NOT the stored `audio_ref_match`.
  // A reference clip is part of the matcher's own reference set, so it self-matches
  // → audio_ref_match ≈ 1.0 for every reference (useless here). `fit` excludes the
  // clip from its own group, so it actually measures how well it fits the others.
  const dyn = item.loudness_range_db;
  const clipWidgets = useMemo<OverlayWidget[]>(() => {
    const w: OverlayWidget[] = [];
    // Combined metrics pill — bottom-center, fit and dyn next to each other.
    if (cohesion != null || dyn != null) {
      w.push({
        id: REF_BADGE_METRICS,
        type: 'badge',
        position: { anchor: 'bottom-center', offset: { x: 0, y: -4 } },
        visibility: { trigger: 'always', transition: 'none' },
        priority: BADGE_PRIORITY.info,
        render: () => (
          <div className="flex items-center gap-1">
            {cohesion != null && (
              <span
                title="fit — leave-one-out match to the rest of this group (higher = fits; low = odd-one-out)"
                className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium text-white shadow-sm backdrop-blur-sm ${
                  cohesion < COHESION_OFF
                    ? 'bg-red-600/85'
                    : cohesion < COHESION_WEAK
                      ? 'bg-amber-600/85'
                      : 'bg-emerald-600/85'
                }`}
              >
                <Icon name="target" size={9} color="#fff" />
                <span className="tabular-nums">{cohesion.toFixed(2)}</span>
              </span>
            )}
            {dyn != null && (
              <span
                title="dyn — p95−p10 loudness (flat ≈ broken, lively ≈ real)"
                className="inline-flex items-center gap-0.5 rounded bg-purple-600/85 px-1 py-0.5 text-[10px] font-medium text-white shadow-sm backdrop-blur-sm"
              >
                <Icon name="activity" size={9} color="#fff" />
                <span className="tabular-nums">{dyn.toFixed(1)}dB</span>
              </span>
            )}
          </div>
        ),
      });
    }
    // Remove-ref action — top-right, like a normal card action badge.
    w.push(
      createBadgeWidget({
        id: REF_BADGE_REMOVE,
        ...BADGE_SLOT.topRight,
        variant: 'icon',
        icon: 'x',
        color: 'red',
        shape: 'circle',
        tooltip: `Remove ${voiceTag} from this clip`,
        priority: BADGE_PRIORITY.action,
        onClick: (_data, e) => {
          e?.stopPropagation();
          if (!busy) onRemoveRef.current();
        },
      }),
    );
    return w;
  }, [cohesion, dyn, voiceTag, busy]);

  return (
    <div
      className={`flex gap-2 rounded-md border bg-muted/10 p-2 ${
        showVideo ? 'min-h-[92px]' : ''
      } ${badge ? 'border-amber-500/40' : 'border-border/60'}`}
    >
      {/* Shared MediaCard trimmed to just the scrubber + duration; hover plays
          and cursor scrubs. Fills the card height so there's no dead space beside
          a taller spectrum column. */}
      {showVideo && (
        <div
          className={`shrink-0 self-stretch overflow-hidden rounded ${
            showSpectrum ? 'w-24' : 'w-32'
          }`}
        >
          <MediaCard
            asset={model}
            customWidgets={clipWidgets}
            layout={{
              density: 'compact',
              hideFooter: true,
              fillHeight: true,
              enableHoverPreview: true,
              widgets: REF_CLIP_WIDGETS,
            }}
          />
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-1.5 text-[11px]">
          {/* Asset id is available from the properties menu — show only the
              description here when there is one. */}
          {model.description && (
            <span className="truncate font-medium" title={model.description}>
              {model.description}
            </span>
          )}
          {/* Weak/off-group warning — on the card this is conveyed by the
              colored fit badge + amber border, so only surface the labelled chip
              in spectrum-only view where there's no card. */}
          {!showVideo && badge && (
            <span
              title={`Leave-one-out match to the rest of ${voiceTag} — below the weak-match band, so this clip may not belong in this group`}
              className={`shrink-0 rounded border px-1 text-[9px] font-medium leading-tight ${badge.className}`}
            >
              {badge.label}
            </span>
          )}
          {/* Remove rides on the card as a top-right badge when it's shown;
              fall back to a body button in spectrum-only view. */}
          {!showVideo && (
            <button
              type="button"
              onClick={onRemove}
              disabled={busy}
              title={`Remove ${voiceTag} from this clip`}
              className="ml-auto shrink-0 rounded border border-red-500/40 px-1.5 text-[10px] text-red-600 hover:bg-red-500/10 disabled:opacity-50"
            >
              {busy ? '…' : '× ref'}
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {/* fit/dyn/dur ride on the card as overlay badges when it's shown; fall
              back to body chips in spectrum-only view where there's no card.
              (`match`/audio_ref_match is intentionally not shown — it's ≈1.0 for
              every reference because each self-matches the reference set.) */}
          {!showVideo && cohesion != null && (
            <MetaBadge
              icon="target"
              value={cohesion.toFixed(2)}
              title={`fit — leave-one-out match to the rest of ${voiceTag} (higher = fits the group)`}
            />
          )}
          {!showVideo && item.loudness_range_db != null && (
            <MetaBadge
              icon="activity"
              value={`${item.loudness_range_db.toFixed(1)}dB`}
              title="dyn — p95−p10 loudness (flat ≈ broken, lively ≈ real)"
            />
          )}
          {!showVideo && model.durationSec != null && (
            <MetaBadge icon="clock" value={`${model.durationSec.toFixed(1)}s`} title="duration" />
          )}
          {otherVoices.map((v) => (
            <MetaBadge
              key={v}
              icon="tag"
              value={voiceDisplay(v).label}
              title={`Also tagged ${v}`}
            />
          ))}
        </div>
        {showSpectrum && (
          <ChromaFingerprint
            chromaFp={item.chroma_fp}
            durationSec={model.durationSec ?? null}
            emptyHint="No fingerprint yet — run a reprobe."
            height={84}
            iconOnly
          />
        )}
      </div>
    </div>
  );
}

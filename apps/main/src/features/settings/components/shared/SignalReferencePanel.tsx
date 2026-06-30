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
import { useCallback, useEffect, useMemo, useState } from 'react';

import { getSignalReferences, type SignalReferenceItem } from '@lib/api/assets';
import { Icon } from '@lib/icons';

import { fromAssetResponse, type AssetModel } from '@features/assets';
import { ChromaFingerprint } from '@features/assets/components/ChromaFingerprint';
import { SIGNAL_REF_PRESETS, signalRefTags, setSignalRefTag } from '@features/assets/lib/signalRefTag';

import { MediaThumbnail } from '@/components/media-preview';

import { extractErrorMessage } from './maintenanceShared';

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

export function SignalReferencePanel() {
  const [rows, setRows] = useState<RefRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

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
      .map(([tag, list]) => ({ tag, ...voiceDisplay(tag), rows: list }));
  }, [rows]);

  const total = rows?.length ?? 0;

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
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="shrink-0 rounded border border-border px-2 py-1 text-[11px] disabled:opacity-50"
        >
          Refresh
        </button>
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
        <div className="space-y-4">
          {groups.map((g) => (
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
                    busy={busyId === row.model.id}
                    onRemove={() => void removeVoice(row.model, g.tag)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ReferenceCard({
  row,
  voiceTag,
  busy,
  onRemove,
}: {
  row: RefRow;
  voiceTag: string;
  busy: boolean;
  onRemove: () => void;
}) {
  const { item, model, voices } = row;
  const otherVoices = voices.filter((v) => v !== voiceTag);
  return (
    <div className="flex gap-2 rounded-md border border-border/60 bg-muted/10 p-2">
      <MediaThumbnail
        assetId={model.id}
        asset={model}
        className="h-16 w-16 shrink-0 rounded object-cover"
      />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="truncate font-medium" title={model.description ?? `Asset ${model.id}`}>
            #{model.id}
            {model.description ? ` · ${model.description}` : ''}
          </span>
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            title={`Remove ${voiceTag} from this clip`}
            className="ml-auto shrink-0 rounded border border-red-500/40 px-1.5 text-[10px] text-red-600 hover:bg-red-500/10 disabled:opacity-50"
          >
            {busy ? '…' : '× ref'}
          </button>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
          {item.audio_ref_match != null && (
            <span title="This clip's own best match to the references">
              match <span className="font-mono">{item.audio_ref_match.toFixed(2)}</span>
            </span>
          )}
          {item.loudness_range_db != null && (
            <span title="p95−p10 loudness (flat ≈ broken, lively ≈ real)">
              dyn <span className="font-mono">{item.loudness_range_db.toFixed(1)}dB</span>
            </span>
          )}
          {model.durationSec != null && (
            <span>
              <span className="font-mono">{model.durationSec.toFixed(1)}s</span>
            </span>
          )}
          {otherVoices.map((v) => (
            <span key={v} className="inline-flex items-center gap-0.5" title={`Also tagged ${v}`}>
              <Icon name="tag" size={9} />
              {voiceDisplay(v).label}
            </span>
          ))}
        </div>
        <ChromaFingerprint
          chromaFp={item.chroma_fp}
          durationSec={model.durationSec ?? null}
          emptyHint="No fingerprint yet — run a reprobe."
          height={84}
        />
      </div>
    </div>
  );
}

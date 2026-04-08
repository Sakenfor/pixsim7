import { Badge, Button, FormField, LoadingSpinner } from '@pixsim7/shared.ui';
import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';


import {
  resolveTemplate,
  type ResolvedFieldEntry,
  type ResolveTemplateResponse,
} from '@lib/api/characters';

// ===== Types =====

export interface TemplateResolverContext {
  character_id: string;
}

export interface TemplateResolverProps {
  context: TemplateResolverContext;
  templateSource?: string;
  onSave?: (prose: string) => void;
  /** Current render_instructions value (for edit buffer) */
  initialProse?: string;
  /** Read-only preview mode (no save) */
  readOnly?: boolean;
}

// ===== Source badge colors =====

const SOURCE_COLORS: Record<string, 'blue' | 'green' | 'gray' | 'purple'> = {
  visual_trait: 'blue',
  species_anatomy: 'green',
  species_default: 'gray',
};

const SOURCE_HIGHLIGHT_BG: Record<string, string> = {
  visual_trait: 'bg-blue-800/40',
  species_anatomy: 'bg-green-800/40',
  species_default: 'bg-neutral-700/40',
};

function sourceBadgeLabel(source: string | null): string {
  if (!source) return 'empty';
  return source.replace(/_/g, ' ');
}

// ===== Segment builder =====

interface TextSegment {
  text: string;
  key?: string;
  source?: string | null;
}

/**
 * Build segments from expanded text by locating each field value.
 * Produces a gap-filled array covering the full text.
 */
function buildHighlightSegments(
  text: string,
  fieldMap: ResolvedFieldEntry[],
): TextSegment[] {
  if (!text || !fieldMap.length) return [{ text }];

  // Find each field value's position in the text
  const ranges: Array<{ start: number; end: number; key: string; source: string | null }> = [];
  let searchFrom = 0;

  for (const field of fieldMap) {
    if (!field.value) continue;
    const idx = text.indexOf(field.value, searchFrom);
    if (idx === -1) continue;
    ranges.push({ start: idx, end: idx + field.value.length, key: field.key, source: field.source });
    searchFrom = idx + field.value.length;
  }

  if (!ranges.length) return [{ text }];

  // Build gap-filled segments
  const segments: TextSegment[] = [];
  let pos = 0;
  for (const range of ranges) {
    if (range.start > pos) {
      segments.push({ text: text.slice(pos, range.start) });
    }
    segments.push({
      text: text.slice(range.start, range.end),
      key: range.key,
      source: range.source,
    });
    pos = range.end;
  }
  if (pos < text.length) {
    segments.push({ text: text.slice(pos) });
  }
  return segments;
}

// ===== Component =====

export function TemplateResolver({
  context,
  templateSource,
  onSave,
  initialProse,
  readOnly = false,
}: TemplateResolverProps) {
  const [resolved, setResolved] = useState<ResolveTemplateResponse | null>(null);
  const [editedProse, setEditedProse] = useState(initialProse ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Build highlight segments for the expansion preview
  const expansionSegments = useMemo(
    () => resolved ? buildHighlightSegments(resolved.expanded_text, resolved.field_map) : [],
    [resolved],
  );

  // Sync initial prose from parent
  useEffect(() => {
    if (initialProse != null && !dirty) {
      setEditedProse(initialProse);
    }
  }, [initialProse, dirty]);

  // Resolve on mount and when context/template changes (debounced)
  const doResolve = useCallback(async () => {
    if (!context.character_id) return;

    setLoading(true);
    setError(null);
    try {
      const result = await resolveTemplate({
        character_id: context.character_id,
        template_source: templateSource,
      });
      setResolved(result);
      // Only populate prose from resolution if user hasn't edited yet
      if (!dirty && !initialProse) {
        setEditedProse(result.expanded_text);
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [context.character_id, templateSource, dirty, initialProse]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(doResolve, 300);
    return () => clearTimeout(debounceRef.current);
  }, [doResolve]);

  const handleProseChange = (value: string) => {
    setEditedProse(value);
    setDirty(true);
  };

  const handleSave = () => {
    onSave?.(editedProse);
    setDirty(false);
  };

  const handleResetToResolved = () => {
    if (resolved) {
      setEditedProse(resolved.expanded_text);
      setDirty(true);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      {/* Template source (read-only, collapsible) */}
      {resolved?.template_source && (
        <details className="group">
          <summary className="cursor-pointer text-[11px] font-medium text-neutral-500 hover:text-neutral-400 select-none">
            Template Source
          </summary>
          <div className="mt-1 rounded-md border border-neutral-700/50 bg-neutral-900/50 px-2.5 py-1.5 font-mono text-[11px] text-neutral-400 select-text">
            {resolved.template_source}
          </div>
        </details>
      )}

      {/* Field map — compact inline badges */}
      {resolved?.field_map && resolved.field_map.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-medium text-neutral-500">Field Sources</div>
          <div className="flex flex-wrap gap-1">
            {resolved.field_map.map((field: ResolvedFieldEntry) => (
              <span
                key={field.key}
                className={clsx(
                  'inline-flex cursor-default items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] transition-colors',
                  hoveredKey === field.key
                    ? 'bg-neutral-700 ring-1 ring-neutral-500'
                    : 'bg-neutral-800/80',
                )}
                title={field.value ?? '(empty)'}
                onMouseEnter={() => setHoveredKey(field.key)}
                onMouseLeave={() => setHoveredKey(null)}
              >
                <span className="text-neutral-300">{field.key}</span>
                <Badge
                  color={SOURCE_COLORS[field.source ?? ''] ?? 'gray'}
                >
                  {sourceBadgeLabel(field.source)}
                </Badge>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Loading / error */}
      {loading && (
        <div className="flex items-center gap-2 text-[11px] text-neutral-500">
          <LoadingSpinner size={12} />
          Resolving...
        </div>
      )}
      {error && (
        <div className="rounded-md border border-red-800/50 bg-red-950/30 px-2.5 py-1.5 text-[11px] text-red-400">
          {error}
        </div>
      )}

      {/* Expanded prose preview with hover highlights */}
      {resolved && (
        <details open className="group">
          <summary className="cursor-pointer text-[11px] font-medium text-neutral-500 hover:text-neutral-400 select-none">
            Expansion Preview
          </summary>
          <div className="mt-1 max-h-32 overflow-y-auto rounded-md border border-neutral-700/50 bg-neutral-900/50 px-2.5 py-1.5 text-xs leading-relaxed text-neutral-300 select-text">
            {expansionSegments.length > 0 ? (
              expansionSegments.map((seg, i) =>
                seg.key ? (
                  <span
                    key={i}
                    className={clsx(
                      'rounded-sm transition-colors',
                      hoveredKey === seg.key
                        ? clsx(SOURCE_HIGHLIGHT_BG[seg.source ?? ''] ?? 'bg-neutral-700/40', 'text-neutral-100')
                        : 'hover:bg-neutral-800/50',
                    )}
                    onMouseEnter={() => setHoveredKey(seg.key!)}
                    onMouseLeave={() => setHoveredKey(null)}
                  >
                    {seg.text}
                  </span>
                ) : (
                  <span key={i} className="text-neutral-500">{seg.text}</span>
                ),
              )
            ) : (
              <span className="text-neutral-500 italic">No expansion</span>
            )}
          </div>
        </details>
      )}

      {/* Editable prose */}
      {!readOnly && (
        <FormField label="Render Instructions">
          <textarea
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-500 focus:border-blue-500 focus:outline-none"
            rows={5}
            value={editedProse}
            onChange={(e) => handleProseChange(e.target.value)}
            placeholder="Edit the resolved prose, or write custom render instructions..."
          />
          <div className="flex items-center gap-2 mt-1.5">
            {resolved && (
              <Button
                variant="ghost"
                size="xs"
                onClick={handleResetToResolved}
                title="Replace with auto-resolved text from template"
              >
                Reset to resolved
              </Button>
            )}
            {onSave && (
              <Button
                variant="primary"
                size="xs"
                onClick={handleSave}
                disabled={!dirty}
              >
                Save
              </Button>
            )}
            {dirty && (
              <span className="text-xs text-amber-500">Unsaved changes</span>
            )}
          </div>
        </FormField>
      )}
    </div>
  );
}

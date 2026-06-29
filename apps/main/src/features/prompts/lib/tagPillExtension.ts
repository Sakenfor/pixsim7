import { type Extension, RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';

/**
 * Tag pill decoration — renders bracketed key:value tags like
 * `[primitive_tags: foo, bar]` as compact inline pills.
 *
 * Behavior:
 *  - Pill is shown when the cursor/selection is OUTSIDE the bracket range.
 *  - When the cursor enters (or click toggles), the underlying text shows
 *    and is fully editable.
 *  - Document text is unchanged — this is purely a view-level transform.
 *
 * Pattern matched: `[<key>: <values>]` where <key> is lowercase + underscores.
 * Examples:  [primitive_tags: a, b]   [camera: wide]   [aesthetic: noir]
 */

interface TagRange {
  from: number;
  to: number;
  key: string;
  values: string;
}

const TAG_RE = /\[([a-z_][a-z0-9_]*):\s*([^\]]*)\]/g;

function findTagRanges(docText: string): TagRange[] {
  const out: TagRange[] = [];
  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(docText)) !== null) {
    out.push({
      from: m.index,
      to: m.index + m[0].length,
      key: m[1],
      values: m[2].trim(),
    });
  }
  return out;
}

class TagPillWidget extends WidgetType {
  constructor(readonly key: string, readonly values: string) {
    super();
  }

  eq(other: TagPillWidget): boolean {
    return other.key === this.key && other.values === this.values;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('span');
    wrap.className = 'cm-tag-pill';
    wrap.setAttribute('data-tag-key', this.key);
    wrap.style.cssText = [
      'display: inline-flex',
      'align-items: center',
      'gap: 4px',
      'padding: 0 6px',
      'margin: 0 1px',
      'border-radius: 10px',
      'border: 1px solid rgba(168, 85, 247, 0.35)',
      'background: rgba(168, 85, 247, 0.10)',
      'color: rgb(126, 34, 206)',
      'font-size: 0.85em',
      'line-height: 1.5',
      'cursor: text',
      'vertical-align: baseline',
      'white-space: nowrap',
      'max-width: 280px',
      'overflow: hidden',
      'text-overflow: ellipsis',
    ].join(';');

    const keySpan = document.createElement('span');
    keySpan.style.cssText = 'font-family: ui-monospace, monospace; opacity: 0.85; font-size: 0.92em;';
    keySpan.textContent = this.key;

    const sep = document.createElement('span');
    sep.style.cssText = 'opacity: 0.45;';
    sep.textContent = ':';

    const valSpan = document.createElement('span');
    valSpan.style.cssText = 'overflow: hidden; text-overflow: ellipsis;';
    valSpan.textContent = this.values || '—';

    wrap.appendChild(keySpan);
    wrap.appendChild(sep);
    wrap.appendChild(valSpan);

    wrap.title = `[${this.key}: ${this.values}] — click to edit`;

    // Click positions the cursor inside the bracket so the auto-expand
    // logic reveals editable text.
    wrap.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const pos = view.posAtDOM(wrap);
      // pos is the start of the replaced range; jump to inside the brackets
      // (just after the colon-space) so the user can edit values directly.
      const insideOffset = this.key.length + 2; // `[` + key + `:`
      view.dispatch({
        selection: { anchor: pos + insideOffset + 1, head: pos + insideOffset + 1 },
      });
      view.focus();
    });

    return wrap;
  }

  ignoreEvent(): boolean {
    return false; // let mousedown reach our handler
  }
}

function buildPillDecorations(
  docText: string,
  selection: { from: number; to: number },
): DecorationSet {
  const ranges = findTagRanges(docText);
  if (ranges.length === 0) return Decoration.none;

  const builder = new RangeSetBuilder<Decoration>();
  for (const r of ranges) {
    // Skip pill rendering when the selection overlaps the range — this is the
    // "auto-expand while editing" behavior. Adjacent (touching) selection
    // counts as outside, so the cursor can sit at either edge of the pill.
    const overlaps = selection.from < r.to && selection.to > r.from;
    if (overlaps) continue;

    builder.add(
      r.from,
      r.to,
      Decoration.replace({
        widget: new TagPillWidget(r.key, r.values),
        inclusive: false,
      }),
    );
  }
  return builder.finish();
}

const tagPillPlugin = ViewPlugin.define(
  (view) => {
    let decorations = buildPillDecorations(view.state.doc.toString(), {
      from: view.state.selection.main.from,
      to: view.state.selection.main.to,
    });

    return {
      get decorations() {
        return decorations;
      },
      update(update: ViewUpdate) {
        if (!update.docChanged && !update.selectionSet) return;
        const docText = update.state.doc.toString();
        // Fast path: regex can't match without `[`. For long prompts that
        // contain no bracketed tags, this skips an O(N) regex per keystroke
        // — the dominant CM-side cost when typing. `String#includes` is a
        // tight scan and exits on the first match.
        if (!docText.includes('[')) {
          if (decorations !== Decoration.none) decorations = Decoration.none;
          return;
        }
        decorations = buildPillDecorations(docText, {
          from: update.state.selection.main.from,
          to: update.state.selection.main.to,
        });
      },
    };
  },
  {
    decorations: (plugin) => plugin.decorations,
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => view.plugin(plugin)?.decorations ?? Decoration.none),
  },
);

export function tagPillExtension(): Extension {
  return [tagPillPlugin];
}

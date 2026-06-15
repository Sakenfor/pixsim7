/**
 * extractInlineVarValues — frontend mirror of the backend inline_values.py.
 *
 * Pulls inline `NAME(value)` bindings out of a prompt (tokenizer-gated, chain
 * context only) and collapses `NAME(value)` -> `NAME`, so the resolved preview
 * matches the outbound generation path. Inline values win over stored values
 * (merge inline last). The backend is authoritative; keep the two in sync.
 */
import { tokenize } from '@pixsim7/core.prompt';

import { splitVarCall } from './promptVariableName';

export interface InlineExtraction {
  /** NAME -> inline value (first occurrence wins). */
  values: Record<string, string>;
  /** Prompt with every `NAME(value)` reduced to `NAME`. */
  collapsed: string;
}

export function extractInlineVarValues(text: string): InlineExtraction {
  if (!text || !text.includes('(')) return { values: {}, collapsed: text };

  const values: Record<string, string> = {};
  const spans: Array<[number, number]> = []; // (removeStart, removeEnd) for the `(value)` suffix

  for (const line of tokenize(text).lines) {
    if (line.kind !== 'chain' || !line.elements) continue;
    for (const el of line.elements) {
      if (el.kind !== 'var') continue;
      const { name, value, nameLen } = splitVarCall(el.text);
      if (value === null) continue;
      const up = name.trim().toUpperCase();
      if (up && !(up in values)) values[up] = value;
      spans.push([el.start + nameLen, el.end]);
    }
  }

  if (spans.length === 0) return { values, collapsed: text };

  let out = text;
  for (const [start, end] of spans.sort((a, b) => b[0] - a[0])) {
    out = out.slice(0, start) + out.slice(end);
  }
  return { values, collapsed: out };
}

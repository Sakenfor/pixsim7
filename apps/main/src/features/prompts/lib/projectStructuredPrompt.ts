/**
 * projectStructuredPrompt — frontend mirror of the backend projection.py (B1).
 *
 * Compiles chain lines into prose using the relation recipes' `template`
 * fragments, so the composer's resolved preview can show what generation will
 * send. The backend is authoritative on the outbound path; keep the two in sync.
 *
 * Pipeline position (preview): inline-collapse -> project -> resolve.
 */
import { tokenize, type PromptTokenLine, type PromptTokenChainElement } from '@pixsim7/core.prompt';

import type { RelationRecipe } from '../hooks/useRelationRecipes';

function relationKind(kind: string | undefined): 'var' | 'prose' {
  return kind === 'var' ? 'var' : 'prose'; // value/prose relate like a body
}

function elemText(el: PromptTokenChainElement): string {
  const t = (el.text || '').trim();
  if (el.kind === 'value' && t.startsWith('(') && t.endsWith(')')) return t.slice(1, -1).trim();
  return t;
}

/** Arrowhead char of a (compound) operator run: `==>`->`>`, `<==`->`<`. */
function opChar(op: string): string {
  if (op.includes('>')) return '>';
  if (op.includes('<')) return '<';
  if (op.includes('=')) return '=';
  if (op.includes(':')) return ':';
  return op.slice(-1) || '';
}

function findTemplate(
  recipes: RelationRecipe[],
  prevKind: string,
  nextKind: string,
  opText: string,
): string | null {
  const head = opChar(opText);
  const matchers = [(o: { op: string }) => o.op === opText, (o: { op: string }) => o.op === head];
  for (const r of recipes) {
    const c = r.context || {};
    if (c.line_kind !== 'chain') continue;
    if (c.prev_kind !== prevKind || c.next_kind !== nextKind) continue;
    if (c.lhs_kind || c.rhs_kind) continue; // typed tier skipped in the structural fold
    for (const matcher of matchers) {
      for (const o of r.operators || []) {
        if (matcher(o) && o.template) return o.template;
      }
    }
  }
  return null;
}

function projectChain(line: PromptTokenLine, recipes: RelationRecipe[]): string | null {
  const els = line.elements || [];
  const ops = line.operators || [];
  if (ops.length === 0 || els.length !== ops.length + 1) return null;
  let acc = elemText(els[0]);
  let accKind = relationKind(els[0].kind);
  for (let i = 0; i < ops.length; i++) {
    const rhsEl = els[i + 1];
    const rhs = elemText(rhsEl);
    const tmpl = findTemplate(recipes, accKind, relationKind(rhsEl.kind), ops[i].op || '');
    acc = tmpl
      ? tmpl.replaceAll('{lhs}', acc).replaceAll('{rhs}', rhs)
      : `${acc} ${ops[i].op || ''} ${rhs}`.trim();
    accKind = 'prose';
  }
  return acc;
}

/** Compile chain lines in `text` to prose; non-chain lines pass through. */
export function projectStructuredPrompt(text: string, recipes: RelationRecipe[]): string {
  if (!text || !recipes || recipes.length === 0) return text;
  const spans: Array<[number, number, string]> = [];
  for (const line of tokenize(text).lines) {
    if (line.kind !== 'chain') continue;
    const prose = projectChain(line, recipes);
    if (prose != null) spans.push([line.start, line.end, prose]);
  }
  if (spans.length === 0) return text;
  let out = text;
  for (const [start, end, prose] of spans.sort((a, b) => b[0] - a[0])) {
    out = out.slice(0, start) + prose + out.slice(end);
  }
  return out;
}

/**
 * Prompt tokenizer — chain-aware line tokenizer (TS port of the backend).
 *
 * This is the structure-layer source of truth for the FRONTEND: it reproduces,
 * byte-for-byte (offsets included), the `tokens.lines` payload that the Python
 * `tokenizer.py` returns through `/prompts/analyze`. Porting it to TS lets the
 * prompt mini-language STRUCTURE layer (variables + operators + facets +
 * click-to-edit) run free, instant, and offline — independent of the heavy
 * role-ANALYSIS layer that the analyze endpoint also carries.
 *
 * PARITY CONTRACT (critical): the `tokenize()` output here MUST match
 * `pixsim7/backend/main/services/prompt/parser/tokenizer.py` exactly. Both are
 * driven by the shared, CUE-generated `grammar_rules.json`; a drift-guard parity
 * corpus (Python vs TS) keeps them from desyncing. Decorations in
 * operatorEditExtension / variableTokenExtension consume this shape unchanged,
 * so any offset divergence mis-positions marks.
 *
 * Difference from `./grammar.ts`: that module is header-only (it recognises
 * `assignment` / `assignment_arrow` headers and stops there, feeding
 * `sections.ts`). THIS module mirrors the backend: `LABEL = body` parses as a
 * CHAIN, and there is no `assignment` header form. They are intentionally
 * separate grammars. The lexer is identical, so we reuse `lex` from `./grammar`.
 */
import { lex, type Token } from './grammar';
import GRAMMAR_RULES from './grammar_rules.json';

// ── output shape (mirrors tokenizer.py `_node_to_dict`) ────────────────────

/** One element in a chain line. `var` iff exactly one UPPER_IDENT after WS-trim. */
export interface PromptTokenChainElement {
  kind: 'var' | 'prose';
  /** Element text after WS-trim; empty string when this slot is empty. */
  text: string;
  start: number;
  end: number;
}

/** One operator run between two chain elements. */
export interface PromptTokenChainOperator {
  /** Raw operator text, e.g. `===>`, `<`, `=`, `:`. */
  op: string;
  /** Total operator length in characters (== op_end - op_start). */
  run: number;
  op_start: number;
  op_end: number;
}

/**
 * Token-level line node. Three kinds:
 *   - header: line-terminal section header (colon | angle_bracket | freestanding)
 *   - chain:  var|prose elements separated by operator runs
 *             (invariant: elements.length === operators.length + 1)
 *   - prose:  free-form text (no recognised structure)
 *
 * Field names are snake_case to match the backend JSON byte-for-byte.
 */
export interface PromptTokenLine {
  kind: 'header' | 'chain' | 'prose';
  // header fields
  pattern?: string;
  label?: string;
  body_start?: number;
  /** Header op char range — colon `:` only; absent for angle_bracket / freestanding. */
  op_start?: number;
  op_end?: number;
  // chain fields
  elements?: PromptTokenChainElement[];
  operators?: PromptTokenChainOperator[];
  // shared
  start: number;
  end: number;
  text?: string; // prose only
}

export interface TokenizeResult {
  lines: PromptTokenLine[];
}

// ── grammar rules (CUE-generated; shared with the Python parser) ───────────

interface HeaderPatternDef {
  id: string;
  label_min: number;
  label_max: number;
}

const HEADER_PATTERNS: Record<string, HeaderPatternDef> = Object.fromEntries(
  GRAMMAR_RULES.header_patterns.map((p) => [p.id, p as unknown as HeaderPatternDef]),
);

const CHAIN_OP_CHARS = new Set<string>(GRAMMAR_RULES.chain.op_chars);
const CHAIN_OP_EXCLUDES = new Set<string>(GRAMMAR_RULES.chain.op_excludes);

const pat = (id: string): HeaderPatternDef => HEADER_PATTERNS[id];

// ── char helpers ──────────────────────────────────────────────────────────

const isUpper = (c: string) => c >= 'A' && c <= 'Z';
const isDigit = (c: string) => c >= '0' && c <= '9';

/** True if an all-uppercase identifier (digits/underscore allowed after head). */
function isUpperIdent(text: string): boolean {
  if (!text || !isUpper(text[0])) return false;
  for (let i = 1; i < text.length; i++) {
    const c = text[i];
    if (!(isUpper(c) || isDigit(c) || c === '_')) return false;
  }
  return true;
}

/** True if no lowercase letters are present. */
function isAllUpper(label: string): boolean {
  for (const c of label) {
    if (c >= 'a' && c <= 'z') return false;
  }
  return true;
}

// ── line splitting ─────────────────────────────────────────────────────────

interface LineSlice {
  /** Token indices [from, to) for this line, EXCLUDING the trailing NEWLINE/STMT_SEP. */
  from: number;
  to: number;
  /** Source-character span of the line content (no trailing separator). */
  start: number;
  end: number;
  /** Source-character index of the start of the next line (after the separator). */
  next: number;
}

function splitLines(tokens: Token[], source: string): LineSlice[] {
  const lines: LineSlice[] = [];
  let from = 0;
  let lineStart = 0;

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.kind === 'NEWLINE' || tok.kind === 'STMT_SEP') {
      lines.push({ from, to: i, start: lineStart, end: tok.start, next: tok.end });
      from = i + 1;
      lineStart = tok.end;
    }
  }
  // Trailing line (no final separator, or chars after the last one).
  if (from <= tokens.length - 1 || lineStart < source.length) {
    lines.push({ from, to: tokens.length, start: lineStart, end: source.length, next: source.length });
  }
  return lines;
}

// ── span/label helpers ──────────────────────────────────────────────────────

function trimWS(tokens: Token[], from: number, to: number): [number, number] {
  let f = from;
  let t = to;
  while (f < t && tokens[f].kind === 'WS') f++;
  while (t > f && tokens[t - 1].kind === 'WS') t--;
  return [f, t];
}

/**
 * Join IDENT / NUMBER / WS / TEXT(-&/) tokens into a label string.
 * Returns null if any token is incompatible or the head is not an uppercase IDENT.
 */
function tryAssembleMixedLabel(tokens: Token[], from: number, to: number): string | null {
  if (from >= to) return null;
  const first = tokens[from];
  if (first.kind !== 'IDENT' || !isUpper(first.text[0])) return null;

  let label = '';
  let prevWasWS = false;
  for (let i = from; i < to; i++) {
    const t = tokens[i];
    if (t.kind === 'IDENT' || t.kind === 'NUMBER') {
      label += t.text;
      prevWasWS = false;
    } else if (t.kind === 'WS') {
      if (!prevWasWS) label += ' ';
      prevWasWS = true;
    } else if (t.kind === 'TEXT' && (t.text === '-' || t.text === '&' || t.text === '/')) {
      label += t.text;
      prevWasWS = false;
    } else {
      return null;
    }
  }
  return label.trim();
}

// ── chain parsing ───────────────────────────────────────────────────────────

/** Operator tokens recognised by the chain parser (data-driven by grammar_rules.json). */
function isChainOpToken(tok: Token): boolean {
  if (tok.kind === 'RUN' && tok.run && CHAIN_OP_CHARS.has(tok.run.char) && !CHAIN_OP_EXCLUDES.has(tok.run.char)) {
    return true;
  }
  if (tok.kind === 'COLON' && CHAIN_OP_CHARS.has(':')) return true;
  return false;
}

/**
 * Parse [i, end) as a chain of var|prose elements separated by operator runs.
 * Returns null when no operator tokens appear (caller falls through to prose).
 */
function tryChain(line: LineSlice, tokens: Token[], i: number, end: number): PromptTokenLine | null {
  const opTokenSpans: Array<[number, number]> = [];
  let k = i;
  while (k < end) {
    if (isChainOpToken(tokens[k])) {
      const opFrom = k;
      while (k < end && isChainOpToken(tokens[k])) k++;
      opTokenSpans.push([opFrom, k]);
    } else {
      k++;
    }
  }

  if (opTokenSpans.length === 0) return null;

  // Element token-ranges between operators (one more than operators).
  const elemTokenSpans: Array<[number, number]> = [];
  elemTokenSpans.push([i, opTokenSpans[0][0]]);
  for (let j = 0; j < opTokenSpans.length - 1; j++) {
    elemTokenSpans.push([opTokenSpans[j][1], opTokenSpans[j + 1][0]]);
  }
  elemTokenSpans.push([opTokenSpans[opTokenSpans.length - 1][1], end]);

  const elements: PromptTokenChainElement[] = [];
  for (let j = 0; j < elemTokenSpans.length; j++) {
    const [tokFrom, tokTo] = elemTokenSpans[j];
    const [f, t] = trimWS(tokens, tokFrom, tokTo);
    if (f >= t) {
      // Empty element — anchor to the surrounding operator boundary.
      const anchor =
        j === 0
          ? tokens[opTokenSpans[0][0]].start
          : tokens[opTokenSpans[j - 1][1] - 1].end;
      elements.push({ kind: 'prose', text: '', start: anchor, end: anchor });
      continue;
    }

    let elemText = '';
    for (let x = f; x < t; x++) elemText += tokens[x].text;
    const elemStart = tokens[f].start;
    const elemEnd = tokens[t - 1].end;
    const kind: 'var' | 'prose' =
      t - f === 1 && tokens[f].kind === 'IDENT' && isUpperIdent(tokens[f].text) ? 'var' : 'prose';
    elements.push({ kind, text: elemText, start: elemStart, end: elemEnd });
  }

  const operators: PromptTokenChainOperator[] = [];
  for (const [opFrom, opTo] of opTokenSpans) {
    let opText = '';
    for (let x = opFrom; x < opTo; x++) opText += tokens[x].text;
    const opCharStart = tokens[opFrom].start;
    const opCharEnd = tokens[opTo - 1].end;
    operators.push({ op: opText, run: opCharEnd - opCharStart, op_start: opCharStart, op_end: opCharEnd });
  }

  return { kind: 'chain', elements, operators, start: line.start, end: line.end };
}

// ── line parsing ────────────────────────────────────────────────────────────

function parseLine(line: LineSlice, tokens: Token[]): PromptTokenLine {
  let i = line.from;
  while (i < line.to && tokens[i].kind === 'WS') i++;
  let end = line.to;
  while (end > i && tokens[end - 1].kind === 'WS') end--;

  let rawText = '';
  for (let x = line.from; x < line.to; x++) rawText += tokens[x].text;
  const prose: PromptTokenLine = { kind: 'prose', text: rawText, start: line.start, end: line.end };

  if (i >= end) return prose;

  const first = tokens[i];

  // ── angle_bracket: > LABEL < (line-terminal) ─────────────────────────────
  if (first.kind === 'RUN' && first.run && first.run.char === '>' && first.run.n === 1) {
    const last = tokens[end - 1];
    if (last.kind === 'RUN' && last.run && last.run.char === '<' && last.run.n === 1 && end - 1 > i) {
      const [lf, lt] = trimWS(tokens, i + 1, end - 1);
      if (lt > lf) {
        const label = tryAssembleMixedLabel(tokens, lf, lt);
        const p = pat('angle_bracket');
        if (label && label.length >= p.label_min && isAllUpper(label)) {
          return { kind: 'header', pattern: 'angle_bracket', label, start: line.start, end: line.end, body_start: line.next };
        }
      }
    }
  }

  // ── colon: LABEL: (line-terminal) ────────────────────────────────────────
  if (first.kind === 'IDENT' && isUpper(first.text[0])) {
    const p = pat('colon');
    for (let k = i; k < end; k++) {
      if (tokens[k].kind === 'COLON') {
        let after = k + 1;
        while (after < end && tokens[after].kind === 'WS') after++;
        if (after === end) {
          const [lf, lt] = trimWS(tokens, i, k);
          const label = tryAssembleMixedLabel(tokens, lf, lt);
          if (label && label.length >= p.label_min && label.length <= p.label_max) {
            return {
              kind: 'header',
              pattern: 'colon',
              label,
              start: line.start,
              end: line.end,
              body_start: line.next,
              op_start: tokens[k].start,
              op_end: tokens[k].end,
            };
          }
        }
        break;
      }
    }
  }

  // ── freestanding: single UPPER_IDENT (line-terminal) ─────────────────────
  if (first.kind === 'IDENT' && isUpperIdent(first.text) && i + 1 === end) {
    const p = pat('freestanding');
    const label = first.text;
    if (label.length >= p.label_min && label.length <= p.label_max) {
      return { kind: 'header', pattern: 'freestanding', label, start: line.start, end: line.end, body_start: line.next };
    }
  }

  // ── chain: var|prose elements separated by operator runs ─────────────────
  const chain = tryChain(line, tokens, i, end);
  if (chain !== null) return chain;

  return prose;
}

// ── public API ──────────────────────────────────────────────────────────────

/**
 * Tokenise and line-parse `text` into the FE-consumed `{ lines }` shape.
 *
 * Output parity with `tokenizer.py` `tokenize()` is contractual — see the
 * module header. Never throws: unknown characters become TEXT tokens; lines
 * with no header shape and no operators become prose nodes.
 */
export function tokenize(text: string): TokenizeResult {
  const tokens = lex(text);
  const lines = splitLines(tokens, text).map((sl) => parseLine(sl, tokens));
  return { lines };
}

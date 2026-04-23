/**
 * Prompt grammar — line-level tokenizer and parser.
 *
 * Replaces the regex-based section detector. The lexer scans left-to-right
 * and emits typed tokens; the parser walks tokens per line and classifies
 * each line as either a known structural form or `prose`. Neither stage
 * fails: unknown characters become `TEXT` tokens, unrecognised lines become
 * `prose` nodes.
 *
 * The lexer preserves raw run lengths for `=`, `<`, `>`, `_` so downstream
 * recipes can interpret cardinality (timing, intensity, duration) without
 * the lexer baking in any semantics.
 */
import type { PatternId } from './sections';
import GRAMMAR_RULES from './grammar_rules.json';

// ── grammar rules loaded from CUE-generated JSON ─────────────────────────

type HeaderPatternDef = (typeof GRAMMAR_RULES.header_patterns)[number];

const _PAT: Record<string, HeaderPatternDef> = Object.fromEntries(
  GRAMMAR_RULES.header_patterns.map((p) => [p.id, p]),
);
const _RELATION_OP_CHARS = new Set<string>(GRAMMAR_RULES.relation.op_chars);

// ── tokens ────────────────────────────────────────────────────────────────

export type TokenKind =
  | 'IDENT'   // [A-Za-z][A-Za-z0-9_]*
  | 'NUMBER'  // [0-9]+
  | 'RUN'     // consecutive run of one of: = < > _
  | 'COLON'   // :
  | 'LPAREN'  // (
  | 'RPAREN'  // )
  | 'PLUS'    // +
  | 'WS'      // [ \t]+ (newlines are their own token)
  | 'NEWLINE' // \n  (also \r\n, \r)
  | 'TEXT';   // any other single character (fallback)

export type RunChar = '=' | '<' | '>' | '_';

export interface Token {
  kind: TokenKind;
  start: number;
  end: number;
  text: string;
  /** Only present on `RUN` tokens. */
  run?: { char: RunChar; n: number };
}

const isLetter = (c: string) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
const isUpper  = (c: string) => c >= 'A' && c <= 'Z';
const isDigit  = (c: string) => c >= '0' && c <= '9';
const isIdent  = (c: string) => isLetter(c) || isDigit(c) || c === '_';
const isRunCh  = (c: string): c is RunChar => c === '=' || c === '<' || c === '>' || c === '_';

export function lex(input: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const n = input.length;

  while (i < n) {
    const ch = input[i];

    // newlines: \n, \r\n, \r
    if (ch === '\n' || ch === '\r') {
      const start = i;
      if (ch === '\r' && input[i + 1] === '\n') i += 2;
      else i += 1;
      out.push({ kind: 'NEWLINE', start, end: i, text: input.slice(start, i) });
      continue;
    }

    // horizontal whitespace
    if (ch === ' ' || ch === '\t') {
      const start = i;
      while (i < n && (input[i] === ' ' || input[i] === '\t')) i++;
      out.push({ kind: 'WS', start, end: i, text: input.slice(start, i) });
      continue;
    }

    // run of =, <, >, _
    if (isRunCh(ch)) {
      const start = i;
      const c = ch;
      while (i < n && input[i] === c) i++;
      out.push({
        kind: 'RUN',
        start,
        end: i,
        text: input.slice(start, i),
        run: { char: c, n: i - start },
      });
      continue;
    }

    // identifier
    if (isLetter(ch)) {
      const start = i;
      i++;
      while (i < n && isIdent(input[i])) i++;
      out.push({ kind: 'IDENT', start, end: i, text: input.slice(start, i) });
      continue;
    }

    // number
    if (isDigit(ch)) {
      const start = i;
      while (i < n && isDigit(input[i])) i++;
      out.push({ kind: 'NUMBER', start, end: i, text: input.slice(start, i) });
      continue;
    }

    // single-char punctuation
    const start = i;
    i++;
    let kind: TokenKind = 'TEXT';
    if      (ch === ':') kind = 'COLON';
    else if (ch === '(') kind = 'LPAREN';
    else if (ch === ')') kind = 'RPAREN';
    else if (ch === '+') kind = 'PLUS';
    out.push({ kind, start, end: i, text: ch });
  }

  return out;
}

// ── line-level AST ────────────────────────────────────────────────────────

export interface HeaderLine {
  kind: 'header';
  /** PatternId classification (mirrors the legacy enum). */
  pattern: PatternId;
  label: string;
  /** Source range of the header itself, including label and separator. */
  start: number;
  end: number;
  /**
   * Where the body begins. For block-style headers (`colon`, `angle_bracket`,
   * `freestanding`) this is the start of the next line; for inline headers
   * (`assignment`, `assignment_arrow`) it's just past the operator.
   */
  bodyStart: number;
}

export interface ProseLine {
  kind: 'prose';
  start: number;
  end: number;
  text: string;
}

export type LineNode = HeaderLine | ProseLine;

interface LineSlice {
  /** Token indices [from, to) for this line, EXCLUDING the trailing NEWLINE. */
  from: number;
  to: number;
  /** Source-character span of the line content (no trailing NEWLINE). */
  start: number;
  end: number;
  /** Source-character index of the start of the next line (after the NEWLINE). */
  next: number;
}

function splitLines(tokens: Token[], source: string): LineSlice[] {
  const lines: LineSlice[] = [];
  let from = 0;
  let lineStart = 0;

  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].kind === 'NEWLINE') {
      lines.push({
        from,
        to: i,
        start: lineStart,
        end: tokens[i].start,
        next: tokens[i].end,
      });
      from = i + 1;
      lineStart = tokens[i].end;
    }
  }
  if (from <= tokens.length - 1 || lineStart < source.length) {
    lines.push({
      from,
      to: tokens.length,
      start: lineStart,
      end: source.length,
      next: source.length,
    });
  }
  return lines;
}

// Pattern constraints come from grammar_rules.json (CUE-generated).
const pat = (id: string): HeaderPatternDef => _PAT[id];

/** True if all-uppercase identifier (digits/underscore allowed). */
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

/**
 * Try to assemble a colon/angle-bracket label from a sequence of tokens.
 * Such labels start with an uppercase letter and may include letters,
 * digits, underscores, single spaces, and punctuation in the set `-`, `&`, `/`.
 *
 * Returns the joined label string, or `null` if any token is incompatible.
 */
function tryAssembleMixedLabel(
  tokens: Token[],
  from: number,
  to: number,
): string | null {
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
      continue;
    }
    if (t.kind === 'WS') {
      // Collapse runs of whitespace into a single space; never leading/trailing
      // (caller trims edges).
      if (!prevWasWS) label += ' ';
      prevWasWS = true;
      continue;
    }
    if (t.kind === 'TEXT' && (t.text === '-' || t.text === '&' || t.text === '/')) {
      label += t.text;
      prevWasWS = false;
      continue;
    }
    return null;
  }
  return label.trim();
}

function parseLine(line: LineSlice, tokens: Token[]): LineNode {
  // Skip leading whitespace.
  let i = line.from;
  while (i < line.to && tokens[i].kind === 'WS') i++;

  // Trim trailing whitespace from consideration.
  let end = line.to;
  while (end > i && tokens[end - 1].kind === 'WS') end--;

  const proseFallback = (): ProseLine => ({
    kind: 'prose',
    start: line.start,
    end: line.end,
    text: tokens.slice(line.from, line.to).map((t) => t.text).join(''),
  });

  if (i >= end) return proseFallback();

  const first = tokens[i];

  // ── angle_bracket: > LABEL <  (line-terminal) ─────────────────────────
  if (first.kind === 'RUN' && first.run!.char === '>' && first.run!.n === 1) {
    const last = tokens[end - 1];
    if (last.kind === 'RUN' && last.run!.char === '<' && last.run!.n === 1 && end - 1 > i) {
      const labelTokens = trimWS(tokens, i + 1, end - 1);
      if (labelTokens.to > labelTokens.from) {
        const label = tryAssembleMixedLabel(tokens, labelTokens.from, labelTokens.to);
        const p = pat('angle_bracket');
        if (label && label.length >= p.label_min && isAllUpper(label)) {
          return { kind: 'header', pattern: 'angle_bracket', label, start: line.start, end: line.end, bodyStart: line.next };
        }
      }
    }
  }

  if (first.kind !== 'IDENT' || !isUpper(first.text[0])) return proseFallback();

  // ── colon header: Label: (possibly multi-word, line-terminal) ─────────
  for (let k = i; k < end; k++) {
    if (tokens[k].kind === 'COLON') {
      let after = k + 1;
      while (after < end && tokens[after].kind === 'WS') after++;
      if (after === end) {
        const labelSpan = trimWS(tokens, i, k);
        const label = tryAssembleMixedLabel(tokens, labelSpan.from, labelSpan.to);
        const p = pat('colon');
        if (label && label.length >= p.label_min && label.length <= p.label_max) {
          return { kind: 'header', pattern: 'colon', label, start: line.start, end: line.end, bodyStart: line.next };
        }
      }
      break;
    }
  }

  if (!isUpperIdent(first.text)) return proseFallback();

  // ── assignment: LABEL = ... ───────────────────────────────────────────
  {
    let k = i + 1;
    if (k < end && tokens[k].kind === 'WS') k++;
    if (k < end && tokens[k].kind === 'RUN' && tokens[k].run!.char === '=') {
      const label = first.text;
      const p = pat('assignment');
      if (label.length >= p.label_min && label.length <= p.label_max) {
        let after = k + 1;
        while (after < end && tokens[after].kind === 'WS') after++;
        const bodyStart = after < end ? tokens[after].start : line.next;
        return { kind: 'header', pattern: 'assignment', label, start: line.start, end: line.end, bodyStart };
      }
    }
  }

  // ── assignment_arrow: LABEL > ...  (whitespace before > mandatory) ────
  {
    let k = i + 1;
    if (k < end && tokens[k].kind === 'WS') {
      k++;
      if (k < end && tokens[k].kind === 'RUN' && tokens[k].run!.char === '>') {
        const label = first.text;
        const p = pat('assignment_arrow');
        if (label.length >= p.label_min && label.length <= p.label_max) {
          let after = k + 1;
          while (after < end && tokens[after].kind === 'WS') after++;
          const bodyStart = after < end ? tokens[after].start : line.next;
          return { kind: 'header', pattern: 'assignment_arrow', label, start: line.start, end: line.end, bodyStart };
        }
      }
    }
  }

  // ── freestanding: LABEL  (line-terminal) ─────────────────────────────
  if (i + 1 === end) {
    const label = first.text;
    const p = pat('freestanding');
    if (label.length >= p.label_min && label.length <= p.label_max) {
      return { kind: 'header', pattern: 'freestanding', label, start: line.start, end: line.end, bodyStart: line.next };
    }
  }

  return proseFallback();
}

function trimWS(tokens: Token[], from: number, to: number): { from: number; to: number } {
  let f = from;
  let t = to;
  while (f < t && tokens[f].kind === 'WS') f++;
  while (t > f && tokens[t - 1].kind === 'WS') t--;
  return { from: f, to: t };
}

export function parseLines(tokens: Token[], source: string): LineNode[] {
  const lines = splitLines(tokens, source);
  return lines.map((line) => parseLine(line, tokens));
}

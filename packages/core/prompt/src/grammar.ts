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

// Length constraints inherited from the legacy regex set.
const COLON_MIN = 2,            COLON_MAX = 39;            // [A-Z][A-Za-z /&-]{1,38}
const ASSIGN_MIN = 2,           ASSIGN_MAX = 59;           // [A-Z][A-Z0-9_]{1,58}
const FREESTAND_MIN = 3,        FREESTAND_MAX = 41;        // [A-Z][A-Z0-9_]{2,40}
const ANGLE_MIN = 2,            ANGLE_MAX = Infinity;      // [A-Z][A-Z /&-]+

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
    // Last meaningful token must be RUN '<' n=1
    const last = tokens[end - 1];
    if (last.kind === 'RUN' && last.run!.char === '<' && last.run!.n === 1 && end - 1 > i) {
      const labelTokens = trimWS(tokens, i + 1, end - 1);
      if (labelTokens.to > labelTokens.from) {
        const label = tryAssembleMixedLabel(tokens, labelTokens.from, labelTokens.to);
        if (label && label.length >= ANGLE_MIN && isAllUpper(label)) {
          return {
            kind: 'header',
            pattern: 'angle_bracket',
            label,
            start: line.start,
            end: line.end,
            bodyStart: line.next,
          };
        }
      }
    }
  }

  // The remaining patterns all begin with an IDENT.
  if (first.kind !== 'IDENT' || !isUpper(first.text[0])) return proseFallback();

  // ── colon header: Label: (possibly multi-word, line-terminal) ─────────
  // Find a COLON; everything before is label, everything after must be empty
  // (after trimming).
  for (let k = i; k < end; k++) {
    if (tokens[k].kind === 'COLON') {
      // Body of the line after the colon (excluding trailing WS) must be empty.
      let afterEnd = end;
      let after = k + 1;
      while (after < afterEnd && tokens[after].kind === 'WS') after++;
      if (after === afterEnd) {
        const labelSpan = trimWS(tokens, i, k);
        const label = tryAssembleMixedLabel(tokens, labelSpan.from, labelSpan.to);
        if (label && label.length >= COLON_MIN && label.length <= COLON_MAX) {
          return {
            kind: 'header',
            pattern: 'colon',
            label,
            start: line.start,
            end: line.end,
            bodyStart: line.next,
          };
        }
      }
      break; // Don't try other patterns past a colon — colon dominates.
    }
  }

  // For the remaining patterns, the label is a single IDENT (uppercase-only).
  if (!isUpperIdent(first.text)) return proseFallback();

  // ── assignment: LABEL = ... ───────────────────────────────────────────
  // After the IDENT, optional WS, then RUN '=' (any length). Body is rest of line.
  {
    let k = i + 1;
    if (k < end && tokens[k].kind === 'WS') k++;
    if (k < end && tokens[k].kind === 'RUN' && tokens[k].run!.char === '=') {
      const label = first.text;
      if (label.length >= ASSIGN_MIN && label.length <= ASSIGN_MAX) {
        // bodyStart: after the '=' run + any trailing whitespace on the same
        // line. If nothing remains on the line, skip to the next line so the
        // body picks up from where content actually begins.
        let after = k + 1;
        while (after < end && tokens[after].kind === 'WS') after++;
        const bodyStart = after < end ? tokens[after].start : line.next;
        return {
          kind: 'header',
          pattern: 'assignment',
          label,
          start: line.start,
          end: line.end,
          bodyStart,
        };
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
        if (label.length >= ASSIGN_MIN && label.length <= ASSIGN_MAX) {
          let after = k + 1;
          while (after < end && tokens[after].kind === 'WS') after++;
          const bodyStart = after < end ? tokens[after].start : line.next;
          return {
            kind: 'header',
            pattern: 'assignment_arrow',
            label,
            start: line.start,
            end: line.end,
            bodyStart,
          };
        }
      }
    }
  }

  // ── freestanding: LABEL  (line-terminal, length 3-41) ─────────────────
  if (i + 1 === end) {
    const label = first.text;
    if (label.length >= FREESTAND_MIN && label.length <= FREESTAND_MAX) {
      return {
        kind: 'header',
        pattern: 'freestanding',
        label,
        start: line.start,
        end: line.end,
        bodyStart: line.next,
      };
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

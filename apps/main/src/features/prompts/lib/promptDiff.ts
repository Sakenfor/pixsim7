/**
 * Lightweight sentence/clause-level diff for prompt text.
 *
 * Splits text by clause boundaries (commas, periods, newlines),
 * computes LCS to find added/removed/kept segments.
 * Falls back to word-level diff when both texts are a single clause.
 */

export interface DiffSegment {
  type: 'keep' | 'add' | 'remove';
  text: string;
}

export interface DiffSegmentWithRange extends DiffSegment {
  /** Offset in the "next" string where this segment starts (keep/add only). */
  from?: number;
  /** Offset in the "next" string where this segment ends (keep/add only). */
  to?: number;
}

interface TextToken {
  text: string;
  from: number;
  to: number;
}

interface IndexedDiffSegment extends DiffSegment {
  nextIndex?: number;
}

/**
 * Split prompt text into clause-level segments for diffing.
 * Splits on sentence-ending punctuation + space, commas + space, or newlines.
 * Keeps delimiters attached to the preceding segment.
 */
function splitClauses(text: string): string[] {
  return splitClausesWithRanges(text).map((token) => token.text);
}

function pushTrimmedToken(tokens: TextToken[], source: string, start: number, end: number): void {
  let from = start;
  let to = end;

  while (from < to && /\s/.test(source[from])) from += 1;
  while (to > from && /\s/.test(source[to - 1])) to -= 1;

  if (to > from) {
    tokens.push({
      text: source.slice(from, to),
      from,
      to,
    });
  }
}

/**
 * Clause splitter with stable offsets back to the original source text.
 * This mirrors `splitClauses()` behavior but retains exact token ranges.
 */
function splitClausesWithRanges(text: string): TextToken[] {
  if (!text.trim()) return [];

  const tokens: TextToken[] = [];
  const boundary = /(?<=[.!?,;])\s+|\n+/g;
  let chunkStart = 0;
  let match: RegExpExecArray | null;

  while ((match = boundary.exec(text)) !== null) {
    const chunkEnd = match.index;
    pushTrimmedToken(tokens, text, chunkStart, chunkEnd);
    chunkStart = match.index + match[0].length;
  }

  pushTrimmedToken(tokens, text, chunkStart, text.length);
  return tokens;
}

/** Word splitter with stable offsets back to the original source text. */
function splitWordsWithRanges(text: string): TextToken[] {
  const tokens: TextToken[] = [];
  const wordRegex = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = wordRegex.exec(text)) !== null) {
    tokens.push({
      text: match[0],
      from: match.index,
      to: match.index + match[0].length,
    });
  }
  return tokens;
}

/** LCS table for two string arrays */
function lcsTable(a: string[], b: string[]): number[][] {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array(b.length + 1).fill(0),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

/** Produce diff segments from two string arrays using LCS backtracking */
function diffArrays(prev: string[], next: string[]): DiffSegment[] {
  const dp = lcsTable(prev, next);
  const segments: DiffSegment[] = [];
  let i = prev.length;
  let j = next.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && prev[i - 1] === next[j - 1]) {
      segments.unshift({ type: 'keep', text: prev[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      segments.unshift({ type: 'add', text: next[j - 1] });
      j--;
    } else {
      segments.unshift({ type: 'remove', text: prev[i - 1] });
      i--;
    }
  }

  return segments;
}

/** Same LCS backtracking as `diffArrays`, but keeps the matched next-token index. */
function diffTokenArrays(prev: TextToken[], next: TextToken[]): IndexedDiffSegment[] {
  const prevText = prev.map((token) => token.text);
  const nextText = next.map((token) => token.text);
  const dp = lcsTable(prevText, nextText);
  const segments: IndexedDiffSegment[] = [];
  let i = prevText.length;
  let j = nextText.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && prevText[i - 1] === nextText[j - 1]) {
      segments.unshift({ type: 'keep', text: nextText[j - 1], nextIndex: j - 1 });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      segments.unshift({ type: 'add', text: nextText[j - 1], nextIndex: j - 1 });
      j--;
    } else {
      segments.unshift({ type: 'remove', text: prevText[i - 1] });
      i--;
    }
  }

  return segments;
}

/**
 * Compute a diff between two prompt texts.
 *
 * Returns an array of segments marked as 'keep', 'add', or 'remove'.
 * Uses clause-level splitting; falls back to word-level when both
 * texts are single clauses.
 */
export function diffPrompt(prev: string, next: string): DiffSegment[] {
  if (prev === next) return [{ type: 'keep', text: next }];
  if (!prev.trim() && !next.trim()) return [];
  if (!prev.trim()) return [{ type: 'add', text: next }];
  if (!next.trim()) return [{ type: 'remove', text: prev }];

  const prevClauses = splitClauses(prev);
  const nextClauses = splitClauses(next);

  // If both are single clauses, do word-level diff for finer granularity
  if (prevClauses.length <= 1 && nextClauses.length <= 1) {
    const prevWords = prev.split(/\s+/);
    const nextWords = next.split(/\s+/);
    return diffArrays(prevWords, nextWords);
  }

  return diffArrays(prevClauses, nextClauses);
}

/**
 * Diff with stable offsets into the "next" text for keep/add segments.
 *
 * This is used by CodeMirror decorations so highlights can be anchored by
 * exact character ranges instead of substring lookups.
 */
export function diffPromptWithRanges(prev: string, next: string): DiffSegmentWithRange[] {
  if (prev === next) {
    if (!next) return [];
    return [{ type: 'keep', text: next, from: 0, to: next.length }];
  }
  if (!prev.trim() && !next.trim()) return [];
  if (!prev.trim()) return [{ type: 'add', text: next, from: 0, to: next.length }];
  if (!next.trim()) return [{ type: 'remove', text: prev }];

  const prevClauses = splitClausesWithRanges(prev);
  const nextClauses = splitClausesWithRanges(next);

  // Keep parity with `diffPrompt`: only fall back to word-level when both
  // sides are a single clause.
  const useWordLevel = prevClauses.length <= 1 && nextClauses.length <= 1;
  const prevTokens = useWordLevel ? splitWordsWithRanges(prev) : prevClauses;
  const nextTokens = useWordLevel ? splitWordsWithRanges(next) : nextClauses;

  return diffTokenArrays(prevTokens, nextTokens).map((segment) => {
    if (typeof segment.nextIndex === 'number') {
      const token = nextTokens[segment.nextIndex];
      return { type: segment.type, text: segment.text, from: token.from, to: token.to };
    }
    return { type: segment.type, text: segment.text };
  });
}

/**
 * One-line summary of the change between two prompt texts.
 */
export function diffSummary(prev: string, next: string): string {
  if (prev === next) return 'No change';
  if (!prev.trim()) return 'Set prompt';
  if (!next.trim()) return 'Cleared';

  const prevWords = prev.split(/\s+/).length;
  const nextWords = next.split(/\s+/).length;
  const delta = nextWords - prevWords;

  if (delta > 0) return `+${delta} word${delta === 1 ? '' : 's'}`;
  if (delta < 0) return `${delta} word${delta === -1 ? '' : 's'}`;
  return 'Modified';
}

/**
 * Hover-friendly summary that shows actual changed words when the diff is small.
 * Falls back to a word-count summary for larger changes.
 */
export function diffHoverSummary(prev: string, next: string): string {
  if (prev === next) return '';
  if (!prev.trim()) return `Set to: "${next.length > 80 ? next.slice(0, 77) + '…' : next}"`;
  if (!next.trim()) return 'Cleared prompt';

  const prevWords = prev.split(/\s+/);
  const nextWords = next.split(/\s+/);
  const prevSet = new Set(prevWords);
  const nextSet = new Set(nextWords);

  const added = nextWords.filter((w) => !prevSet.has(w));
  const removed = prevWords.filter((w) => !nextSet.has(w));

  // Show actual words if the change is small enough for a tooltip
  const MAX_WORDS = 8;
  const parts: string[] = [];

  if (removed.length > 0 && removed.length <= MAX_WORDS) {
    parts.push(`− ${removed.join(' ')}`);
  } else if (removed.length > MAX_WORDS) {
    parts.push(`− ${removed.length} words`);
  }

  if (added.length > 0 && added.length <= MAX_WORDS) {
    parts.push(`+ ${added.join(' ')}`);
  } else if (added.length > MAX_WORDS) {
    parts.push(`+ ${added.length} words`);
  }

  return parts.join('\n') || 'Reordered';
}

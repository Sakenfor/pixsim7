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

/**
 * Split prompt text into clause-level segments for diffing.
 * Splits on sentence-ending punctuation + space, commas + space, or newlines.
 * Keeps delimiters attached to the preceding segment.
 */
function splitClauses(text: string): string[] {
  if (!text.trim()) return [];
  return text
    .split(/(?<=[.!?,;])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
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

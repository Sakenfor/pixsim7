/**
 * Shift candidate and token-line positions by a leading-whitespace offset.
 *
 * The backend analyser positions everything against `value.trim()` — so
 * candidate `start_pos`/`end_pos` and `tokens.lines.*` start/end ranges are
 * relative to the trim-start of the original text. The CodeMirror editor
 * (and any other renderer that displays the *full* doc, not the trimmed
 * version) needs those positions shifted by however many leading whitespace
 * chars the doc currently has.
 *
 * Trailing whitespace doesn't need an offset because the trim there is at
 * the end — positions before it are unchanged.
 *
 * Returning the same array reference when offset === 0 is intentional so
 * downstream useMemo / Compartment.reconfigure() in CM stay stable.
 */
import type {
  PromptTokenChainElement,
  PromptTokenChainOperator,
  PromptTokenLine,
} from '../hooks/useShadowAnalysis';
import type { PromptBlockCandidate } from '../types';

export function shiftCandidates(
  candidates: PromptBlockCandidate[],
  offset: number,
): PromptBlockCandidate[] {
  if (offset === 0 || candidates.length === 0) return candidates;
  return candidates.map((c) => ({
    ...c,
    start_pos: typeof c.start_pos === 'number' ? c.start_pos + offset : c.start_pos,
    end_pos: typeof c.end_pos === 'number' ? c.end_pos + offset : c.end_pos,
  }));
}

export function shiftTokenLines(
  lines: PromptTokenLine[] | undefined,
  offset: number,
): PromptTokenLine[] | undefined {
  if (!lines || offset === 0 || lines.length === 0) return lines;
  return lines.map<PromptTokenLine>((line) => {
    const shifted: PromptTokenLine = {
      ...line,
      start: line.start + offset,
      end: line.end + offset,
    };
    if (line.kind === 'header') {
      if (typeof line.body_start === 'number') {
        shifted.body_start = line.body_start + offset;
      }
      if (typeof line.op_start === 'number' && typeof line.op_end === 'number') {
        shifted.op_start = line.op_start + offset;
        shifted.op_end = line.op_end + offset;
      }
    } else if (line.kind === 'chain') {
      if (Array.isArray(line.elements)) {
        shifted.elements = line.elements.map<PromptTokenChainElement>((el) => ({
          ...el,
          start: el.start + offset,
          end: el.end + offset,
        }));
      }
      if (Array.isArray(line.operators)) {
        shifted.operators = line.operators.map<PromptTokenChainOperator>((op) => ({
          ...op,
          op_start: op.op_start + offset,
          op_end: op.op_end + offset,
        }));
      }
    }
    return shifted;
  });
}

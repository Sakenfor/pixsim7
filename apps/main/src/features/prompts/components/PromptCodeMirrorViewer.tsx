/**
 * PromptCodeMirrorViewer
 *
 * Read-only CodeMirror surface for inspecting an analysed prompt. Wraps
 * PromptEditor in disabled mode and installs the same shadow/operator
 * extensions QuickGen uses, so the viewer gets structure parity for free
 * (chain line tints, header badges, var/prose styling, operator marks,
 * candidate role colours with confidence-fade + hex underline + hover bg).
 *
 * Differences from QuickGen's PromptComposer:
 *  - No ghost-diff, ref-input, or click handlers (read-only).
 *  - No counter / placeholder / size cap UI.
 *  - Tokens are passed through unshifted — backend tokeniser positions
 *    are already relative to the original text.
 *  - Candidates are shifted by leading-whitespace count, matching what
 *    PromptComposer does (analyser positions are relative to value.trim()).
 */
import type { Extension } from '@codemirror/state';
import { PromptEditor } from '@pixsim7/shared.ui';
import { useMemo } from 'react';

import type { PromptTokenLine } from '../hooks/useShadowAnalysis';
import { operatorEditExtension } from '../lib/operatorEditExtension';
import { shadowAnalysisExtension } from '../lib/shadowAnalysisExtension';
import { shiftCandidates } from '../lib/shiftAnalysisPositions';
import { usePromptSettingsStore } from '../stores/promptSettingsStore';
import type { PromptBlockCandidate } from '../types';

export interface PromptCodeMirrorViewerProps {
  prompt: string;
  candidates: PromptBlockCandidate[];
  /** Token lines from the same analysis response. Optional — when absent,
   *  only the candidate role layer is decorated. */
  tokenLines?: PromptTokenLine[];
  /** When set, candidates of other roles render dimmed in the editor. */
  emphasizedRole?: string | null;
  className?: string;
}

export function PromptCodeMirrorViewer({
  prompt,
  candidates,
  tokenLines,
  emphasizedRole = null,
  className,
}: PromptCodeMirrorViewerProps) {
  const promptRoleColors = usePromptSettingsStore((s) => s.promptRoleColors);

  // Candidates are positioned against `prompt.trim()` (analyser strips
  // before invoking) — shift by the leading-whitespace count so they line
  // up with the doc the editor actually shows.
  const leadingShift = prompt.length - prompt.trimStart().length;
  const shiftedCandidates = useMemo(
    () => (leadingShift === 0 ? candidates : shiftCandidates(candidates, leadingShift)),
    [candidates, leadingShift],
  );

  const extensions = useMemo<Extension[]>(() => {
    const exts: Extension[] = [];
    // Operator marks (clickable on hover for editing, but no callback here
    // means clicks fall through harmlessly — we still get the visual mark).
    exts.push(operatorEditExtension(tokenLines));
    // Candidate role layer + structural chain/header decorations. Click /
    // hover callbacks omitted — read-only inspector, the popover/edit
    // affordance belongs to the editor surface.
    if (shiftedCandidates.length > 0 || (tokenLines && tokenLines.length > 0)) {
      exts.push(
        shadowAnalysisExtension({
          candidates: shiftedCandidates,
          roleColors: promptRoleColors,
          tokenLines,
          emphasizedRole,
        }),
      );
    }
    return exts;
  }, [shiftedCandidates, tokenLines, promptRoleColors, emphasizedRole]);

  return (
    <PromptEditor
      value={prompt}
      onChange={() => {
        /* read-only — never fires because `readOnly` */
      }}
      readOnly
      showCounter={false}
      maxChars={Number.MAX_SAFE_INTEGER}
      placeholder=""
      extensions={extensions}
      className={className}
    />
  );
}

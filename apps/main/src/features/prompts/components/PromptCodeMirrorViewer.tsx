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
 *  - No ghost-diff, ref-input, or text-editing click handlers (read-only).
 *  - No counter / placeholder / size cap UI.
 *  - Tokens are passed through unshifted — backend tokeniser positions
 *    are already relative to the original text.
 *  - Candidates are shifted by leading-whitespace count, matching what
 *    PromptComposer does (analyser positions are relative to value.trim()).
 *
 * Opt-in `enableVariableSave` adds the VAR-token click → Save/Remove popover
 * (the same one the composer uses). Saving a variable only records a name in
 * user prefs — it never mutates the prompt — so it's compatible with this
 * read-only surface.
 */
import type { Extension } from '@codemirror/state';
import { Popover, PromptEditor, useToast } from '@pixsim7/shared.ui';
import { useMemo, useState } from 'react';

import { usePromptVariables } from '../hooks/usePromptVariables';
import type { PromptTokenLine } from '../hooks/useShadowAnalysis';
import { operatorEditExtension } from '../lib/operatorEditExtension';
import { shadowAnalysisExtension } from '../lib/shadowAnalysisExtension';
import { shiftCandidates } from '../lib/shiftAnalysisPositions';
import { variableTokenExtension, type VariableRange } from '../lib/variableTokenExtension';
import { usePromptSettingsStore } from '../stores/promptSettingsStore';
import type { PromptBlockCandidate } from '../types';

import { VariableEditPopover } from './VariableEditPopover';

export interface PromptCodeMirrorViewerProps {
  prompt: string;
  candidates: PromptBlockCandidate[];
  /** Token lines from the same analysis response. Optional — when absent,
   *  only the candidate role layer is decorated. */
  tokenLines?: PromptTokenLine[];
  /** When set, candidates of other roles render dimmed in the editor. */
  emphasizedRole?: string | null;
  /** Opt in to the clickable VAR-token save/unsave popover. */
  enableVariableSave?: boolean;
  className?: string;
}

export function PromptCodeMirrorViewer({
  prompt,
  candidates,
  tokenLines,
  emphasizedRole = null,
  enableVariableSave = false,
  className,
}: PromptCodeMirrorViewerProps) {
  const promptRoleColors = usePromptSettingsStore((s) => s.promptRoleColors);
  const { entries: savedVariableEntries, saveVariable, deleteVariable } = usePromptVariables();
  const toast = useToast();
  const savedVariableNames = useMemo(
    () => new Set(savedVariableEntries.map((entry) => entry.name)),
    [savedVariableEntries],
  );
  const [varPopover, setVarPopover] = useState<{
    anchor: HTMLElement;
    variable: VariableRange;
  } | null>(null);

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
    // VAR-token save/unsave popover — opt-in, non-mutating, so allowed on
    // this read-only surface. Positions come from the (unshifted) token lines.
    if (enableVariableSave) {
      exts.push(
        variableTokenExtension(
          { tokenLines, savedNames: savedVariableNames },
          {
            onVariableClick: (variable, anchor) => {
              setVarPopover({ variable, anchor });
            },
          },
        ),
      );
    }
    // Candidate role layer + structural chain/header decorations. Click /
    // hover callbacks omitted — read-only inspector, the text-edit affordance
    // belongs to the editor surface.
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
  }, [
    shiftedCandidates,
    tokenLines,
    promptRoleColors,
    emphasizedRole,
    enableVariableSave,
    savedVariableNames,
  ]);

  return (
    <>
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
      {enableVariableSave && (
        <Popover
          anchor={varPopover?.anchor ?? null}
          placement="bottom"
          align="start"
          offset={6}
          open={!!varPopover}
          onClose={() => setVarPopover(null)}
        >
          {varPopover && (() => {
            const { variable } = varPopover;
            const entry = savedVariableEntries.find((e) => e.name === variable.name);
            const saved = savedVariableNames.has(variable.name);
            return (
              <VariableEditPopover
                name={variable.name}
                saved={saved}
                defaultClass={variable.defaultClass}
                description={entry?.description}
                value={entry?.value}
                transform={entry?.transform}
                onCancel={() => setVarPopover(null)}
                onSave={async (value, transform) => {
                  setVarPopover(null);
                  const result = await saveVariable(variable.name, {
                    allowExisting: true,
                    value,
                    transform: transform ?? '',
                  });
                  if (result.ok) toast.success(`Saved ${variable.name}`);
                  else if (result.code === 'duplicate')
                    toast.info(`${variable.name} is already saved`);
                  else toast.error(result.message ?? `Failed to save ${variable.name}`);
                }}
                onRemove={async () => {
                  setVarPopover(null);
                  const result = await deleteVariable(variable.name);
                  if (result.ok) toast.success(`Removed ${variable.name}`);
                  else toast.error(result.message ?? `Failed to remove ${variable.name}`);
                }}
              />
            );
          })()}
        </Popover>
      )}
    </>
  );
}

import type { PromptAuthoringModeContract } from '@lib/api/prompts';

import { isValidOperationType, type OperationType } from '@/types/operations';

export interface AuthoringOperationHintMeta {
  requiresInputAsset: boolean;
  autoBind: string | null;
  note: string | null;
  suggestedParams: Record<string, unknown> | null;
}

export interface ResolvedAuthoringGenerationHints {
  modeId: string | null;
  prioritizedOperations: OperationType[];
  hintsByOperation: Partial<Record<OperationType, AuthoringOperationHintMeta>>;
}

interface ResolveAuthoringHintsInput {
  tags: string[];
  familyCategory?: string | null;
  modes: PromptAuthoringModeContract[];
}

const FALLBACK_MODE_BY_TAG: Record<string, string> = {
  'sequence:continuation': 'scene_continuation',
  'intent:modify': 'tool_edit',
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function extractModeIdFromTags(tags: string[]): string | null {
  for (const tag of tags) {
    const normalized = normalize(tag);
    if (!normalized.startsWith('mode:')) continue;
    const modeId = normalize(normalized.slice('mode:'.length));
    if (modeId) return modeId;
  }
  return null;
}

function resolveModeIdFallbackFromTags(tags: string[]): string | null {
  for (const tag of tags) {
    const normalized = normalize(tag);
    const mapped = FALLBACK_MODE_BY_TAG[normalized];
    if (mapped) return mapped;
  }
  return null;
}

export function resolveAuthoringModeId({
  tags,
  familyCategory,
  modes,
}: ResolveAuthoringHintsInput): string | null {
  if (modes.length === 0) return null;
  const modeIds = new Set(modes.map((mode) => normalize(mode.id)));

  // Family category is authoritative — if set, it wins.
  const categoryMode = familyCategory ? normalize(familyCategory) : '';
  if (categoryMode && modeIds.has(categoryMode)) return categoryMode;

  // Fall back to version-level mode: tag (useful when family has no category)
  const modeFromTag = extractModeIdFromTags(tags);
  if (modeFromTag && modeIds.has(modeFromTag)) return modeFromTag;

  const fallbackMode = resolveModeIdFallbackFromTags(tags);
  if (fallbackMode && modeIds.has(fallbackMode)) return fallbackMode;

  return null;
}

export function resolveAuthoringGenerationHints(
  input: ResolveAuthoringHintsInput,
): ResolvedAuthoringGenerationHints {
  const modeId = resolveAuthoringModeId(input);
  if (!modeId) {
    return {
      modeId: null,
      prioritizedOperations: [],
      hintsByOperation: {},
    };
  }

  const mode = input.modes.find((entry) => normalize(entry.id) === modeId);
  if (!mode) {
    return {
      modeId: null,
      prioritizedOperations: [],
      hintsByOperation: {},
    };
  }

  const sortedHints = [...(mode.generation_hints ?? [])]
    .filter((hint) => isValidOperationType(hint.operation))
    .sort((a, b) => (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER));

  const prioritizedOperations: OperationType[] = sortedHints.map(
    (hint) => hint.operation as OperationType,
  );
  const hintsByOperation: Partial<Record<OperationType, AuthoringOperationHintMeta>> = {};
  for (const hint of sortedHints) {
    const operation = hint.operation as OperationType;
    hintsByOperation[operation] = {
      requiresInputAsset: Boolean(hint.requires_input_asset),
      autoBind: hint.auto_bind ?? null,
      note: hint.note ?? null,
      suggestedParams: hint.suggested_params && typeof hint.suggested_params === 'object'
        ? { ...hint.suggested_params }
        : null,
    };
  }

  return {
    modeId: mode.id,
    prioritizedOperations,
    hintsByOperation,
  };
}

export function pickPreferredOperation(
  hints: ResolvedAuthoringGenerationHints,
  hasInputForOperation: (operation: OperationType) => boolean,
): {
  operation: OperationType | null;
  requiresInputAsset: boolean;
  autoBind: string | null;
  note: string | null;
  suggestedParams: Record<string, unknown> | null;
} {
  for (const operation of hints.prioritizedOperations) {
    const metadata = hints.hintsByOperation[operation];
    const requiresInputAsset = metadata?.requiresInputAsset === true;
    if (!requiresInputAsset || hasInputForOperation(operation)) {
      return {
        operation,
        requiresInputAsset,
        autoBind: metadata?.autoBind ?? null,
        note: metadata?.note ?? null,
        suggestedParams: metadata?.suggestedParams ?? null,
      };
    }
  }
  const fallbackOperation = hints.prioritizedOperations[0] ?? null;
  const fallbackMetadata = fallbackOperation ? hints.hintsByOperation[fallbackOperation] : undefined;
  return {
    operation: fallbackOperation,
    requiresInputAsset: fallbackMetadata?.requiresInputAsset === true,
    autoBind: fallbackMetadata?.autoBind ?? null,
    note: fallbackMetadata?.note ?? null,
    suggestedParams: fallbackMetadata?.suggestedParams ?? null,
  };
}

export function formatOperationTypeLabel(operation: OperationType): string {
  return operation
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatOperationTypeShort(operation: OperationType): string {
  const map: Record<OperationType, string> = {
    text_to_image: 'T2I',
    text_to_video: 'T2V',
    image_to_video: 'I2V',
    image_to_image: 'I2I',
    video_extend: 'V-Extend',
    video_transition: 'V-Transition',
    video_modify: 'V-Modify',
    fusion: 'Fusion',
  };
  return map[operation];
}

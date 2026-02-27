export type CharacterReferenceSlotKey =
  | 'identity_primary'
  | 'face_closeup'
  | 'expression_smile'
  | 'expression_thinking'
  | 'pose_neutral';

export interface CharacterReferenceSlotLike {
  asset_id?: string | null;
  kind?: string | null;
}

export type CharacterReferenceSlotsLike = Partial<Record<CharacterReferenceSlotKey, CharacterReferenceSlotLike>>;

export interface CharacterScenePrepPrefillData {
  sceneName: string;
  basePrompt: string;
  sourceAssetId: string | null;
  cast: Array<{ role: string; character_id: string }>;
  guidanceRefs: Array<{
    key: string;
    asset_id: string;
    kind?: string;
    label?: string;
    priority?: number;
  }>;
  matrixQuery: string;
  discoveryNotes: string;
}

export function parseCharacterReferenceSlotsFromTags(
  tags: Record<string, unknown> | undefined,
): CharacterReferenceSlotsLike {
  const raw = tags?._reference_slots;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const next: CharacterReferenceSlotsLike = {};
  for (const key of [
    'identity_primary',
    'face_closeup',
    'expression_smile',
    'expression_thinking',
    'pose_neutral',
  ] as const) {
    const row = (raw as Record<string, unknown>)[key];
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const assetId = typeof (row as Record<string, unknown>).asset_id === 'string'
      ? ((row as Record<string, unknown>).asset_id as string).trim()
      : '';
    if (!assetId) continue;
    next[key] = {
      asset_id: assetId,
      kind: typeof (row as Record<string, unknown>).kind === 'string'
        ? ((row as Record<string, unknown>).kind as string)
        : undefined,
    };
  }
  return next;
}

export function buildCharacterScenePrepPrefill(args: {
  characterId: string;
  characterDisplayName: string;
  suggestedScenePrompt: string;
  referenceSlots: CharacterReferenceSlotsLike;
}): CharacterScenePrepPrefillData {
  const cast = args.characterId
    ? [{ role: 'lead', character_id: args.characterId }]
    : [];

  const slotOrder: Array<{
    key: CharacterReferenceSlotKey;
    bindingKey: string;
    fallbackKind: string;
    label: string;
    priority: number;
  }> = [
    { key: 'identity_primary', bindingKey: 'identity', fallbackKind: 'identity', label: 'Lead identity', priority: 1 },
    { key: 'face_closeup', bindingKey: 'face', fallbackKind: 'identity', label: 'Lead face', priority: 2 },
    { key: 'expression_smile', bindingKey: 'expression_smile', fallbackKind: 'expression', label: 'Smile ref', priority: 3 },
    { key: 'expression_thinking', bindingKey: 'expression_thinking', fallbackKind: 'expression', label: 'Thinking ref', priority: 4 },
    { key: 'pose_neutral', bindingKey: 'pose_neutral', fallbackKind: 'pose', label: 'Neutral pose ref', priority: 5 },
  ];

  const guidanceRefs = slotOrder
    .map((slotDef) => {
      const slot = args.referenceSlots[slotDef.key];
      const assetId = typeof slot?.asset_id === 'string' ? slot.asset_id.trim() : '';
      if (!assetId) return null;
      return {
        key: slotDef.bindingKey,
        asset_id: assetId,
        kind: (typeof slot?.kind === 'string' && slot.kind.trim()) ? slot.kind : slotDef.fallbackKind,
        label: slotDef.label,
        priority: slotDef.priority,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);

  return {
    sceneName: args.characterDisplayName ? `${args.characterDisplayName} scene prep` : 'Scene prep',
    basePrompt: args.suggestedScenePrompt,
    sourceAssetId: typeof args.referenceSlots.identity_primary?.asset_id === 'string'
      ? args.referenceSlots.identity_primary.asset_id
      : null,
    cast,
    guidanceRefs,
    matrixQuery: '',
    discoveryNotes: '',
  };
}


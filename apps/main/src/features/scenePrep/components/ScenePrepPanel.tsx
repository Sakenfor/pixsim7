import { Badge, Button, Checkbox, DisclosureSection, FormField, Input, Select } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { CharacterBindings } from '@lib/api/blockTemplates';

import {
  CAP_ASSET_SELECTION,
  CAP_CHARACTER_CONTEXT,
  CAP_CHARACTER_SCENE_PREP_PREFILL,
  useCapability,
  type AssetSelection,
  type CharacterContextSummary,
  type CharacterScenePrepPrefillContext,
} from '@features/contextHub';
import { openWorkspacePanel } from '@features/workspace';

import {
  useSceneArtifactStore,
  type SceneArtifact,
  type SceneArtifactPrepState,
  type SceneArtifactStage,
  type SceneArtifactStatus,
} from '@/domain/sceneArtifact';
import {
  buildBackendEachExecutionPolicy,
  buildBackendFanoutExecutionPolicy,
} from '@/features/generation/lib/fanoutExecutionPolicy';
import { buildGuidancePlanReferences } from '@/features/generation/lib/runContext';
import {
  compileTemplateFanoutRequest,
  executeTrackedTemplateFanoutRequest,
  type TemplateFanoutInputRow,
} from '@/features/generation/lib/templateFanoutExecution';

type PrepOperationMode = 'auto' | 'text_to_image' | 'image_to_image';
type CandidateGroup = 'location' | 'style' | 'mood' | 'prop' | 'other';
type ScenePrepStage = 'explore' | 'compose' | 'refine' | 'custom';
type ScenePrepExecutionMode = 'fanout' | 'sequential';

interface ScenePrepCastRow {
  id: string;
  role: string;
  character_id: string;
}

interface ScenePrepGuidanceRefRow {
  id: string;
  key: string;
  asset_id: string;
  kind: string;
  label?: string;
  priority?: string;
}

interface ScenePrepCandidateAssetRow {
  id: string;
  asset_id: string;
  group: CandidateGroup;
  note?: string;
}

interface ScenePrepVariantRow {
  id: string;
  key: string;
  label: string;
  promptSuffix: string;
  shot?: string;
  view?: string;
  state?: string;
}

interface ScenePrepLaunchHistoryEntry {
  id: string;
  launchId: string;
  stage: ScenePrepStage;
  createdAtMs: number;
  estimatedRows: number;
  executionMode: ScenePrepExecutionMode;
  reusePreviousOutputAsInput: boolean;
  sourceAssetId: number | null;
  executionId?: number;
  generationCount?: number;
}

interface ScenePrepStageHandoff {
  sourceAssetId: string;
  fromStage: ScenePrepStage;
  fromLaunchId: string;
  capturedAtMs: number;
}

export interface ScenePrepPrefillCastRow {
  role: string;
  character_id: string;
}

export interface ScenePrepPrefillGuidanceRefRow {
  key: string;
  asset_id: string | number;
  kind?: string;
  label?: string;
  priority?: number;
}

export interface ScenePrepPanelPrefill {
  sceneName?: string;
  basePrompt?: string;
  sourceAssetId?: string | number | null;
  matrixQuery?: string;
  discoveryNotes?: string;
  cast?: ScenePrepPrefillCastRow[];
  guidanceRefs?: ScenePrepPrefillGuidanceRefRow[];
}

export interface ScenePrepPanelProps {
  initialTemplateId?: string;
  initialProviderId?: string;
  initialBasePrompt?: string;
  hostPrefill?: ScenePrepPanelPrefill | null;
  draftPersistenceKey?: string | null;
}

interface ScenePrepDraftState {
  templateId: string;
  providerId: string;
  basePrompt: string;
  sceneName: string;
  stage: ScenePrepStage;
  variantCount: string;
  executionMode: ScenePrepExecutionMode;
  reusePreviousOutputAsInput: boolean;
  operationMode: PrepOperationMode;
  sourceAssetId: string;
  matrixQuery: string;
  discoveryNotes: string;
  castRows: ScenePrepCastRow[];
  guidanceRefRows: ScenePrepGuidanceRefRow[];
  candidateAssets: ScenePrepCandidateAssetRow[];
  variantRows: ScenePrepVariantRow[];
}

const SCENE_PREP_DRAFT_STORAGE_VERSION = 1;

const SCENE_PREP_STAGE_DEFAULTS: Record<ScenePrepStage, {
  variantCount: number;
  executionMode: ScenePrepExecutionMode;
  reusePreviousOutputAsInput: boolean;
}> = {
  explore: { variantCount: 3, executionMode: 'fanout', reusePreviousOutputAsInput: false },
  compose: { variantCount: 4, executionMode: 'fanout', reusePreviousOutputAsInput: false },
  refine: { variantCount: 2, executionMode: 'sequential', reusePreviousOutputAsInput: true },
  custom: { variantCount: 4, executionMode: 'fanout', reusePreviousOutputAsInput: false },
};

function normalizeCastRows(rows: unknown): ScenePrepCastRow[] {
  if (!Array.isArray(rows)) return [createDefaultCastRow('lead', '')];
  const next = rows
    .filter((row) => row && typeof row === 'object')
    .map((row) => {
      const item = row as Record<string, unknown>;
      return {
        id: typeof item.id === 'string' && item.id ? item.id : nextRowId('cast'),
        role: typeof item.role === 'string' ? item.role : '',
        character_id: typeof item.character_id === 'string' ? item.character_id : '',
      };
    })
    .filter((row) => row.role.trim() || row.character_id.trim());
  return next.length > 0 ? next : [createDefaultCastRow('lead', '')];
}

function normalizeGuidanceRefRows(rows: unknown): ScenePrepGuidanceRefRow[] {
  if (!Array.isArray(rows)) return [createDefaultGuidanceRef()];
  const next = rows
    .filter((row) => row && typeof row === 'object')
    .map((row) => {
      const item = row as Record<string, unknown>;
      return {
        id: typeof item.id === 'string' && item.id ? item.id : nextRowId('guideref'),
        key: typeof item.key === 'string' ? item.key : '',
        asset_id: typeof item.asset_id === 'string' ? item.asset_id : '',
        kind: typeof item.kind === 'string' ? item.kind : 'identity',
        label: typeof item.label === 'string' ? item.label : '',
        priority: typeof item.priority === 'string' ? item.priority : '',
      };
    })
    .filter((row) => row.key.trim() || row.asset_id.trim());
  return next.length > 0 ? next : [createDefaultGuidanceRef()];
}

function normalizeCandidateRows(rows: unknown): ScenePrepCandidateAssetRow[] {
  if (!Array.isArray(rows)) return [createDefaultCandidate()];
  const validGroups = new Set<CandidateGroup>(['location', 'style', 'mood', 'prop', 'other']);
  const next = rows
    .filter((row) => row && typeof row === 'object')
    .map((row) => {
      const item = row as Record<string, unknown>;
      const group = typeof item.group === 'string' && validGroups.has(item.group as CandidateGroup)
        ? (item.group as CandidateGroup)
        : 'other';
      return {
        id: typeof item.id === 'string' && item.id ? item.id : nextRowId('candidate'),
        asset_id: typeof item.asset_id === 'string' ? item.asset_id : '',
        group,
        note: typeof item.note === 'string' ? item.note : '',
      };
    });
  return next.length > 0 ? next : [createDefaultCandidate()];
}

function normalizeVariantRows(rows: unknown): ScenePrepVariantRow[] {
  if (!Array.isArray(rows)) return createDefaultVariants();
  const next = rows
    .filter((row) => row && typeof row === 'object')
    .map((row) => {
      const item = row as Record<string, unknown>;
      return {
        id: typeof item.id === 'string' && item.id ? item.id : nextRowId('variant'),
        key: typeof item.key === 'string' ? item.key : '',
        label: typeof item.label === 'string' ? item.label : '',
        promptSuffix: typeof item.promptSuffix === 'string' ? item.promptSuffix : '',
        shot: typeof item.shot === 'string' ? item.shot : undefined,
        view: typeof item.view === 'string' ? item.view : undefined,
        state: typeof item.state === 'string' ? item.state : undefined,
      };
    })
    .filter((row) => row.key.trim() || row.label.trim() || row.promptSuffix.trim());
  return next.length > 0 ? next : createDefaultVariants();
}

function isScenePrepStage(value: unknown): value is ScenePrepStage {
  return value === 'explore' || value === 'compose' || value === 'refine' || value === 'custom';
}

function normalizeLaunchHistoryRows(rows: unknown): ScenePrepLaunchHistoryEntry[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => row && typeof row === 'object')
    .map((row) => {
      const item = row as Record<string, unknown>;
      const stage = isScenePrepStage(item.stage) ? item.stage : 'custom';
      const executionMode = item.executionMode === 'sequential' ? 'sequential' : 'fanout';
      const sourceAssetIdRaw = item.sourceAssetId;
      const sourceAssetId = typeof sourceAssetIdRaw === 'number' && Number.isFinite(sourceAssetIdRaw)
        ? Math.trunc(sourceAssetIdRaw)
        : null;
      return {
        id: typeof item.id === 'string' && item.id ? item.id : nextRowId('launch'),
        launchId: typeof item.launchId === 'string' ? item.launchId : '',
        stage,
        createdAtMs: typeof item.createdAtMs === 'number' && Number.isFinite(item.createdAtMs) ? item.createdAtMs : Date.now(),
        estimatedRows: typeof item.estimatedRows === 'number' && Number.isFinite(item.estimatedRows) ? Math.max(1, Math.floor(item.estimatedRows)) : 1,
        executionMode,
        reusePreviousOutputAsInput: Boolean(item.reusePreviousOutputAsInput),
        sourceAssetId,
        executionId: typeof item.executionId === 'number' && Number.isFinite(item.executionId) ? Math.floor(item.executionId) : undefined,
        generationCount: typeof item.generationCount === 'number' && Number.isFinite(item.generationCount) ? Math.floor(item.generationCount) : undefined,
      } satisfies ScenePrepLaunchHistoryEntry;
    })
    .filter((row) => row.launchId.trim());
}

function normalizeStageHandoff(value: unknown): ScenePrepStageHandoff | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (!isScenePrepStage(item.fromStage)) return null;
  if (typeof item.sourceAssetId !== 'string' || !item.sourceAssetId.trim()) return null;
  if (typeof item.fromLaunchId !== 'string' || !item.fromLaunchId.trim()) return null;
  return {
    sourceAssetId: item.sourceAssetId.trim(),
    fromStage: item.fromStage,
    fromLaunchId: item.fromLaunchId.trim(),
    capturedAtMs:
      typeof item.capturedAtMs === 'number' && Number.isFinite(item.capturedAtMs)
        ? item.capturedAtMs
        : Date.now(),
  };
}

function buildDefaultDraft(args: {
  initialTemplateId: string;
  initialProviderId: string;
  initialBasePrompt: string;
  prefill: ScenePrepPanelPrefill | null;
}): ScenePrepDraftState {
  const prefill = args.prefill;
  return {
    templateId: args.initialTemplateId,
    providerId: args.initialProviderId,
    basePrompt: args.initialBasePrompt || prefill?.basePrompt || '',
    sceneName: prefill?.sceneName || '',
    stage: 'custom',
    variantCount: '4',
    executionMode: 'fanout',
    reusePreviousOutputAsInput: false,
    operationMode: 'auto',
    sourceAssetId: prefill?.sourceAssetId != null ? String(prefill.sourceAssetId) : '',
    matrixQuery: prefill?.matrixQuery || '',
    discoveryNotes: prefill?.discoveryNotes || '',
    castRows: buildCastRowsFromPrefill(prefill),
    guidanceRefRows: buildGuidanceRowsFromPrefill(prefill),
    candidateAssets: [createDefaultCandidate()],
    variantRows: createDefaultVariants(),
  };
}

function readScenePrepDraft(key: string): ScenePrepDraftState | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;
    const version = typeof parsed.version === 'number' ? parsed.version : 0;
    if (version !== SCENE_PREP_DRAFT_STORAGE_VERSION) return null;
    const draft = (parsed.draft && typeof parsed.draft === 'object') ? (parsed.draft as Record<string, unknown>) : parsed;
    const op = draft.operationMode;
    return {
      templateId: typeof draft.templateId === 'string' ? draft.templateId : '',
      providerId: typeof draft.providerId === 'string' ? draft.providerId : 'pixverse',
      basePrompt: typeof draft.basePrompt === 'string' ? draft.basePrompt : '',
      sceneName: typeof draft.sceneName === 'string' ? draft.sceneName : '',
      stage:
        draft.stage === 'explore' || draft.stage === 'compose' || draft.stage === 'refine' || draft.stage === 'custom'
          ? draft.stage
          : 'custom',
      variantCount: typeof draft.variantCount === 'string' ? draft.variantCount : '4',
      executionMode: draft.executionMode === 'sequential' ? 'sequential' : 'fanout',
      reusePreviousOutputAsInput: Boolean(draft.reusePreviousOutputAsInput),
      operationMode: op === 'text_to_image' || op === 'image_to_image' || op === 'auto' ? op : 'auto',
      sourceAssetId: typeof draft.sourceAssetId === 'string' ? draft.sourceAssetId : '',
      matrixQuery: typeof draft.matrixQuery === 'string' ? draft.matrixQuery : '',
      discoveryNotes: typeof draft.discoveryNotes === 'string' ? draft.discoveryNotes : '',
      castRows: normalizeCastRows(draft.castRows),
      guidanceRefRows: normalizeGuidanceRefRows(draft.guidanceRefRows),
      candidateAssets: normalizeCandidateRows(draft.candidateAssets),
      variantRows: normalizeVariantRows(draft.variantRows),
    };
  } catch {
    return null;
  }
}

function writeScenePrepDraft(key: string, draft: ScenePrepDraftState): void {
  try {
    localStorage.setItem(key, JSON.stringify({
      version: SCENE_PREP_DRAFT_STORAGE_VERSION,
      saved_at: Date.now(),
      draft,
    }));
  } catch {
    // ignore persistence failures
  }
}

const SHOT_OPTIONS = ['full_body', 'bust', 'closeup_face'] as const;
const VIEW_OPTIONS = ['front', 'three_quarter_left', 'three_quarter_right', 'side', 'profile_left', 'back'] as const;
const CANDIDATE_GROUP_OPTIONS: { value: CandidateGroup; label: string }[] = [
  { value: 'location', label: 'Location' },
  { value: 'style', label: 'Style' },
  { value: 'mood', label: 'Mood' },
  { value: 'prop', label: 'Prop' },
  { value: 'other', label: 'Other' },
];

let _rowCounter = 0;
function nextRowId(prefix: string): string {
  _rowCounter += 1;
  return `${prefix}_${Date.now()}_${_rowCounter}`;
}

function slugifyTagPart(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function createScenePrepLaunchId(): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return randomUuid;
  return `sceneprep_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function shortId(value: string, max = 8): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function getNextScenePrepStage(stage: ScenePrepStage): ScenePrepStage | null {
  if (stage === 'explore') return 'compose';
  if (stage === 'compose') return 'refine';
  return null;
}

function scenePrepStageToArtifactStatus(stage: ScenePrepStage): SceneArtifactStatus {
  if (stage === 'explore') return 'explored';
  if (stage === 'compose') return 'composed';
  if (stage === 'refine') return 'refined';
  return 'draft';
}

function uniqueNonEmptyStrings(values: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function toNumericAssetId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function buildCharacterBindings(rows: ScenePrepCastRow[]): CharacterBindings {
  const result: CharacterBindings = {};
  for (const row of rows) {
    const role = row.role.trim();
    const characterId = row.character_id.trim();
    if (!role || !characterId) continue;
    result[role] = { character_id: characterId };
  }
  return result;
}

function buildGuidancePlanFromRows(rows: ScenePrepGuidanceRefRow[]) {
  const refs: Record<string, { assetId: number | string; kind?: string; priority?: number; label?: string }> = {};
  for (const row of rows) {
    const key = row.key.trim();
    const assetId = row.asset_id.trim();
    if (!key || !assetId) continue;
    const numeric = toNumericAssetId(assetId);
    const parsedPriority = row.priority?.trim() ? Number(row.priority) : undefined;
    refs[key] = {
      assetId: numeric != null ? numeric : assetId,
      kind: row.kind.trim() || 'identity',
      ...(Number.isFinite(parsedPriority) ? { priority: Math.max(1, Math.floor(Number(parsedPriority))) } : {}),
      ...(row.label?.trim() ? { label: row.label.trim() } : {}),
    };
  }
  if (Object.keys(refs).length === 0) return null;
  return buildGuidancePlanReferences(refs);
}

function firstGuidanceIdentityAssetId(rows: ScenePrepGuidanceRefRow[]): number | null {
  const preferredKeys = ['identity', 'subject_lead_identity', 'lead_identity', 'character_primary'];
  for (const key of preferredKeys) {
    const match = rows.find((row) => row.key.trim() === key);
    const id = toNumericAssetId(match?.asset_id);
    if (id != null) return id;
  }
  const fallback = rows.find((row) => row.kind.trim() === 'identity');
  return toNumericAssetId(fallback?.asset_id);
}

function createDefaultVariants(): ScenePrepVariantRow[] {
  return [
    { id: nextRowId('variant'), key: 'establishing', label: 'Establishing', promptSuffix: 'wide establishing shot', shot: 'full_body', view: 'front' },
    { id: nextRowId('variant'), key: 'portrait', label: 'Portrait', promptSuffix: 'portrait framing', shot: 'bust', view: 'three_quarter_left' },
    { id: nextRowId('variant'), key: 'closeup', label: 'Close-up', promptSuffix: 'close-up portrait', shot: 'closeup_face', view: 'front' },
    { id: nextRowId('variant'), key: 'profile', label: 'Profile', promptSuffix: 'profile view portrait', shot: 'bust', view: 'side' },
  ];
}

function createDefaultCandidate(): ScenePrepCandidateAssetRow {
  return { id: nextRowId('candidate'), asset_id: '', group: 'location', note: '' };
}

function createDefaultGuidanceRef(): ScenePrepGuidanceRefRow {
  return { id: nextRowId('guideref'), key: '', asset_id: '', kind: 'identity', label: '', priority: '' };
}

function createDefaultCastRow(role = '', characterId = ''): ScenePrepCastRow {
  return { id: nextRowId('cast'), role, character_id: characterId };
}

function buildCastRowsFromPrefill(prefill: ScenePrepPanelPrefill | null | undefined): ScenePrepCastRow[] {
  const rows = (prefill?.cast ?? [])
    .map((row) => ({
      id: nextRowId('cast'),
      role: typeof row.role === 'string' ? row.role : '',
      character_id: typeof row.character_id === 'string' ? row.character_id : '',
    }))
    .filter((row) => row.role.trim() || row.character_id.trim());
  return rows.length > 0 ? rows : [createDefaultCastRow('lead', '')];
}

function buildGuidanceRowsFromPrefill(prefill: ScenePrepPanelPrefill | null | undefined): ScenePrepGuidanceRefRow[] {
  const rows = (prefill?.guidanceRefs ?? [])
    .map((row) => ({
      id: nextRowId('guideref'),
      key: typeof row.key === 'string' ? row.key : '',
      asset_id: String(row.asset_id ?? '').trim(),
      kind: typeof row.kind === 'string' ? row.kind : 'identity',
      label: typeof row.label === 'string' ? row.label : '',
      priority: typeof row.priority === 'number' && Number.isFinite(row.priority) ? String(Math.floor(row.priority)) : '',
    }))
    .filter((row) => row.key.trim() || row.asset_id.trim());
  return rows.length > 0 ? rows : [createDefaultGuidanceRef()];
}

function mapCapabilityPrefillToPanelPrefill(
  value: CharacterScenePrepPrefillContext | null | undefined,
): ScenePrepPanelPrefill | null {
  if (!value) return null;
  return {
    sceneName: value.sceneName,
    basePrompt: value.basePrompt,
    sourceAssetId: value.sourceAssetId ?? null,
    cast: value.cast,
    guidanceRefs: value.guidanceRefs.map((row) => ({
      key: row.key,
      asset_id: row.asset_id,
      kind: row.kind,
      label: row.label,
      priority: row.priority,
    })),
    matrixQuery: value.matrixQuery || '',
    discoveryNotes: value.discoveryNotes || '',
  };
}

function buildScenePrepRows(args: {
  basePrompt: string;
  count: number;
  stage: ScenePrepStage;
  variants: ScenePrepVariantRow[];
  sceneKey: string;
  candidateAssets: ScenePrepCandidateAssetRow[];
}): TemplateFanoutInputRow[] {
  const usableVariants = args.variants.filter((row) => row.label.trim() || row.promptSuffix.trim());
  const variants = usableVariants.length > 0 ? usableVariants : createDefaultVariants();
  const candidates = args.candidateAssets
    .filter((row) => row.asset_id.trim())
    .map((row) => ({ asset_id: row.asset_id.trim(), group: row.group, note: row.note?.trim() || undefined }));

  return Array.from({ length: Math.max(1, args.count) }, (_, index) => {
    const variant = variants[index % variants.length];
    const suffix = variant.promptSuffix.trim();
    const prompt = suffix ? `${args.basePrompt}, ${suffix}` : args.basePrompt;
    const tagIntents = uniqueNonEmptyStrings([
      'surface:scene',
      `stage:${args.stage}`,
      `shot:${variant.shot || 'unspecified'}`,
      variant.view ? `view:${variant.view}` : null,
      variant.state ? `state:${variant.state}` : null,
      args.sceneKey ? `scene:${args.sceneKey}` : null,
    ]);

    return {
      id: `scene_${index + 1}`,
      label: `${variant.label.trim() || 'Variant'} ${index + 1}`,
      prompt,
      runContext: {
        scene_variant_key: variant.key || `variant_${index + 1}`,
        scene_variant_label: variant.label || `Variant ${index + 1}`,
        shot: variant.shot,
        view: variant.view,
        expression_state: variant.state,
        tag_intents: tagIntents,
        ...(candidates.length > 0 ? { prep_candidate_assets: candidates } : {}),
      },
    };
  });
}

export function ScenePrepPanel({
  initialTemplateId = '',
  initialProviderId = 'pixverse',
  initialBasePrompt = '',
  hostPrefill = null,
  draftPersistenceKey,
}: ScenePrepPanelProps) {
  const { value: activeCharacter } = useCapability<CharacterContextSummary>(CAP_CHARACTER_CONTEXT);
  const { value: characterScenePrepPrefillCapability } = useCapability<CharacterScenePrepPrefillContext>(CAP_CHARACTER_SCENE_PREP_PREFILL);
  const { value: assetSelection } = useCapability<AssetSelection>(CAP_ASSET_SELECTION);
  const capabilityPrefill = useMemo(
    () => mapCapabilityPrefillToPanelPrefill(characterScenePrepPrefillCapability),
    [characterScenePrepPrefillCapability],
  );
  const effectiveHostPrefill = hostPrefill ?? capabilityPrefill;
  const effectiveDraftPersistenceKey = draftPersistenceKey === undefined
    ? 'scene-prep:draft:v1'
    : (draftPersistenceKey && draftPersistenceKey.trim() ? draftPersistenceKey.trim() : null);
  const initialDraft = useMemo(
    () => {
      const defaults = buildDefaultDraft({
        initialTemplateId,
        initialProviderId,
        initialBasePrompt,
        prefill: effectiveHostPrefill,
      });
      if (!effectiveDraftPersistenceKey) return defaults;
      const persisted = readScenePrepDraft(effectiveDraftPersistenceKey);
      return persisted ?? defaults;
    },
    [effectiveDraftPersistenceKey, effectiveHostPrefill, initialBasePrompt, initialProviderId, initialTemplateId],
  );

  const [templateId, setTemplateId] = useState(initialDraft.templateId);
  const [providerId, setProviderId] = useState(initialDraft.providerId);
  const [basePrompt, setBasePrompt] = useState(initialDraft.basePrompt);
  const [sceneName, setSceneName] = useState(initialDraft.sceneName);
  const [stage, setStage] = useState<ScenePrepStage>(initialDraft.stage);
  const [variantCount, setVariantCount] = useState(initialDraft.variantCount);
  const [executionMode, setExecutionMode] = useState<ScenePrepExecutionMode>(initialDraft.executionMode);
  const [reusePreviousOutputAsInput, setReusePreviousOutputAsInput] = useState(initialDraft.reusePreviousOutputAsInput);
  const [operationMode, setOperationMode] = useState<PrepOperationMode>(initialDraft.operationMode);
  const [sourceAssetId, setSourceAssetId] = useState(initialDraft.sourceAssetId);
  const [matrixQuery, setMatrixQuery] = useState(initialDraft.matrixQuery);
  const [discoveryNotes, setDiscoveryNotes] = useState(initialDraft.discoveryNotes);
  const [castRows, setCastRows] = useState<ScenePrepCastRow[]>(initialDraft.castRows);
  const [guidanceRefRows, setGuidanceRefRows] = useState<ScenePrepGuidanceRefRow[]>(initialDraft.guidanceRefRows);
  const [candidateAssets, setCandidateAssets] = useState<ScenePrepCandidateAssetRow[]>(initialDraft.candidateAssets);
  const [variantRows, setVariantRows] = useState<ScenePrepVariantRow[]>(initialDraft.variantRows);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [candidateImportGroup, setCandidateImportGroup] = useState<CandidateGroup>('other');
  const [launchHistory, setLaunchHistory] = useState<ScenePrepLaunchHistoryEntry[]>([]);
  const [stageHandoff, setStageHandoff] = useState<ScenePrepStageHandoff | null>(null);
  const [artifactTitle, setArtifactTitle] = useState(initialDraft.sceneName || 'Untitled Scene');

  const sceneArtifactsById = useSceneArtifactStore((state) => state.artifacts);
  const currentSceneArtifactId = useSceneArtifactStore((state) => state.currentArtifactId);
  const setCurrentSceneArtifact = useSceneArtifactStore((state) => state.setCurrentArtifact);
  const upsertPrepArtifact = useSceneArtifactStore((state) => state.upsertPrepArtifact);
  const getSceneArtifact = useSceneArtifactStore((state) => state.getArtifact);
  const deleteSceneArtifact = useSceneArtifactStore((state) => state.deleteArtifact);
  const sceneArtifacts = useMemo(
    () => Object.values(sceneArtifactsById).sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0)),
    [sceneArtifactsById],
  );

  const characterBindings = useMemo(() => buildCharacterBindings(castRows), [castRows]);
  const guidancePlan = useMemo(() => buildGuidancePlanFromRows(guidanceRefRows), [guidanceRefRows]);
  const explicitSourceAssetId = useMemo(() => toNumericAssetId(sourceAssetId), [sourceAssetId]);
  const inferredGuidanceSourceAssetId = useMemo(() => firstGuidanceIdentityAssetId(guidanceRefRows), [guidanceRefRows]);
  const resolvedSourceAssetId = explicitSourceAssetId ?? inferredGuidanceSourceAssetId;

  const resolvedOperation = useMemo(() => {
    if (operationMode === 'text_to_image') return 'text_to_image' as const;
    if (operationMode === 'image_to_image') return 'image_to_image' as const;
    return resolvedSourceAssetId != null ? 'image_to_image' as const : 'text_to_image' as const;
  }, [operationMode, resolvedSourceAssetId]);
  const effectiveReusePrevious = executionMode === 'sequential' && reusePreviousOutputAsInput;
  const requestedVariantCount = useMemo(() => {
    const countRaw = Number(variantCount);
    return Number.isFinite(countRaw) ? Math.max(1, Math.min(16, Math.floor(countRaw))) : 4;
  }, [variantCount]);
  const estimatedLaunchRows = useMemo(() => {
    const sceneKey = slugifyTagPart(sceneName.trim() || basePrompt.trim());
    return buildScenePrepRows({
      basePrompt: basePrompt.trim(),
      count: requestedVariantCount,
      stage,
      variants: variantRows,
      sceneKey,
      candidateAssets,
    }).length;
  }, [basePrompt, candidateAssets, requestedVariantCount, sceneName, stage, variantRows]);
  const launchWarnings = useMemo(() => {
    const warnings: string[] = [];
    if (executionMode === 'sequential' && estimatedLaunchRows > 8) {
      warnings.push(`Sequential mode will queue ${estimatedLaunchRows} steps one-by-one and may take longer to finish.`);
    }
    if (effectiveReusePrevious && resolvedOperation !== 'image_to_image') {
      warnings.push('Reuse previous output is enabled, but the first step will start without an explicit source asset (chain begins after step 1).');
    }
    if (estimatedLaunchRows >= 12) {
      warnings.push(`Large batch (${estimatedLaunchRows} generations). Review template/provider settings before launch.`);
    }
    return warnings;
  }, [effectiveReusePrevious, estimatedLaunchRows, executionMode, resolvedOperation]);

  const activeCharacterLabel = activeCharacter
    ? (activeCharacter.displayName || activeCharacter.name || activeCharacter.characterId)
    : null;
  const latestLaunch = launchHistory[0] ?? null;
  const nextStageSuggestion = getNextScenePrepStage(stage);
  const selectedSceneArtifact = useMemo<SceneArtifact | null>(() => {
    if (!currentSceneArtifactId) return null;
    return sceneArtifactsById[currentSceneArtifactId] ?? null;
  }, [currentSceneArtifactId, sceneArtifactsById]);

  useEffect(() => {
    if (selectedSceneArtifact) {
      setArtifactTitle(selectedSceneArtifact.title || 'Untitled Scene');
      return;
    }
    if (artifactTitle.trim()) return;
    const fallback = sceneName.trim() || 'Untitled Scene';
    setArtifactTitle(fallback);
  }, [artifactTitle, sceneName, selectedSceneArtifact]);

  const buildSceneArtifactPrepState = useCallback((): SceneArtifactPrepState => ({
    templateId,
    providerId,
    basePrompt,
    sceneName,
    stage: stage as SceneArtifactStage,
    variantCount,
    executionMode,
    reusePreviousOutputAsInput,
    operationMode,
    sourceAssetId,
    matrixQuery,
    discoveryNotes,
    castRows: castRows.map((row) => ({ ...row })),
    guidanceRefRows: guidanceRefRows.map((row) => ({ ...row })),
    candidateAssets: candidateAssets.map((row) => ({ ...row })),
    variantRows: variantRows.map((row) => ({ ...row })),
    launchHistory: launchHistory.map((row) => ({ ...row })),
    stageHandoff: stageHandoff ? { ...stageHandoff } : null,
  }), [
    basePrompt,
    candidateAssets,
    castRows,
    discoveryNotes,
    executionMode,
    guidanceRefRows,
    launchHistory,
    matrixQuery,
    operationMode,
    providerId,
    reusePreviousOutputAsInput,
    sceneName,
    sourceAssetId,
    stage,
    stageHandoff,
    templateId,
    variantCount,
    variantRows,
  ]);

  const applySceneArtifactPrepState = useCallback((prep: SceneArtifactPrepState) => {
    setTemplateId(typeof prep.templateId === 'string' ? prep.templateId : '');
    setProviderId(typeof prep.providerId === 'string' ? prep.providerId : 'pixverse');
    setBasePrompt(typeof prep.basePrompt === 'string' ? prep.basePrompt : '');
    setSceneName(typeof prep.sceneName === 'string' ? prep.sceneName : '');
    setStage(isScenePrepStage(prep.stage) ? prep.stage : 'custom');
    setVariantCount(typeof prep.variantCount === 'string' ? prep.variantCount : '4');
    setExecutionMode(prep.executionMode === 'sequential' ? 'sequential' : 'fanout');
    setReusePreviousOutputAsInput(Boolean(prep.reusePreviousOutputAsInput));
    setOperationMode(
      prep.operationMode === 'text_to_image' || prep.operationMode === 'image_to_image' || prep.operationMode === 'auto'
        ? prep.operationMode
        : 'auto',
    );
    setSourceAssetId(typeof prep.sourceAssetId === 'string' ? prep.sourceAssetId : '');
    setMatrixQuery(typeof prep.matrixQuery === 'string' ? prep.matrixQuery : '');
    setDiscoveryNotes(typeof prep.discoveryNotes === 'string' ? prep.discoveryNotes : '');
    setCastRows(normalizeCastRows(prep.castRows));
    setGuidanceRefRows(normalizeGuidanceRefRows(prep.guidanceRefRows));
    setCandidateAssets(normalizeCandidateRows(prep.candidateAssets));
    setVariantRows(normalizeVariantRows(prep.variantRows));
    setLaunchHistory(normalizeLaunchHistoryRows(prep.launchHistory));
    setStageHandoff(normalizeStageHandoff(prep.stageHandoff));
  }, []);

  const saveSceneArtifact = useCallback(() => {
    const title = (artifactTitle.trim() || sceneName.trim() || 'Untitled Scene').slice(0, 120);
    const id = upsertPrepArtifact({
      artifactId: currentSceneArtifactId,
      title,
      status: scenePrepStageToArtifactStatus(stage),
      prep: buildSceneArtifactPrepState(),
      metadata: {
        source: 'scene-prep',
      },
    });
    setCurrentSceneArtifact(id);
    setArtifactTitle(title);
    setError(null);
    setStatus(
      currentSceneArtifactId
        ? `Updated Scene Artifact "${title}".`
        : `Saved new Scene Artifact "${title}".`,
    );
  }, [
    artifactTitle,
    buildSceneArtifactPrepState,
    currentSceneArtifactId,
    sceneName,
    setCurrentSceneArtifact,
    stage,
    upsertPrepArtifact,
  ]);

  const loadSceneArtifact = useCallback((artifactId?: string | null) => {
    const targetId = artifactId ?? currentSceneArtifactId;
    if (!targetId) {
      setError('Select a Scene Artifact to load.');
      return;
    }
    const artifact = getSceneArtifact(targetId);
    if (!artifact) {
      setError('Scene Artifact not found.');
      return;
    }
    applySceneArtifactPrepState(artifact.prep);
    setCurrentSceneArtifact(targetId);
    setArtifactTitle(artifact.title || 'Untitled Scene');
    setError(null);
    setStatus(`Loaded Scene Artifact "${artifact.title}".`);
  }, [applySceneArtifactPrepState, currentSceneArtifactId, getSceneArtifact, setCurrentSceneArtifact]);

  const resetSceneArtifactSelection = useCallback(() => {
    setCurrentSceneArtifact(null);
    setArtifactTitle(sceneName.trim() || 'Untitled Scene');
    setStatus('Started a new Scene Artifact draft (unlinked).');
    setError(null);
  }, [sceneName, setCurrentSceneArtifact]);

  const removeCurrentSceneArtifact = useCallback(() => {
    if (!currentSceneArtifactId) {
      setError('No Scene Artifact selected to delete.');
      return;
    }
    const artifact = getSceneArtifact(currentSceneArtifactId);
    deleteSceneArtifact(currentSceneArtifactId);
    setCurrentSceneArtifact(null);
    setStatus(`Deleted Scene Artifact "${artifact?.title || currentSceneArtifactId}".`);
    setError(null);
  }, [currentSceneArtifactId, deleteSceneArtifact, getSceneArtifact, setCurrentSceneArtifact]);

  const patchCastRow = useCallback((id: string, patch: Partial<ScenePrepCastRow>) => {
    setCastRows((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }, []);
  const patchGuidanceRow = useCallback((id: string, patch: Partial<ScenePrepGuidanceRefRow>) => {
    setGuidanceRefRows((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }, []);
  const patchCandidateRow = useCallback((id: string, patch: Partial<ScenePrepCandidateAssetRow>) => {
    setCandidateAssets((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }, []);
  const patchVariantRow = useCallback((id: string, patch: Partial<ScenePrepVariantRow>) => {
    setVariantRows((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }, []);

  const applyStageDefaults = useCallback((nextStage: ScenePrepStage) => {
    const defaults = SCENE_PREP_STAGE_DEFAULTS[nextStage];
    setVariantCount(String(defaults.variantCount));
    setExecutionMode(defaults.executionMode);
    setReusePreviousOutputAsInput(defaults.reusePreviousOutputAsInput);
  }, []);

  const handleStageChange = useCallback((nextStage: ScenePrepStage) => {
    setStage(nextStage);
    applyStageDefaults(nextStage);
  }, [applyStageDefaults]);

  const handleExecutionModeChange = useCallback((nextMode: ScenePrepExecutionMode) => {
    setExecutionMode(nextMode);
    if (nextMode !== 'sequential') {
      setReusePreviousOutputAsInput(false);
    }
  }, []);

  const selectionAssetIds = useMemo(() => {
    const ids = new Set<string>();
    const rows = Array.isArray(assetSelection?.assets) ? assetSelection.assets : [];
    for (const asset of rows) {
      const id = Number((asset as any)?.id);
      if (Number.isFinite(id)) ids.add(String(Math.trunc(id)));
    }
    const currentId = Number((assetSelection as any)?.asset?.id);
    if (Number.isFinite(currentId)) ids.add(String(Math.trunc(currentId)));
    return Array.from(ids);
  }, [assetSelection]);

  const currentSelectionAssetId = useMemo(() => {
    const id = Number((assetSelection as any)?.asset?.id);
    return Number.isFinite(id) ? String(Math.trunc(id)) : null;
  }, [assetSelection]);

  const appendImportedCandidates = useCallback((assetIds: string[]) => {
    const normalized = assetIds
      .map((id) => String(id).trim())
      .filter(Boolean);
    if (normalized.length === 0) return 0;

    let added = 0;
    setCandidateAssets((rows) => {
      const existingIds = new Set(rows.map((row) => row.asset_id.trim()).filter(Boolean));
      const next = [...rows];
      for (const assetId of normalized) {
        if (existingIds.has(assetId)) continue;
        existingIds.add(assetId);
        next.unshift({
          id: nextRowId('candidate'),
          asset_id: assetId,
          group: candidateImportGroup,
          note: '',
        });
        added += 1;
      }
      return next;
    });
    return added;
  }, [candidateImportGroup]);

  const importSelectedAssetsToCandidates = useCallback(() => {
    const added = appendImportedCandidates(selectionAssetIds);
    if (added <= 0) {
      setStatus('No new selected assets to import.');
      return;
    }
    setError(null);
    setStatus(`Imported ${added} asset${added === 1 ? '' : 's'} into ${candidateImportGroup} candidates.`);
  }, [appendImportedCandidates, candidateImportGroup, selectionAssetIds]);

  const importCurrentAssetToCandidates = useCallback(() => {
    if (!currentSelectionAssetId) {
      setStatus('No current asset available to import.');
      return;
    }
    const added = appendImportedCandidates([currentSelectionAssetId]);
    if (added <= 0) {
      setStatus('Current asset is already in candidates.');
      return;
    }
    setError(null);
    setStatus(`Imported current asset ${currentSelectionAssetId} into ${candidateImportGroup} candidates.`);
  }, [appendImportedCandidates, candidateImportGroup, currentSelectionAssetId]);

  const applyActiveCharacterAsLead = useCallback(() => {
    if (!activeCharacter) return;
    const id = activeCharacter.characterId;
    setCastRows((rows) => {
      const existingLead = rows.find((row) => row.role.trim() === 'lead');
      if (existingLead) {
        return rows.map((row) => (row.id === existingLead.id ? { ...row, character_id: id } : row));
      }
      return [createDefaultCastRow('lead', id), ...rows];
    });
    setSceneName((prev) => prev || `${activeCharacter.displayName || activeCharacter.name || id} scene prep`);
    setBasePrompt((prev) => prev || `${activeCharacter.displayName || activeCharacter.name || id} in a scene`);
  }, [activeCharacter]);

  const addLeadIdentityGuidanceFromSource = useCallback(() => {
    const id = sourceAssetId.trim();
    if (!id) return;
    setGuidanceRefRows((rows) => {
      const existing = rows.find((row) => row.key.trim() === 'identity');
      if (existing) {
        return rows.map((row) => (
          row.id === existing.id ? { ...row, asset_id: id, kind: row.kind || 'identity', label: row.label || 'Lead identity' } : row
        ));
      }
      return [{ ...createDefaultGuidanceRef(), key: 'identity', asset_id: id, kind: 'identity', label: 'Lead identity' }, ...rows];
    });
  }, [sourceAssetId]);

  const openBlockMatrix = useCallback(() => {
    openWorkspacePanel('block-matrix');
  }, []);

  const applySelectedAssetAsStageSource = useCallback((options?: { advanceStage?: boolean }) => {
    if (!currentSelectionAssetId) {
      setError('No selected asset to use as source. Select a generated output first.');
      return;
    }
    const sourceLaunch = latestLaunch;
    const fromStage = sourceLaunch?.stage ?? stage;
    const fromLaunchId = sourceLaunch?.launchId ?? 'manual_selection';

    setSourceAssetId(currentSelectionAssetId);
    setOperationMode((prev) => (prev === 'text_to_image' ? 'auto' : prev));
    setStageHandoff({
      sourceAssetId: currentSelectionAssetId,
      fromStage,
      fromLaunchId,
      capturedAtMs: Date.now(),
    });

    if (options?.advanceStage) {
      const next = getNextScenePrepStage(fromStage);
      if (next) {
        handleStageChange(next);
        setStatus(`Using selected asset ${currentSelectionAssetId} as source and prefilling next stage (${next}) from ${fromStage}.`);
      } else {
        setStatus(`Using selected asset ${currentSelectionAssetId} as source (no next-stage preset after ${fromStage}; staying on current stage).`);
      }
    } else {
      setStatus(`Using selected asset ${currentSelectionAssetId} as source for next launch (${fromStage} handoff).`);
    }
    setError(null);
  }, [currentSelectionAssetId, handleStageChange, latestLaunch, stage]);

  const prefillNextStage = useCallback(() => {
    const sourceStage = stageHandoff?.fromStage ?? latestLaunch?.stage ?? stage;
    const next = getNextScenePrepStage(sourceStage);
    if (!next) {
      setStatus(`No automatic next-stage preset after ${sourceStage}. Switch stage manually if needed.`);
      return;
    }
    handleStageChange(next);
    setError(null);
    setStatus(`Prefilled next stage preset: ${sourceStage} -> ${next}.`);
  }, [handleStageChange, latestLaunch, stage, stageHandoff]);

  const clearStageHandoff = useCallback(() => {
    setStageHandoff(null);
    setStatus('Cleared stage handoff source.');
    setError(null);
  }, []);

  const applyHostPrefill = useCallback(() => {
    if (!effectiveHostPrefill) return;
    if (effectiveHostPrefill.sceneName) setSceneName(effectiveHostPrefill.sceneName);
    if (effectiveHostPrefill.basePrompt) setBasePrompt(effectiveHostPrefill.basePrompt);
    if (effectiveHostPrefill.sourceAssetId != null) setSourceAssetId(String(effectiveHostPrefill.sourceAssetId));
    if (typeof effectiveHostPrefill.matrixQuery === 'string') setMatrixQuery(effectiveHostPrefill.matrixQuery);
    if (typeof effectiveHostPrefill.discoveryNotes === 'string') setDiscoveryNotes(effectiveHostPrefill.discoveryNotes);
    setCastRows(buildCastRowsFromPrefill(effectiveHostPrefill));
    setGuidanceRefRows(buildGuidanceRowsFromPrefill(effectiveHostPrefill));
  }, [effectiveHostPrefill]);

  const applyDefaultDraft = useCallback(() => {
    const next = buildDefaultDraft({
      initialTemplateId,
      initialProviderId,
      initialBasePrompt,
      prefill: effectiveHostPrefill,
    });
    setTemplateId(next.templateId);
    setProviderId(next.providerId);
    setBasePrompt(next.basePrompt);
    setSceneName(next.sceneName);
    setStage(next.stage);
    setVariantCount(next.variantCount);
    setExecutionMode(next.executionMode);
    setReusePreviousOutputAsInput(next.reusePreviousOutputAsInput);
    setOperationMode(next.operationMode);
    setSourceAssetId(next.sourceAssetId);
    setMatrixQuery(next.matrixQuery);
    setDiscoveryNotes(next.discoveryNotes);
    setCastRows(next.castRows);
    setGuidanceRefRows(next.guidanceRefRows);
    setCandidateAssets(next.candidateAssets);
    setVariantRows(next.variantRows);
    setLaunchHistory([]);
    setStageHandoff(null);
    setArtifactTitle(next.sceneName || 'Untitled Scene');
    setStatus(null);
    setError(null);
  }, [effectiveHostPrefill, initialBasePrompt, initialProviderId, initialTemplateId]);

  const clearSavedDraft = useCallback(() => {
    if (!effectiveDraftPersistenceKey) return;
    try {
      localStorage.removeItem(effectiveDraftPersistenceKey);
    } catch {
      // ignore
    }
  }, [effectiveDraftPersistenceKey]);

  useEffect(() => {
    if (!effectiveDraftPersistenceKey) return;
    const persisted = readScenePrepDraft(effectiveDraftPersistenceKey);
    if (!persisted) return;
    setTemplateId(persisted.templateId);
    setProviderId(persisted.providerId);
    setBasePrompt(persisted.basePrompt);
    setSceneName(persisted.sceneName);
    setStage(persisted.stage);
    setVariantCount(persisted.variantCount);
    setExecutionMode(persisted.executionMode);
    setReusePreviousOutputAsInput(persisted.reusePreviousOutputAsInput);
    setOperationMode(persisted.operationMode);
    setSourceAssetId(persisted.sourceAssetId);
    setMatrixQuery(persisted.matrixQuery);
    setDiscoveryNotes(persisted.discoveryNotes);
    setCastRows(persisted.castRows);
    setGuidanceRefRows(persisted.guidanceRefRows);
    setCandidateAssets(persisted.candidateAssets);
    setVariantRows(persisted.variantRows);
    setStatus(null);
    setError(null);
  }, [effectiveDraftPersistenceKey]);

  useEffect(() => {
    if (!effectiveDraftPersistenceKey) return;
    writeScenePrepDraft(effectiveDraftPersistenceKey, {
      templateId,
      providerId,
      basePrompt,
      sceneName,
      stage,
      variantCount,
      executionMode,
      reusePreviousOutputAsInput,
      operationMode,
      sourceAssetId,
      matrixQuery,
      discoveryNotes,
      castRows,
      guidanceRefRows,
      candidateAssets,
      variantRows,
    });
  }, [
    effectiveDraftPersistenceKey,
    templateId,
    providerId,
    basePrompt,
    sceneName,
    stage,
    variantCount,
    executionMode,
    reusePreviousOutputAsInput,
    operationMode,
    sourceAssetId,
    matrixQuery,
    discoveryNotes,
    castRows,
    guidanceRefRows,
    candidateAssets,
    variantRows,
  ]);

  const launchScenePrep = useCallback(async () => {
    const trimmedTemplateId = templateId.trim();
    const trimmedProviderId = providerId.trim();
    const trimmedBasePrompt = basePrompt.trim();
    const countRaw = Number(variantCount);
    const count = Number.isFinite(countRaw) ? Math.max(1, Math.min(16, Math.floor(countRaw))) : 4;

    if (!trimmedTemplateId) {
      setError('Enter a template ID/slug.');
      return;
    }
    if (!trimmedProviderId) {
      setError('Enter a provider ID.');
      return;
    }
    if (!trimmedBasePrompt) {
      setError('Enter a base prompt.');
      return;
    }

    const prepName = sceneName.trim() || trimmedBasePrompt.slice(0, 64);
    const sceneKey = slugifyTagPart(prepName || trimmedBasePrompt);
    const rows = buildScenePrepRows({
      basePrompt: trimmedBasePrompt,
      count,
      stage,
      variants: variantRows,
      sceneKey,
      candidateAssets,
    });
    const launchId = createScenePrepLaunchId();

    const candidateSummary = candidateAssets
      .filter((row) => row.asset_id.trim())
      .map((row) => ({
        asset_id: toNumericAssetId(row.asset_id) ?? row.asset_id.trim(),
        group: row.group,
        ...(row.note?.trim() ? { note: row.note.trim() } : {}),
      }));

    const commonRunContext: Record<string, unknown> = {
      mode: 'scene_prep_batch',
      scene_prep_schema_version: 2,
      scene_prep_stage: stage,
      scene_prep_launch_id: launchId,
      scene_prep_name: prepName,
      scene_key: sceneKey || null,
      scene_prompt_base: trimmedBasePrompt,
      matrix_query: matrixQuery.trim() || null,
      discovery_notes: discoveryNotes.trim() || null,
      ...(Object.keys(characterBindings).length > 0 ? { character_bindings: characterBindings } : {}),
      ...(guidancePlan ? { guidance_plan: guidancePlan } : {}),
      ...(candidateSummary.length > 0 ? { scene_prep_candidates: candidateSummary } : {}),
      ...(stageHandoff ? {
        scene_prep_handoff: {
          source_asset_id: toNumericAssetId(stageHandoff.sourceAssetId) ?? stageHandoff.sourceAssetId,
          from_stage: stageHandoff.fromStage,
          from_launch_id: stageHandoff.fromLaunchId,
          captured_at_ms: stageHandoff.capturedAtMs,
        },
      } : {}),
    };

    const commonExtraParams: Record<string, unknown> = {};
    if (resolvedOperation === 'image_to_image' && resolvedSourceAssetId != null) {
      commonExtraParams.source_asset_id = resolvedSourceAssetId;
    }

    setSubmitting(true);
    setError(null);
    setStatus(`Starting scene prep batch (${rows.length} items)...`);
    try {
      const request = compileTemplateFanoutRequest({
        templateId: trimmedTemplateId,
        providerId: trimmedProviderId,
        defaultOperation: resolvedOperation,
        continueOnError: true,
        executionPolicy: executionMode === 'sequential'
          ? buildBackendEachExecutionPolicy({
            onError: 'continue',
            executionMode: 'sequential',
            reusePreviousOutputAsInput: effectiveReusePrevious,
          })
          : buildBackendFanoutExecutionPolicy({ onError: 'continue' }),
        nodeLabel: prepName || 'Scene Prep Batch',
        commonExtraParams,
        commonRunContext,
        inputs: rows,
        executionMetadata: {
          launch_kind: 'scene_prep_panel',
          scene_key: sceneKey || null,
          prep_name: prepName,
          scene_prep_stage: stage,
          scene_prep_launch_id: launchId,
        },
      });

      const result = await executeTrackedTemplateFanoutRequest({
        request,
        pollIntervalMs: 2000,
        onProgress: (progress) => {
          setStatus(`Submitting scene prep ${progress.queued}/${progress.total}`);
        },
      });

      setLaunchHistory((prev) => [
        {
          id: nextRowId('launch'),
          launchId,
          stage,
          createdAtMs: Date.now(),
          estimatedRows: rows.length,
          executionMode,
          reusePreviousOutputAsInput: effectiveReusePrevious,
          sourceAssetId: resolvedSourceAssetId,
          executionId: result.execution.id,
          generationCount: result.generationIds.length,
        },
        ...prev,
      ].slice(0, 12));
      setStatus(`Scene prep launched (${result.generationIds.length} generations, execution ${result.execution.id})`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to launch scene prep batch');
    } finally {
      setSubmitting(false);
    }
  }, [
    templateId,
    providerId,
    basePrompt,
    variantCount,
    sceneName,
    variantRows,
    candidateAssets,
    stage,
    executionMode,
    effectiveReusePrevious,
    matrixQuery,
    discoveryNotes,
    characterBindings,
    guidancePlan,
    resolvedOperation,
    resolvedSourceAssetId,
    stageHandoff,
  ]);

  const candidateCount = candidateAssets.filter((row) => row.asset_id.trim()).length;
  const castCount = Object.keys(characterBindings).length;
  const guidanceRefCount = guidanceRefRows.filter((row) => row.key.trim() && row.asset_id.trim()).length;

  return (
    <div className="space-y-4 p-2">
      <div className="rounded border border-neutral-700/50 bg-neutral-850 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-medium text-neutral-200">Scene Prep (Experimental)</h3>
          <Badge color="blue">prep</Badge>
          <Badge color="gray">template fanout</Badge>
          {activeCharacterLabel && <Badge color="green">active char: {activeCharacterLabel}</Badge>}
        </div>
        <p className="mt-1 text-xs text-neutral-500">
          Hostable pre-batch composition workspace. Reuses template fanout execution plus run-context provenance, while keeping discovery/candidate curation separate from launch.
        </p>
      </div>

      <DisclosureSection label={<span className="text-sm">Prep Setup</span>} defaultOpen size="sm" bordered>
        <div className="space-y-2.5 pt-1">
          <FormField label="Prep Name" size="sm">
            <Input size="sm" value={sceneName} onChange={(e) => setSceneName(e.target.value)} placeholder="e.g. Anne + friend at cafe (rainy evening)" />
          </FormField>
          <FormField label="Template ID / Slug" size="sm">
            <Input size="sm" value={templateId} onChange={(e) => setTemplateId(e.target.value)} placeholder="e.g. scene-pack-v1" />
          </FormField>
          <FormField label="Base Prompt" size="sm">
            <Input size="sm" value={basePrompt} onChange={(e) => setBasePrompt(e.target.value)} placeholder="Describe the scene base prompt" />
          </FormField>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <FormField label="Stage" size="sm">
              <Select size="sm" value={stage} onChange={(e) => handleStageChange(e.target.value as ScenePrepStage)}>
                <option value="explore">Explore</option>
                <option value="compose">Compose</option>
                <option value="refine">Refine</option>
                <option value="custom">Custom</option>
              </Select>
            </FormField>
            <FormField label="Provider" size="sm">
              <Input size="sm" value={providerId} onChange={(e) => setProviderId(e.target.value)} placeholder="pixverse" />
            </FormField>
            <FormField label="Variant Count (1-16)" size="sm">
              <Input size="sm" type="number" min={1} max={16} value={variantCount} onChange={(e) => setVariantCount(e.target.value)} />
            </FormField>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <FormField label="Operation Mode" size="sm">
              <Select size="sm" value={operationMode} onChange={(e) => setOperationMode(e.target.value as PrepOperationMode)}>
                <option value="auto">Auto (use source if available)</option>
                <option value="text_to_image">Text to Image</option>
                <option value="image_to_image">Image to Image</option>
              </Select>
            </FormField>
            <FormField label="Source Asset ID (optional)" size="sm">
              <Input size="sm" value={sourceAssetId} onChange={(e) => setSourceAssetId(e.target.value)} placeholder="Numeric asset ID for i2i" />
            </FormField>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {effectiveDraftPersistenceKey && (
              <Badge color="gray">draft:{effectiveDraftPersistenceKey}</Badge>
            )}
            {effectiveHostPrefill && (
              <Button size="xs" variant="ghost" onClick={applyHostPrefill}>
                {hostPrefill ? 'Apply Host Prefill' : 'Prefill from Character Slots'}
              </Button>
            )}
            {activeCharacter && (
              <Button size="xs" variant="ghost" onClick={applyActiveCharacterAsLead}>Use Active Character as Lead</Button>
            )}
            <Button size="xs" variant="ghost" onClick={addLeadIdentityGuidanceFromSource} disabled={!sourceAssetId.trim()}>
              Add Source as Identity Ref
            </Button>
            <span className="text-neutral-500">
              Resolved mode: <span className="text-neutral-300">{resolvedOperation}</span>
              {resolvedSourceAssetId != null && <span className="text-neutral-500"> (source asset {resolvedSourceAssetId})</span>}
            </span>
          </div>
        </div>
      </DisclosureSection>

      <DisclosureSection label={<span className="text-sm">Scene Artifact</span>} defaultOpen={false} size="sm" bordered>
        <div className="space-y-2.5 pt-1">
          <p className="text-xs text-neutral-500">
            Save this prep state as a reusable <code>SceneArtifact</code> (non-game scene record). This stays separate from <code>GameScene</code>.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <FormField label="Artifact Title" size="sm">
              <Input
                size="sm"
                value={artifactTitle}
                onChange={(e) => setArtifactTitle(e.target.value)}
                placeholder="Scene Artifact title"
              />
            </FormField>
            <FormField label="Artifact" size="sm">
              <Select
                size="sm"
                value={currentSceneArtifactId || ''}
                onChange={(e) => setCurrentSceneArtifact(e.target.value || null)}
              >
                <option value="">(new / unlinked)</option>
                {sceneArtifacts.map((artifact) => (
                  <option key={artifact.id} value={artifact.id}>
                    {artifact.title} · {artifact.status}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="xs" onClick={saveSceneArtifact}>Save Scene Artifact</Button>
            <Button size="xs" variant="ghost" onClick={() => loadSceneArtifact()} disabled={!currentSceneArtifactId}>
              Load Artifact
            </Button>
            <Button size="xs" variant="ghost" onClick={resetSceneArtifactSelection}>
              New Artifact Draft
            </Button>
            <Button size="xs" variant="ghost" onClick={removeCurrentSceneArtifact} disabled={!currentSceneArtifactId}>
              Delete Artifact
            </Button>
            <span className="text-xs text-neutral-500">
              Total artifacts: <span className="text-neutral-300">{sceneArtifacts.length}</span>
            </span>
          </div>
          {selectedSceneArtifact && (
            <div className="rounded border border-neutral-700/40 bg-neutral-800/20 p-2 text-xs text-neutral-400">
              <div className="flex flex-wrap items-center gap-2">
                <Badge color="gray">{selectedSceneArtifact.status}</Badge>
                <span>updated {new Date(selectedSceneArtifact.updatedAt).toLocaleString()}</span>
                {selectedSceneArtifact.gameSceneId && (
                  <span className="text-neutral-500">· game scene {selectedSceneArtifact.gameSceneId}</span>
                )}
              </div>
              <div className="mt-1 text-[11px] text-neutral-500">
                Artifact ID: {selectedSceneArtifact.id}
              </div>
            </div>
          )}
        </div>
      </DisclosureSection>

      <DisclosureSection label={<span className="text-sm">Cast (Character Bindings)</span>} defaultOpen={false} size="sm" bordered>
        <div className="space-y-2.5 pt-1">
          <p className="text-xs text-neutral-500">
            Reuses template character bindings schema (<code>role -&gt; character_id</code>). This is the multi-character cast layer for scene prep.
          </p>
          {castRows.map((row) => (
            <div key={row.id} className="grid grid-cols-1 gap-2 rounded border border-neutral-700/40 bg-neutral-800/20 p-2 sm:grid-cols-[1fr_1fr_auto]">
              <Input size="sm" value={row.role} onChange={(e) => patchCastRow(row.id, { role: e.target.value })} placeholder="role (lead, support, bartender)" />
              <Input size="sm" value={row.character_id} onChange={(e) => patchCastRow(row.id, { character_id: e.target.value })} placeholder="character_id" />
              <Button size="xs" variant="ghost" onClick={() => setCastRows((rows) => rows.filter((r) => r.id !== row.id))}>Remove</Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="xs" variant="ghost" onClick={() => setCastRows((rows) => [...rows, createDefaultCastRow('', '')])}>+ Add Cast Role</Button>
            <span className="text-xs text-neutral-500">Active bindings: <span className="text-neutral-300">{castCount}</span></span>
          </div>
        </div>
      </DisclosureSection>

      <DisclosureSection label={<span className="text-sm">Discovery / Matrix Query</span>} defaultOpen={false} size="sm" bordered>
        <div className="space-y-2.5 pt-1">
          <p className="text-xs text-neutral-500">
            Prep-phase discovery notes and candidate curation. Use Block Matrix for coverage/gap checks, then record the query and selected asset candidates here before launching.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="xs" onClick={openBlockMatrix}>Open Block Matrix</Button>
            <Select
              size="sm"
              value={candidateImportGroup}
              onChange={(e) => setCandidateImportGroup(e.target.value as CandidateGroup)}
            >
              {CANDIDATE_GROUP_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
            <Button size="xs" variant="ghost" onClick={importSelectedAssetsToCandidates} disabled={selectionAssetIds.length === 0}>
              Import Selected Assets
            </Button>
            <Button size="xs" variant="ghost" onClick={importCurrentAssetToCandidates} disabled={!currentSelectionAssetId}>
              Import Current Asset
            </Button>
            <span className="text-xs text-neutral-500">Keeps prep separate from execution while preserving provenance.</span>
          </div>
          <FormField label="Matrix Query / Filters (notes)" size="sm">
            <textarea
              className="min-h-[70px] w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-200 outline-none"
              value={matrixQuery}
              onChange={(e) => setMatrixQuery(e.target.value)}
              placeholder="e.g. role:location + mood:cozy + time:evening + surface:reference"
            />
          </FormField>
          <FormField label="Discovery Notes" size="sm">
            <textarea
              className="min-h-[70px] w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-200 outline-none"
              value={discoveryNotes}
              onChange={(e) => setDiscoveryNotes(e.target.value)}
              placeholder="What assets/coverage are still missing? What to generate next?"
            />
          </FormField>
          <div className="space-y-2">
            <div className="text-xs font-medium text-neutral-300">Candidate Assets</div>
            {candidateAssets.map((row) => (
              <div key={row.id} className="grid grid-cols-1 gap-2 rounded border border-neutral-700/40 bg-neutral-800/20 p-2 sm:grid-cols-[1.2fr_0.9fr_1fr_auto]">
                <Input size="sm" value={row.asset_id} onChange={(e) => patchCandidateRow(row.id, { asset_id: e.target.value })} placeholder="asset_id" />
                <Select size="sm" value={row.group} onChange={(e) => patchCandidateRow(row.id, { group: e.target.value as CandidateGroup })}>
                  {CANDIDATE_GROUP_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </Select>
                <Input size="sm" value={row.note || ''} onChange={(e) => patchCandidateRow(row.id, { note: e.target.value })} placeholder="note (location alt, palette, prop)" />
                <Button size="xs" variant="ghost" onClick={() => setCandidateAssets((rows) => rows.filter((r) => r.id !== row.id))}>Remove</Button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Button size="xs" variant="ghost" onClick={() => setCandidateAssets((rows) => [...rows, createDefaultCandidate()])}>+ Add Candidate</Button>
              <span className="text-xs text-neutral-500">Selected candidates: <span className="text-neutral-300">{candidateCount}</span></span>
            </div>
          </div>
        </div>
      </DisclosureSection>

      <DisclosureSection label={<span className="text-sm">Guidance References</span>} defaultOpen={false} size="sm" bordered>
        <div className="space-y-2.5 pt-1">
          <p className="text-xs text-neutral-500">
            Named asset bindings reused via <code>GuidancePlanV1</code> (e.g. <code>identity</code>, <code>location_primary</code>, <code>style_look</code>, <code>pose_neutral</code>).
          </p>
          {guidanceRefRows.map((row) => (
            <div key={row.id} className="space-y-2 rounded border border-neutral-700/40 bg-neutral-800/20 p-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_0.8fr_auto]">
                <Input size="sm" value={row.key} onChange={(e) => patchGuidanceRow(row.id, { key: e.target.value })} placeholder="binding key" />
                <Input size="sm" value={row.asset_id} onChange={(e) => patchGuidanceRow(row.id, { asset_id: e.target.value })} placeholder="asset_id" />
                <Input size="sm" value={row.kind} onChange={(e) => patchGuidanceRow(row.id, { kind: e.target.value })} placeholder="kind (identity/location/style)" />
                <Button size="xs" variant="ghost" onClick={() => setGuidanceRefRows((rows) => rows.filter((r) => r.id !== row.id))}>Remove</Button>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_0.4fr]">
                <Input size="sm" value={row.label || ''} onChange={(e) => patchGuidanceRow(row.id, { label: e.target.value })} placeholder="label (optional)" />
                <Input size="sm" value={row.priority || ''} onChange={(e) => patchGuidanceRow(row.id, { priority: e.target.value })} placeholder="priority" />
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Button size="xs" variant="ghost" onClick={() => setGuidanceRefRows((rows) => [...rows, createDefaultGuidanceRef()])}>+ Add Guidance Ref</Button>
            <span className="text-xs text-neutral-500">Bound refs: <span className="text-neutral-300">{guidanceRefCount}</span></span>
          </div>
        </div>
      </DisclosureSection>

      <DisclosureSection label={<span className="text-sm">Variant Plan</span>} defaultOpen={false} size="sm" bordered>
        <div className="space-y-2.5 pt-1">
          <p className="text-xs text-neutral-500">
            Prompt suffix variants are cycled to fill the requested variant count. This stays prep-level; execution is compiled to template fanout rows at launch.
          </p>
          {variantRows.map((row) => (
            <div key={row.id} className="space-y-2 rounded border border-neutral-700/40 bg-neutral-800/20 p-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[0.8fr_1fr_auto]">
                <Input size="sm" value={row.key} onChange={(e) => patchVariantRow(row.id, { key: e.target.value })} placeholder="key" />
                <Input size="sm" value={row.label} onChange={(e) => patchVariantRow(row.id, { label: e.target.value })} placeholder="label" />
                <Button size="xs" variant="ghost" onClick={() => setVariantRows((rows) => rows.filter((r) => r.id !== row.id))}>Remove</Button>
              </div>
              <Input size="sm" value={row.promptSuffix} onChange={(e) => patchVariantRow(row.id, { promptSuffix: e.target.value })} placeholder="prompt suffix" />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Select size="sm" value={row.shot || ''} onChange={(e) => patchVariantRow(row.id, { shot: e.target.value || undefined })}>
                  <option value="">Shot...</option>
                  {SHOT_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
                </Select>
                <Select size="sm" value={row.view || ''} onChange={(e) => patchVariantRow(row.id, { view: e.target.value || undefined })}>
                  <option value="">View...</option>
                  {VIEW_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
                </Select>
                <Input size="sm" value={row.state || ''} onChange={(e) => patchVariantRow(row.id, { state: e.target.value || undefined })} placeholder="state (optional)" />
              </div>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="xs" variant="ghost" onClick={() => setVariantRows((rows) => [...rows, { id: nextRowId('variant'), key: '', label: '', promptSuffix: '' }])}>+ Add Variant</Button>
            <Button size="xs" variant="ghost" onClick={() => setVariantRows(createDefaultVariants())}>Reset Defaults</Button>
          </div>
        </div>
      </DisclosureSection>

      <DisclosureSection label={<span className="text-sm">Launch</span>} defaultOpen size="sm" bordered>
        <div className="space-y-2.5 pt-1">
          <div className="rounded border border-neutral-700/40 bg-neutral-800/20 p-2 text-xs text-neutral-400">
            <div className="flex flex-wrap items-center gap-2">
              <span>Cast: <span className="text-neutral-200">{castCount}</span></span>
              <span>Guidance refs: <span className="text-neutral-200">{guidanceRefCount}</span></span>
              <span>Candidates: <span className="text-neutral-200">{candidateCount}</span></span>
              <span>Stage: <span className="text-neutral-200">{stage}</span></span>
            </div>
            <div className="mt-1">
              Execution compiles to backend raw-item template fanout and records prep metadata in <code>run_context</code>.
            </div>
          </div>

          <div className="rounded border border-neutral-700/40 bg-neutral-800/20 p-2 text-xs text-neutral-400">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-neutral-300">Stage handoff</span>
              {stageHandoff ? (
                <>
                  <Badge color="green">source {stageHandoff.sourceAssetId}</Badge>
                  <Badge color="gray">{stageHandoff.fromStage}</Badge>
                  <Badge color="gray">launch {shortId(stageHandoff.fromLaunchId)}</Badge>
                </>
              ) : (
                <span>No handoff source selected.</span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Button size="xs" variant="ghost" onClick={() => applySelectedAssetAsStageSource()} disabled={!currentSelectionAssetId}>
                Use Selected Asset as Next-Stage Source
              </Button>
              <Button size="xs" variant="ghost" onClick={() => applySelectedAssetAsStageSource({ advanceStage: true })} disabled={!currentSelectionAssetId}>
                Use Selected + Prefill Next Stage
              </Button>
              <Button size="xs" variant="ghost" onClick={prefillNextStage} disabled={!nextStageSuggestion && !(stageHandoff || latestLaunch)}>
                Prefill Next Stage
              </Button>
              <Button size="xs" variant="ghost" onClick={clearStageHandoff} disabled={!stageHandoff}>
                Clear Handoff
              </Button>
            </div>
            <div className="mt-1 text-[11px] text-neutral-500">
              Select an output asset in the gallery, then use it as the next stage source. Handoff metadata is recorded in <code>run_context</code> (no tags are auto-applied).
            </div>
          </div>

          <div className="rounded border border-neutral-700/40 bg-neutral-800/20 p-2 text-xs text-neutral-400">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-neutral-300">Stage Launch History (session)</span>
              <span className="text-[11px] text-neutral-500">latest {launchHistory.length} launches</span>
            </div>
            {launchHistory.length === 0 ? (
              <div className="text-[11px] text-neutral-500">
                Launches will appear here so you can hand off outputs into later stages.
              </div>
            ) : (
              <div className="space-y-1.5">
                {launchHistory.map((entry) => (
                  <div key={entry.id} className="rounded border border-neutral-700/30 bg-neutral-900/20 px-2 py-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge color="gray">{entry.stage}</Badge>
                      <span className="text-neutral-200">launch {shortId(entry.launchId)}</span>
                      {typeof entry.executionId === 'number' && <span>exec {entry.executionId}</span>}
                      {typeof entry.generationCount === 'number' && <span>{entry.generationCount} gens</span>}
                    </div>
                    <div className="mt-0.5 text-[11px] text-neutral-500">
                      rows {entry.estimatedRows} · {entry.executionMode}
                      {entry.reusePreviousOutputAsInput ? ' · chain prev' : ''}
                      {entry.sourceAssetId != null ? ` · src ${entry.sourceAssetId}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <FormField label="Execution Mode" size="sm">
              <Select
                size="sm"
                value={executionMode}
                onChange={(e) => handleExecutionModeChange(e.target.value as ScenePrepExecutionMode)}
              >
                <option value="fanout">Fanout (parallel)</option>
                <option value="sequential">Sequential (one-by-one)</option>
              </Select>
            </FormField>
            <div className="rounded border border-neutral-700/40 bg-neutral-800/20 px-2 py-1.5">
              <div className="mb-1 text-[11px] font-medium text-neutral-300">Sequential chaining</div>
              <label className="flex items-center gap-2 text-xs text-neutral-300">
                <Checkbox
                  size="sm"
                  checked={effectiveReusePrevious}
                  disabled={executionMode !== 'sequential'}
                  onChange={(e) => setReusePreviousOutputAsInput(e.target.checked)}
                />
                Reuse previous output as next input
              </label>
              <div className="mt-1 text-[11px] text-neutral-500">
                {executionMode === 'sequential'
                  ? 'Uses backend sequential policy with dependency_mode=previous when enabled.'
                  : 'Available only in sequential mode.'}
              </div>
            </div>
          </div>

          <div className="rounded border border-neutral-700/40 bg-neutral-800/20 p-2 text-xs text-neutral-400">
            <div>
              Estimated generations this launch: <span className="text-neutral-200">{estimatedLaunchRows}</span>
              <span className="text-neutral-500"> · mode: </span>
              <span className="text-neutral-200">{executionMode}</span>
              {effectiveReusePrevious && <span className="text-neutral-500"> · chaining enabled</span>}
            </div>
            {launchWarnings.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-[11px] text-amber-200/90">
                {launchWarnings.map((warningText) => (
                  <li key={warningText}>• {warningText}</li>
                ))}
              </ul>
            )}
          </div>

          {error && <div className="rounded border border-red-900/40 bg-red-900/20 px-2.5 py-2 text-xs text-red-200">{error}</div>}
          {status && !error && <div className="rounded border border-neutral-700/40 bg-neutral-800/40 px-2.5 py-2 text-xs text-neutral-300">{status}</div>}

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={launchScenePrep} disabled={submitting}>{submitting ? 'Launching...' : 'Launch Scene Prep Batch'}</Button>
            <Button size="sm" variant="ghost" onClick={() => { setError(null); setStatus(null); }} disabled={!status && !error}>Clear Status</Button>
            <Button size="sm" variant="ghost" onClick={applyDefaultDraft}>Reset Draft</Button>
            {effectiveDraftPersistenceKey && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  clearSavedDraft();
                  applyDefaultDraft();
                }}
              >
                Clear Saved Draft
              </Button>
            )}
          </div>
        </div>
      </DisclosureSection>
    </div>
  );
}

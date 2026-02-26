import { Badge, Button, DisclosureSection, FormField, Input, Select } from '@pixsim7/shared.ui';
import clsx from 'clsx';
import { useCallback, useMemo, useState } from 'react';

import type { CharacterDetail, ReferenceAsset } from '@lib/api/characters';
import { pixsimClient } from '@lib/api/client';

import { MiniGallery } from '@features/gallery';
import { GraphEditorSplitLayout } from '@features/graph/components/graph/GraphEditorSplitLayout';
import { GraphSidebarSection } from '@features/graph/components/graph/GraphSidebarSection';

import { buildBackendFanoutExecutionPolicy } from '@/features/generation/lib/fanoutExecutionPolicy';
import { buildGuidancePlanReferences } from '@/features/generation/lib/runContext';
import {
  compileTemplateFanoutRequest,
  executeTrackedTemplateFanoutRequest,
  type TemplateFanoutInputRow,
} from '@/features/generation/lib/templateFanoutExecution';
import { ScenePrepPanel, type ScenePrepPanelPrefill } from '@/features/scenePrep';
import { useAnalyzerSettingsStore } from '@/lib/analyzers/settingsStore';

import { buildCharacterScenePrepPrefill } from '../../lib/scenePrepPrefill';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface StageStatus {
  label: string;
  color: 'gray' | 'yellow' | 'green';
}

type AssetKind = 'identity' | 'expression_ref' | 'pose_ref' | 'outfit_ref';
type ReferenceIngestStatus = 'ingest' | 'analyzing' | 'analyzed' | 'suggested' | 'ready' | 'error';
type ReferenceSlotKey = 'identity_primary' | 'face_closeup' | 'expression_smile' | 'expression_thinking' | 'pose_neutral';
type ReferenceIngestAnalyzerMode = 'auto' | 'general' | 'face' | 'sheet';
type ProductionSection = 'ingest' | 'slots' | 'assets' | 'scene-prep' | 'quick-batch' | 'templates' | 'tagging';

interface ReferenceSlotAssignment {
  asset_id: string;
  kind?: AssetKind;
  shot?: string;
  view?: string;
  pose?: string;
  expression_state?: string;
  note?: string;
  source?: 'ingest' | 'manual';
  updated_at?: number;
}

type ReferenceSlotsState = Partial<Record<ReferenceSlotKey, ReferenceSlotAssignment>>;

interface ReferenceIngestAnalysisSuggestion {
  shot?: string;
  view?: string;
  pose?: string;
  expression_state?: string;
  slot_kind?: AssetKind;
  confidence?: number;
  analyzer_id?: string;
  analyzer_provider_id?: string;
  analyzer_model_id?: string;
  raw_tags?: string[];
}

interface ReferenceIngestItem {
  id: string;
  asset_id: string;
  note?: string;
  status: ReferenceIngestStatus;
  analysis?: ReferenceIngestAnalysisSuggestion;
  error?: string;
  updated_at?: number;
}

interface ReferenceIngestState {
  items: ReferenceIngestItem[];
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const KIND_OPTIONS: { value: AssetKind; label: string }[] = [
  { value: 'identity', label: 'Identity' },
  { value: 'expression_ref', label: 'Expression' },
  { value: 'pose_ref', label: 'Pose' },
  { value: 'outfit_ref', label: 'Outfit' },
];

const SHOT_OPTIONS = ['full_body', 'bust', 'closeup_face'] as const;
const VIEW_OPTIONS = ['front', 'three_quarter_left', 'three_quarter_right', 'profile_left', 'side', 'back'] as const;
const POSE_OPTIONS = ['neutral_stand', 'sit', 'reach', 'turn', 'walk_ready'] as const;
const EXPRESSION_OPTIONS = ['idle', 'thinking', 'smile', 'surprised', 'angry', 'sad'] as const;

/** Pipeline stages describe recommended reference groups. */
const PIPELINE_STAGES = [
  {
    id: 'base-identity',
    title: 'Base Identity Refs',
    description: 'Full-body neutral turnaround and face closeup for consistent identity anchoring.',
    kind: 'identity' as AssetKind,
    steps: [
      { label: 'Full-body neutral (turnaround-ready)', shot: 'full_body', view: 'front' },
      { label: 'Face closeup neutral', shot: 'closeup_face', view: 'front' },
    ],
  },
  {
    id: 'expression-set',
    title: 'Expression Set',
    description: 'Bust/closeup expression states for NPC reaction surfaces.',
    kind: 'expression_ref' as AssetKind,
    steps: [
      { label: 'Idle', shot: 'bust', expression_state: 'idle' },
      { label: 'Smile', shot: 'bust', expression_state: 'smile' },
      { label: 'Thinking', shot: 'bust', expression_state: 'thinking' },
      { label: 'Surprised', shot: 'bust', expression_state: 'surprised' },
      { label: 'Angry', shot: 'bust', expression_state: 'angry' },
      { label: 'Sad', shot: 'bust', expression_state: 'sad' },
    ],
  },
  {
    id: 'pose-set',
    title: 'Basic Pose Set',
    description: 'Core poses for sprite/game-ready reference sheets.',
    kind: 'pose_ref' as AssetKind,
    steps: [
      { label: 'Neutral stand', shot: 'full_body', pose: 'neutral_stand' },
      { label: 'Sit', shot: 'full_body', pose: 'sit' },
      { label: 'Reach', shot: 'full_body', pose: 'reach' },
      { label: 'Turn', shot: 'full_body', pose: 'turn' },
      { label: 'Walk-ready stance', shot: 'full_body', pose: 'walk_ready' },
    ],
  },
] as const;

const CHECKLIST_STEPS = [
  { step: 1, label: 'Create base identity refs', key: 'base-identity' },
  { step: 2, label: 'Create expression set', key: 'expression-set' },
  { step: 3, label: 'Create pose set', key: 'pose-set' },
  { step: 4, label: 'Tag assets', key: 'tagging' },
  { step: 5, label: 'Link to game NPC / sync', key: 'game-link' },
] as const;

const RECOMMENDED_TAGS = [
  { category: 'Identity', examples: ['npc:<id>', 'player'] },
  { category: 'Surface', examples: ['surface:portrait', 'surface:reaction', 'surface:reference'] },
  { category: 'View', examples: ['view:front', 'view:three_quarter_left', 'view:three_quarter_right', 'view:side', 'view:back'] },
  { category: 'State', examples: ['state:idle', 'state:thinking', 'state:surprised', 'state:angry', 'state:happy'] },
  { category: 'Shot', examples: ['shot:full_body', 'shot:bust', 'shot:closeup_face'] },
] as const;

type ScenePackVariant = {
  key: string;
  label: string;
  promptSuffix: string;
  shot: 'full_body' | 'bust' | 'closeup_face';
  view?: string;
  state?: string;
};

const SCENE_PACK_VARIANTS: ScenePackVariant[] = [
  { key: 'establishing', label: 'Establishing', promptSuffix: 'wide establishing shot', shot: 'full_body', view: 'front' },
  { key: 'portrait', label: 'Portrait', promptSuffix: 'portrait framing', shot: 'bust', view: 'three_quarter_left' },
  { key: 'closeup', label: 'Close-up', promptSuffix: 'close-up portrait', shot: 'closeup_face', view: 'front' },
  { key: 'react_smile', label: 'Smile', promptSuffix: 'smiling reaction shot', shot: 'bust', view: 'three_quarter_right', state: 'smile' },
  { key: 'react_thinking', label: 'Thinking', promptSuffix: 'thoughtful reaction shot', shot: 'bust', view: 'front', state: 'thinking' },
  { key: 'side_profile', label: 'Profile', promptSuffix: 'profile view portrait', shot: 'bust', view: 'side' },
];

const EMPTY_REFERENCE_INGEST: ReferenceIngestState = { items: [] };
const EMPTY_REFERENCE_SLOTS: ReferenceSlotsState = {};

const REFERENCE_SLOTS: {
  key: ReferenceSlotKey;
  label: string;
  description: string;
  defaultKind: AssetKind;
}[] = [
  {
    key: 'identity_primary',
    label: 'Identity Primary',
    description: 'Main identity anchor used as the default source image when available.',
    defaultKind: 'identity',
  },
  {
    key: 'face_closeup',
    label: 'Face Closeup',
    description: 'Face closeup identity reference for stronger facial consistency.',
    defaultKind: 'identity',
  },
  {
    key: 'expression_smile',
    label: 'Expression Smile',
    description: 'Smile expression reference used in guidance for reaction shots.',
    defaultKind: 'expression_ref',
  },
  {
    key: 'expression_thinking',
    label: 'Expression Thinking',
    description: 'Thinking expression reference for curation and future variants.',
    defaultKind: 'expression_ref',
  },
  {
    key: 'pose_neutral',
    label: 'Pose Neutral',
    description: 'Neutral standing pose reference for pose consistency.',
    defaultKind: 'pose_ref',
  },
];

const REFERENCE_SLOT_SET = new Set<ReferenceSlotKey>(REFERENCE_SLOTS.map((slot) => slot.key));
const REFERENCE_SLOT_BY_KEY: Record<ReferenceSlotKey, (typeof REFERENCE_SLOTS)[number]> = REFERENCE_SLOTS
  .reduce((acc, slot) => {
    acc[slot.key] = slot;
    return acc;
  }, {} as Record<ReferenceSlotKey, (typeof REFERENCE_SLOTS)[number]>);

type AssetAnalysisSubmission = { id: number; status: string };
type AssetAnalysisRecord = {
  id: number;
  status: string;
  analyzer_id?: string;
  provider_id?: string;
  model_id?: string | null;
  result?: Record<string, unknown>;
  error_message?: string | null;
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function assetsByKind(assets: ReferenceAsset[], kind: AssetKind): ReferenceAsset[] {
  return assets.filter((a) => a.kind === kind);
}

function toNumericAssetId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function slugifyTagPart(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function slotAssetId(referenceSlots: ReferenceSlotsState, slotKey: ReferenceSlotKey): number | null {
  return toNumericAssetId(referenceSlots[slotKey]?.asset_id);
}

function inferReferenceSlotKeyFromIngestItem(item: ReferenceIngestItem): ReferenceSlotKey {
  const s = item.analysis;
  if (s?.expression_state === 'smile') return 'expression_smile';
  if (s?.expression_state === 'thinking') return 'expression_thinking';
  if (s?.pose === 'neutral_stand') return 'pose_neutral';
  if (s?.shot === 'closeup_face') return 'face_closeup';
  return 'identity_primary';
}

function buildReferenceSlotAssignmentFromIngestItem(item: ReferenceIngestItem, slotKey: ReferenceSlotKey): ReferenceSlotAssignment {
  const suggestion = item.analysis;
  const slotDef = REFERENCE_SLOT_BY_KEY[slotKey];
  return {
    asset_id: item.asset_id,
    kind: suggestion?.slot_kind ?? slotDef.defaultKind,
    ...(suggestion?.shot ? { shot: suggestion.shot } : {}),
    ...(suggestion?.view ? { view: suggestion.view } : {}),
    ...(suggestion?.pose ? { pose: suggestion.pose } : {}),
    ...(suggestion?.expression_state ? { expression_state: suggestion.expression_state } : {}),
    ...(item.note ? { note: item.note } : {}),
    source: 'ingest',
    updated_at: Date.now(),
  };
}

function buildCharacterGuidancePlanFromReferenceSources(referenceSlots: ReferenceSlotsState, assets: ReferenceAsset[]) {
  const identityRefs = assetsByKind(assets, 'identity');
  const primaryIdentity = identityRefs.find((a) => a.is_primary) ?? identityRefs[0];
  const closeupIdentity = identityRefs.find((a) => a.shot === 'closeup_face') ?? primaryIdentity;
  const expressionSmile = assetsByKind(assets, 'expression_ref').find((a) => a.expression_state === 'smile');
  const poseNeutral = assetsByKind(assets, 'pose_ref').find((a) => a.pose === 'neutral_stand');

  const bindings: Record<string, { assetId: number; kind?: string; label?: string }> = {};

  const primaryId = slotAssetId(referenceSlots, 'identity_primary') ?? toNumericAssetId(primaryIdentity?.asset_id);
  if (primaryId != null) bindings.identity = { assetId: primaryId, kind: 'identity', label: 'Primary identity' };
  const faceId = slotAssetId(referenceSlots, 'face_closeup') ?? toNumericAssetId(closeupIdentity?.asset_id);
  if (faceId != null && faceId !== primaryId) bindings.face = { assetId: faceId, kind: 'identity', label: 'Face closeup' };
  const smileId = slotAssetId(referenceSlots, 'expression_smile') ?? toNumericAssetId(expressionSmile?.asset_id);
  if (smileId != null) bindings.expression_smile = { assetId: smileId, kind: 'expression', label: 'Smile ref' };
  const poseId = slotAssetId(referenceSlots, 'pose_neutral') ?? toNumericAssetId(poseNeutral?.asset_id);
  if (poseId != null) bindings.pose_neutral = { assetId: poseId, kind: 'pose', label: 'Neutral pose ref' };

  if (Object.keys(bindings).length === 0) return null;
  return buildGuidancePlanReferences(bindings);
}

function stageStatus(assets: ReferenceAsset[], stage: typeof PIPELINE_STAGES[number]): StageStatus {
  const count = assetsByKind(assets, stage.kind).filter((a) => a.asset_id).length;
  const totalSteps = stage.steps.length;

  if (count === 0) return { label: 'Not started', color: 'gray' };
  if (count >= totalSteps) return { label: 'Complete', color: 'green' };
  return { label: `${count}/${totalSteps} refs`, color: 'yellow' };
}

let _nextId = 0;
function nextAssetId(): string {
  return `ref_${Date.now()}_${++_nextId}`;
}

/* ------------------------------------------------------------------ */
/*  Template Preset Slots (still in tags)                              */
/* ------------------------------------------------------------------ */

interface TemplatePresets {
  body_ref_template: string;
  face_ref_template: string;
  expression_sheet_template: string;
  pose_pack_template: string;
}

const TEMPLATE_SLOTS: { key: keyof TemplatePresets; label: string; placeholder: string }[] = [
  { key: 'body_ref_template', label: 'Body Ref Template', placeholder: 'e.g. body-turnaround-neutral' },
  { key: 'face_ref_template', label: 'Face Ref Template', placeholder: 'e.g. face-closeup-neutral' },
  { key: 'expression_sheet_template', label: 'Expression Sheet Template', placeholder: 'e.g. npc-expression-sheet' },
  { key: 'pose_pack_template', label: 'Pose Pack Template', placeholder: 'e.g. basic-pose-pack' },
];

const EMPTY_PRESETS: TemplatePresets = {
  body_ref_template: '',
  face_ref_template: '',
  expression_sheet_template: '',
  pose_pack_template: '',
};

function parseTemplatePresets(tags: Record<string, unknown> | undefined): TemplatePresets {
  if (!tags || !tags._template_presets) return { ...EMPTY_PRESETS };
  try {
    const raw = tags._template_presets as TemplatePresets;
    return {
      body_ref_template: typeof raw.body_ref_template === 'string' ? raw.body_ref_template : '',
      face_ref_template: typeof raw.face_ref_template === 'string' ? raw.face_ref_template : '',
      expression_sheet_template: typeof raw.expression_sheet_template === 'string' ? raw.expression_sheet_template : '',
      pose_pack_template: typeof raw.pose_pack_template === 'string' ? raw.pose_pack_template : '',
    };
  } catch {
    return { ...EMPTY_PRESETS };
  }
}

function parseReferenceIngest(tags: Record<string, unknown> | undefined): ReferenceIngestState {
  const raw = tags?._reference_ingest;
  if (!raw || typeof raw !== 'object') return { ...EMPTY_REFERENCE_INGEST };
  const candidateItems = Array.isArray((raw as any).items) ? (raw as any).items : [];
  const items: ReferenceIngestItem[] = candidateItems
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => ({
      id: typeof (item as any).id === 'string' && (item as any).id ? (item as any).id : `ingest_${index + 1}`,
      asset_id: typeof (item as any).asset_id === 'string' ? (item as any).asset_id : '',
      note: typeof (item as any).note === 'string' ? (item as any).note : undefined,
      status: (['ingest', 'analyzing', 'analyzed', 'suggested', 'ready', 'error'] as const).includes((item as any).status)
        ? (item as any).status
        : 'ingest',
      analysis: (item as any).analysis && typeof (item as any).analysis === 'object'
        ? ((item as any).analysis as ReferenceIngestAnalysisSuggestion)
        : undefined,
      error: typeof (item as any).error === 'string' ? (item as any).error : undefined,
      updated_at: typeof (item as any).updated_at === 'number' ? (item as any).updated_at : undefined,
    }))
    .filter((item) => item.asset_id.trim().length > 0 || item.note);
  return { items };
}

function parseReferenceSlots(tags: Record<string, unknown> | undefined): ReferenceSlotsState {
  const raw = tags?._reference_slots;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...EMPTY_REFERENCE_SLOTS };

  const next: ReferenceSlotsState = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!REFERENCE_SLOT_SET.has(key as ReferenceSlotKey)) continue;
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const row = value as Record<string, unknown>;
    const asset_id = typeof row.asset_id === 'string' ? row.asset_id.trim() : '';
    if (!asset_id) continue;
    next[key as ReferenceSlotKey] = {
      asset_id,
      kind: (['identity', 'expression_ref', 'pose_ref', 'outfit_ref'] as const).includes(row.kind as AssetKind)
        ? (row.kind as AssetKind)
        : undefined,
      shot: typeof row.shot === 'string' ? row.shot : undefined,
      view: typeof row.view === 'string' ? row.view : undefined,
      pose: typeof row.pose === 'string' ? row.pose : undefined,
      expression_state: typeof row.expression_state === 'string' ? row.expression_state : undefined,
      note: typeof row.note === 'string' ? row.note : undefined,
      source: (row.source === 'ingest' || row.source === 'manual') ? row.source : undefined,
      updated_at: typeof row.updated_at === 'number' ? row.updated_at : undefined,
    };
  }
  return next;
}

function readNestedString(source: Record<string, unknown>, path: string[]): string | undefined {
  let current: unknown = source;
  for (const key of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' ? current : undefined;
}

function readNestedNumber(source: Record<string, unknown>, path: string[]): number | undefined {
  let current: unknown = source;
  for (const key of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'number' && Number.isFinite(current) ? current : undefined;
}

function collectStringTags(result: Record<string, unknown>): string[] {
  const candidates: unknown[] = [
    result.tags,
    result.normalized_tags,
    result.suggested_tags,
    (result.attributes && typeof result.attributes === 'object' ? (result.attributes as any).tags : undefined),
  ];
  const tags = candidates.flatMap((entry) => (Array.isArray(entry) ? entry : []))
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return Array.from(new Set(tags));
}

function extractTagValue(tags: string[], prefix: string): string | undefined {
  const direct = tags.find((t) => t.startsWith(`${prefix}:`));
  if (direct) return direct.slice(prefix.length + 1);
  return undefined;
}

function inferSlotKindFromSuggestion(s: {
  shot?: string;
  pose?: string;
  expression_state?: string;
}): AssetKind {
  if (s.expression_state) return 'expression_ref';
  if (s.pose) return 'pose_ref';
  if (s.shot === 'closeup_face' || s.shot === 'full_body' || s.shot === 'bust') return 'identity';
  return 'identity';
}

function resolveIngestAnalyzerIdForMode(
  mode: ReferenceIngestAnalyzerMode,
  defaults: {
    defaultImageAnalyzerId: string;
    faceAnalyzerId: string;
    sheetAnalyzerId: string;
  },
): string | null {
  switch (mode) {
    case 'auto':
      return null;
    case 'general':
      return defaults.defaultImageAnalyzerId?.trim() || 'asset:object-detection';
    case 'face':
      return defaults.faceAnalyzerId?.trim() || 'asset:face-detection';
    case 'sheet':
      return defaults.sheetAnalyzerId?.trim() || 'asset:caption';
    default:
      return null;
  }
}

function extractReferenceIngestSuggestion(record: AssetAnalysisRecord): ReferenceIngestAnalysisSuggestion {
  const result = (record.result && typeof record.result === 'object') ? record.result : {};
  const tags = collectStringTags(result);
  const shot =
    readNestedString(result, ['shot'])
    || readNestedString(result, ['attributes', 'shot'])
    || extractTagValue(tags, 'shot');
  const view =
    readNestedString(result, ['view'])
    || readNestedString(result, ['attributes', 'view'])
    || extractTagValue(tags, 'view');
  const expression_state =
    readNestedString(result, ['expression_state'])
    || readNestedString(result, ['attributes', 'expression_state'])
    || extractTagValue(tags, 'state')
    || extractTagValue(tags, 'expression');
  const pose =
    readNestedString(result, ['pose'])
    || readNestedString(result, ['attributes', 'pose'])
    || extractTagValue(tags, 'pose');
  const confidence =
    readNestedNumber(result, ['confidence'])
    || readNestedNumber(result, ['score'])
    || readNestedNumber(result, ['attributes', 'confidence']);

  const slot_kind = inferSlotKindFromSuggestion({ shot, pose, expression_state });
  return {
    shot,
    view,
    pose,
    expression_state,
    slot_kind,
    confidence,
    analyzer_id: record.analyzer_id,
    analyzer_provider_id: record.provider_id,
    analyzer_model_id: record.model_id ?? undefined,
    raw_tags: tags.length > 0 ? tags : undefined,
  };
}

async function submitAssetAnalysis(
  assetId: number,
  options?: { analyzerId?: string | null },
): Promise<AssetAnalysisSubmission> {
  const analyzerId = options?.analyzerId?.trim();
  return pixsimClient.post<AssetAnalysisSubmission>(`/assets/${assetId}/analyze`, analyzerId ? { analyzer_id: analyzerId } : {});
}

async function getAssetAnalysis(analysisId: number): Promise<AssetAnalysisRecord> {
  return pixsimClient.get<AssetAnalysisRecord>(`/analyses/${analysisId}`);
}

async function analyzeAssetAndPoll(assetId: number, options?: { analyzerId?: string | null }): Promise<AssetAnalysisRecord> {
  const submitted = await submitAssetAnalysis(assetId, options);
  const timeoutMs = 90_000;
  const pollIntervalMs = 1200;
  const startedAt = Date.now();
  while (true) {
    const record = await getAssetAnalysis(submitted.id);
    if (record.status === 'completed' || record.status === 'failed' || record.status === 'cancelled') {
      return record;
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Asset analysis timed out');
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

function buildReferenceAssetFromIngestItem(item: ReferenceIngestItem): ReferenceAsset {
  const suggestion = item.analysis;
  return {
    asset_id: item.asset_id,
    kind: suggestion?.slot_kind ?? 'identity',
    ...(suggestion?.shot ? { shot: suggestion.shot } : {}),
    ...(suggestion?.view ? { view: suggestion.view } : {}),
    ...(suggestion?.pose ? { pose: suggestion.pose } : {}),
    ...(suggestion?.expression_state ? { expression_state: suggestion.expression_state } : {}),
    tags: {
      ingest_promoted: true,
      ...(item.note ? { ingest_note: item.note } : {}),
      ...(typeof suggestion?.confidence === 'number' ? { ingest_confidence: suggestion.confidence } : {}),
    },
  };
}

function buildCharacterScenePackRows(args: {
  basePrompt: string;
  count: number;
  characterId: string;
  characterDisplayName: string;
  sceneSlug: string;
}): TemplateFanoutInputRow[] {
  const variants = Array.from({ length: Math.max(1, args.count) }, (_, index) => {
    return SCENE_PACK_VARIANTS[index % SCENE_PACK_VARIANTS.length];
  });

  return variants.map((variant, index) => {
    const tagIntents = [
      `character:${args.characterId}`,
      'surface:scene',
      'source:generated',
      `shot:${variant.shot}`,
      variant.view ? `view:${variant.view}` : null,
      variant.state ? `state:${variant.state}` : null,
      args.sceneSlug ? `scene:${args.sceneSlug}` : null,
    ].filter((v): v is string => Boolean(v));

    return {
      id: `scene_${index + 1}`,
      label: `${variant.label} ${index + 1}`,
      prompt: `${args.basePrompt}, ${variant.promptSuffix}`,
      runContext: {
        character_stage: 'scene_pack',
        template_slot: 'scene_pack',
        scene_variant_key: variant.key,
        shot: variant.shot,
        view: variant.view,
        expression_state: variant.state,
        character_display_name: args.characterDisplayName,
        tag_intents: tagIntents,
      },
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function CopyableTag({ tag }: { tag: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(tag).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }, [tag]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-xs text-neutral-300 transition hover:bg-neutral-700 hover:text-neutral-100"
      title="Click to copy"
    >
      {copied ? 'copied!' : tag}
    </button>
  );
}

function StepCard({
  step,
  matchingAssets,
}: {
  step: { label: string; shot?: string; expression_state?: string; pose?: string; view?: string };
  matchingAssets: ReferenceAsset[];
}) {
  const hasRef = matchingAssets.length > 0;

  return (
    <div className="flex items-start gap-3 rounded border border-neutral-700/50 bg-neutral-800/40 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-neutral-200">{step.label}</span>
          {hasRef && <Badge color="green">has ref</Badge>}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-neutral-500">
          {step.shot && <span>Shot: {step.shot}</span>}
          {step.view && <span>View: {step.view}</span>}
          {step.expression_state && <span>Expression: {step.expression_state}</span>}
          {step.pose && <span>Pose: {step.pose}</span>}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Ref Asset Editor                                                   */
/* ------------------------------------------------------------------ */

function RefAssetEditor({
  kind,
  assets,
  onUpdate,
}: {
  kind: AssetKind;
  assets: ReferenceAsset[];
  onUpdate: (updated: ReferenceAsset[]) => void;
}) {
  const kindLabel = KIND_OPTIONS.find((o) => o.value === kind)?.label ?? kind;

  const handleAdd = () => {
    onUpdate([...assets, { asset_id: nextAssetId(), kind }]);
  };

  const handleChange = (i: number, patch: Partial<ReferenceAsset>) => {
    const next = [...assets];
    next[i] = { ...next[i], ...patch };
    onUpdate(next);
  };

  const handleRemove = (i: number) => onUpdate(assets.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-neutral-300">{kindLabel} Refs</span>
        <Badge color="blue">{assets.length}</Badge>
      </div>
      {assets.map((asset, i) => (
        <div key={asset.asset_id} className="space-y-1 rounded border border-neutral-700/40 bg-neutral-800/30 p-2">
          <div className="flex items-center gap-1.5">
            <Input
              size="sm"
              className="flex-1"
              value={asset.asset_id}
              onChange={(e) => handleChange(i, { asset_id: e.target.value })}
              placeholder="Asset ID (URL or identifier)"
            />
            <Button variant="ghost" size="xs" onClick={() => handleRemove(i)} className="shrink-0 text-red-400 hover:text-red-300">
              &times;
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Select size="sm" value={asset.shot ?? ''} onChange={(e) => handleChange(i, { shot: e.target.value || undefined })}>
              <option value="">Shot...</option>
              {SHOT_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
            <Select size="sm" value={asset.view ?? ''} onChange={(e) => handleChange(i, { view: e.target.value || undefined })}>
              <option value="">View...</option>
              {VIEW_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
            </Select>
            {kind === 'pose_ref' && (
              <Select size="sm" value={asset.pose ?? ''} onChange={(e) => handleChange(i, { pose: e.target.value || undefined })}>
                <option value="">Pose...</option>
                {POSE_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
            )}
            {kind === 'expression_ref' && (
              <Select size="sm" value={asset.expression_state ?? ''} onChange={(e) => handleChange(i, { expression_state: e.target.value || undefined })}>
                <option value="">Expression...</option>
                {EXPRESSION_OPTIONS.map((ex) => <option key={ex} value={ex}>{ex}</option>)}
              </Select>
            )}
          </div>
        </div>
      ))}
      <Button variant="ghost" size="xs" onClick={handleAdd}>
        + Add {kindLabel.toLowerCase()} ref
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export interface ReferencePipelineTabProps {
  character: Partial<CharacterDetail>;
  onChange: (patch: Partial<CharacterDetail>) => void;
}

export function ReferencePipelineTab({ character, onChange }: ReferencePipelineTabProps) {
  const tags = (character.tags as Record<string, unknown>) ?? {};
  const allAssets: ReferenceAsset[] = (character.reference_assets as ReferenceAsset[]) ?? [];

  /* Update the full reference_assets array */
  const setAssets = useCallback(
    (next: ReferenceAsset[]) => {
      onChange({ reference_assets: next });
    },
    [onChange],
  );

  /* Per-kind update: splice out old assets of that kind and replace */
  const handleKindUpdate = useCallback(
    (kind: AssetKind, updated: ReferenceAsset[]) => {
      const others = allAssets.filter((a) => a.kind !== kind);
      setAssets([...others, ...updated]);
    },
    [allAssets, setAssets],
  );

  /* Template presets – persisted in tags._template_presets */
  const presets = useMemo(() => parseTemplatePresets(tags), [tags]);
  const referenceSlots = useMemo(() => parseReferenceSlots(tags), [tags]);

  const handlePresetChange = useCallback(
    (key: keyof TemplatePresets, value: string) => {
      const next: TemplatePresets = { ...presets, [key]: value };
      onChange({ tags: { ...tags, _template_presets: next } });
    },
    [presets, tags, onChange],
  );

  const ingestState = useMemo(() => parseReferenceIngest(tags), [tags]);
  const ingestItems = ingestState.items;
  const defaultImageAnalyzerId = useAnalyzerSettingsStore((s) => s.defaultImageAnalyzer);
  const defaultFaceIngestAnalyzerId = useAnalyzerSettingsStore((s) => s.getDefaultAssetAnalyzerForIntent('character_ingest_face', 'image'));
  const defaultSheetIngestAnalyzerId = useAnalyzerSettingsStore((s) => s.getDefaultAssetAnalyzerForIntent('character_ingest_sheet', 'image'));
  const [ingestDraftAssetId, setIngestDraftAssetId] = useState('');
  const [ingestDraftNote, setIngestDraftNote] = useState('');
  const [ingestBulkAnalyzing, setIngestBulkAnalyzing] = useState(false);
  const [ingestAnalyzerMode, setIngestAnalyzerMode] = useState<ReferenceIngestAnalyzerMode>('auto');
  const [activeSection, setActiveSection] = useState<ProductionSection>('ingest');

  const setIngestItems = useCallback((nextItems: ReferenceIngestItem[]) => {
    onChange({
      tags: {
        ...tags,
        _reference_ingest: { items: nextItems },
      },
    });
  }, [onChange, tags]);

  const setReferenceSlots = useCallback((nextSlots: ReferenceSlotsState) => {
    onChange({
      tags: {
        ...tags,
        _reference_slots: nextSlots,
      },
    });
  }, [onChange, tags]);

  const patchReferenceSlot = useCallback((slotKey: ReferenceSlotKey, patch: Partial<ReferenceSlotAssignment> | null) => {
    const current = referenceSlots[slotKey];
    const nextSlots = { ...referenceSlots };
    if (patch == null) {
      delete nextSlots[slotKey];
      setReferenceSlots(nextSlots);
      return;
    }

    const nextAssetId = (patch.asset_id ?? current?.asset_id ?? '').trim();
    if (!nextAssetId) {
      delete nextSlots[slotKey];
      setReferenceSlots(nextSlots);
      return;
    }

    nextSlots[slotKey] = {
      ...(current ?? {}),
      ...patch,
      asset_id: nextAssetId,
      kind: patch.kind ?? current?.kind ?? REFERENCE_SLOT_BY_KEY[slotKey].defaultKind,
      source: patch.source ?? current?.source ?? 'manual',
      updated_at: Date.now(),
    };
    setReferenceSlots(nextSlots);
  }, [referenceSlots, setReferenceSlots]);

  const patchIngestItem = useCallback((itemId: string, patch: Partial<ReferenceIngestItem>) => {
    setIngestItems(
      ingestItems.map((item) => (
        item.id === itemId
          ? { ...item, ...patch, updated_at: Date.now() }
          : item
      )),
    );
  }, [ingestItems, setIngestItems]);

  const addIngestItem = useCallback(() => {
    const assetId = ingestDraftAssetId.trim();
    const note = ingestDraftNote.trim();
    if (!assetId) return;
    const next: ReferenceIngestItem = {
      id: `ingest_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      asset_id: assetId,
      ...(note ? { note } : {}),
      status: 'ingest',
      updated_at: Date.now(),
    };
    setIngestItems([next, ...ingestItems]);
    setIngestDraftAssetId('');
    setIngestDraftNote('');
  }, [ingestDraftAssetId, ingestDraftNote, ingestItems, setIngestItems]);

  const addAssetToIngest = useCallback((assetId: string | number, note?: string) => {
    const normalizedAssetId = String(assetId).trim();
    if (!normalizedAssetId) return;
    const existing = ingestItems.find((item) => item.asset_id === normalizedAssetId);
    if (existing) {
      if (note && !existing.note) {
        patchIngestItem(existing.id, { note });
      }
      return;
    }
    const next: ReferenceIngestItem = {
      id: `ingest_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      asset_id: normalizedAssetId,
      ...(note ? { note } : {}),
      status: 'ingest',
      updated_at: Date.now(),
    };
    setIngestItems([next, ...ingestItems]);
  }, [ingestItems, patchIngestItem, setIngestItems]);

  const removeIngestItem = useCallback((itemId: string) => {
    setIngestItems(ingestItems.filter((item) => item.id !== itemId));
  }, [ingestItems, setIngestItems]);

  const runAnalyzeIngestItem = useCallback(async (item: ReferenceIngestItem) => {
    const numericAssetId = toNumericAssetId(item.asset_id);
    if (numericAssetId == null) {
      patchIngestItem(item.id, {
        status: 'error',
        error: 'Analyzer requires a numeric asset ID (existing library asset).',
      });
      return;
    }
    patchIngestItem(item.id, { status: 'analyzing', error: undefined });
    try {
      const analyzerId = resolveIngestAnalyzerIdForMode(ingestAnalyzerMode, {
        defaultImageAnalyzerId,
        faceAnalyzerId: defaultFaceIngestAnalyzerId,
        sheetAnalyzerId: defaultSheetIngestAnalyzerId,
      });
      const analysis = await analyzeAssetAndPoll(numericAssetId, { analyzerId });
      if (analysis.status !== 'completed') {
        patchIngestItem(item.id, {
          status: 'error',
          error: analysis.error_message || `Analysis ${analysis.status}`,
        });
        return;
      }
      const suggestion = extractReferenceIngestSuggestion(analysis);
      const hasSuggestion = Boolean(
        suggestion.shot || suggestion.view || suggestion.pose || suggestion.expression_state || suggestion.slot_kind,
      );
      patchIngestItem(item.id, {
        status: hasSuggestion ? 'suggested' : 'analyzed',
        analysis: suggestion,
        error: undefined,
      });
    } catch (err) {
      patchIngestItem(item.id, {
        status: 'error',
        error: err instanceof Error ? err.message : 'Analysis failed',
      });
    }
  }, [defaultFaceIngestAnalyzerId, defaultImageAnalyzerId, defaultSheetIngestAnalyzerId, ingestAnalyzerMode, patchIngestItem]);

  const analyzeAllIngest = useCallback(async () => {
    const pending = ingestItems.filter((item) => item.status !== 'ready' && item.status !== 'analyzing');
    if (pending.length === 0) return;
    setIngestBulkAnalyzing(true);
    try {
      for (const item of pending) {
        await runAnalyzeIngestItem(item);
      }
    } finally {
      setIngestBulkAnalyzing(false);
    }
  }, [ingestItems, runAnalyzeIngestItem]);

  const promoteIngestItemToReference = useCallback((item: ReferenceIngestItem) => {
    const promoted = buildReferenceAssetFromIngestItem(item);
    const existingIndex = allAssets.findIndex((a) => a.asset_id === promoted.asset_id);
    const nextAssets =
      existingIndex >= 0
        ? allAssets.map((a, idx) => (idx === existingIndex ? { ...a, ...promoted } : a))
        : [...allAssets, promoted];
    const nextIngestItems = ingestItems.map((row) => (
      row.id === item.id
        ? { ...row, status: 'ready' as const, error: undefined, updated_at: Date.now() }
        : row
    ));
    onChange({
      reference_assets: nextAssets,
      tags: {
        ...tags,
        _reference_ingest: { items: nextIngestItems },
      },
    });
  }, [allAssets, ingestItems, onChange, tags]);

  const promoteIngestItemToSlot = useCallback((item: ReferenceIngestItem, slotKey?: ReferenceSlotKey) => {
    const targetSlot = slotKey ?? inferReferenceSlotKeyFromIngestItem(item);
    const promoted = buildReferenceAssetFromIngestItem(item);
    const slotAssignment = buildReferenceSlotAssignmentFromIngestItem(item, targetSlot);
    const existingIndex = allAssets.findIndex((a) => a.asset_id === promoted.asset_id);
    const nextAssets =
      existingIndex >= 0
        ? allAssets.map((a, idx) => (idx === existingIndex ? { ...a, ...promoted } : a))
        : [...allAssets, promoted];
    const nextIngestItems = ingestItems.map((row) => (
      row.id === item.id
        ? { ...row, status: 'ready' as const, error: undefined, updated_at: Date.now() }
        : row
    ));
    onChange({
      reference_assets: nextAssets,
      tags: {
        ...tags,
        _reference_ingest: { items: nextIngestItems },
        _reference_slots: {
          ...referenceSlots,
          [targetSlot]: slotAssignment,
        },
      },
    });
  }, [allAssets, ingestItems, onChange, referenceSlots, tags]);

  const characterId = typeof character.character_id === 'string' ? character.character_id.trim() : '';
  const characterDisplayName =
    (typeof character.display_name === 'string' && character.display_name.trim())
    || (typeof character.name === 'string' && character.name.trim())
    || characterId
    || 'Character';
  const suggestedScenePrompt = `${characterDisplayName} at cafe`;
  const scenePrepPrefill = useMemo(
    () => (buildCharacterScenePrepPrefill({
      characterId,
      characterDisplayName,
      suggestedScenePrompt,
      referenceSlots,
    }) satisfies ScenePrepPanelPrefill),
    [characterDisplayName, characterId, referenceSlots, suggestedScenePrompt],
  );
  const [scenePackTemplateId, setScenePackTemplateId] = useState('');
  const [scenePackPrompt, setScenePackPrompt] = useState('');
  const [scenePackProviderId, setScenePackProviderId] = useState('pixverse');
  const [scenePackCount, setScenePackCount] = useState('4');
  const [scenePackSubmitting, setScenePackSubmitting] = useState(false);
  const [scenePackStatus, setScenePackStatus] = useState<string | null>(null);
  const [scenePackError, setScenePackError] = useState<string | null>(null);

  const fallbackPrimaryIdentityRef = useMemo(
    () => (assetsByKind(allAssets, 'identity').find((a) => a.is_primary) ?? assetsByKind(allAssets, 'identity')[0] ?? null),
    [allAssets],
  );
  const slottedPrimaryIdentityAssetId = useMemo(
    () => toNumericAssetId(referenceSlots.identity_primary?.asset_id),
    [referenceSlots],
  );
  const primaryIdentityAssetId = useMemo(
    () => slottedPrimaryIdentityAssetId ?? toNumericAssetId(fallbackPrimaryIdentityRef?.asset_id),
    [fallbackPrimaryIdentityRef, slottedPrimaryIdentityAssetId],
  );
  const scenePackOperation = primaryIdentityAssetId != null ? 'image_to_image' : 'text_to_image';
  const characterGuidancePlan = useMemo(
    () => buildCharacterGuidancePlanFromReferenceSources(referenceSlots, allAssets),
    [allAssets, referenceSlots],
  );

  const launchScenePack = useCallback(async () => {
    const templateId = scenePackTemplateId.trim();
    const providerId = scenePackProviderId.trim();
    const basePrompt = (scenePackPrompt.trim() || suggestedScenePrompt).trim();
    const requestedCount = Number(scenePackCount);
    const count = Number.isFinite(requestedCount) ? Math.max(1, Math.min(8, Math.floor(requestedCount))) : 4;

    if (!characterId) {
      setScenePackError('Save or define a character_id before launching a scene pack.');
      return;
    }
    if (!templateId) {
      setScenePackError('Enter a template ID/slug for the scene pack.');
      return;
    }
    if (!providerId) {
      setScenePackError('Enter a provider ID.');
      return;
    }
    if (!basePrompt) {
      setScenePackError('Enter a base scene prompt.');
      return;
    }

    const sceneSlug = slugifyTagPart(basePrompt);
    const rows = buildCharacterScenePackRows({
      basePrompt,
      count,
      characterId,
      characterDisplayName,
      sceneSlug,
    });

    const commonRunContext: Record<string, unknown> = {
      mode: 'character_template_batch',
      character_batch_schema_version: 1,
      character_id: characterId,
      character_display_name: characterDisplayName,
      character_category: character.category ?? null,
      character_archetype: character.archetype ?? null,
      character_species: character.species ?? null,
      template_slot: 'scene_pack',
      scene_prompt_base: basePrompt,
      scene_key: sceneSlug || null,
      ...(typeof character.game_npc_id === 'number' ? { game_npc_id: character.game_npc_id } : {}),
      ...(characterGuidancePlan ? { guidance_plan: characterGuidancePlan } : {}),
    };

    const commonExtraParams: Record<string, unknown> = {};
    if (scenePackOperation === 'image_to_image' && primaryIdentityAssetId != null) {
      commonExtraParams.source_asset_id = primaryIdentityAssetId;
    }

    setScenePackSubmitting(true);
    setScenePackError(null);
    setScenePackStatus(`Starting ${count} scene variants...`);
    try {
      const request = compileTemplateFanoutRequest({
        templateId,
        providerId,
        defaultOperation: scenePackOperation,
        continueOnError: true,
        executionPolicy: buildBackendFanoutExecutionPolicy({ onError: 'continue' }),
        nodeLabel: `${characterDisplayName} Scene Pack`,
        commonExtraParams,
        commonRunContext,
        inputs: rows,
        executionMetadata: {
          launch_kind: 'character_scene_pack',
          character_id: characterId,
          scene_key: sceneSlug,
        },
      });

      const result = await executeTrackedTemplateFanoutRequest({
        request,
        pollIntervalMs: 2000,
        onProgress: (progress) => {
          setScenePackStatus(`Submitting scene pack ${progress.queued}/${progress.total}`);
        },
      });

      setScenePackStatus(
        `Scene pack launched (${result.generationIds.length} generations, execution ${result.execution.id})`,
      );
    } catch (err) {
      setScenePackError(err instanceof Error ? err.message : 'Failed to launch scene pack');
    } finally {
      setScenePackSubmitting(false);
    }
  }, [
    characterId,
    characterDisplayName,
    character.category,
    character.archetype,
    character.species,
    character.game_npc_id,
    characterGuidancePlan,
    scenePackTemplateId,
    scenePackProviderId,
    scenePackPrompt,
    scenePackCount,
    suggestedScenePrompt,
    scenePackOperation,
    primaryIdentityAssetId,
  ]);

  /* Checklist statuses */
  const checklistDone = useMemo(() => {
    const identityAssets = assetsByKind(allAssets, 'identity');
    const bodyDone = identityAssets.some((a) => a.shot === 'full_body') && identityAssets.some((a) => a.shot === 'closeup_face');
    const exprDone = assetsByKind(allAssets, 'expression_ref').length >= 3;
    const poseDone = assetsByKind(allAssets, 'pose_ref').length >= 3;
    const tagged = Object.keys(tags).some((k) => !k.startsWith('_'));
    const linked = character.game_npc_id != null;
    return { 'base-identity': bodyDone, 'expression-set': exprDone, 'pose-set': poseDone, tagging: tagged, 'game-link': linked };
  }, [allAssets, tags, character.game_npc_id]);

  /* ── Production workspace nav groups ────────────────────────────── */
  const navGroups: { title: string; items: { id: ProductionSection; label: string; badge?: number }[] }[] = [
    {
      title: 'References',
      items: [
        { id: 'ingest', label: 'Ingest', badge: ingestItems.length > 0 ? ingestItems.length : undefined },
        { id: 'slots', label: 'Slots', badge: Object.keys(referenceSlots).length > 0 ? Object.keys(referenceSlots).length : undefined },
        { id: 'assets', label: 'Assets', badge: allAssets.length > 0 ? allAssets.length : undefined },
      ],
    },
    {
      title: 'Scene',
      items: [
        { id: 'scene-prep', label: 'Scene Prep' },
        { id: 'quick-batch', label: 'Quick Batch' },
      ],
    },
    {
      title: 'Config',
      items: [
        { id: 'templates', label: 'Templates' },
        { id: 'tagging', label: 'Tagging' },
      ],
    },
  ];

  return (
    <div className="flex flex-col">
      {/* Header strip */}
      <div className="border-b border-neutral-700/30 px-3 py-2">
        <p className="text-xs text-neutral-500">
          Build reusable game-ready reference surfaces for this character. Work through each stage in order.
        </p>
      </div>

      {/* Production workspace split */}
      <GraphEditorSplitLayout
        sidebarWidthPx={192}
        className="min-h-[540px]"
        sidebar={
          <>
            {/* Section nav — grouped */}
            {navGroups.map((group) => (
              <GraphSidebarSection key={group.title} title={group.title} className="mb-1">
                <nav className="space-y-0.5">
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveSection(item.id)}
                      className={clsx(
                        'flex w-full items-center justify-between gap-2 rounded py-1.5 pl-4 pr-2 text-left text-xs transition',
                        activeSection === item.id
                          ? 'bg-neutral-700 text-neutral-100'
                          : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200',
                      )}
                    >
                      <span>{item.label}</span>
                      {item.badge != null && (
                        <span
                          className={clsx(
                            'rounded px-1.5 py-0.5 text-[10px] tabular-nums',
                            activeSection === item.id
                              ? 'bg-neutral-600 text-neutral-200'
                              : 'bg-neutral-800 text-neutral-500',
                          )}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  ))}
                </nav>
              </GraphSidebarSection>
            ))}

            {/* Compact checklist */}
            <GraphSidebarSection title="Checklist">
              <ol className="space-y-1">
                {CHECKLIST_STEPS.map(({ step, label, key }) => {
                  const done = checklistDone[key];
                  return (
                    <li key={key} className="flex items-center gap-1.5 text-[11px]">
                      <span
                        className={clsx(
                          'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold',
                          done ? 'bg-green-600 text-white' : 'bg-neutral-700 text-neutral-400',
                        )}
                      >
                        {done ? '✓' : step}
                      </span>
                      <span className={done ? 'text-neutral-500 line-through' : 'text-neutral-400'}>{label}</span>
                    </li>
                  );
                })}
              </ol>
            </GraphSidebarSection>
          </>
        }
        main={
          <div className="space-y-3">

            {/* ── Ingest ─────────────────────────────────────────────── */}
            {activeSection === 'ingest' && (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold text-neutral-200">
                    Reference Ingest{' '}
                    <span className="text-xs font-normal text-neutral-500">(Experimental)</span>
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    Add raw character image assets here first (even if untagged). Run analyzer suggestions, then explicitly promote reviewed items into structured reference assets.
                  </p>
                </div>

                <div className="rounded border border-neutral-700/40 bg-neutral-800/20 p-2">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-xs font-medium text-neutral-300">Pick From Library</div>
                    <div className="text-[11px] text-neutral-500">
                      Hover a card and click <span className="text-neutral-300">+ Ingest</span>
                    </div>
                  </div>
                  <div className="h-[300px] overflow-hidden rounded border border-neutral-700/30">
                    <MiniGallery
                      maxItems={24}
                      paginationMode="page"
                      pageSize={12}
                      initialFilters={{ media_type: 'image', include_archived: false }}
                      renderItemActions={(asset) => (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            addAssetToIngest(asset.id);
                          }}
                          className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-700"
                          title="Add to character ingest"
                        >
                          + Ingest
                        </button>
                      )}
                    />
                  </div>
                </div>

                <div className="rounded border border-neutral-700/40 bg-neutral-800/30 p-2.5">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <Input
                      size="sm"
                      value={ingestDraftAssetId}
                      onChange={(e) => setIngestDraftAssetId(e.target.value)}
                      placeholder="Asset ID (numeric for analyzer support)"
                    />
                    <Input
                      size="sm"
                      value={ingestDraftNote}
                      onChange={(e) => setIngestDraftNote(e.target.value)}
                      placeholder="Optional note (e.g. front face, side view)"
                    />
                    <Button size="sm" onClick={addIngestItem} disabled={!ingestDraftAssetId.trim()}>
                      Add Ingest
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Select
                      size="sm"
                      value={ingestAnalyzerMode}
                      onChange={(e) => setIngestAnalyzerMode(e.target.value as ReferenceIngestAnalyzerMode)}
                    >
                      <option value="auto">Analyzer: Auto (backend default)</option>
                      <option value="general">Analyzer: General (image default)</option>
                      <option value="face">Analyzer: Face</option>
                      <option value="sheet">Analyzer: Sheet / Composite</option>
                    </Select>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={analyzeAllIngest}
                      disabled={ingestBulkAnalyzing || ingestItems.length === 0}
                    >
                      {ingestBulkAnalyzing ? 'Analyzing...' : 'Analyze All'}
                    </Button>
                    <span className="text-[11px] text-neutral-500">
                      Analyzer expects numeric library asset IDs.
                      {ingestAnalyzerMode === 'general' && (
                        <span className="ml-1">Uses image default: <span className="font-mono text-neutral-300">{defaultImageAnalyzerId}</span></span>
                      )}
                      {ingestAnalyzerMode === 'face' && (
                        <span className="ml-1">Uses <span className="font-mono text-neutral-300">{defaultFaceIngestAnalyzerId}</span> (intent: character_ingest_face)</span>
                      )}
                      {ingestAnalyzerMode === 'sheet' && (
                        <span className="ml-1">Uses <span className="font-mono text-neutral-300">{defaultSheetIngestAnalyzerId}</span> (intent: character_ingest_sheet)</span>
                      )}
                    </span>
                  </div>
                </div>

                {ingestItems.length === 0 ? (
                  <div className="text-xs text-neutral-500">No ingest items yet.</div>
                ) : (
                  <div className="space-y-2">
                    {ingestItems.map((item) => {
                      const suggestion = item.analysis;
                      const statusBadgeColor =
                        item.status === 'ready'
                          ? 'green'
                          : item.status === 'suggested'
                            ? 'blue'
                            : item.status === 'error'
                              ? 'red'
                              : item.status === 'analyzing'
                                ? 'yellow'
                                : 'gray';
                      return (
                        <div key={item.id} className="rounded border border-neutral-700/40 bg-neutral-800/20 p-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs text-neutral-300">{item.asset_id}</span>
                            <Badge color={statusBadgeColor as any}>{item.status}</Badge>
                            {suggestion?.slot_kind && (
                              <span className="text-[11px] text-neutral-400">
                                kind: <span className="text-neutral-200">{suggestion.slot_kind}</span>
                              </span>
                            )}
                            <span className="text-[11px] text-neutral-400">
                              slot: <span className="text-neutral-200">{inferReferenceSlotKeyFromIngestItem(item)}</span>
                            </span>
                            {typeof suggestion?.confidence === 'number' && (
                              <span className="text-[11px] text-neutral-500">conf {Math.round(suggestion.confidence * 100)}%</span>
                            )}
                            <span className="ml-auto" />
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => void runAnalyzeIngestItem(item)}
                              disabled={item.status === 'analyzing' || ingestBulkAnalyzing}
                            >
                              {item.status === 'analyzing' ? 'Analyzing...' : 'Analyze'}
                            </Button>
                            <Button size="xs" onClick={() => promoteIngestItemToReference(item)} disabled={item.status === 'analyzing'}>
                              Promote
                            </Button>
                            <Button size="xs" onClick={() => promoteIngestItemToSlot(item)} disabled={item.status === 'analyzing'}>
                              Promote + Slot
                            </Button>
                            <Button size="xs" variant="ghost" onClick={() => removeIngestItem(item.id)}>
                              Remove
                            </Button>
                          </div>
                          {item.note && <div className="mt-1 text-xs text-neutral-500">{item.note}</div>}
                          {item.error && <div className="mt-1 text-xs text-red-300">{item.error}</div>}
                          {suggestion && (
                            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-neutral-400">
                              {suggestion.shot && <span className="rounded bg-neutral-900/60 px-1.5 py-0.5">shot:{suggestion.shot}</span>}
                              {suggestion.view && <span className="rounded bg-neutral-900/60 px-1.5 py-0.5">view:{suggestion.view}</span>}
                              {suggestion.expression_state && <span className="rounded bg-neutral-900/60 px-1.5 py-0.5">state:{suggestion.expression_state}</span>}
                              {suggestion.pose && <span className="rounded bg-neutral-900/60 px-1.5 py-0.5">pose:{suggestion.pose}</span>}
                              {suggestion.analyzer_id && <span className="rounded bg-neutral-900/60 px-1.5 py-0.5">analyzer:{suggestion.analyzer_id}</span>}
                              {suggestion.analyzer_provider_id && <span className="rounded bg-neutral-900/60 px-1.5 py-0.5">provider:{suggestion.analyzer_provider_id}</span>}
                              {suggestion.analyzer_model_id && <span className="rounded bg-neutral-900/60 px-1.5 py-0.5">model:{suggestion.analyzer_model_id}</span>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── Slots ──────────────────────────────────────────────── */}
            {activeSection === 'slots' && (
              <div className="space-y-2.5">
                <div>
                  <p className="text-sm font-semibold text-neutral-200">Reference Slots (Curated)</p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    Curated slots are stable references used by character generation flows. Promote ingest items into slots after review, or edit slot asset IDs manually.
                  </p>
                </div>
                {REFERENCE_SLOTS.map((slot) => {
                  const assigned = referenceSlots[slot.key];
                  return (
                    <div key={slot.key} className="rounded border border-neutral-700/40 bg-neutral-800/20 p-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-neutral-200">{slot.label}</span>
                            {assigned ? <Badge color="green">assigned</Badge> : <Badge color="gray">empty</Badge>}
                          </div>
                          <div className="mt-0.5 text-[11px] text-neutral-500">{slot.description}</div>
                        </div>
                        {assigned && (
                          <Button size="xs" variant="ghost" onClick={() => patchReferenceSlot(slot.key, null)}>
                            Clear
                          </Button>
                        )}
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                        <Input
                          size="sm"
                          value={assigned?.asset_id ?? ''}
                          onChange={(e) => {
                            const assetId = e.target.value;
                            if (!assetId.trim()) {
                              patchReferenceSlot(slot.key, null);
                              return;
                            }
                            patchReferenceSlot(slot.key, {
                              asset_id: assetId,
                              kind: assigned?.kind ?? slot.defaultKind,
                              source: assigned?.source ?? 'manual',
                            });
                          }}
                          placeholder={`Asset ID for ${slot.label.toLowerCase()}`}
                        />
                        <div className="flex items-center gap-1">
                          <Badge color="blue">{assigned?.kind ?? slot.defaultKind}</Badge>
                          {assigned?.source && <Badge color="gray">{assigned.source}</Badge>}
                        </div>
                      </div>
                      {assigned && (
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-neutral-400">
                          {assigned.shot && <span className="rounded bg-neutral-900/60 px-1.5 py-0.5">shot:{assigned.shot}</span>}
                          {assigned.view && <span className="rounded bg-neutral-900/60 px-1.5 py-0.5">view:{assigned.view}</span>}
                          {assigned.expression_state && <span className="rounded bg-neutral-900/60 px-1.5 py-0.5">state:{assigned.expression_state}</span>}
                          {assigned.pose && <span className="rounded bg-neutral-900/60 px-1.5 py-0.5">pose:{assigned.pose}</span>}
                          {assigned.note && <span className="rounded bg-neutral-900/60 px-1.5 py-0.5">note:{assigned.note}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Assets ─────────────────────────────────────────────── */}
            {activeSection === 'assets' && (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold text-neutral-200">Reference Assets</p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    Pipeline stage progress and per-kind reference asset editing.
                  </p>
                </div>

                {/* Pipeline stages */}
                {PIPELINE_STAGES.map((stage) => {
                  const status = stageStatus(allAssets, stage);
                  const kindAssets = assetsByKind(allAssets, stage.kind);
                  return (
                    <DisclosureSection
                      key={stage.id}
                      label={
                        <span className="flex items-center gap-2">
                          <span className="text-sm">{stage.title}</span>
                          <Badge color={status.color}>{status.label}</Badge>
                        </span>
                      }
                      defaultOpen={false}
                      size="sm"
                      bordered
                    >
                      <div className="space-y-2 pt-1">
                        <p className="text-xs text-neutral-500">{stage.description}</p>
                        <div className="space-y-1.5">
                          {stage.steps.map((step) => {
                            const matching = kindAssets.filter((a) => {
                              if ('expression_state' in step && step.expression_state) return a.expression_state === step.expression_state;
                              if ('pose' in step && step.pose) return a.pose === step.pose;
                              if (step.shot && step.view) return a.shot === step.shot && a.view === step.view;
                              if (step.shot) return a.shot === step.shot;
                              return false;
                            });
                            return <StepCard key={step.label} step={step} matchingAssets={matching} />;
                          })}
                        </div>
                      </div>
                    </DisclosureSection>
                  );
                })}

                {/* Per-kind editors */}
                <div className="space-y-3 pt-1">
                  <p className="text-xs text-neutral-500">
                    Manage structured reference assets by kind (identity, expression, pose, outfit). Each asset carries metadata for shot, view, pose, and expression.
                  </p>
                  {KIND_OPTIONS.map(({ value: kind }) => (
                    <RefAssetEditor
                      key={kind}
                      kind={kind}
                      assets={assetsByKind(allAssets, kind)}
                      onUpdate={(updated) => handleKindUpdate(kind, updated)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ── Scene Prep ─────────────────────────────────────────── */}
            {activeSection === 'scene-prep' && (
              <div className="space-y-2">
                <div>
                  <p className="text-sm font-semibold text-neutral-200">Scene Prep</p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    Embedded host for the reusable Scene Prep panel. Pre-fills cast and guidance refs from this character&apos;s curated slots, but remains a generic multi-entity prep workflow.
                  </p>
                </div>
                <div className="rounded border border-neutral-700/40 bg-neutral-900/30">
                  <ScenePrepPanel
                    key={`scene-prep-embed:${characterId || 'draft'}`}
                    initialBasePrompt={suggestedScenePrompt}
                    hostPrefill={scenePrepPrefill}
                    draftPersistenceKey={characterId ? `scene-prep:character:${characterId}` : null}
                  />
                </div>
              </div>
            )}

            {/* ── Quick Batch ────────────────────────────────────────── */}
            {activeSection === 'quick-batch' && (
              <div className="space-y-2.5">
                <div>
                  <p className="text-sm font-semibold text-neutral-200">
                    Quick Scene Batch{' '}
                    <span className="text-xs font-normal text-neutral-500">(Experimental)</span>
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    Launch a template-backed batch directly from this character. Uses backend template fanout and records character/tag intents in <code>run_context</code> for provenance and later tagging.
                  </p>
                </div>

                <FormField label="Scene Template ID / Slug" size="sm">
                  <Input
                    size="sm"
                    value={scenePackTemplateId}
                    onChange={(e) => setScenePackTemplateId(e.target.value)}
                    placeholder="e.g. anne-cafe-scene-pack"
                  />
                </FormField>

                <FormField label="Base Scene Prompt" size="sm">
                  <Input
                    size="sm"
                    value={scenePackPrompt}
                    onChange={(e) => setScenePackPrompt(e.target.value)}
                    placeholder={suggestedScenePrompt}
                  />
                </FormField>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <FormField label="Provider" size="sm">
                    <Input
                      size="sm"
                      value={scenePackProviderId}
                      onChange={(e) => setScenePackProviderId(e.target.value)}
                      placeholder="pixverse"
                    />
                  </FormField>
                  <FormField label="Variant Count (1-8)" size="sm">
                    <Input
                      size="sm"
                      type="number"
                      min={1}
                      max={8}
                      value={scenePackCount}
                      onChange={(e) => setScenePackCount(e.target.value)}
                    />
                  </FormField>
                </div>

                <div className="rounded border border-neutral-700/40 bg-neutral-800/30 px-2.5 py-2 text-xs text-neutral-400">
                  <div>
                    Mode: <span className="font-medium text-neutral-200">{scenePackOperation}</span>
                    {primaryIdentityAssetId != null && (
                      <span className="ml-2 text-neutral-500">
                        (using {slottedPrimaryIdentityAssetId != null ? 'slot' : 'identity ref'} asset {primaryIdentityAssetId} as source)
                      </span>
                    )}
                  </div>
                  <div className="mt-1">
                    Guidance refs: <span className="font-medium text-neutral-200">{characterGuidancePlan ? 'enabled' : 'none yet'}</span>
                  </div>
                  <div className="mt-1">
                    Curated slots: <span className="font-medium text-neutral-200">{Object.keys(referenceSlots).length}</span>
                  </div>
                  <div className="mt-1 text-neutral-500">
                    Tags are not auto-applied yet; tag intents are recorded in run metadata to avoid unsafe writes while iterating.
                  </div>
                </div>

                {scenePackError && (
                  <div className="rounded border border-red-900/40 bg-red-900/20 px-2.5 py-2 text-xs text-red-200">
                    {scenePackError}
                  </div>
                )}
                {scenePackStatus && !scenePackError && (
                  <div className="rounded border border-neutral-700/40 bg-neutral-800/40 px-2.5 py-2 text-xs text-neutral-300">
                    {scenePackStatus}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={launchScenePack} disabled={scenePackSubmitting}>
                    {scenePackSubmitting ? 'Launching...' : 'Launch Scene Pack'}
                  </Button>
                  {!characterId && (
                    <span className="text-xs text-amber-400">Requires a saved character_id.</span>
                  )}
                </div>
              </div>
            )}

            {/* ── Templates ──────────────────────────────────────────── */}
            {activeSection === 'templates' && (
              <div className="space-y-2">
                <div>
                  <p className="text-sm font-semibold text-neutral-200">Template Launch Presets</p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    Pre-select template IDs/slugs for each ref stage. These will plug into the template execution workflow.
                  </p>
                </div>
                {TEMPLATE_SLOTS.map(({ key, label, placeholder }) => (
                  <FormField key={key} label={label} size="sm">
                    <Input
                      size="sm"
                      value={presets[key]}
                      onChange={(e) => handlePresetChange(key, e.target.value)}
                      placeholder={placeholder}
                    />
                  </FormField>
                ))}
              </div>
            )}

            {/* ── Tagging ────────────────────────────────────────────── */}
            {activeSection === 'tagging' && (
              <div className="space-y-2.5">
                <div>
                  <p className="text-sm font-semibold text-neutral-200">Tagging Guidance</p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    Use these tag conventions when labelling generated assets for game integration. Click any tag to copy.
                  </p>
                </div>
                {RECOMMENDED_TAGS.map(({ category, examples }) => (
                  <div key={category}>
                    <p className="mb-1 text-xs font-medium text-neutral-400">{category}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {examples.map((tag) => (
                        <CopyableTag key={tag} tag={tag} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
        }
      />
    </div>
  );
}

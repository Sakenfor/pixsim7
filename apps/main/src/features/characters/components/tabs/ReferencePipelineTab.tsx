import { Badge, Button, DisclosureSection, FormField, Input, Select } from '@pixsim7/shared.ui';
import { useCallback, useMemo, useState } from 'react';

import type { CharacterDetail, ReferenceAsset } from '@lib/api/characters';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface StageStatus {
  label: string;
  color: 'gray' | 'yellow' | 'green';
}

type AssetKind = 'identity' | 'expression_ref' | 'pose_ref' | 'outfit_ref';

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

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function assetsByKind(assets: ReferenceAsset[], kind: AssetKind): ReferenceAsset[] {
  return assets.filter((a) => a.kind === kind);
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

  const handlePresetChange = useCallback(
    (key: keyof TemplatePresets, value: string) => {
      const next: TemplatePresets = { ...presets, [key]: value };
      onChange({ tags: { ...tags, _template_presets: next } });
    },
    [presets, tags, onChange],
  );

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

  return (
    <div className="space-y-4">
      <p className="text-xs text-neutral-500">
        Build reusable game-ready reference surfaces for this character. Work through each stage in order.
      </p>

      {/* ── Recommended order checklist ─────────────────────────── */}
      <div className="rounded border border-neutral-700/50 bg-neutral-850 p-3">
        <p className="mb-2 text-xs font-semibold text-neutral-400 uppercase tracking-wide">Recommended order</p>
        <ol className="space-y-1">
          {CHECKLIST_STEPS.map(({ step, label, key }) => {
            const done = checklistDone[key];
            return (
              <li key={key} className="flex items-center gap-2 text-xs">
                <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${done ? 'bg-green-600 text-white' : 'bg-neutral-700 text-neutral-400'}`}>
                  {done ? '\u2713' : step}
                </span>
                <span className={done ? 'text-neutral-400 line-through' : 'text-neutral-300'}>{label}</span>
              </li>
            );
          })}
        </ol>
      </div>

      {/* ── Pipeline stages ────────────────────────────────────── */}
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

      {/* ── Structured reference assets ────────────────────────── */}
      <DisclosureSection
        label={<span className="text-sm">Reference Assets</span>}
        defaultOpen={false}
        size="sm"
        bordered
      >
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
      </DisclosureSection>

      {/* ── Template launch presets ─────────────────────────────── */}
      <DisclosureSection
        label={<span className="text-sm">Template Launch Presets</span>}
        defaultOpen={false}
        size="sm"
        bordered
      >
        <div className="space-y-2 pt-1">
          <p className="text-xs text-neutral-500">
            Pre-select template IDs/slugs for each ref stage. These will plug into the template execution workflow later.
          </p>
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
      </DisclosureSection>

      {/* ── Tagging guidance ───────────────────────────────────── */}
      <DisclosureSection
        label={<span className="text-sm">Tagging Guidance</span>}
        defaultOpen={false}
        size="sm"
        bordered
      >
        <div className="space-y-2.5 pt-1">
          <p className="text-xs text-neutral-500">
            Use these tag conventions when labelling generated assets for game integration. Click any tag to copy.
          </p>
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
      </DisclosureSection>
    </div>
  );
}

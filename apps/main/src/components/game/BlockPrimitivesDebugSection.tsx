import { Button, useToast } from '@pixsim7/shared.ui';
import { useEffect, useMemo, useState } from 'react';

import {
  buildPrimitiveSelectionRequestFromBehavior,
  type BuildPrimitiveSelectionRequestFromBehaviorRequest,
  selectPrimitiveBlocksFromBehavior,
} from '@lib/api';
import { resolveGameNpcs } from '@lib/resolvers';

import { useEffectiveAuthoringIds } from '@features/contextHub';

type NpcChoice = {
  id: number;
  name: string;
  worldId: number | null;
};

type NpcSummaryLike = {
  id: number;
  name?: string | null;
  world_id?: number | null;
  worldId?: number | null;
};

type DebugResult = {
  mode: 'build' | 'select';
  payload: unknown;
  timestamp: number;
};

export interface BlockPrimitivesDebugSectionProps {
  defaultWorldId?: number | null;
  defaultSessionId?: number | null;
  title?: string;
  className?: string;
}

function parseOptionalInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const next = Number(trimmed);
  if (!Number.isFinite(next)) return null;
  return Math.trunc(next);
}

function parseOptionalFloat(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const next = Number(trimmed);
  if (!Number.isFinite(next)) return null;
  return next;
}

function parseTagList(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function addWorldTimeDelta(currentInput: string, deltaSeconds: number): string {
  const current = parseOptionalFloat(currentInput) ?? 0;
  return String(current + deltaSeconds);
}

export function BlockPrimitivesDebugSection({
  defaultWorldId = null,
  defaultSessionId = null,
  title = 'Block Primitives Debug',
  className,
}: BlockPrimitivesDebugSectionProps) {
  const effectiveIds = useEffectiveAuthoringIds({
    fallbackWorldId: defaultWorldId,
    fallbackSessionId: defaultSessionId,
  });
  const resolvedDefaultWorldId = effectiveIds.worldId;
  const resolvedDefaultSessionId = effectiveIds.sessionId;
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [sessionIdInput, setSessionIdInput] = useState('');
  const [worldIdInput, setWorldIdInput] = useState('');
  const [leadNpcIdInput, setLeadNpcIdInput] = useState('');
  const [partnerNpcIdInput, setPartnerNpcIdInput] = useState('');
  const [worldTimeInput, setWorldTimeInput] = useState('');
  const [poseInput, setPoseInput] = useState('');
  const [moodInput, setMoodInput] = useState('');
  const [intimacyLevelInput, setIntimacyLevelInput] = useState('');
  const [branchIntentInput, setBranchIntentInput] = useState('');
  const [previousBlockIdInput, setPreviousBlockIdInput] = useState('');
  const [maxDurationInput, setMaxDurationInput] = useState('');
  const [requiredTagsInput, setRequiredTagsInput] = useState('');
  const [excludeTagsInput, setExcludeTagsInput] = useState('');
  const [includeSceneIntentTag, setIncludeSceneIntentTag] = useState(false);
  const [allowLlmFallback, setAllowLlmFallback] = useState(false);
  const [llmProfileIdInput, setLlmProfileIdInput] = useState('');
  const [result, setResult] = useState<DebugResult | null>(null);
  const [npcs, setNpcs] = useState<NpcChoice[]>([]);

  useEffect(() => {
    let cancelled = false;

    const loadNpcs = async () => {
      try {
        const list = await resolveGameNpcs({}, {
          consumerId: 'BlockPrimitivesDebugSection.loadNpcs',
        });
        if (cancelled) return;

        const mapped = list
          .map((npc) => {
            const source = npc as NpcSummaryLike;
            const id = Number(source.id);
            if (!Number.isFinite(id)) return null;
            const worldRef = Number(source.world_id ?? source.worldId);
            return {
              id: Math.trunc(id),
              name: String(source.name ?? `NPC ${Math.trunc(id)}`),
              worldId: Number.isFinite(worldRef) ? Math.trunc(worldRef) : null,
            } as NpcChoice;
          })
          .filter((npc): npc is NpcChoice => npc != null)
          .sort((a, b) => a.id - b.id);

        setNpcs(mapped);
      } catch {
        if (!cancelled) setNpcs([]);
      }
    };

    void loadNpcs();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredNpcs = useMemo(() => {
    const worldFilter = parseOptionalInt(worldIdInput) ?? resolvedDefaultWorldId;
    if (worldFilter == null) return npcs;
    return npcs.filter((npc) => npc.worldId == null || npc.worldId === worldFilter);
  }, [resolvedDefaultWorldId, npcs, worldIdInput]);

  const applyDefaults = () => {
    if (resolvedDefaultWorldId != null) {
      setWorldIdInput(String(resolvedDefaultWorldId));
    }
    if (resolvedDefaultSessionId != null) {
      setSessionIdInput(String(resolvedDefaultSessionId));
    }
  };

  const buildRequest = (): BuildPrimitiveSelectionRequestFromBehaviorRequest | null => {
    const sessionId = parseOptionalInt(sessionIdInput) ?? resolvedDefaultSessionId;
    if (sessionId == null || sessionId <= 0) {
      toast.warning('Enter a valid session ID');
      return null;
    }

    const worldId = parseOptionalInt(worldIdInput) ?? resolvedDefaultWorldId;
    if (worldId == null || worldId <= 0) {
      toast.warning('Enter a valid world ID');
      return null;
    }

    const leadNpcId = parseOptionalInt(leadNpcIdInput);
    if (leadNpcId == null || leadNpcId <= 0) {
      toast.warning('Enter a valid lead NPC ID');
      return null;
    }

    const partnerNpcId = parseOptionalInt(partnerNpcIdInput);
    const worldTime = parseOptionalFloat(worldTimeInput);
    const maxDuration = parseOptionalFloat(maxDurationInput);
    const pose = poseInput.trim();
    const mood = moodInput.trim();
    const intimacyLevel = intimacyLevelInput.trim();
    const branchIntent = branchIntentInput.trim();
    const previousBlockId = previousBlockIdInput.trim();

    return {
      session_id: sessionId,
      world_id: worldId,
      lead_npc_id: leadNpcId,
      ...(partnerNpcId != null && partnerNpcId > 0 ? { partner_npc_id: partnerNpcId } : {}),
      ...(worldTime != null ? { world_time: worldTime } : {}),
      include_scene_intent_tag: includeSceneIntentTag,
      ...(pose ? { pose } : {}),
      ...(mood ? { mood } : {}),
      ...(intimacyLevel ? { intimacy_level: intimacyLevel } : {}),
      ...(branchIntent ? { branch_intent: branchIntent } : {}),
      ...(previousBlockId ? { previous_block_id: previousBlockId } : {}),
      ...(maxDuration != null ? { max_duration: maxDuration } : {}),
      required_tags: parseTagList(requiredTagsInput),
      exclude_tags: parseTagList(excludeTagsInput),
      ...(allowLlmFallback ? { allow_llm_fallback: true } : {}),
      ...(llmProfileIdInput.trim() ? { llm_profile_id: llmProfileIdInput.trim() } : {}),
    };
  };

  const handleBuild = async () => {
    const request = buildRequest();
    if (!request) return;

    setBusy(true);
    try {
      const payload = await buildPrimitiveSelectionRequestFromBehavior(request);
      setResult({ mode: 'build', payload, timestamp: Date.now() });
      toast.success('Built request from behavior context');
    } catch (error) {
      toast.error(`Build failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSelect = async () => {
    const request = buildRequest();
    if (!request) return;

    setBusy(true);
    try {
      const payload = await selectPrimitiveBlocksFromBehavior(request);
      setResult({ mode: 'select', payload, timestamp: Date.now() });
      toast.success(`Selection completed (${payload.blocks.length} block(s))`);
    } catch (error) {
      toast.error(`Selection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={className ?? 'text-xs'}>
      <div className="font-semibold mb-2">{title}</div>
      <div className="text-neutral-600 dark:text-neutral-300 mb-2">
        Build or run behavior-driven block primitive selection for this context.
      </div>
      <div className="text-neutral-600 dark:text-neutral-300 mb-3 space-y-1">
        <div>Default world: {resolvedDefaultWorldId ?? 'N/A'}</div>
        <div>Default session: {resolvedDefaultSessionId ?? 'N/A'}</div>
        <div>World source: {effectiveIds.worldSource}</div>
        <div>Session source: {effectiveIds.sessionSource}</div>
        <div className="text-[10px]">
          Leave world/session empty to follow defaults; enter values to override.
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <label className="flex flex-col gap-1">
          <span className="text-neutral-600 dark:text-neutral-300">World ID</span>
          <input
            value={worldIdInput}
            onChange={(event) => setWorldIdInput(event.target.value)}
            placeholder={resolvedDefaultWorldId != null ? String(resolvedDefaultWorldId) : 'Required (default context)'}
            className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-neutral-600 dark:text-neutral-300">Session ID</span>
          <input
            value={sessionIdInput}
            onChange={(event) => setSessionIdInput(event.target.value)}
            placeholder={resolvedDefaultSessionId != null ? String(resolvedDefaultSessionId) : 'Required (default context)'}
            className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <label className="flex flex-col gap-1">
          <span className="text-neutral-600 dark:text-neutral-300">Lead NPC ID</span>
          <input
            list="block-primitives-debug-npc-options"
            value={leadNpcIdInput}
            onChange={(event) => setLeadNpcIdInput(event.target.value)}
            placeholder="Required"
            className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-neutral-600 dark:text-neutral-300">Partner NPC ID (optional)</span>
          <input
            list="block-primitives-debug-npc-options"
            value={partnerNpcIdInput}
            onChange={(event) => setPartnerNpcIdInput(event.target.value)}
            placeholder="Optional"
            className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
          />
        </label>
      </div>

      <datalist id="block-primitives-debug-npc-options">
        {filteredNpcs.map((npc) => (
          <option key={npc.id} value={npc.id}>
            {npc.name}
            {npc.worldId != null ? ` (world ${npc.worldId})` : ''}
          </option>
        ))}
      </datalist>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <label className="flex flex-col gap-1">
          <span className="text-neutral-600 dark:text-neutral-300">Mood (optional)</span>
          <input
            value={moodInput}
            onChange={(event) => setMoodInput(event.target.value)}
            placeholder="Derived when empty"
            className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-neutral-600 dark:text-neutral-300">Pose (optional)</span>
          <input
            value={poseInput}
            onChange={(event) => setPoseInput(event.target.value)}
            placeholder="e.g. sit"
            className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
          />
        </label>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-2">
        <label className="flex flex-col gap-1">
          <span className="text-neutral-600 dark:text-neutral-300">Intimacy (optional)</span>
          <input
            value={intimacyLevelInput}
            onChange={(event) => setIntimacyLevelInput(event.target.value)}
            placeholder="e.g. warm"
            className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-neutral-600 dark:text-neutral-300">Branch intent (optional)</span>
          <input
            value={branchIntentInput}
            onChange={(event) => setBranchIntentInput(event.target.value)}
            placeholder="e.g. playful"
            className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-neutral-600 dark:text-neutral-300">Max duration (optional)</span>
          <input
            value={maxDurationInput}
            onChange={(event) => setMaxDurationInput(event.target.value)}
            placeholder="seconds"
            className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <label className="flex flex-col gap-1">
          <span className="text-neutral-600 dark:text-neutral-300">World time override (optional)</span>
          <input
            value={worldTimeInput}
            onChange={(event) => setWorldTimeInput(event.target.value)}
            placeholder="Uses session.world_time when empty"
            className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-neutral-600 dark:text-neutral-300">Previous block ID (optional)</span>
          <input
            value={previousBlockIdInput}
            onChange={(event) => setPreviousBlockIdInput(event.target.value)}
            placeholder="block_id"
            className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
          />
        </label>
      </div>

      <div className="flex gap-2 mb-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setWorldTimeInput(addWorldTimeDelta(worldTimeInput, -3600))}
          disabled={busy}
        >
          -1h
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setWorldTimeInput(addWorldTimeDelta(worldTimeInput, 3600))}
          disabled={busy}
        >
          +1h
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setWorldTimeInput(addWorldTimeDelta(worldTimeInput, -86400))}
          disabled={busy}
        >
          -1d
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setWorldTimeInput(addWorldTimeDelta(worldTimeInput, 86400))}
          disabled={busy}
        >
          +1d
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setWorldTimeInput('')}
          disabled={busy}
        >
          Clear Time
        </Button>
      </div>

      <label className="flex items-center gap-2 mb-1">
        <input
          type="checkbox"
          checked={includeSceneIntentTag}
          onChange={(event) => setIncludeSceneIntentTag(event.target.checked)}
        />
        <span className="text-neutral-600 dark:text-neutral-300">Include scene-intent tag</span>
      </label>
      <label className="flex items-center gap-2 mb-1">
        <input
          type="checkbox"
          checked={allowLlmFallback}
          onChange={(event) => setAllowLlmFallback(event.target.checked)}
        />
        <span className="text-neutral-600 dark:text-neutral-300">LLM fallback for unresolved slots</span>
      </label>
      {allowLlmFallback && (
        <label className="flex flex-col gap-1 mb-2 ml-5">
          <span className="text-neutral-600 dark:text-neutral-300 text-[10px]">Profile ID (default: assistant:creative)</span>
          <input
            value={llmProfileIdInput}
            onChange={(event) => setLlmProfileIdInput(event.target.value)}
            placeholder="assistant:creative"
            className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
          />
        </label>
      )}

      <div className="grid grid-cols-1 gap-2 mb-3">
        <label className="flex flex-col gap-1">
          <span className="text-neutral-600 dark:text-neutral-300">Required tags (comma separated)</span>
          <input
            value={requiredTagsInput}
            onChange={(event) => setRequiredTagsInput(event.target.value)}
            placeholder="location:deck_cafe, scene_intent:idle"
            className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-neutral-600 dark:text-neutral-300">Exclude tags (comma separated)</span>
          <input
            value={excludeTagsInput}
            onChange={(event) => setExcludeTagsInput(event.target.value)}
            placeholder="nsfw, combat"
            className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
          />
        </label>
      </div>

      <div className="flex gap-2 mb-3">
        <Button size="sm" variant="ghost" onClick={applyDefaults} disabled={busy}>
          Apply Defaults
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            void handleBuild();
          }}
          disabled={busy}
        >
          Build Request
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            void handleSelect();
          }}
          disabled={busy}
        >
          Run Select
        </Button>
      </div>

      {!result ? (
        <div className="text-neutral-500 dark:text-neutral-400">
          No debug run yet.
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-neutral-600 dark:text-neutral-300">
            Result: {result.mode} at {new Date(result.timestamp).toLocaleTimeString()}
          </div>
          <pre className="max-h-56 overflow-auto text-[11px] p-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900">
            {JSON.stringify(result.payload, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

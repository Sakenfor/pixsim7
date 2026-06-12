/**
 * Structured editor for a location's hotspots.
 *
 * Replaces raw-JSON hotspot editing in the Game World editor:
 * - Action types come from the shared gameActionRegistry (mirrors
 *   GET /api/v1/game/actions) instead of hardcoded options.
 * - Action targets are picked from real world entities (scenes, locations,
 *   NPCs) instead of free-text numeric inputs.
 * - Hotspot targets (mesh / rect2d) are edited as structured fields.
 * - Only `meta` stays JSON, edited in a validating textarea that never
 *   silently drops keystrokes.
 */
import { gameActionRegistry } from '@pixsim7/game.engine';
import type { HotspotAction, HotspotActionType, HotspotTargetRect2d } from '@pixsim7/shared.types';
import { Button, Input, Select } from '@pixsim7/shared.ui';
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';

import type {
  GameHotspotDTO,
  GameLocationSummary,
  GameNpcSummary,
  GameSceneSummary,
} from '@lib/api/game';
import { listGameNpcs, listGameScenes } from '@lib/api/game';

import { validateHotspots } from './hotspotEditorModel';

interface ReferenceOption {
  id: number;
  label: string;
}

interface ReferenceSelectProps {
  label: string;
  value: number | string | null | undefined;
  options: ReferenceOption[];
  isLoading: boolean;
  loadError: string | null;
  placeholder: string;
  onChange: (id: number | null) => void;
}

function ReferenceSelect({
  label,
  value,
  options,
  isLoading,
  loadError,
  placeholder,
  onChange,
}: ReferenceSelectProps) {
  const numericValue = value == null || value === '' ? null : Number(value);

  if (loadError) {
    // Picker data failed to load: degrade to a manual id input so authoring
    // is not blocked, but say so instead of pretending the list is empty.
    return (
      <div>
        <label className="mb-1 block text-xs text-neutral-600 dark:text-neutral-400">
          {label}
        </label>
        <Input
          size="sm"
          type="number"
          value={numericValue ?? ''}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const trimmed = event.target.value.trim();
            const parsed = trimmed ? Number(trimmed) : null;
            onChange(parsed != null && Number.isFinite(parsed) ? parsed : null);
          }}
          placeholder={placeholder}
        />
        <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
          Couldn't load options ({loadError}); enter an id manually.
        </p>
      </div>
    );
  }

  const hasValueInOptions =
    numericValue != null && options.some((option) => option.id === numericValue);

  return (
    <div>
      <label className="mb-1 block text-xs text-neutral-600 dark:text-neutral-400">
        {label}
      </label>
      <Select
        size="sm"
        value={numericValue != null ? String(numericValue) : ''}
        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
          onChange(event.target.value ? Number(event.target.value) : null)
        }
        disabled={isLoading}
      >
        <option value="">{isLoading ? 'Loading...' : placeholder}</option>
        {numericValue != null && !hasValueInOptions && (
          <option value={String(numericValue)}>
            #{numericValue} (not found in this world)
          </option>
        )}
        {options.map((option) => (
          <option key={option.id} value={String(option.id)}>
            {option.label} (#{option.id})
          </option>
        ))}
      </Select>
    </div>
  );
}

interface HotspotMetaJsonEditorProps {
  value: Record<string, unknown> | null | undefined;
  onChange: (meta: Record<string, unknown> | undefined) => void;
}

function HotspotMetaJsonEditor({ value, onChange }: HotspotMetaJsonEditorProps) {
  const [text, setText] = useState(() =>
    value && Object.keys(value).length > 0 ? JSON.stringify(value, null, 2) : '',
  );
  const [parseError, setParseError] = useState<string | null>(null);
  const lastCommittedRef = useRef(JSON.stringify(value ?? null));

  // Re-sync from props only when the change came from outside (e.g. reload
  // after save), never while the author is mid-edit on invalid JSON.
  useEffect(() => {
    const incoming = JSON.stringify(value ?? null);
    if (incoming !== lastCommittedRef.current) {
      lastCommittedRef.current = incoming;
      setText(value && Object.keys(value).length > 0 ? JSON.stringify(value, null, 2) : '');
      setParseError(null);
    }
  }, [value]);

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const nextText = event.target.value;
    setText(nextText);

    const trimmed = nextText.trim();
    if (!trimmed) {
      lastCommittedRef.current = JSON.stringify(null);
      setParseError(null);
      onChange(undefined);
      return;
    }

    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setParseError('Meta must be a JSON object.');
        return;
      }
      lastCommittedRef.current = JSON.stringify(parsed);
      setParseError(null);
      onChange(parsed as Record<string, unknown>);
    } catch {
      setParseError('Invalid JSON; changes are not applied until it parses.');
    }
  };

  return (
    <div className="space-y-1">
      <textarea
        value={text}
        onChange={handleChange}
        placeholder='Optional meta JSON, e.g. {"tooltip": "Locked door"}'
        rows={3}
        spellCheck={false}
        className={`w-full rounded border bg-white px-2 py-1 font-mono text-xs dark:bg-neutral-900 ${
          parseError
            ? 'border-red-400 dark:border-red-700'
            : 'border-neutral-300 dark:border-neutral-700'
        }`}
      />
      {parseError && (
        <p className="text-[11px] text-red-600 dark:text-red-400">{parseError}</p>
      )}
    </div>
  );
}

const DEFAULT_RECT2D: HotspotTargetRect2d = { x: 0.4, y: 0.4, w: 0.2, h: 0.2 };
const RECT2D_FIELDS: Array<keyof HotspotTargetRect2d> = ['x', 'y', 'w', 'h'];

interface HotspotListEditorProps {
  hotspots: GameHotspotDTO[];
  worldId: number | null;
  locations: GameLocationSummary[];
  onChange: (hotspots: GameHotspotDTO[]) => void;
}

export function HotspotListEditor({
  hotspots,
  worldId,
  locations,
  onChange,
}: HotspotListEditorProps) {
  const [scenes, setScenes] = useState<GameSceneSummary[]>([]);
  const [npcs, setNpcs] = useState<GameNpcSummary[]>([]);
  const [isLoadingReferences, setIsLoadingReferences] = useState(false);
  const [referenceError, setReferenceError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    setIsLoadingReferences(true);
    setReferenceError(null);
    (async () => {
      try {
        const scopedOpts = worldId != null ? { worldId } : undefined;
        const [loadedScenes, loadedNpcs] = await Promise.all([
          listGameScenes(scopedOpts),
          listGameNpcs(scopedOpts),
        ]);
        if (!isActive) return;
        setScenes(loadedScenes);
        setNpcs(loadedNpcs);
      } catch (loadError: unknown) {
        if (!isActive) return;
        setReferenceError(
          loadError instanceof Error ? loadError.message : String(loadError),
        );
      } finally {
        if (isActive) {
          setIsLoadingReferences(false);
        }
      }
    })();
    return () => {
      isActive = false;
    };
  }, [worldId]);

  const updateHotspot = (index: number, patch: Partial<GameHotspotDTO>) => {
    onChange(hotspots.map((hotspot, i) => (i === index ? { ...hotspot, ...patch } : hotspot)));
  };

  const updateTarget = (
    index: number,
    updater: (target: NonNullable<GameHotspotDTO['target']>) => NonNullable<GameHotspotDTO['target']>,
  ) => {
    const hotspot = hotspots[index];
    const nextTarget = updater({ ...(hotspot.target ?? {}) });
    const hasTarget = Object.keys(nextTarget).length > 0;
    updateHotspot(index, { target: hasTarget ? nextTarget : undefined });
  };

  const handleMeshChange = (index: number, objectName: string) => {
    updateTarget(index, (target) => {
      if (objectName.trim()) {
        return { ...target, mesh: { object_name: objectName } };
      }
      const rest = { ...target };
      delete rest.mesh;
      return rest;
    });
  };

  const handleRect2dChange = (
    index: number,
    field: keyof HotspotTargetRect2d,
    rawValue: string,
  ) => {
    const parsed = Number(rawValue);
    updateTarget(index, (target) => ({
      ...target,
      rect2d: {
        ...(target.rect2d ?? DEFAULT_RECT2D),
        [field]: Number.isFinite(parsed) ? parsed : 0,
      },
    }));
  };

  const handleAddRect2d = (index: number) => {
    updateTarget(index, (target) => ({ ...target, rect2d: { ...DEFAULT_RECT2D } }));
  };

  const handleRemoveRect2d = (index: number) => {
    updateTarget(index, (target) => {
      const rest = { ...target };
      delete rest.rect2d;
      return rest;
    });
  };

  const handleActionTypeChange = (index: number, rawType: string) => {
    if (!rawType) {
      updateHotspot(index, { action: undefined });
      return;
    }
    const hotspot = hotspots[index];
    const currentType = (hotspot.action as { type?: string } | null | undefined)?.type;
    if (currentType === rawType) {
      return;
    }
    updateHotspot(index, { action: { type: rawType as HotspotActionType } as HotspotAction });
  };

  const handleActionTargetChange = (index: number, field: string, id: number | null) => {
    const hotspot = hotspots[index];
    const action = { ...((hotspot.action ?? {}) as unknown as Record<string, unknown>) };
    if (!action.type) {
      return;
    }
    if (id == null) {
      delete action[field];
    } else {
      action[field] = id;
    }
    updateHotspot(index, { action: action as unknown as HotspotAction });
  };

  const handleAddHotspot = () => {
    onChange([...hotspots, { hotspot_id: '', target: {}, action: undefined, meta: undefined }]);
  };

  const handleRemoveHotspot = (index: number) => {
    onChange(hotspots.filter((_, i) => i !== index));
  };

  const referenceOptionsForField = (field: string): ReferenceOption[] => {
    switch (field) {
      case 'scene_id':
        return scenes.map((scene) => ({ id: scene.id, label: scene.title }));
      case 'target_location_id':
        return locations.map((location) => ({ id: location.id, label: location.name }));
      case 'npc_id':
        return npcs.map((npc) => ({ id: npc.id, label: npc.name }));
      default:
        return [];
    }
  };

  const labelForField = (field: string): string => {
    switch (field) {
      case 'scene_id':
        return 'Scene';
      case 'target_location_id':
        return 'Target Location';
      case 'npc_id':
        return 'NPC';
      default:
        return field;
    }
  };

  const issues = validateHotspots(hotspots);
  const issuesByIndex = new Map<number, string[]>();
  for (const issue of issues) {
    const existing = issuesByIndex.get(issue.index);
    if (existing) {
      existing.push(issue.message);
    } else {
      issuesByIndex.set(issue.index, [issue.message]);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" variant="secondary" onClick={handleAddHotspot}>
          + Add Hotspot
        </Button>
      </div>

      {hotspots.map((hotspot, index) => {
        const actionType = (hotspot.action as { type?: string } | null | undefined)?.type ?? '';
        const actionMeta = actionType ? gameActionRegistry.getOrNull(actionType) : undefined;
        const actionTargetValue = actionMeta
          ? ((hotspot.action as unknown as Record<string, unknown>)[actionMeta.requiredField] as
              | number
              | string
              | null
              | undefined)
          : undefined;
        const rowIssues = issuesByIndex.get(index) ?? [];
        const rect2d = hotspot.target?.rect2d ?? null;

        return (
          <div
            key={index}
            className={`space-y-3 rounded-lg border p-3 ${
              rowIssues.length > 0
                ? 'border-red-300 bg-red-50/40 dark:border-red-800/70 dark:bg-red-900/10'
                : 'border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800/50'
            }`}
          >
            <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-neutral-600 dark:text-neutral-400">
                  Hotspot ID
                </label>
                <Input
                  size="sm"
                  placeholder="hotspot_id"
                  value={hotspot.hotspot_id}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    updateHotspot(index, { hotspot_id: event.target.value })
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-neutral-600 dark:text-neutral-400">
                  Mesh Name (from glTF)
                </label>
                <Input
                  size="sm"
                  placeholder="mesh object name"
                  value={hotspot.target?.mesh?.object_name ?? ''}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    handleMeshChange(index, event.target.value)
                  }
                />
              </div>
            </div>

            <div className="border-t border-neutral-200 pt-3 dark:border-neutral-700">
              <div className="mb-2 flex items-center justify-between">
                <label className="block text-xs font-semibold">2D Rect Target</label>
                {rect2d ? (
                  <Button size="xs" variant="secondary" onClick={() => handleRemoveRect2d(index)}>
                    Remove Rect
                  </Button>
                ) : (
                  <Button size="xs" variant="secondary" onClick={() => handleAddRect2d(index)}>
                    + Add 2D Rect
                  </Button>
                )}
              </div>
              {rect2d ? (
                <div className="grid grid-cols-4 gap-2">
                  {RECT2D_FIELDS.map((field) => (
                    <div key={field}>
                      <label className="mb-1 block text-xs text-neutral-600 dark:text-neutral-400">
                        {field}
                      </label>
                      <Input
                        size="sm"
                        type="number"
                        step="0.01"
                        value={rect2d[field] ?? ''}
                        onChange={(event: ChangeEvent<HTMLInputElement>) =>
                          handleRect2dChange(index, field, event.target.value)
                        }
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  Optional normalized rect (0-1) for 2D view hit-testing.
                </p>
              )}
            </div>

            <div className="border-t border-neutral-200 pt-3 dark:border-neutral-700">
              <label className="mb-1 block text-xs font-semibold">Hotspot Action</label>
              <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-neutral-600 dark:text-neutral-400">
                    Action Type
                  </label>
                  <Select
                    size="sm"
                    value={actionType}
                    onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                      handleActionTypeChange(index, event.target.value)
                    }
                  >
                    <option value="">None</option>
                    {gameActionRegistry.all().map((meta) => (
                      <option key={meta.type} value={meta.type}>
                        {meta.icon} {meta.label}
                      </option>
                    ))}
                  </Select>
                  {actionMeta?.description && (
                    <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                      {actionMeta.description}
                    </p>
                  )}
                </div>

                {actionMeta && (
                  <ReferenceSelect
                    label={labelForField(actionMeta.requiredField)}
                    value={actionTargetValue}
                    options={referenceOptionsForField(actionMeta.requiredField)}
                    isLoading={isLoadingReferences}
                    loadError={referenceError}
                    placeholder={`Select ${labelForField(actionMeta.requiredField).toLowerCase()}...`}
                    onChange={(id) => handleActionTargetChange(index, actionMeta.requiredField, id)}
                  />
                )}
              </div>
            </div>

            <div className="border-t border-neutral-200 pt-3 dark:border-neutral-700">
              <label className="mb-1 block text-xs font-semibold">Meta (advanced)</label>
              <HotspotMetaJsonEditor
                value={hotspot.meta}
                onChange={(meta) => updateHotspot(index, { meta })}
              />
            </div>

            {rowIssues.length > 0 && (
              <ul className="space-y-0.5 text-[11px] text-red-600 dark:text-red-400">
                {rowIssues.map((message, issueIndex) => (
                  <li key={issueIndex}>{message}</li>
                ))}
              </ul>
            )}

            <div className="flex justify-end">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleRemoveHotspot(index)}
                className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
              >
                Remove Hotspot
              </Button>
            </div>
          </div>
        );
      })}

      {hotspots.length === 0 && (
        <p className="py-4 text-center text-xs text-neutral-500 dark:text-neutral-400">
          No hotspots yet. Click "Add Hotspot" to create one.
        </p>
      )}
    </div>
  );
}

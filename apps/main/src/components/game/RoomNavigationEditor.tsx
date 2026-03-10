import type {
  RoomCheckpointViewKind,
  RoomEdgeMoveKind,
  RoomNavigationValidationIssue,
} from '@pixsim7/shared.types';
import { ROOM_NAVIGATION_META_KEY, validateRoomNavigation } from '@pixsim7/shared.types';
import { Button, Input, Panel, Select } from '@pixsim7/shared.ui';
import { useEffect, useMemo, useState } from 'react';

import type { GameLocationDetail } from '@lib/api/game';
import { getRoomNavigation, saveGameLocationMeta, setRoomNavigation } from '@lib/api/game';

interface RoomNavigationEditorProps {
  location: GameLocationDetail;
  onLocationUpdate: (location: GameLocationDetail) => void;
}

const VIEW_KINDS: RoomCheckpointViewKind[] = ['cylindrical_pano', 'quad_directions'];
const MOVE_KINDS: RoomEdgeMoveKind[] = ['forward', 'turn_left', 'turn_right', 'door', 'custom'];
type RoomNavigationData = Extract<
  ReturnType<typeof validateRoomNavigation>,
  { ok: true }
>['data'];

const createDefaultRoomNavigation = (locationId: number): RoomNavigationData => ({
  version: 1,
  room_id: `location_${locationId}`,
  checkpoints: [],
  edges: [],
});

const createNextId = (prefix: string, existingIds: Set<string>): string => {
  let index = 1;
  while (existingIds.has(`${prefix}_${index}`)) {
    index += 1;
  }
  return `${prefix}_${index}`;
};

const parseOptionalNumber = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const readValidationIssuesFromError = (error: any): RoomNavigationValidationIssue[] => {
  const details = error?.response?.data?.detail?.details;
  if (!Array.isArray(details)) {
    return [];
  }
  return details
    .filter((item: any): item is { path: string; message: string } => typeof item?.path === 'string' && typeof item?.message === 'string')
    .map((item) => ({ path: item.path, message: item.message }));
};

export function RoomNavigationEditor({ location, onLocationUpdate }: RoomNavigationEditorProps) {
  const [navigation, setNavigation] = useState<RoomNavigationData>(() => createDefaultRoomNavigation(location.id));
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationIssues, setValidationIssues] = useState<RoomNavigationValidationIssue[]>([]);

  useEffect(() => {
    const roomNavigationPayload = (location.meta as Record<string, unknown> | null | undefined)?.[ROOM_NAVIGATION_META_KEY];
    if (roomNavigationPayload == null) {
      const nextNavigation = createDefaultRoomNavigation(location.id);
      setNavigation(nextNavigation);
      setSelectedCheckpointId(nextNavigation.start_checkpoint_id ?? null);
      setValidationIssues([]);
      setError(null);
      return;
    }

    const parsed = validateRoomNavigation(roomNavigationPayload);
    if (parsed.ok) {
      setNavigation(parsed.data);
      setSelectedCheckpointId(parsed.data.start_checkpoint_id ?? parsed.data.checkpoints[0]?.id ?? null);
      setValidationIssues([]);
      setError(null);
      return;
    }

    const fallbackNavigation = createDefaultRoomNavigation(location.id);
    setNavigation(fallbackNavigation);
    setSelectedCheckpointId(null);
    setValidationIssues(parsed.issues);
    setError(`Loaded invalid room_navigation data (${parsed.issues.length} issue(s)).`);
  }, [location.id, location.meta]);

  useEffect(() => {
    if (navigation.checkpoints.length === 0) {
      if (selectedCheckpointId !== null) {
        setSelectedCheckpointId(null);
      }
      return;
    }
    const exists = selectedCheckpointId
      ? navigation.checkpoints.some((checkpoint) => checkpoint.id === selectedCheckpointId)
      : false;
    if (!exists) {
      setSelectedCheckpointId(navigation.start_checkpoint_id ?? navigation.checkpoints[0]?.id ?? null);
    }
  }, [navigation.checkpoints, navigation.start_checkpoint_id, selectedCheckpointId]);

  const selectedCheckpoint = useMemo(
    () => navigation.checkpoints.find((checkpoint) => checkpoint.id === selectedCheckpointId) ?? null,
    [navigation.checkpoints, selectedCheckpointId],
  );

  const addCheckpoint = () => {
    let createdCheckpointId = '';
    setNavigation((prev) => {
      const checkpointId = createNextId('cp', new Set(prev.checkpoints.map((checkpoint) => checkpoint.id)));
      createdCheckpointId = checkpointId;
      return {
        ...prev,
        checkpoints: [
          ...prev.checkpoints,
          { id: checkpointId, label: `Checkpoint ${prev.checkpoints.length + 1}`, view: { kind: 'cylindrical_pano' }, hotspots: [] },
        ],
        start_checkpoint_id: prev.start_checkpoint_id ?? checkpointId,
      };
    });
    if (createdCheckpointId) {
      setSelectedCheckpointId(createdCheckpointId);
    }
  };

  const removeCheckpoint = (checkpointId: string) => {
    setNavigation((prev) => {
      const checkpoints = prev.checkpoints
        .filter((checkpoint) => checkpoint.id !== checkpointId)
        .map((checkpoint) => ({
          ...checkpoint,
          hotspots: checkpoint.hotspots.map((hotspot) =>
            hotspot.target_checkpoint_id === checkpointId
              ? { ...hotspot, target_checkpoint_id: undefined }
              : hotspot,
          ),
        }));
      return {
        ...prev,
        checkpoints,
        edges: prev.edges.filter((edge) => edge.from_checkpoint_id !== checkpointId && edge.to_checkpoint_id !== checkpointId),
        start_checkpoint_id: prev.start_checkpoint_id === checkpointId ? checkpoints[0]?.id : prev.start_checkpoint_id,
      };
    });
  };

  const updateCheckpoint = (patch: Partial<RoomNavigationData['checkpoints'][number]>) => {
    if (!selectedCheckpointId) {
      return;
    }
    setNavigation((prev) => ({
      ...prev,
      checkpoints: prev.checkpoints.map((checkpoint) =>
        checkpoint.id === selectedCheckpointId ? { ...checkpoint, ...patch } : checkpoint,
      ),
    }));
  };

  const addEdge = () => {
    setNavigation((prev) => {
      if (prev.checkpoints.length === 0) {
        return prev;
      }
      const edgeId = createNextId('edge', new Set(prev.edges.map((edge) => edge.id)));
      const fromCheckpointId = selectedCheckpointId && prev.checkpoints.some((checkpoint) => checkpoint.id === selectedCheckpointId)
        ? selectedCheckpointId
        : prev.checkpoints[0].id;
      const toCheckpointId = prev.checkpoints.find((checkpoint) => checkpoint.id !== fromCheckpointId)?.id ?? fromCheckpointId;
      return {
        ...prev,
        edges: [...prev.edges, { id: edgeId, from_checkpoint_id: fromCheckpointId, to_checkpoint_id: toCheckpointId, move_kind: 'forward' }],
      };
    });
  };

  const updateEdge = (edgeIndex: number, patch: Partial<RoomNavigationData['edges'][number]>) => {
    setNavigation((prev) => ({
      ...prev,
      edges: prev.edges.map((edge, index) => (index === edgeIndex ? { ...edge, ...patch } : edge)),
    }));
  };

  const removeEdge = (edgeIndex: number) => {
    setNavigation((prev) => ({
      ...prev,
      edges: prev.edges.filter((_, index) => index !== edgeIndex),
    }));
  };

  const handleSave = async () => {
    setError(null);
    const localValidation = validateRoomNavigation(navigation);
    if (!localValidation.ok) {
      setValidationIssues(localValidation.issues);
      setError(`Room navigation has ${localValidation.issues.length} validation issue(s).`);
      return;
    }

    setValidationIssues([]);
    setIsSaving(true);
    try {
      const updatedLocation = setRoomNavigation(location, localValidation.data);
      const savedLocation = await saveGameLocationMeta(location.id as any, updatedLocation.meta || {});
      onLocationUpdate(savedLocation);
      const savedNavigation = getRoomNavigation(savedLocation) ?? localValidation.data;
      setNavigation(savedNavigation);
    } catch (saveError: any) {
      const backendValidationIssues = readValidationIssuesFromError(saveError);
      if (backendValidationIssues.length > 0) {
        setValidationIssues(backendValidationIssues);
        setError(`Backend rejected room navigation (${backendValidationIssues.length} issue(s)).`);
      } else {
        setError(String(saveError?.message ?? saveError));
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Room Navigation (Beta)</h2>
          <p className="text-xs text-neutral-500">
            Stored in <code>meta.room_navigation</code> for this location.
          </p>
        </div>
        <Button size="sm" variant="primary" onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save Room Navigation'}
        </Button>
      </div>

      {error && <p className="text-sm text-red-500">Error: {error}</p>}

      {validationIssues.length > 0 && (
        <Panel className="space-y-2 border-red-300 dark:border-red-800">
          <h3 className="text-sm font-semibold text-red-700 dark:text-red-300">
            Validation issues ({validationIssues.length})
          </h3>
          <ul className="space-y-1 text-xs text-red-700 dark:text-red-300">
            {validationIssues.slice(0, 8).map((issue, index) => (
              <li key={`${issue.path}-${index}`}>
                <code>{issue.path}</code>: {issue.message}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Checkpoints ({navigation.checkpoints.length})</h3>
            <Button size="sm" variant="secondary" onClick={addCheckpoint}>
              + Add
            </Button>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium">Room ID</label>
            <Input
              size="sm"
              value={navigation.room_id}
              onChange={(event: any) => setNavigation((prev) => ({ ...prev, room_id: event.target.value }))}
              placeholder="room_id"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium">Start checkpoint</label>
            <Select
              size="sm"
              value={navigation.start_checkpoint_id ?? ''}
              onChange={(event: any) =>
                setNavigation((prev) => ({ ...prev, start_checkpoint_id: event.target.value || undefined }))
              }
            >
              <option value="">(none)</option>
              {navigation.checkpoints.map((checkpoint) => (
                <option key={checkpoint.id} value={checkpoint.id}>
                  {checkpoint.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            {navigation.checkpoints.map((checkpoint) => {
              const isActive = checkpoint.id === selectedCheckpointId;
              return (
                <div
                  key={checkpoint.id}
                  className={`rounded border ${
                    isActive
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-neutral-300 dark:border-neutral-700'
                  }`}
                >
                  <button
                    className="w-full text-left px-2 py-2"
                    onClick={() => setSelectedCheckpointId(checkpoint.id)}
                  >
                    <div className="text-xs font-semibold">{checkpoint.label}</div>
                    <div className="text-[11px] text-neutral-500">{checkpoint.id}</div>
                  </button>
                  <div className="px-2 pb-2 flex justify-end">
                    <Button
                      size="xs"
                      variant="secondary"
                      onClick={() => removeCheckpoint(checkpoint.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              );
            })}
            {navigation.checkpoints.length === 0 && (
              <p className="text-xs text-neutral-500">No checkpoints yet. Add one to start authoring.</p>
            )}
          </div>
        </Panel>

        <Panel className="space-y-3">
          <h3 className="text-sm font-semibold">Checkpoint Details</h3>
          {!selectedCheckpoint ? (
            <p className="text-xs text-neutral-500">Select a checkpoint to edit view configuration.</p>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="block text-xs font-medium">Label</label>
                <Input
                  size="sm"
                  value={selectedCheckpoint.label}
                  onChange={(event: any) => updateCheckpoint({ label: event.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium">View Kind</label>
                <Select
                  size="sm"
                  value={selectedCheckpoint.view.kind}
                  onChange={(event: any) =>
                    updateCheckpoint({ view: { ...selectedCheckpoint.view, kind: event.target.value as RoomCheckpointViewKind } })
                  }
                >
                  {VIEW_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </Select>
              </div>

              {selectedCheckpoint.view.kind === 'cylindrical_pano' ? (
                <div className="space-y-1">
                  <label className="block text-xs font-medium">Pano Asset ID</label>
                  <Input
                    size="sm"
                    value={selectedCheckpoint.view.pano_asset_id ?? ''}
                    onChange={(event: any) =>
                      updateCheckpoint({ view: { ...selectedCheckpoint.view, pano_asset_id: event.target.value || undefined } })
                    }
                    placeholder="asset id"
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    size="sm"
                    value={selectedCheckpoint.view.north_asset_id ?? ''}
                    onChange={(event: any) =>
                      updateCheckpoint({ view: { ...selectedCheckpoint.view, north_asset_id: event.target.value || undefined } })
                    }
                    placeholder="north_asset_id"
                  />
                  <Input
                    size="sm"
                    value={selectedCheckpoint.view.east_asset_id ?? ''}
                    onChange={(event: any) =>
                      updateCheckpoint({ view: { ...selectedCheckpoint.view, east_asset_id: event.target.value || undefined } })
                    }
                    placeholder="east_asset_id"
                  />
                  <Input
                    size="sm"
                    value={selectedCheckpoint.view.south_asset_id ?? ''}
                    onChange={(event: any) =>
                      updateCheckpoint({ view: { ...selectedCheckpoint.view, south_asset_id: event.target.value || undefined } })
                    }
                    placeholder="south_asset_id"
                  />
                  <Input
                    size="sm"
                    value={selectedCheckpoint.view.west_asset_id ?? ''}
                    onChange={(event: any) =>
                      updateCheckpoint({ view: { ...selectedCheckpoint.view, west_asset_id: event.target.value || undefined } })
                    }
                    placeholder="west_asset_id"
                  />
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                <Input
                  size="sm"
                  type="number"
                  value={selectedCheckpoint.view.fov_default ?? ''}
                  onChange={(event: any) =>
                    updateCheckpoint({ view: { ...selectedCheckpoint.view, fov_default: parseOptionalNumber(event.target.value) } })
                  }
                  placeholder="fov"
                  min="1"
                  max="180"
                  step="0.1"
                />
                <Input
                  size="sm"
                  type="number"
                  value={selectedCheckpoint.view.yaw_default ?? ''}
                  onChange={(event: any) =>
                    updateCheckpoint({ view: { ...selectedCheckpoint.view, yaw_default: parseOptionalNumber(event.target.value) } })
                  }
                  placeholder="yaw"
                  step="0.1"
                />
                <Input
                  size="sm"
                  type="number"
                  value={selectedCheckpoint.view.pitch_default ?? ''}
                  onChange={(event: any) =>
                    updateCheckpoint({ view: { ...selectedCheckpoint.view, pitch_default: parseOptionalNumber(event.target.value) } })
                  }
                  placeholder="pitch"
                  min="-90"
                  max="90"
                  step="0.1"
                />
              </div>
            </div>
          )}
        </Panel>

        <Panel className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Edges ({navigation.edges.length})</h3>
            <Button size="sm" variant="secondary" onClick={addEdge} disabled={navigation.checkpoints.length === 0}>
              + Add Edge
            </Button>
          </div>

          {navigation.edges.map((edge, edgeIndex) => (
            <div
              key={`${edge.id}-${edgeIndex}`}
              className="p-2 border rounded border-neutral-300 dark:border-neutral-700 space-y-2"
            >
              <Input
                size="sm"
                value={edge.id}
                onChange={(event: any) => updateEdge(edgeIndex, { id: event.target.value })}
                placeholder="edge id"
              />

              <div className="grid grid-cols-2 gap-2">
                <Select
                  size="sm"
                  value={edge.from_checkpoint_id}
                  onChange={(event: any) => updateEdge(edgeIndex, { from_checkpoint_id: event.target.value })}
                >
                  {navigation.checkpoints.map((checkpoint) => (
                    <option key={checkpoint.id} value={checkpoint.id}>{checkpoint.label}</option>
                  ))}
                </Select>
                <Select
                  size="sm"
                  value={edge.to_checkpoint_id}
                  onChange={(event: any) => updateEdge(edgeIndex, { to_checkpoint_id: event.target.value })}
                >
                  {navigation.checkpoints.map((checkpoint) => (
                    <option key={checkpoint.id} value={checkpoint.id}>{checkpoint.label}</option>
                  ))}
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Select
                  size="sm"
                  value={edge.move_kind}
                  onChange={(event: any) => updateEdge(edgeIndex, { move_kind: event.target.value as RoomEdgeMoveKind })}
                >
                  {MOVE_KINDS.map((moveKind) => (
                    <option key={moveKind} value={moveKind}>{moveKind}</option>
                  ))}
                </Select>
                <Input
                  size="sm"
                  value={edge.transition_profile ?? ''}
                  onChange={(event: any) =>
                    updateEdge(edgeIndex, { transition_profile: event.target.value || undefined })
                  }
                  placeholder="transition_profile (optional)"
                />
              </div>

              <div className="flex justify-end">
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={() => removeEdge(edgeIndex)}
                  className="text-red-600 hover:text-red-700"
                >
                  Remove Edge
                </Button>
              </div>
            </div>
          ))}

          {navigation.edges.length === 0 && (
            <p className="text-xs text-neutral-500">No edges yet. Add links to define traversal.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}

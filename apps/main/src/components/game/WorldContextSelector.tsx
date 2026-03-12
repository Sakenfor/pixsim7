import { Button, Modal, FormField, Input, useToast } from '@pixsim7/shared.ui';
import { useEffect, useState, useCallback, useRef } from 'react';

import {
  createGameWorld,
  type GameLocationSummary,
} from '@lib/api';
import { resolveGameLocations } from '@lib/resolvers';

import {
  CAP_EDITOR_CONTEXT,
  type EditorContextSnapshot,
  useCapability,
} from '@features/contextHub';
import { useWorldContextStore } from '@features/scene';

import { useSharedWorldSelection } from '@/hooks';

export function WorldContextSelector() {
  const toast = useToast();
  const { value: editorContext } = useCapability<EditorContextSnapshot>(CAP_EDITOR_CONTEXT);
  const locationId = editorContext?.world?.locationId ?? null;
  const setLocationId = useWorldContextStore((s) => s.setLocationId);
  const {
    worlds,
    selectedWorldId: worldId,
    setSelectedWorldId: setWorldId,
    isLoadingWorlds,
    worldLoadError,
    reloadWorlds,
  } = useSharedWorldSelection({ autoSelectFirst: true });

  const [locations, setLocations] = useState<GameLocationSummary[]>([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState(false);
  const [showNewWorldDialog, setShowNewWorldDialog] = useState(false);
  const [newWorldName, setNewWorldName] = useState('');
  const toastRef = useRef(toast);
  const locationIdRef = useRef<number | null>(locationId);

  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  useEffect(() => {
    locationIdRef.current = locationId;
  }, [locationId]);

  const loadLocationsForWorld = useCallback(async (activeWorldId: number) => {
    setIsLoadingLocations(true);
    try {
      const data = await resolveGameLocations(
        { worldId: activeWorldId },
        { consumerId: 'WorldContextSelector.loadLocations' },
      );

      const list = Array.isArray(data) ? data : [];
      setLocations(list);

      // Auto-select first location if none selected
      if (list.length > 0 && locationIdRef.current === null) {
        setLocationId(list[0].id);
      } else if (
        locationIdRef.current != null &&
        !list.some((location) => location.id === locationIdRef.current)
      ) {
        setLocationId(null);
      }
    } catch (error) {
      toastRef.current.error(
        `Failed to load locations: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      setIsLoadingLocations(false);
    }
  }, [setLocationId]);

  // Bubble world load errors to the existing toast channel.
  useEffect(() => {
    if (worldLoadError) {
      toastRef.current.error(`Failed to load worlds: ${worldLoadError}`);
    }
  }, [worldLoadError]);

  // Load locations when world changes
  useEffect(() => {
    if (worldId !== null) {
      void loadLocationsForWorld(worldId);
    } else {
      setLocations((prev) => (prev.length === 0 ? prev : []));
      if (locationIdRef.current !== null) {
        setLocationId(null);
      }
    }
  }, [worldId, loadLocationsForWorld, setLocationId]);

  const handleCreateWorld = useCallback(async () => {
    if (!newWorldName.trim()) {
      toast.error('World name is required');
      return;
    }

    try {
      const newWorld = await createGameWorld(newWorldName.trim());
      toast.success(`Created world: ${newWorld.name}`);
      setNewWorldName('');
      setShowNewWorldDialog(false);
      await reloadWorlds();
      setWorldId(newWorld.id);
    } catch (error) {
      toast.error(
        `Failed to create world: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }, [newWorldName, toast, reloadWorlds, setWorldId]);

  return (
    <div className="flex items-center gap-2">
      {/* World Selector */}
      <div className="flex items-center gap-1">
        <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">World:</label>
        <select
          value={worldId ?? ''}
          onChange={(e) => setWorldId(e.target.value ? Number(e.target.value) : null)}
          disabled={isLoadingWorlds}
          className="px-2 py-1 text-xs border rounded bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
        >
          <option value="">None</option>
          {worlds.map((world) => (
            <option key={world.id} value={world.id}>
              {world.name}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setShowNewWorldDialog(true)}
          className="text-xs"
        >
          + New
        </Button>
      </div>

      {/* Location Selector */}
      <div className="flex items-center gap-1">
        <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
          Location:
        </label>
        <select
          value={locationId ?? ''}
          onChange={(e) => setLocationId(e.target.value ? Number(e.target.value) : null)}
          disabled={isLoadingLocations || worldId === null}
          className="px-2 py-1 text-xs border rounded bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
        >
          <option value="">None</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </div>

      {/* New World Dialog */}
      <Modal
        isOpen={showNewWorldDialog}
        onClose={() => {
          setShowNewWorldDialog(false);
          setNewWorldName('');
        }}
        title="Create New World"
        size="sm"
      >
        <FormField label="World Name" required size="md">
          <Input
            type="text"
            size="md"
            value={newWorldName}
            onChange={(e) => setNewWorldName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCreateWorld();
              }
            }}
            placeholder="e.g., Main Story World"
            autoFocus
          />
        </FormField>

        <div className="flex gap-2 justify-end mt-4">
          <Button
            variant="secondary"
            onClick={() => {
              setShowNewWorldDialog(false);
              setNewWorldName('');
            }}
          >
            Cancel
          </Button>
          <Button variant="primary" onClick={handleCreateWorld}>
            Create
          </Button>
        </div>
      </Modal>
    </div>
  );
}

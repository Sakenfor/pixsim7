import { useEffect, useState, useCallback } from 'react';
import { Button, Modal, FormField, Input, useToast } from '@pixsim7/shared.ui';
import { useWorldContextStore } from '../stores/worldContextStore';
import {
  listGameWorlds,
  createGameWorld,
  listGameLocations,
  type GameWorldSummary,
  type GameLocationSummary,
} from '../lib/api/game';

export function WorldContextSelector() {
  const toast = useToast();
  const { worldId, locationId, setWorldId, setLocationId } = useWorldContextStore();

  const [worlds, setWorlds] = useState<GameWorldSummary[]>([]);
  const [locations, setLocations] = useState<GameLocationSummary[]>([]);
  const [isLoadingWorlds, setIsLoadingWorlds] = useState(false);
  const [isLoadingLocations, setIsLoadingLocations] = useState(false);
  const [showNewWorldDialog, setShowNewWorldDialog] = useState(false);
  const [newWorldName, setNewWorldName] = useState('');

  // Load worlds on mount
  useEffect(() => {
    loadWorlds();
  }, []);

  // Load locations when world changes
  useEffect(() => {
    if (worldId !== null) {
      loadLocations();
    } else {
      setLocations([]);
      setLocationId(null);
    }
  }, [worldId]);

  const loadWorlds = useCallback(async () => {
    setIsLoadingWorlds(true);
    try {
      const data = await listGameWorlds();
      setWorlds(data);

      // Auto-select first world if none selected
      if (data.length > 0 && worldId === null) {
        setWorldId(data[0].id);
      }
    } catch (error) {
      toast.error(`Failed to load worlds: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoadingWorlds(false);
    }
  }, [worldId, setWorldId, toast]);

  const loadLocations = useCallback(async () => {
    setIsLoadingLocations(true);
    try {
      const data = await listGameLocations();

      // Filter by world_id if the location meta has it
      // For now, show all locations (can be enhanced with meta.world_id filter)
      setLocations(data);

      // Auto-select first location if none selected
      if (data.length > 0 && locationId === null) {
        setLocationId(data[0].id);
      }
    } catch (error) {
      toast.error(
        `Failed to load locations: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      setIsLoadingLocations(false);
    }
  }, [locationId, setLocationId, toast]);

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
      await loadWorlds();
      setWorldId(newWorld.id);
    } catch (error) {
      toast.error(
        `Failed to create world: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }, [newWorldName, toast, loadWorlds, setWorldId]);

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

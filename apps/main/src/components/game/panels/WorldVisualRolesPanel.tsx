/**
 * World Visual Role Binder Panel (Task 100)
 *
 * Workspace panel for binding gallery assets to world-specific visual roles
 * (portraits, POV, backgrounds, comic panels) for characters and locations.
 *
 * Integration points:
 * - Uses existing panel system (corePanelsPlugin)
 * - Integrates with assetPickerStore for asset selection
 * - Stores bindings in world.meta.visualRoles
 * - Uses Task 99 asset resolver for suggestions
 */

import { useState, useEffect, useMemo } from 'react';
import { Panel, Button, Input } from '@pixsim7/shared.ui';
import {
  listGameWorlds,
  getGameWorld,
  listGameNpcs,
  listGameLocations,
  saveGameWorldMeta,
  type GameWorldSummary,
  type GameWorldDetail,
  type GameNpcSummary,
  type GameLocationSummary,
} from '@/lib/api/game';
import { useAssetPickerStore, type SelectedAsset } from '@/stores/assetPickerStore';

/**
 * Visual roles data structure stored in world.meta.visualRoles
 */
interface WorldVisualRoles {
  characters?: Record<string, {
    portraitAssetId?: string;
    povAssetId?: string;
    comicIntroPanelAssetIds?: string[];
  }>;
  locations?: Record<string, {
    backgroundAssetIds?: string[];
    comicPanelAssetIds?: string[];
  }>;
}

/**
 * Entity type (character or location)
 */
type EntityType = 'character' | 'location';

interface Entity {
  id: string; // e.g., "npc:1" or "loc:1"
  name: string;
  type: EntityType;
  databaseId: number; // Original database ID
}

/**
 * Visual role slot definition
 */
interface RoleSlot {
  id: string;
  label: string;
  description: string;
  multiple?: boolean; // If true, can have multiple assets (array)
}

// Role slots for characters
const CHARACTER_SLOTS: RoleSlot[] = [
  {
    id: 'portraitAssetId',
    label: 'Portrait',
    description: 'Main character portrait for dialogue/UI',
    multiple: false,
  },
  {
    id: 'povAssetId',
    label: 'POV (Player-facing)',
    description: 'First-person view (hands/body)',
    multiple: false,
  },
  {
    id: 'comicIntroPanelAssetIds',
    label: 'Comic Intro Panels',
    description: 'Comic-style introduction panels',
    multiple: true,
  },
];

// Role slots for locations
const LOCATION_SLOTS: RoleSlot[] = [
  {
    id: 'backgroundAssetIds',
    label: 'Backgrounds',
    description: 'Background images for this location',
    multiple: true,
  },
  {
    id: 'comicPanelAssetIds',
    label: 'Comic Panels',
    description: 'Comic-style establishing shots',
    multiple: true,
  },
];

export function WorldVisualRolesPanel() {
  const [worlds, setWorlds] = useState<GameWorldSummary[]>([]);
  const [selectedWorldId, setSelectedWorldId] = useState<number | null>(null);
  const [worldDetail, setWorldDetail] = useState<GameWorldDetail | null>(null);
  const [visualRoles, setVisualRoles] = useState<WorldVisualRoles>({});

  const [npcs, setNpcs] = useState<GameNpcSummary[]>([]);
  const [locations, setLocations] = useState<GameLocationSummary[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enterSelectionMode = useAssetPickerStore((s) => s.enterSelectionMode);

  // Load worlds on mount
  useEffect(() => {
    (async () => {
      try {
        setIsLoading(true);
        const worldList = await listGameWorlds();
        setWorlds(worldList);
        if (worldList.length > 0 && !selectedWorldId) {
          setSelectedWorldId(worldList[0].id);
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to load worlds');
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // Load world detail, NPCs, and locations when world is selected
  useEffect(() => {
    if (!selectedWorldId) {
      setWorldDetail(null);
      setVisualRoles({});
      setNpcs([]);
      setLocations([]);
      setSelectedEntity(null);
      return;
    }

    (async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Load world detail
        const world = await getGameWorld(selectedWorldId);
        setWorldDetail(world);

        // Extract visual roles from world.meta.visualRoles
        const roles = (world.meta as any)?.visualRoles as WorldVisualRoles || {};
        setVisualRoles(roles);

        // Load NPCs and locations
        const [npcList, locationList] = await Promise.all([
          listGameNpcs(),
          listGameLocations(),
        ]);
        setNpcs(npcList);
        setLocations(locationList);

        // Auto-select first entity if none selected
        if (npcList.length > 0) {
          setSelectedEntity({
            id: `npc:${npcList[0].id}`,
            name: npcList[0].name,
            type: 'character',
            databaseId: npcList[0].id,
          });
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to load world data');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [selectedWorldId]);

  // Convert NPCs and locations to entities
  const entities: Entity[] = useMemo(() => {
    const characterEntities: Entity[] = npcs.map(npc => ({
      id: `npc:${npc.id}`,
      name: npc.name,
      type: 'character' as EntityType,
      databaseId: npc.id,
    }));

    const locationEntities: Entity[] = locations.map(loc => ({
      id: `loc:${loc.id}`,
      name: loc.name,
      type: 'location' as EntityType,
      databaseId: loc.id,
    }));

    return [...characterEntities, ...locationEntities];
  }, [npcs, locations]);

  // Get role slots for the selected entity
  const roleSlots: RoleSlot[] = useMemo(() => {
    if (!selectedEntity) return [];
    return selectedEntity.type === 'character' ? CHARACTER_SLOTS : LOCATION_SLOTS;
  }, [selectedEntity]);

  // Get current bindings for selected entity
  const currentBindings = useMemo(() => {
    if (!selectedEntity) return {};

    if (selectedEntity.type === 'character') {
      return visualRoles.characters?.[selectedEntity.id] || {};
    } else {
      return visualRoles.locations?.[selectedEntity.id] || {};
    }
  }, [selectedEntity, visualRoles]);

  // Handle asset selection for a slot
  const handleAssignAsset = (slotId: string, multiple: boolean) => {
    if (!selectedEntity) return;

    enterSelectionMode((asset: SelectedAsset) => {
      const updatedRoles = { ...visualRoles };

      if (selectedEntity.type === 'character') {
        if (!updatedRoles.characters) {
          updatedRoles.characters = {};
        }
        if (!updatedRoles.characters[selectedEntity.id]) {
          updatedRoles.characters[selectedEntity.id] = {};
        }

        if (multiple) {
          // Add to array
          const current = (updatedRoles.characters[selectedEntity.id] as any)[slotId] as string[] || [];
          (updatedRoles.characters[selectedEntity.id] as any)[slotId] = [...current, asset.id];
        } else {
          // Replace single value
          (updatedRoles.characters[selectedEntity.id] as any)[slotId] = asset.id;
        }
      } else {
        if (!updatedRoles.locations) {
          updatedRoles.locations = {};
        }
        if (!updatedRoles.locations[selectedEntity.id]) {
          updatedRoles.locations[selectedEntity.id] = {};
        }

        if (multiple) {
          // Add to array
          const current = (updatedRoles.locations[selectedEntity.id] as any)[slotId] as string[] || [];
          (updatedRoles.locations[selectedEntity.id] as any)[slotId] = [...current, asset.id];
        } else {
          // Replace single value
          (updatedRoles.locations[selectedEntity.id] as any)[slotId] = asset.id;
        }
      }

      setVisualRoles(updatedRoles);
    });
  };

  // Handle clearing a slot
  const handleClearSlot = (slotId: string, assetIndex?: number) => {
    if (!selectedEntity) return;

    const updatedRoles = { ...visualRoles };

    if (selectedEntity.type === 'character') {
      if (!updatedRoles.characters?.[selectedEntity.id]) return;

      if (assetIndex !== undefined) {
        // Remove specific asset from array
        const current = (updatedRoles.characters[selectedEntity.id] as any)[slotId] as string[] || [];
        (updatedRoles.characters[selectedEntity.id] as any)[slotId] = current.filter((_, i) => i !== assetIndex);
      } else {
        // Clear entire slot
        delete (updatedRoles.characters[selectedEntity.id] as any)[slotId];
      }
    } else {
      if (!updatedRoles.locations?.[selectedEntity.id]) return;

      if (assetIndex !== undefined) {
        // Remove specific asset from array
        const current = (updatedRoles.locations[selectedEntity.id] as any)[slotId] as string[] || [];
        (updatedRoles.locations[selectedEntity.id] as any)[slotId] = current.filter((_, i) => i !== assetIndex);
      } else {
        // Clear entire slot
        delete (updatedRoles.locations[selectedEntity.id] as any)[slotId];
      }
    }

    setVisualRoles(updatedRoles);
  };

  // Save visual roles to world meta
  const handleSave = async () => {
    if (!selectedWorldId || !worldDetail) return;

    try {
      setIsSaving(true);
      setError(null);

      const updatedMeta = {
        ...(worldDetail.meta || {}),
        visualRoles,
      };

      const updated = await saveGameWorldMeta(selectedWorldId, updatedMeta);
      setWorldDetail(updated);
    } catch (err: any) {
      setError(err?.message || 'Failed to save visual roles');
    } finally {
      setIsSaving(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <p className="text-neutral-600 dark:text-neutral-400">Loading...</p>
      </div>
    );
  }

  // No worlds state
  if (worlds.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <div className="text-center">
          <p className="text-neutral-600 dark:text-neutral-400 mb-2">
            No worlds found
          </p>
          <p className="text-sm text-neutral-500 dark:text-neutral-500">
            Create a world in the Game panel to configure visual roles
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-neutral-50 dark:bg-neutral-950">
      {/* Header with world selector and actions */}
      <div className="flex-shrink-0 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3">
        <div className="flex items-center justify-between gap-4">
          {/* World selector */}
          <div className="flex items-center gap-2 flex-1">
            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              World:
            </label>
            <select
              value={selectedWorldId || ''}
              onChange={(e) => setSelectedWorldId(Number(e.target.value))}
              className="px-3 py-1.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded text-sm text-neutral-900 dark:text-neutral-100"
            >
              {worlds.map((world) => (
                <option key={world.id} value={world.id}>
                  {world.name}
                </option>
              ))}
            </select>
          </div>

          {/* Save button */}
          <Button
            size="sm"
            variant="primary"
            onClick={handleSave}
            disabled={!selectedWorldId || isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>

        {/* Error message */}
        {error && (
          <p className="text-sm text-red-500 mt-2">{error}</p>
        )}
      </div>

      {/* Main content - three columns */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-4 p-4">
        {/* Left column: Entity list */}
        <Panel className="space-y-3 overflow-y-auto">
          <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
            Entities
          </h2>

          {entities.length === 0 && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              No NPCs or locations found
            </p>
          )}

          <div className="space-y-2">
            {/* Characters section */}
            {npcs.length > 0 && (
              <>
                <p className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 uppercase">
                  Characters
                </p>
                {entities
                  .filter(e => e.type === 'character')
                  .map((entity) => (
                    <button
                      key={entity.id}
                      className={`w-full text-left px-3 py-2 rounded text-sm border transition-colors ${
                        selectedEntity?.id === entity.id
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700'
                      }`}
                      onClick={() => setSelectedEntity(entity)}
                    >
                      <span className="mr-2">🎭</span>
                      {entity.name}
                    </button>
                  ))}
              </>
            )}

            {/* Locations section */}
            {locations.length > 0 && (
              <>
                <p className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 uppercase mt-3">
                  Locations
                </p>
                {entities
                  .filter(e => e.type === 'location')
                  .map((entity) => (
                    <button
                      key={entity.id}
                      className={`w-full text-left px-3 py-2 rounded text-sm border transition-colors ${
                        selectedEntity?.id === entity.id
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700'
                      }`}
                      onClick={() => setSelectedEntity(entity)}
                    >
                      <span className="mr-2">📍</span>
                      {entity.name}
                    </button>
                  ))}
              </>
            )}
          </div>
        </Panel>

        {/* Middle column: Role slots */}
        <Panel className="space-y-3 overflow-y-auto lg:col-span-2">
          {!selectedEntity && (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                Select an entity to configure visual roles
              </p>
            </div>
          )}

          {selectedEntity && (
            <>
              <div>
                <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                  Visual Roles for {selectedEntity.name}
                </h2>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  Bind gallery assets to visual roles for this {selectedEntity.type}
                </p>
              </div>

              <div className="space-y-4">
                {roleSlots.map((slot) => {
                  const value = (currentBindings as any)[slot.id];
                  const hasValue = slot.multiple
                    ? Array.isArray(value) && value.length > 0
                    : !!value;

                  return (
                    <div
                      key={slot.id}
                      className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-3 space-y-2"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                            {slot.label}
                          </h3>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400">
                            {slot.description}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleAssignAsset(slot.id, slot.multiple || false)}
                          >
                            {hasValue && !slot.multiple ? 'Change' : 'Assign'}
                          </Button>
                          {hasValue && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleClearSlot(slot.id)}
                            >
                              Clear
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Show current bindings */}
                      {hasValue && (
                        <div className="space-y-2">
                          {slot.multiple ? (
                            // Multiple assets
                            <div className="flex flex-wrap gap-2">
                              {(value as string[]).map((assetId, index) => (
                                <div
                                  key={index}
                                  className="flex items-center gap-2 px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded text-xs"
                                >
                                  <span className="font-mono">{assetId}</span>
                                  <button
                                    onClick={() => handleClearSlot(slot.id, index)}
                                    className="text-neutral-500 hover:text-red-500"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            // Single asset
                            <div className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 rounded text-xs font-mono">
                              {value as string}
                            </div>
                          )}
                        </div>
                      )}

                      {!hasValue && (
                        <p className="text-xs text-neutral-400 dark:text-neutral-500 italic">
                          No asset assigned
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Quick actions / navigation */}
              <div className="border-t border-neutral-200 dark:border-neutral-700 pt-3 mt-4">
                <p className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 uppercase mb-2">
                  Related Tools
                </p>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      window.location.href = '/npc-portraits';
                    }}
                    title="Configure detailed NPC expressions and states"
                  >
                    🔧 Configure Expressions
                  </Button>
                </div>
              </div>
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}

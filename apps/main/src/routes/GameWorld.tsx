import type { IDs } from '@pixsim7/shared.types';
import {
  Button,
  HierarchicalSidebarNav,
  Panel,
  PanelShell,
  Select,
  SidebarPaneShell,
  useSidebarNav,
} from '@pixsim7/shared.ui';
import { useEffect, useState } from 'react';

import { resolveGameLocations } from '@lib/resolvers';

import { InteractionPresetUsagePanel } from '@/components/game/panels/InteractionPresetUsagePanel';
import { WorldValidationPanel } from '@/components/game/panels/WorldValidationPanel';
import { useSharedWorldSelection } from '@/hooks';

import { validateHotspots } from '../components/game/hotspotEditorModel';
import { HotspotListEditor } from '../components/game/HotspotListEditor';
import { InteractionPresetEditor } from '../components/game/InteractionPresetEditor';
import { RoomNavigationEditor } from '../components/game/RoomNavigationEditor';
import { NpcSlotEditor } from '../components/NpcSlotEditor';
import type { GameLocationSummary, GameLocationDetail, GameHotspotDTO, GameWorldDetail } from '../lib/api/game';
import { getGameLocation, saveGameLocationHotspots, getGameWorld } from '../lib/api/game';

type GameWorldTab = 'hotspots' | '2d-layout' | 'room-nav' | 'presets' | 'usage' | 'validation';
type GameWorldSection = 'location-tools' | 'world-tools';

const TAB_SECTIONS: Array<{
  id: GameWorldSection;
  label: string;
  children: { id: GameWorldTab; label: string }[];
}> = [
  {
    id: 'location-tools',
    label: 'Location Tools',
    children: [
      { id: 'hotspots', label: 'Hotspots' },
      { id: '2d-layout', label: '2D Layout' },
      { id: 'room-nav', label: 'Room Nav (Beta)' },
    ],
  },
  {
    id: 'world-tools',
    label: 'World Tools',
    children: [
      { id: 'presets', label: 'Interaction Presets' },
      { id: 'usage', label: 'Usage Stats' },
      { id: 'validation', label: 'Validation' },
    ],
  },
];

const TAB_DESCRIPTIONS: Record<GameWorldTab, string> = {
  hotspots: 'Configure mesh hotspots and linked actions for this location.',
  '2d-layout': 'Manage 2D slot layout and world-linked actor placement.',
  'room-nav': 'Define local room movement links and routing behavior.',
  presets: 'Manage reusable interaction presets at world scope.',
  usage: 'Inspect development usage metrics for interaction presets.',
  validation: 'Check world health: behavior config validation and link integrity.',
};

export function GameWorld() {
  const {
    worlds,
    selectedWorldId,
    selectedWorldSource,
    setSelectedWorldId,
    isLoadingWorlds,
    worldLoadError,
  } = useSharedWorldSelection({ autoSelectFirst: true });
  const [locations, setLocations] = useState<GameLocationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<GameLocationDetail | null>(null);
  const [savedHotspotsJson, setSavedHotspotsJson] = useState<string>('[]');
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSavingHotspots, setIsSavingHotspots] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [worldDetail, setWorldDetail] = useState<GameWorldDetail | null>(null);

  const nav = useSidebarNav<GameWorldSection, GameWorldTab>({
    sections: TAB_SECTIONS,
    initial: 'hotspots',
    storageKey: 'game-world-editor:nav',
  });
  const activeTab = nav.activeChildId ?? 'hotspots';

  useEffect(() => {
    if (!worldLoadError) return;
    setError(worldLoadError);
  }, [worldLoadError]);

  useEffect(() => {
    (async () => {
      try {
        setError(null);
        const locs = await resolveGameLocations(
          selectedWorldId != null ? { worldId: selectedWorldId } : {},
          { consumerId: 'GameWorld.loadLocations' },
        );
        setLocations(locs);
        setSelectedId((prev) =>
          prev != null && locs.some((loc) => loc.id === prev)
            ? prev
            : (locs[0]?.id ?? null),
        );
      } catch (e: any) {
        setError(String(e?.message ?? e));
      }
    })();
  }, [selectedWorldId]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setSavedHotspotsJson('[]');
      return;
    }
    setIsLoadingDetail(true);
    setError(null);
    (async () => {
      try {
        const d = await getGameLocation(selectedId as IDs.LocationId);
        setDetail(d);
        setSavedHotspotsJson(JSON.stringify(d.hotspots));
      } catch (e: any) {
        setError(String(e?.message ?? e));
      } finally {
        setIsLoadingDetail(false);
      }
    })();
  }, [selectedId]);

  useEffect(() => {
    if (!selectedWorldId) {
      setWorldDetail(null);
      return;
    }
    (async () => {
      try {
        const w = await getGameWorld(selectedWorldId);
        setWorldDetail(w);
      } catch (e: any) {
        setError(`Failed to load world: ${String(e?.message ?? e)}`);
        setWorldDetail(null);
      }
    })();
  }, [selectedWorldId]);

  const hasUnsavedHotspots =
    detail != null && JSON.stringify(detail.hotspots) !== savedHotspotsJson;

  // Other location editors (2D layout, room nav) reload the location after
  // their own saves; treat that as a fresh hotspot baseline too.
  const handleLocationUpdate = (updatedLocation: GameLocationDetail) => {
    setDetail(updatedLocation);
    setSavedHotspotsJson(JSON.stringify(updatedLocation.hotspots));
  };

  const handleSelectLocation = (nextId: number | null) => {
    if (nextId === selectedId) return;
    if (
      hasUnsavedHotspots &&
      !window.confirm('Discard unsaved hotspot changes for this location?')
    ) {
      return;
    }
    setSelectedId(nextId);
  };

  const handleSelectWorld = (nextId: number | null) => {
    if (nextId === selectedWorldId) return;
    if (
      hasUnsavedHotspots &&
      !window.confirm('Discard unsaved hotspot changes for this location?')
    ) {
      return;
    }
    setSelectedWorldId(nextId);
  };

  const handleHotspotsChange = (hotspots: GameHotspotDTO[]) => {
    if (!detail) return;
    setDetail({ ...detail, hotspots });
  };

  const hotspotIssues = detail ? validateHotspots(detail.hotspots) : [];

  const handleSave = async () => {
    if (!detail) return;
    if (hotspotIssues.length > 0) {
      setError(
        `Fix ${hotspotIssues.length} hotspot issue${hotspotIssues.length === 1 ? '' : 's'} before saving (highlighted below).`,
      );
      return;
    }
    setIsSavingHotspots(true);
    setError(null);
    try {
      const saved = await saveGameLocationHotspots(detail.id as IDs.LocationId, detail.hotspots);
      setDetail(saved);
      setSavedHotspotsJson(JSON.stringify(saved.hotspots));
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setIsSavingHotspots(false);
    }
  };

  const selectedWorldName = worlds.find((world) => world.id === selectedWorldId)?.name ?? 'None';
  const selectedLocationName = locations.find((loc) => loc.id === selectedId)?.name ?? 'None';

  return (
    <PanelShell
      className="h-full min-h-0 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100"
      sidebar={
        <SidebarPaneShell
          title="Game World"
          variant="light"
          widthClassName="w-full"
          collapsible
          resizable
          expandedWidth={236}
          persistKey="game-world-editor-sidebar"
          autoHideTitle={false}
        >
          <div className="space-y-3 px-1">
            <Panel className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  World
                </label>
                <Select
                  value={selectedWorldId ? String(selectedWorldId) : ''}
                  onChange={(e: any) => handleSelectWorld(e.target.value ? Number(e.target.value) : null)}
                  disabled={isLoadingWorlds}
                  className="w-full"
                >
                  <option value="">Select world...</option>
                  {worlds.map((world) => (
                    <option key={world.id} value={world.id}>{world.name}</option>
                  ))}
                </Select>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  Source: {selectedWorldSource}
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  Location
                </label>
                <Select
                  value={selectedId ? String(selectedId) : ''}
                  onChange={(e: any) => handleSelectLocation(e.target.value ? Number(e.target.value) : null)}
                  className="w-full"
                >
                  <option value="">Select location...</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </Select>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  {locations.length} location{locations.length === 1 ? '' : 's'} available
                </p>
              </div>

              {activeTab === 'hotspots' && (
                <div className="space-y-1">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={handleSave}
                    disabled={!detail || isSavingHotspots || !hasUnsavedHotspots}
                    className="w-full"
                  >
                    {isSavingHotspots ? 'Saving...' : 'Save Hotspots'}
                  </Button>
                  {hasUnsavedHotspots && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">
                      Unsaved changes
                      {hotspotIssues.length > 0
                        ? ` — ${hotspotIssues.length} issue${hotspotIssues.length === 1 ? '' : 's'} to fix`
                        : ''}
                    </p>
                  )}
                </div>
              )}
            </Panel>

            <HierarchicalSidebarNav
              items={TAB_SECTIONS}
              expandedItemIds={nav.expandedSectionIds}
              onToggleExpand={nav.toggleExpand}
              onSelectItem={nav.selectSection}
              onSelectChild={nav.selectChild}
              getItemState={(item) => (item.id === nav.activeSectionId ? 'active' : 'inactive')}
              getChildState={(_, child) => (child.id === activeTab ? 'active' : 'inactive')}
              variant="light"
              className="space-y-1"
            />
          </div>
        </SidebarPaneShell>
      }
      sidebarWidth="w-auto"
      bodyScroll={false}
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 border-b border-neutral-200 dark:border-neutral-800 px-6 py-4">
          <h1 className="text-2xl font-semibold">Game World Editor</h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
            {TAB_DESCRIPTIONS[activeTab]}
          </p>
          <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
            World: {selectedWorldName} | Location: {selectedLocationName}
          </p>
        </div>

        {error && (
          <div className="shrink-0 border-b border-red-200 bg-red-50 px-6 py-2 text-sm text-red-700 dark:border-red-800/70 dark:bg-red-900/20 dark:text-red-300">
            Error: {error}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto p-6">
          {activeTab === 'presets' ? (
            worldDetail ? (
              <InteractionPresetEditor
                world={worldDetail}
                onWorldUpdate={(updatedWorld) => setWorldDetail(updatedWorld)}
              />
            ) : (
              <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-neutral-50 text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-400">
                Select a world to manage interaction presets.
              </div>
            )
          ) : activeTab === 'usage' ? (
            <InteractionPresetUsagePanel world={worldDetail} />
          ) : activeTab === 'validation' ? (
            selectedWorldId != null ? (
              <WorldValidationPanel worldId={selectedWorldId} />
            ) : (
              <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-neutral-50 text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-400">
                Select a world to run validation checks.
              </div>
            )
          ) : !detail ? (
            <div className="flex h-full min-h-[220px] items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-neutral-50 text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-400">
              {isLoadingDetail ? 'Loading location details...' : 'Select a world location to begin editing.'}
            </div>
          ) : activeTab === 'hotspots' ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-semibold">Hotspots</h2>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Asset ID: {(detail as GameLocationDetail & { asset_id?: number | null }).asset_id ?? 'none'} | Default spawn: {detail.default_spawn ?? 'none'}
                </p>
              </div>
              <HotspotListEditor
                hotspots={detail.hotspots}
                worldId={selectedWorldId}
                locations={locations}
                onChange={handleHotspotsChange}
              />
            </div>
          ) : activeTab === '2d-layout' ? (
            <NpcSlotEditor
              location={detail}
              world={worldDetail}
              onLocationUpdate={handleLocationUpdate}
            />
          ) : activeTab === 'room-nav' ? (
            <RoomNavigationEditor
              location={detail}
              onLocationUpdate={handleLocationUpdate}
            />
          ) : null}
        </div>
      </div>
    </PanelShell>
  );
}

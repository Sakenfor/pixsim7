/**
 * Game2D Route - Core Game View
 *
 * This is the **canonical runtime/play viewport** for PixSim7.
 * It shows the game as the player sees it: world, HUD, overlays, interactions.
 *
 * Core Editor Role: game-view
 *
 * Features:
 * - World/Location navigation and rendering
 * - NPC slot assignment and interaction handling
 * - Scene playback with dialogue UI
 * - HUD system with configurable widgets
 * - World time management (turn-based/real-time)
 *
 * Related:
 * - Flow View (Graph editor) is the canonical flow/logic editor
 * - World editor (GameWorld) is the canonical world/location editor
 *
 * @see EditorContext.editor.primaryView for how this integrates with the editor context
 */

import { ScenePlayer } from '@pixsim7/game.components';
import {
  createSessionHelpers,
  hasEnabledInteractions,
  parseHotspotAction,
  deriveScenePlaybackPhase,
  getTurnDeltaLabel,
  type NpcSlotAssignment,
  type HotspotAction,
} from '@pixsim7/game.engine';
import { saveWorldSession } from '@pixsim7/game.engine';
import { SceneId as toSceneId, SessionId as toSessionId } from '@pixsim7/shared.types';
import { Button, Panel, Badge, Select, SidebarContentLayout, useSidebarNav } from '@pixsim7/shared.ui';
import { useCallback, useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { buildWorldLabelMap } from '@lib/game/worldLabels';
import { Icon } from '@lib/icons';
import { worldToolSelectors } from '@lib/plugins/catalogSelectors';
import type { SessionFlags } from '@lib/registries';


import {
  RegionalHudLayout,
  HudEditor,
  HudCustomizationButton,
  HudProfileSwitcherButton,
  HudRenderer,
  HudRendererToggle,
  HudLayoutSwitcher,
} from '@features/hud';
import { useWorkspaceStore } from '@features/workspace';
import type { WorldToolContext } from '@features/worldTools';
import { getEffectiveViewMode } from '@features/worldTools/lib/playerHudPreferences';

import { UserPreferencesPanel } from '@/components/game/panels/UserPreferencesPanel';
import { SceneGizmoMiniGame } from '@/components/minigames/SceneGizmoMiniGame';
import { useSharedWorldSelection } from '@/hooks';
import { useDialogueController } from '@/hooks/useDialogueController';
import { useGameLocations } from '@/hooks/useGameLocations';
import { useGameNotifications } from '@/hooks/useGameNotifications';
import { useLocationBackground } from '@/hooks/useLocationBackground';
import { useLocationDetail } from '@/hooks/useLocationDetail';
import { useNpcExpressions } from '@/hooks/useNpcExpressions';
import { useNpcSlotAssignments } from '@/hooks/useNpcSlotAssignments';
import { useRoomNavigation } from '@/hooks/useRoomNavigation';
import { useScenePlayback } from '@/hooks/useScenePlayback';

import { SimpleDialogue } from '../components/game/DialogueUI';
import { GameNotifications } from '../components/game/GameNotification';
import { InteractionPresetEditor } from '../components/game/InteractionPresetEditor';
import {
  getGameScene,
  createGameSession,
  getGameSession,
  updateGameSession,
  createGameWorld,
  attemptPickpocket,
  attemptSensualTouch,
  type SessionUpdatePayload,
  type GameHotspotDTO,
} from '../lib/api/game';
import { type InteractionContext, type SessionAPI } from '../lib/game/interactions';
import { executeSlotInteractions } from '../lib/game/interactions/executor';
import {
  useGameRuntime,
  useActorPresence,
  isTurnBasedMode,
  getTurnDelta,
  worldTimeToSeconds,
  registerBuiltinGamePlugins,
  unregisterBuiltinGamePlugins,
} from '../lib/game/runtime';
import { pluginManager } from '../lib/plugins';
import type { PluginGameState } from '../lib/plugins/types';
import { useWorldTheme, useViewMode, filterToolsByViewMode, useSessionThemeOverrideStore } from '../lib/theming';


// WorldTime type for display (kept for backward compatibility with UI components)
interface WorldTime {
  day: number;
  hour: number;
}

const NAV_SECTIONS = [
  {
    id: 'play',
    label: 'Play',
    icon: <Icon name="play" size={14} className="flex-shrink-0" />,
  },
  {
    id: 'world',
    label: 'World',
    icon: <Icon name="globe" size={14} className="flex-shrink-0" />,
  },
  {
    id: 'locations',
    label: 'Locations',
    icon: <Icon name="map" size={14} className="flex-shrink-0" />,
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: <Icon name="settings" size={14} className="flex-shrink-0" />,
  },
];

export function Game2D() {
  const [searchParams] = useSearchParams();

  // Sidebar navigation — thin first-cut migration to the shared SidebarContentLayout.
  // Only the Play section currently renders content; other sections will receive chips
  // and panes peeled out of the Play view in follow-up commits.
  const nav = useSidebarNav<string, string>({
    sections: NAV_SECTIONS,
    initial: 'play',
    storageKey: 'game-panel:nav',
  });

  // ========================================
  // Game Runtime (unified world/session/time management)
  // ========================================
  const runtime = useGameRuntime();
  const {
    state: runtimeState,
    world: runtimeWorld,
    session: runtimeSession,
    worldTime: runtimeWorldTime,
    ensureSession,
    detachSession,
    advanceTurn,
    enterRoom: runtimeEnterRoom,
    enterScene: runtimeEnterScene,
    enterConversation: runtimeEnterConversation,
  } = runtime;

  const {
    worlds,
    selectedWorldId: sharedSelectedWorldId,
    selectedWorldSource,
    setSelectedWorldId: setSharedWorldId,
    isLoadingWorlds,
    worldLoadError,
    reloadWorlds,
  } = useSharedWorldSelection({ autoSelectFirst: true });

  // Derive worldTime in old format for backward compatibility
  const worldTime: WorldTime = runtimeWorldTime;
  const selectedWorldId = sharedSelectedWorldId ?? runtimeState.worldId;

  // ========================================
  // Session/World state with local overrides for callbacks
  // These allow legacy code to call setGameSession/setWorldDetail
  // while runtime remains the primary source of truth
  // ========================================
  const [sessionOverride, setSessionOverride] = useState<typeof runtimeSession | null>(null);
  const [worldOverride, setWorldOverride] = useState<typeof runtimeWorld | null>(null);

  // Use runtime values unless overridden by callbacks
  const gameSession = sessionOverride ?? runtimeSession;
  const worldDetail = worldOverride ?? runtimeWorld;
  const relationships = (gameSession?.stats?.relationships as Record<string, unknown>) ?? {};

  // Sync overrides back to null when runtime updates (runtime takes precedence)
  useEffect(() => {
    if (runtimeSession) {
      setSessionOverride(null);
    }
  }, [runtimeSession?.id, runtimeSession?.version]);

  useEffect(() => {
    if (runtimeWorld) {
      setWorldOverride(null);
    }
  }, [runtimeWorld?.id, runtimeWorld?.world_time]);

  // Legacy setters for backward compatibility
  const setGameSession = (session: typeof runtimeSession) => setSessionOverride(session);
  const setWorldDetail = (world: typeof runtimeWorld) => setWorldOverride(world);

  // Aliases for runtime mode transitions (used by legacy code)
  const enterRoom = runtimeEnterRoom;
  const enterScene = runtimeEnterScene;
  const enterConversation = runtimeEnterConversation;

  // ========================================
  // Local UI state (location, scene, NPC details)
  // ========================================
  const initialLocationIdFromUrl = (() => {
    const raw = searchParams.get('locationId');
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  })();
  const {
    locations,
    selectedLocationId,
    setSelectedLocationId,
    error: locationsError,
  } = useGameLocations({
    worldId: selectedWorldId,
    initialLocationIdFromUrl,
    consumerId: 'Game2D.loadLocations',
  });
  const {
    locationDetail,
    setLocationDetail,
    isLoadingLocation,
    error: locationLoadError,
  } = useLocationDetail({ locationId: selectedLocationId });
  const {
    currentScene,
    isSceneOpen,
    scenePhase,
    isLoadingScene,
    setIsLoadingScene,
    setScenePhase,
    openScene,
    closeScene,
  } = useScenePlayback();
  const [error, setError] = useState<string | null>(null);
  const {
    roomNavigation,
    activeRoomCheckpoint,
    roomCheckpointNameById,
    roomTraversalOptions,
    roomTraversalGizmoConfig,
    roomNavBackgroundAsset,
    roomNavBackgroundUrl,
    isLoadingRoomNavAsset,
    roomNavMoveLog,
    isResolvingRoomNavTransition,
    roomNavControlMode,
    setRoomNavControlMode,
    syncFromLocation: syncRoomNavFromLocation,
    handleRoomTraversalMove,
    handleRoomTraversalGizmoResult,
  } = useRoomNavigation({
    locationDetail,
    isLoadingScene,
    onLocationUpdate: (updatedLocation) => {
      setLocationDetail((current) =>
        current && current.id === updatedLocation.id ? updatedLocation : current,
      );
    },
  });
  const worldLabelsById = useMemo(() => buildWorldLabelMap(worlds), [worlds]);
  const { activeBackgroundSrc, isBackgroundVideo } = useLocationBackground({
    locationDetail,
    overrideAsset: roomNavBackgroundAsset,
    overrideUrl: roomNavBackgroundUrl,
  });

  // Actor presence via unified hook (NPCs, players, agents at location)
  const { npcPresenceDTOs: locationNpcs } = useActorPresence({
    worldId: selectedWorldId,
    locationId: selectedLocationId,
    worldTimeSeconds: runtimeState.worldTimeSeconds,
    actorTypes: ['npc', 'player'],
    session: gameSession,
    enabled: !!selectedLocationId,
  });
  const npcSlotAssignments = useNpcSlotAssignments(locationDetail, locationNpcs, worldDetail);
  const {
    activeNpcId,
    setActiveNpcId,
    npcPortraitAsset,
    resolvedNpcPortraitSrc,
  } = useNpcExpressions({
    currentScene,
    isSceneOpen,
    scenePhase,
    locationNpcs,
  });
  const { showDialogue, dialogueNpcId, openDialogue, closeDialogue } = useDialogueController();
  const { notifications, addNotification, dismissNotification } = useGameNotifications();
  const [showHudEditor, setShowHudEditor] = useState(false);
  const [showPresetEditor, setShowPresetEditor] = useState(false);
  const [showUserPreferences, setShowUserPreferences] = useState(false);
  const [useNewHudSystem, setUseNewHudSystem] = useState(false); // Task 58: Toggle for new HUD system
  const [hudLayoutOverride, setHudLayoutOverride] = useState<string | null>(null); // Task 58.4: Temporary HUD override

  const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);

  // Apply per-world theme when world changes, merging any active session
  // theme override (set via the Session Theme Override world tool).
  const sessionThemeOverride = useSessionThemeOverrideStore((s) => s.currentOverride);
  useWorldTheme(worldDetail, gameSession ?? undefined, sessionThemeOverride ?? undefined);

  // Get current view mode from world configuration
  const viewMode = useViewMode(worldDetail);

  // Sync game state with plugin manager
  useEffect(() => {
    const pluginGameState: PluginGameState = {
      session: gameSession,
      flags: gameSession?.flags || {},
      relationships,
      world: worldDetail,
      worldTime: worldTime,
      currentLocation: locationDetail,
      locationNpcs: locationNpcs,
    };

    pluginManager.updateGameState(pluginGameState);
  }, [gameSession, worldDetail, worldTime, locationDetail, locationNpcs]);

  // Register game hooks plugins on mount
  useEffect(() => {
    registerBuiltinGamePlugins();
    return () => {
      unregisterBuiltinGamePlugins();
    };
  }, []);

  // Update game context when entering a room (now handled by runtime, but sync location)
  useEffect(() => {
    if (selectedWorldId && gameSession && selectedLocationId && locationDetail) {
      runtimeEnterRoom(selectedLocationId);
    }
  }, [selectedWorldId, gameSession, selectedLocationId, locationDetail, runtimeEnterRoom]);

  useEffect(() => {
    if (!worldLoadError) return;
    setError(worldLoadError);
  }, [worldLoadError]);

  useEffect(() => {
    if (sharedSelectedWorldId == null) {
      if (runtimeState.worldId != null) {
        detachSession();
      }
      return;
    }
    if (runtimeState.worldId === sharedSelectedWorldId) {
      return;
    }
    ensureSession(sharedSelectedWorldId).catch((e) => {
      const message = e instanceof Error ? e.message : String(e);
      setError(`Failed to initialize world session: ${message}`);
      console.error('Failed to initialize world session', e);
    });
  }, [sharedSelectedWorldId, runtimeState.worldId, detachSession, ensureSession]);

  useEffect(() => {
    if (locationsError) setError(locationsError);
  }, [locationsError]);

  const handleSelectWorld = useCallback(
    async (worldId: number | null) => {
      setSharedWorldId(worldId);
      if (!worldId) {
        detachSession();
        return;
      }
      try {
        // Use runtime to ensure session for the selected world
        await ensureSession(worldId);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setError(`Failed to select world: ${message}`);
        console.error('Failed to select GameWorld for Game2D', e);
      }
    },
    [detachSession, ensureSession, setSharedWorldId],
  );

  const handleCreateWorld = useCallback(async () => {
    const name = window.prompt('World name:', 'My World');
    if (!name) return;
    try {
      const created = await createGameWorld(name, {});
      await reloadWorlds();
      await handleSelectWorld(created.id);
    } catch (e) {
      console.error('Failed to create GameWorld', e);
    }
  }, [handleSelectWorld, reloadWorlds]);

  // Phase 5: Handle URL params for direct scene playback from editor
  useEffect(() => {
    const worldIdParam = searchParams.get('worldId');
    const locationIdParam = searchParams.get('locationId');
    const sceneIdParam = searchParams.get('sceneId');

    if (worldIdParam) {
      const wId = Number(worldIdParam);
      if (Number.isFinite(wId) && wId !== sharedSelectedWorldId) {
        setSharedWorldId(wId);
      }
    }

    if (!sceneIdParam) return; // No scene to auto-play

    if (locationIdParam) {
      const locId = Number(locationIdParam);
      if (Number.isFinite(locId) && locId !== selectedLocationId) {
        setSelectedLocationId(locId);
      }
    }

    // Auto-play the scene after a short delay to allow state to settle
    const timer = setTimeout(async () => {
      const sceneId = Number(sceneIdParam);
      if (!Number.isFinite(sceneId)) return;

      setIsLoadingScene(true);
      setError(null);
      try {
        // Ensure session exists via runtime (if world is selected)
        if (!gameSession && selectedWorldId) {
          try {
            await ensureSession(selectedWorldId);
          } catch (err) {
            console.error('Failed to create GameSession for auto-play', err);
          }
        }

        const scene = await getGameScene(toSceneId(sceneId));
        openScene(scene);
        runtimeEnterScene(sceneId);
        console.info('Auto-playing scene from URL params', { sceneId, worldId: selectedWorldId, locationId: selectedLocationId });
      } catch (e: unknown) {
        setError(`Failed to load scene: ${String((e as Error)?.message ?? e)}`);
      } finally {
        setIsLoadingScene(false);
      }
    }, 500); // Small delay to ensure state has settled

    return () => clearTimeout(timer);
  }, [
    searchParams,
    gameSession,
    selectedWorldId,
    selectedLocationId,
    ensureSession,
    runtimeEnterScene,
    setSharedWorldId,
    sharedSelectedWorldId,
  ]);

  // Mirror location-load errors into the global Game2D error banner.
  useEffect(() => {
    if (locationLoadError) setError(locationLoadError);
  }, [locationLoadError]);

  // Fire downstream side effects ONLY when the loaded location's id changes,
  // not on in-place mutations from room-nav transitions (which share the id).
  useEffect(() => {
    if (!locationDetail) {
      syncRoomNavFromLocation(null);
      return;
    }
    syncRoomNavFromLocation(locationDetail);

    const primaryNpcId = (locationDetail.meta as { primary_npc_id?: number | string } | null)?.primary_npc_id;
    const npcIdNumber =
      typeof primaryNpcId === 'string' || typeof primaryNpcId === 'number'
        ? Number(primaryNpcId)
        : null;
    setActiveNpcId(Number.isFinite(npcIdNumber) ? npcIdNumber : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally key on id only; in-place updates from room-nav must not retrigger the reset
  }, [locationDetail?.id]);

  // Advance time using the runtime (handles turn-based and real-time modes)
  const advanceTime = () => {
    advanceTurn().catch((e) => {
      console.error('Failed to advance time', e);
    });
  };

  // Memoize SessionAPI to prevent recreating on every render
  const sessionAPI = useMemo<SessionAPI>(
    () => ({
      updateSession: (sessionId, updates) => updateGameSession(toSessionId(sessionId), updates),
    }),
    [] // SessionAPI functions are stable, no dependencies needed
  );

  // Memoize sessionHelpers to prevent recreating on every render
  // Only recreates when gameSession changes
  const sessionHelpers = useMemo(
    () => createSessionHelpers(gameSession, setGameSession, sessionAPI),
    [gameSession, sessionAPI]
  );

  // Memoize WorldToolContext for plugin system
  const worldToolContext = useMemo<WorldToolContext>(
    () => ({
      session: gameSession,
      sessionFlags: gameSession?.flags || {},
      relationships,
      worldDetail,
      worldTime,
      locationDetail,
      locationNpcs,
      npcSlotAssignments,
      selectedWorldId,
      selectedLocationId,
      activeNpcId,
    }),
    [
      gameSession,
      worldDetail,
      worldTime,
      locationDetail,
      locationNpcs,
      npcSlotAssignments,
      selectedWorldId,
      selectedLocationId,
      activeNpcId,
    ]
  );

  // Get visible world tools based on current context and view mode
  const visibleWorldTools = useMemo(() => {
    const contextFilteredTools = worldToolSelectors.getVisible(worldToolContext);

    // Apply player view mode override if exists
    const effectiveViewMode = selectedWorldId
      ? getEffectiveViewMode(selectedWorldId, viewMode)
      : viewMode;

    return filterToolsByViewMode(contextFilteredTools, effectiveViewMode);
  }, [worldToolContext, viewMode, selectedWorldId]);

  const handleNpcSlotClick = async (assignment: NpcSlotAssignment) => {
    if (!assignment.npcId) return;

    // Build context once - everything a plugin needs
    const context: InteractionContext = {
      state: {
        assignment,
        gameSession,
        sessionFlags: gameSession?.flags || {},
        relationships,
        worldId: selectedWorldId,
        worldTime,
        locationId: selectedLocationId!,
        locationNpcs,
      },
      api: {
        getSession: (id) => getGameSession(toSessionId(id)),
        updateSession: async (id, updates) => {
          const response = await updateGameSession(toSessionId(id), updates as SessionUpdatePayload);
          if (response.session) return response.session;
          if (response.serverSession) return response.serverSession;
          throw new Error('Failed to update session');
        },
        attemptPickpocket: (req) => attemptPickpocket(req),
        attemptSensualTouch: (req) => attemptSensualTouch(req),
        getScene: (id) => getGameScene(toSceneId(id)),
      },
      session: sessionHelpers,
      onSceneOpen: async (sceneId, npcId) => {
        setIsLoadingScene(true);
        try {
          if (!gameSession) {
            const created = await createGameSession(toSceneId(sceneId));
            setGameSession(created);
            const worldTimeSeconds = worldTimeToSeconds(worldTime);
            saveWorldSession({ worldTimeSeconds, gameSessionId: created.id, worldId: selectedWorldId || undefined });
            updateGameSession(toSessionId(created.id), { world_time: worldTimeSeconds }).catch(() => {});
          }
          const scene = await getGameScene(toSceneId(sceneId));
          openScene(scene);
          setActiveNpcId(npcId);

          // Update game context to scene mode (Task 22)
          enterScene(sceneId, npcId);
        } finally {
          setIsLoadingScene(false);
        }
      },
      onSessionUpdate: (session) => setGameSession(session),
      onError: (msg) => addNotification('error', 'Error', msg),
      onSuccess: (msg) => addNotification('success', 'Success', msg),
    };

    // Execute all enabled interactions using the executor
    await executeSlotInteractions(assignment, context, {
      onDialogue: (npcId) => {
        openDialogue(npcId);
        // Update game context to conversation mode (Task 22)
        enterConversation(npcId);
      },
      onNotification: (type, title, message) => {
        addNotification(type, title, message);
      },
    });
  };

  const handlePlayHotspot = async (hotspot: GameHotspotDTO) => {
    const action: HotspotAction | null = parseHotspotAction(hotspot.action);

    // Change location
    if (action?.type === 'change_location') {
      const target = action.target_location_id;
      if (target != null) {
        const newLoc = Number(target);
        if (Number.isFinite(newLoc)) {
          setSelectedLocationId(newLoc);
          return;
        }
      }
    }

    // NPC talk (placeholder for future conversation system)
    if (action?.type === 'npc_talk') {
      const npcId = action.npc_id;
      console.info('npc_talk action triggered', { hotspot, npcId });
      // For now, just log; later this can open a dialogue UI.
      return;
    }

    // Default: play scene
    const sceneId = action?.type === 'play_scene' ? action.scene_id : null;
    if (!sceneId) return;

    setIsLoadingScene(true);
    setError(null);
    try {
      // Lazily create a backing GameSession the first time we enter a scene.
      if (!gameSession) {
        try {
          const created = await createGameSession(toSceneId(Number(sceneId)));
          setGameSession(created);
          const worldTimeSeconds = worldTimeToSeconds(worldTime);
          saveWorldSession({ worldTimeSeconds, gameSessionId: created.id });
          // Optionally keep GameSession.world_time in sync on creation.
          updateGameSession(toSessionId(created.id), { world_time: worldTimeSeconds }).catch(() => {});
        } catch (err) {
          console.error('Failed to create GameSession for Game2D', err);
        }
      }

      const scene = await getGameScene(toSceneId(Number(sceneId)));
      openScene(scene);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setIsLoadingScene(false);
    }
  };

  const playContent = (
    <div className="p-6 space-y-4 h-full overflow-auto min-h-0">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">PixSim7 2D Game</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {isTurnBasedMode(gameSession?.flags, worldDetail) ? 'Turn-based' : 'Real-time'} world with locations, NPCs, and interactions.
            {isTurnBasedMode(gameSession?.flags, worldDetail) && (
              <Badge className="ml-2 text-xs">Turn-Based Mode</Badge>
            )}
          </p>
        </div>
        <div className="flex flex-col md:flex-row gap-2 md:items-center">
          <Panel className="flex items-center gap-3 py-2 px-3">
            <div className="flex flex-col text-xs">
              <span className="font-semibold">Day {worldTime.day}</span>
              <span>{worldTime.hour.toString().padStart(2, '0')}:00</span>
              {isTurnBasedMode(gameSession?.flags, worldDetail) && (
                <span className="text-[10px] text-neutral-500">
                  Turn {((gameSession?.flags as SessionFlags)?.world?.turnNumber ?? 0) + 1}
                </span>
              )}
            </div>
            <Button size="sm" variant="primary" onClick={advanceTime}>
              {isTurnBasedMode(gameSession?.flags, worldDetail) ? (
                <>End Turn ({getTurnDeltaLabel(getTurnDelta(gameSession?.flags, worldDetail))})</>
              ) : (
                <>Next Hour</>
              )}
            </Button>
          </Panel>
          <Panel className="flex items-center gap-2 py-2 px-3">
            <div className="flex flex-col text-xs">
              <span className="font-semibold">World</span>
              <Select
                size="sm"
                transparent
                className="py-0.5"
                value={selectedWorldId ? String(selectedWorldId) : ''}
                onChange={(e) => {
                  const v = e.target.value;
                  handleSelectWorld(v ? Number(v) : null);
                }}
                disabled={isLoadingWorlds}
              >
                <option value="">(local session)</option>
                {worlds.map((w) => (
                  <option key={w.id} value={w.id}>
                    {worldLabelsById.get(w.id) ?? w.name}
                  </option>
                ))}
              </Select>
              <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                ({selectedWorldSource})
              </span>
            </div>
            <Button size="sm" variant="secondary" onClick={handleCreateWorld}>
              New World
            </Button>
          </Panel>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => openFloatingPanel('gizmo-lab', { context: { sceneId: currentScene?.id, locationId: selectedLocationId } })}
            title="Open Gizmo Lab to explore gizmos and tools"
          >
            🎮 Gizmo Lab
          </Button>
          {selectedWorldId && worldDetail && (
            <>
              <HudCustomizationButton
                worldDetail={worldDetail}
                availableTools={visibleWorldTools}
                currentViewMode={viewMode}
                onUpdate={() => {
                  // Trigger re-render when player preferences change
                  setWorldDetail({ ...worldDetail });
                }}
              />
              <HudProfileSwitcherButton
                worldId={worldDetail.id}
                onProfileChange={() => {
                  // Trigger re-render when profile changes
                  setWorldDetail({ ...worldDetail });
                }}
              />
            </>
          )}
          {selectedWorldId && useNewHudSystem && (
            <HudLayoutSwitcher
              worldId={selectedWorldId}
              currentLayoutId={hudLayoutOverride}
              onLayoutChange={setHudLayoutOverride}
            />
          )}
          {selectedWorldId && (
            <HudRendererToggle
              enabled={useNewHudSystem}
              onToggle={setUseNewHudSystem}
            />
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-500">Error: {error}</p>}

      {/* World Tools Panel - uses regional layout from world config (old system) or new HUD Renderer (Task 58) */}
      {!useNewHudSystem && (
        <RegionalHudLayout context={worldToolContext} tools={visibleWorldTools} worldDetail={worldDetail} />
      )}

      {/* Task 58: New HUD Renderer using widget compositions */}
      {useNewHudSystem && selectedWorldId && (
        <div className="relative">
          <HudRenderer worldId={selectedWorldId} layoutId={hudLayoutOverride} />
        </div>
      )}

      <Panel className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Current Location</h2>
            {isLoadingLocation && (
              <span className="text-xs text-neutral-500">Loading location…</span>
            )}
          </div>
          {locationDetail ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{locationDetail.name}</span>
                {locationDetail.asset?.id != null && (
                  <Badge color="blue" className="text-[10px]">
                    Asset #{locationDetail.asset.id}
                  </Badge>
                )}
              </div>
              {roomNavigation && activeRoomCheckpoint && (
                <Panel className="space-y-2 border-neutral-300 dark:border-neutral-700">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                        Room Navigation Runtime (Beta)
                      </h3>
                      <Badge color="blue" className="text-[10px]">
                        {activeRoomCheckpoint.label || activeRoomCheckpoint.id}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="xs"
                        variant={roomNavControlMode === 'buttons' ? 'primary' : 'secondary'}
                        onClick={() => setRoomNavControlMode('buttons')}
                      >
                        Buttons
                      </Button>
                      <Button
                        size="xs"
                        variant={roomNavControlMode === 'gizmo' ? 'primary' : 'secondary'}
                        onClick={() => setRoomNavControlMode('gizmo')}
                        disabled={roomTraversalOptions.length === 0}
                      >
                        Gizmo
                      </Button>
                    </div>
                  </div>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    room_id: {roomNavigation.room_id} | checkpoint: {activeRoomCheckpoint.id}
                    {isLoadingRoomNavAsset ? ' | loading checkpoint asset...' : ''}
                  </p>
                  {isResolvingRoomNavTransition && (
                    <p className="text-[11px] text-blue-600 dark:text-blue-300">
                      Resolving movement transition...
                    </p>
                  )}
                  {lastRoomNavTransitionResult && (
                    <div className="p-2 rounded border border-neutral-300 dark:border-neutral-700 space-y-1">
                      <p className="text-[11px]">
                        transition: <code>{lastRoomNavTransitionResult.status}</code>
                      </p>
                      <p className="text-[11px] text-neutral-600 dark:text-neutral-300">
                        {lastRoomNavTransitionResult.message}
                      </p>
                      {lastRoomNavTransitionResult.clipAssetRef && (
                        <p className="text-[11px] text-neutral-600 dark:text-neutral-300">
                          clip: <code>{lastRoomNavTransitionResult.clipAssetRef}</code>
                        </p>
                      )}
                    </div>
                  )}
                  {roomNavControlMode === 'buttons' ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        {roomTraversalOptions.map((option) => (
                          <Button
                            key={option.id}
                            size="sm"
                            variant="secondary"
                            onClick={() => void handleRoomTraversalMove(option)}
                            disabled={
                              isLoadingScene ||
                              isLoadingRoomNavAsset ||
                              isResolvingRoomNavTransition
                            }
                          >
                            {option.sourceType === 'hotspot' ? 'Hotspot' : 'Edge'}: {option.label}
                            {' -> '}
                            {roomCheckpointNameById.get(option.toCheckpointId) ?? option.toCheckpointId}
                          </Button>
                        ))}
                      </div>
                      {roomTraversalOptions.length === 0 && (
                        <p className="text-xs text-neutral-500">
                          No outgoing traversal options from this checkpoint.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {roomTraversalOptions.length === 0 ? (
                        <p className="text-xs text-neutral-500">
                          No outgoing traversal options from this checkpoint.
                        </p>
                      ) : (
                        <>
                          <div className="h-72 rounded border border-neutral-300 dark:border-neutral-700 overflow-hidden">
                            <SceneGizmoMiniGame
                              config={roomTraversalGizmoConfig}
                              onResult={(result) =>
                                handleRoomTraversalGizmoResult(result.segmentId)
                              }
                            />
                          </div>
                          <div className="p-2 rounded border border-neutral-300 dark:border-neutral-700 space-y-1">
                            {roomTraversalOptions.map((option) => (
                              <p key={option.id} className="text-[11px] text-neutral-600 dark:text-neutral-300">
                                {option.source}
                                {' -> '}
                                {roomCheckpointNameById.get(option.toCheckpointId) ?? option.toCheckpointId}
                              </p>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  {roomNavMoveLog.length > 0 && (
                    <div className="text-[11px] text-neutral-600 dark:text-neutral-300">
                      last move: {roomNavMoveLog[0]}
                    </div>
                  )}
                </Panel>
              )}
              {/* Background + clickable overlays */}
              {activeBackgroundSrc && (
                <div className="relative w-full max-w-xl aspect-video bg-black/80 rounded overflow-hidden">
              {!isBackgroundVideo ? (
                <img
                  src={activeBackgroundSrc}
                  alt="location background"
                  className="w-full h-full object-cover"
                />
              ) : (
                <video
                  src={activeBackgroundSrc}
                  className="w-full h-full object-cover"
                  muted
                  loop
                  autoPlay
                  playsInline
                />
              )}
                  {/* rect2d overlays from hotspot targets */}
                  {locationDetail.hotspots.map((h) => {
                    const rect = h.target?.rect2d || null;
                    if (!rect || rect.w == null || rect.h == null) return null;
                    const x = Number(rect.x ?? 0);
                    const y = Number(rect.y ?? 0);
                    const w = Number(rect.w);
                    const hH = Number(rect.h);
                    const style = {
                      left: `${x * 100}%`,
                      top: `${y * 100}%`,
                      width: `${w * 100}%`,
                      height: `${hH * 100}%`,
                    } as React.CSSProperties;
                    const action = parseHotspotAction(h.action);
                    const isActionable = Boolean(action);
                    const label = h.hotspot_id || h.target?.mesh?.object_name || 'hotspot';
                    return (
                      <button
                        key={`hs-rect-${h.id ?? h.hotspot_id}`}
                        className={`absolute border-2 rounded-sm border-blue-400/70 hover:border-blue-600 bg-blue-500/10 hover:bg-blue-500/20 text-[10px] text-white flex items-center justify-center`}
                        style={style}
                        disabled={!isActionable || isLoadingScene}
                        onClick={() => handlePlayHotspot(h)}
                        title={label}
                      >
                        {label}
                      </button>
                    );
                  })}

                  {/* NPC slot markers */}
                  {npcSlotAssignments.map((assignment) => {
                    const slot = assignment.slot;
                    const hasNpc = assignment.npcId !== null;
                    const hasInteractions = hasEnabledInteractions(slot.interactions);

                    return (
                      <button
                        key={`npc-slot-${slot.id}`}
                        className={`absolute w-10 h-10 -ml-5 -mt-5 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all ${
                          hasNpc
                            ? hasInteractions
                              ? 'bg-green-500 border-white hover:bg-green-600 hover:scale-110 shadow-lg'
                              : 'bg-gray-500 border-white hover:bg-gray-600 hover:scale-105'
                            : 'bg-gray-300 border-gray-400 opacity-50 cursor-not-allowed'
                        }`}
                        style={{
                          left: `${slot.x * 100}%`,
                          top: `${slot.y * 100}%`,
                        }}
                        disabled={!hasNpc || isLoadingScene}
                        onClick={() => hasNpc && handleNpcSlotClick(assignment)}
                        title={
                          hasNpc
                            ? `NPC #${assignment.npcId} - ${slot.id}${
                                hasInteractions ? ' (click to interact)' : ''
                              }`
                            : `Empty slot: ${slot.id}`
                        }
                      >
                        <span className="text-white">
                          {hasNpc ? `#${assignment.npcId}` : '○'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Fallback interactions list */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                  Available Interactions
                </h3>
                {locationDetail.hotspots.length === 0 && (
                  <p className="text-xs text-neutral-500">
                    No hotspots configured for this location yet.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {locationDetail.hotspots.map((h) => {
                    const action = parseHotspotAction(h.action);
                    const isPlayable = action?.type === 'play_scene' && action.scene_id != null;
                    const isActionable = Boolean(action);
                    const label = h.hotspot_id || h.target?.mesh?.object_name || 'hotspot';
                    return (
                      <Button
                        key={h.id ?? `${label}-${h.hotspot_id}`}
                        size="sm"
                        variant={isPlayable ? 'primary' : 'secondary'}
                        disabled={!isActionable || isLoadingScene}
                        onClick={() => handlePlayHotspot(h)}
                      >
                        {label}
                        {isPlayable && (
                          <span className="ml-1 text-[10px] opacity-70">#{action?.scene_id}</span>
                        )}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-neutral-500">
              Select a location to see interactions.
            </p>
          )}
      </Panel>

      {isSceneOpen && currentScene && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70">
          <div className="absolute top-4 right-4 flex items-center gap-2">
            {activeNpcId && npcPortraitAsset && resolvedNpcPortraitSrc && (
              <Panel className="flex items-center gap-2 py-1 px-2 bg-black/80 border border-neutral-700">
                {npcPortraitAsset.mediaType === 'image' ? (
                  <img
                    src={resolvedNpcPortraitSrc}
                    alt="NPC portrait"
                    className="w-12 h-12 object-cover rounded"
                  />
                ) : (
                  <video
                    src={resolvedNpcPortraitSrc}
                    className="w-12 h-12 object-cover rounded"
                    muted
                    loop
                    autoPlay
                    playsInline
                  />
                )}
              </Panel>
            )}
            <Button size="sm" variant="secondary" onClick={() => {
              closeScene();

              // Return to room mode when closing scene (Task 22)
              if (selectedLocationId) {
                enterRoom(selectedLocationId);
              }
            }}>
              Close
            </Button>
          </div>
          <div className="w-full max-w-4xl mx-auto bg-black rounded shadow-lg p-4">
            <ScenePlayer
              scene={currentScene}
              initialState={{ flags: { focus: 0 } }}
              onStateChange={(runtime) => {
                const phase = deriveScenePlaybackPhase({ scene: currentScene, runtime });
                setScenePhase(phase);
              }}
            />
          </div>
        </div>
      )}

    </div>
  );

  const settingsContent = (
    <div className="p-6 space-y-6 h-full overflow-auto">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          Game Settings
        </h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Modal triggers moved here from the Play header.
        </p>
      </div>

      {selectedWorldId && worldDetail && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            World
          </h3>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowHudEditor(true)}
            title="Configure HUD layout for this world"
          >
            🎨 HUD Layout
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowPresetEditor(true)}
            title="Manage interaction presets for this world"
          >
            📦 Presets
          </Button>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          User
        </h3>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setShowUserPreferences(true)}
          title="Manage user accessibility and UI preferences"
        >
          ⚙️ Preferences
        </Button>
      </div>
    </div>
  );

  const locationsContent = (
    <div className="p-6 space-y-4 h-full overflow-auto">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          Locations
        </h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Choose where to play. Selection drives the Current Location pane in
          the Play view.
        </p>
      </div>

      {locations.length === 0 ? (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          No locations yet.
        </p>
      ) : (
        <div className="space-y-1">
          {locations.map((loc) => (
            <button
              key={loc.id}
              className={`w-full text-left px-2 py-1 rounded text-xs border ${
                selectedLocationId === loc.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-neutral-50 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200'
              }`}
              onClick={() => setSelectedLocationId(loc.id)}
            >
              <span className="font-medium">{loc.name}</span>
              {loc.asset?.id != null && (
                <span className="ml-2 text-[10px] text-neutral-400">
                  asset #{loc.asset.id}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  // Fixed-position overlays — rendered at the outer level so they remain
  // mounted regardless of which sidebar section is active.
  const overlays = (
    <>
      {showDialogue && dialogueNpcId && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70">
          <SimpleDialogue
            npcId={dialogueNpcId}
            onStartScene={async (sceneId) => {
              closeDialogue();
              setIsLoadingScene(true);
              try {
                if (!gameSession) {
                  const created = await createGameSession(toSceneId(sceneId));
                  setGameSession(created);
                  const worldTimeSeconds = worldTimeToSeconds(worldTime);
                  saveWorldSession({ worldTimeSeconds, gameSessionId: created.id, worldId: selectedWorldId || undefined });
                  updateGameSession(toSessionId(created.id), { world_time: worldTimeSeconds }).catch(() => {});
                }
                const scene = await getGameScene(toSceneId(sceneId));
                openScene(scene);
              } catch (e: any) {
                addNotification('error', 'Scene Error', String(e?.message ?? e));
              } finally {
                setIsLoadingScene(false);
              }
            }}
            onClose={() => {
              closeDialogue();
              if (selectedLocationId) {
                enterRoom(selectedLocationId);
              }
            }}
          />
        </div>
      )}

      <GameNotifications notifications={notifications} onDismiss={dismissNotification} />

      {showHudEditor && worldDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-auto">
            <HudEditor
              worldDetail={worldDetail}
              onSave={(updatedWorld) => {
                setWorldDetail(updatedWorld);
                setShowHudEditor(false);
              }}
              onClose={() => setShowHudEditor(false)}
            />
          </div>
        </div>
      )}

      {showPresetEditor && worldDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-auto">
            <InteractionPresetEditor
              world={worldDetail}
              onWorldUpdate={(updatedWorld) => {
                setWorldDetail(updatedWorld);
              }}
              onClose={() => setShowPresetEditor(false)}
            />
          </div>
        </div>
      )}

      {showUserPreferences && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-auto">
            <UserPreferencesPanel
              onClose={() => setShowUserPreferences(false)}
            />
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="h-full min-h-0 flex bg-neutral-50 dark:bg-neutral-900">
      <SidebarContentLayout
        sections={NAV_SECTIONS}
        activeSectionId={nav.activeSectionId}
        onSelectSection={nav.selectSection}
        activeChildId={nav.activeChildId}
        onSelectChild={nav.selectChild}
        expandedSectionIds={nav.expandedSectionIds}
        onToggleExpand={nav.toggleExpand}
        sidebarTitle={<span className="truncate text-sm">Game</span>}
        collapsible
        resizable
        persistKey="game-panel-sidebar"
        autoHideTitle
      >
        {nav.activeId === 'play' ? (
          playContent
        ) : nav.activeId === 'settings' ? (
          settingsContent
        ) : nav.activeId === 'locations' ? (
          locationsContent
        ) : (
          <div className="p-6 text-sm text-neutral-500 dark:text-neutral-400 h-full overflow-auto">
            <p>
              This section is part of the in-progress sidebar migration — chips
              and panes from the Play view will move here as the rework proceeds.
            </p>
          </div>
        )}
      </SidebarContentLayout>
      {overlays}
    </div>
  );
}

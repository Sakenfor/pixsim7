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

import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Scene, SessionFlags } from '@lib/registries';
import { ScenePlayer } from '@pixsim7/game.components';
import { Button, Panel, Badge, Select } from '@pixsim7/shared.ui';
import { useWorkspaceStore } from '../stores/workspaceStore';
import {
  listGameLocations,
  getGameLocation,
  getGameScene,
  getNpcExpressions,
  createGameSession,
  getGameSession,
  updateGameSession,
  listGameWorlds,
  createGameWorld,
  getNpcSlots,
  getWorldNpcRoles,
  attemptPickpocket,
  type GameLocationSummary,
  type GameLocationDetail,
  type GameHotspotDTO,
  type NpcExpressionDTO,
  type NpcPresenceDTO,
  type GameWorldSummary,
  type NpcSlot2d,
} from '../lib/api/game';
import { getAsset, type AssetResponse } from '@features/assets';
import {
  assignNpcsToSlots,
  parseHotspotAction,
  deriveScenePlaybackPhase,
  getNpcRelationshipState,
  getTurnDeltaLabel,
  type NpcSlotAssignment,
  type HotspotAction,
  type ScenePlaybackPhase,
} from '@pixsim7/game.engine';
import { saveWorldSession } from '../lib/game/session';
import {
  useGameRuntime,
  useActorPresence,
  isTurnBasedMode,
  getTurnDelta,
  worldTimeToSeconds,
  gameHooksRegistry,
  registerBuiltinGamePlugins,
  unregisterBuiltinGamePlugins,
} from '../lib/game/runtime';
import { hasEnabledInteractions } from '../lib/game/interactions/utils';
import { type InteractionContext, type SessionAPI } from '../lib/game/interactions';
import { createSessionHelpers } from '../lib/game/interactions/sessionAdapter';
import { executeSlotInteractions } from '../lib/game/interactions/executor';
import { SimpleDialogue } from '../components/game/DialogueUI';
import { GameNotifications, type GameNotification } from '../components/game/GameNotification';
import { WorldToolsPanel } from '@features/worldTools';
import {
  RegionalHudLayout,
  HudLayoutEditor,
  HudCustomizationButton,
  HudProfileSwitcherButton,
  HudRenderer,
  HudRendererToggle,
  HudLayoutSwitcher,
} from '@features/hud';
import { InteractionPresetEditor } from '../components/game/InteractionPresetEditor';
import { UserPreferencesPanel } from '@/components/game/panels/UserPreferencesPanel';
import { pluginManager } from '../lib/plugins';
import type { PluginGameState } from '../lib/plugins/types';
import { worldToolRegistry, type WorldToolContext } from '@features/worldTools';
import { useWorldTheme, useViewMode, filterToolsByViewMode } from '../lib/theming';
import { applyPlayerPreferences, getEffectiveViewMode } from '@features/worldTools/lib/playerHudPreferences';

// WorldTime type for display (kept for backward compatibility with UI components)
interface WorldTime {
  day: number;
  hour: number;
}

export function Game2D() {
  const [searchParams] = useSearchParams();

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
    advanceTurn,
    enterRoom: runtimeEnterRoom,
    enterScene: runtimeEnterScene,
    enterConversation: runtimeEnterConversation,
    exitToRoom,
    error: runtimeError,
  } = runtime;

  // Derive worldTime in old format for backward compatibility
  const worldTime: WorldTime = runtimeWorldTime;
  const selectedWorldId = runtimeState.worldId;

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
  const [locations, setLocations] = useState<GameLocationSummary[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
  const [locationDetail, setLocationDetail] = useState<GameLocationDetail | null>(null);
  const [currentScene, setCurrentScene] = useState<Scene | null>(null);
  const [isSceneOpen, setIsSceneOpen] = useState(false);
  const [scenePhase, setScenePhase] = useState<ScenePlaybackPhase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [isLoadingScene, setIsLoadingScene] = useState(false);
  const [backgroundAsset, setBackgroundAsset] = useState<AssetResponse | null>(null);
  const [activeNpcId, setActiveNpcId] = useState<number | null>(null);
  const [npcExpressions, setNpcExpressions] = useState<NpcExpressionDTO[]>([]);
  const [npcPortraitAsset, setNpcPortraitAsset] = useState<AssetResponse | null>(null);
  const [npcPortraitAssetId, setNpcPortraitAssetId] = useState<number | null>(null);
  const [worlds, setWorlds] = useState<GameWorldSummary[]>([]);

  // Actor presence via unified hook (NPCs, players, agents at location)
  const {
    npcs: locationActors,
    npcPresenceDTOs: locationNpcs,  // Legacy format for assignNpcsToSlots etc.
    players: locationPlayers,
  } = useActorPresence({
    worldId: selectedWorldId,
    locationId: selectedLocationId,
    worldTimeSeconds: runtimeState.worldTimeSeconds,
    actorTypes: ['npc', 'player'],
    session: gameSession,
    enabled: !!selectedLocationId,
  });
  const [npcSlotAssignments, setNpcSlotAssignments] = useState<NpcSlotAssignment[]>([]);
  const [showDialogue, setShowDialogue] = useState(false);
  const [dialogueNpcId, setDialogueNpcId] = useState<number | null>(null);
  const [notifications, setNotifications] = useState<GameNotification[]>([]);
  const [showHudEditor, setShowHudEditor] = useState(false);
  const [showPresetEditor, setShowPresetEditor] = useState(false);
  const [showUserPreferences, setShowUserPreferences] = useState(false);
  const [useNewHudSystem, setUseNewHudSystem] = useState(false); // Task 58: Toggle for new HUD system
  const [hudLayoutOverride, setHudLayoutOverride] = useState<string | null>(null); // Task 58.4: Temporary HUD override

  const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);

  // Combine runtime error with local error
  const displayError = error || runtimeError;

  // Apply per-world theme when world changes
  useWorldTheme(worldDetail);

  // Get current view mode from world configuration
  const viewMode = useViewMode(worldDetail);

  // Sync game state with plugin manager
  useEffect(() => {
    const pluginGameState: PluginGameState = {
      session: gameSession,
      flags: gameSession?.flags || {},
      relationships: gameSession?.relationships || {},
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

  // Load locations and worlds on mount
  useEffect(() => {
    (async () => {
      try {
        const locs = await listGameLocations();
        setLocations(locs);
        const locationIdParam = searchParams.get('locationId');
        const locFromParam = locationIdParam ? Number(locationIdParam) : null;
        if (locFromParam && Number.isFinite(locFromParam)) {
          setSelectedLocationId(locFromParam);
        } else if (!selectedLocationId && locs.length > 0) {
          setSelectedLocationId(locs[0].id);
        }
      } catch (e: unknown) {
        setError(String((e as Error)?.message ?? e));
      }
    })();

    // Load worlds list (runtime handles session restoration)
    (async () => {
      try {
        const ws = await listGameWorlds();
        setWorlds(ws);

        // If runtime hasn't loaded a world yet, initialize from URL or first world
        if (!selectedWorldId) {
          const worldIdParam = searchParams.get('worldId');
          let effectiveWorldId: number | null = null;

          if (worldIdParam) {
            const wId = Number(worldIdParam);
            if (Number.isFinite(wId)) {
              effectiveWorldId = wId;
            }
          } else if (ws.length > 0) {
            effectiveWorldId = ws[0].id;
          }

          if (effectiveWorldId != null) {
            // Use runtime to ensure session for this world
            ensureSession(effectiveWorldId).catch((e) => {
              console.error('Failed to initialize world session', e);
            });
          }
        }
      } catch (e: unknown) {
        console.error('Failed to list game worlds', e);
      }
    })();
  }, []);

  // Define handleSelectWorld before it's used in useEffect
  const handleSelectWorld = async (worldId: number | null) => {
    if (!worldId) {
      runtime.detachSession();
      return;
    }
    try {
      // Use runtime to ensure session for the selected world
      await ensureSession(worldId);
    } catch (e) {
      console.error('Failed to select GameWorld for Game2D', e);
    }
  };

  const handleCreateWorld = async () => {
    const name = window.prompt('World name:', 'My World');
    if (!name) return;
    try {
      const created = await createGameWorld(name, {});
      const nextWorlds = [...worlds, { id: created.id, name: created.name }];
      setWorlds(nextWorlds);
      await handleSelectWorld(created.id);
    } catch (e) {
      console.error('Failed to create GameWorld', e);
    }
  };

  // Phase 5: Handle URL params for direct scene playback from editor
  useEffect(() => {
    const worldIdParam = searchParams.get('worldId');
    const locationIdParam = searchParams.get('locationId');
    const sceneIdParam = searchParams.get('sceneId');

    if (!sceneIdParam) return; // No scene to auto-play

    // Set world and location from params if provided
    if (worldIdParam) {
      const wId = Number(worldIdParam);
      if (Number.isFinite(wId) && wId !== selectedWorldId) {
        handleSelectWorld(wId);
      }
    }

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

        const scene = await getGameScene(sceneId);
        setCurrentScene(scene);
        setIsSceneOpen(true);
        setScenePhase('playing');
        runtimeEnterScene(sceneId);
        console.info('Auto-playing scene from URL params', { sceneId, worldId: selectedWorldId, locationId: selectedLocationId });
      } catch (e: unknown) {
        setError(`Failed to load scene: ${String((e as Error)?.message ?? e)}`);
      } finally {
        setIsLoadingScene(false);
      }
    }, 500); // Small delay to ensure state has settled

    return () => clearTimeout(timer);
  }, [searchParams, gameSession, selectedWorldId, selectedLocationId, ensureSession, handleSelectWorld, runtimeEnterScene]);

  useEffect(() => {
    if (!selectedLocationId) {
      setLocationDetail(null);
      setBackgroundAsset(null);
      return;
    }
    setIsLoadingLocation(true);
    setError(null);
    (async () => {
      try {
        const detail = await getGameLocation(selectedLocationId);
        setLocationDetail(detail);

        // Try to load a background asset for 2D rendering:
        // prefer meta.background_asset_id, else fall back to asset_id if it is image/video.
        setBackgroundAsset(null);
        const bgId = (detail.meta && (detail.meta as any).background_asset_id) ?? detail.asset_id;
        if (bgId) {
          const asset = await getAsset(bgId);
          if (asset.media_type === 'image' || asset.media_type === 'video') {
            setBackgroundAsset(asset);
          }
        }

        // Determine active NPC for this location (simple convention).
        const primaryNpcId = detail.meta && (detail.meta as any).primary_npc_id;
        const npcIdNumber =
          typeof primaryNpcId === 'string' || typeof primaryNpcId === 'number'
            ? Number(primaryNpcId)
            : null;
        setActiveNpcId(Number.isFinite(npcIdNumber) ? npcIdNumber : null);
      } catch (e: any) {
        setError(String(e?.message ?? e));
      } finally {
        setIsLoadingLocation(false);
      }
    })();
  }, [selectedLocationId]);

  // Fetch expressions for the active NPC (once per location / NPC change).
  useEffect(() => {
    if (!activeNpcId) {
      setNpcExpressions([]);
      setNpcPortraitAsset(null);
      setNpcPortraitAssetId(null);
      return;
    }
    (async () => {
      try {
        const expressions = await getNpcExpressions(activeNpcId);
        setNpcExpressions(expressions);
      } catch (e: any) {
        console.error('Failed to load NPC expressions', e);
      }
    })();
  }, [activeNpcId]);

  // Set active NPC when presence changes
  useEffect(() => {
    if (locationNpcs.length > 0) {
      // Prefer the first present NPC over the static primary_npc_id.
      setActiveNpcId(locationNpcs[0].npc_id);
    }
  }, [locationNpcs]);

  // Assign NPCs to slots when location, NPCs, or world changes.
  useEffect(() => {
    if (!locationDetail) {
      setNpcSlotAssignments([]);
      return;
    }

    const slots = getNpcSlots(locationDetail);
    if (slots.length === 0) {
      setNpcSlotAssignments([]);
      return;
    }

    const npcRoles = worldDetail ? getWorldNpcRoles(worldDetail) : {};
    const assignments = assignNpcsToSlots(slots, locationNpcs, npcRoles);
    setNpcSlotAssignments(assignments);
  }, [locationDetail, locationNpcs, worldDetail]);

  // Advance time using the runtime (handles turn-based and real-time modes)
  const advanceTime = () => {
    advanceTurn().catch((e) => {
      console.error('Failed to advance time', e);
    });
  };

  const addNotification = (type: 'success' | 'error' | 'info' | 'warning', title: string, message: string, duration?: number) => {
    const notification: GameNotification = {
      id: `${Date.now()}-${Math.random()}`,
      type,
      title,
      message,
      duration,
    };
    setNotifications((prev) => [...prev, notification]);
  };

  const dismissNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  // Memoize SessionAPI to prevent recreating on every render
  const sessionAPI = useMemo<SessionAPI>(
    () => ({
      updateSession: (sessionId, updates) => updateGameSession(sessionId, updates),
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
      relationships: gameSession?.relationships || {},
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
    const contextFilteredTools = worldToolRegistry.getVisible(worldToolContext);

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
        relationships: gameSession?.relationships || {},
        worldId: selectedWorldId,
        worldTime,
        locationId: selectedLocationId!,
        locationNpcs,
      },
      api: {
        getSession: (id) => getGameSession(id),
        updateSession: (id, updates) => updateGameSession(id, updates),
        attemptPickpocket: (req) => attemptPickpocket(req),
        getScene: (id) => getGameScene(id),
      },
      session: sessionHelpers,
      onSceneOpen: async (sceneId, npcId) => {
        setIsLoadingScene(true);
        try {
          if (!gameSession) {
            const created = await createGameSession(sceneId);
            setGameSession(created);
            const worldTimeSeconds = worldTimeToSeconds(worldTime);
            saveWorldSession({ worldTimeSeconds, gameSessionId: created.id, worldId: selectedWorldId || undefined });
            updateGameSession(created.id, { world_time: worldTimeSeconds }).catch(() => {});
          }
          const scene = await getGameScene(sceneId);
          setCurrentScene(scene);
          setIsSceneOpen(true);
          setScenePhase('playing');
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
        setDialogueNpcId(npcId);
        setShowDialogue(true);

        // Update game context to conversation mode (Task 22)
        enterConversation(npcId);
      },
      onNotification: (type, title, message) => {
        addNotification(type, title, message);
      },
    });
  };

  const handlePlayHotspot = async (hotspot: GameHotspotDTO) => {
    const rawAction = (hotspot.meta as any)?.action ?? null;
    const action: HotspotAction | null = parseHotspotAction(rawAction);

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

    // Default: play scene (from action.scene_id or linked_scene_id)
    const sceneId = (action && 'scene_id' in action ? action.scene_id : null) ?? hotspot.linked_scene_id;
    if (!sceneId) return;

    setIsLoadingScene(true);
    setError(null);
    try {
      // Lazily create a backing GameSession the first time we enter a scene.
      if (!gameSession) {
        try {
          const created = await createGameSession(Number(sceneId));
          setGameSession(created);
          const worldTimeSeconds = worldTimeToSeconds(worldTime);
          saveWorldSession({ worldTimeSeconds, gameSessionId: created.id });
          // Optionally keep GameSession.world_time in sync on creation.
          updateGameSession(created.id, { world_time: worldTimeSeconds }).catch(() => {});
        } catch (err) {
          console.error('Failed to create GameSession for Game2D', err);
        }
      }

      const scene = await getGameScene(Number(sceneId));
      setCurrentScene(scene);
      setIsSceneOpen(true);
      setScenePhase('playing');
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setIsLoadingScene(false);
    }
  };

  // Derive NPC expression state from scene phase and load portrait asset.
  useEffect(() => {
    if (!currentScene || !isSceneOpen || npcExpressions.length === 0) {
      setNpcPortraitAsset(null);
      setNpcPortraitAssetId(null);
      return;
    }

    let desiredState: string = 'idle';
    if (scenePhase === 'awaiting_input') {
      // Prefer an explicit "waiting_for_player" expression if it exists.
      desiredState = 'waiting_for_player';
    } else if (scenePhase === 'playing') {
      desiredState = 'talking';
    } else if (scenePhase === 'completed') {
      desiredState = 'idle';
    }

    const match =
      npcExpressions.find((e) => e.state === desiredState) ||
      npcExpressions.find((e) => e.state === 'idle') ||
      npcExpressions[0];

    if (!match) {
      setNpcPortraitAsset(null);
      setNpcPortraitAssetId(null);
      return;
    }

    if (npcPortraitAssetId === match.asset_id && npcPortraitAsset) {
      return;
    }

    (async () => {
      try {
        const asset = await getAsset(match.asset_id);
        if (asset.media_type === 'image' || asset.media_type === 'video') {
          setNpcPortraitAsset(asset);
          setNpcPortraitAssetId(match.asset_id);
        } else {
          setNpcPortraitAsset(null);
          setNpcPortraitAssetId(null);
        }
      } catch (e: any) {
        console.error('Failed to load NPC portrait asset', e);
        setNpcPortraitAsset(null);
        setNpcPortraitAssetId(null);
      }
    })();
  }, [currentScene, isSceneOpen, scenePhase, npcExpressions, npcPortraitAssetId, npcPortraitAsset]);

  return (
    <div className="p-6 space-y-4 content-with-dock min-h-screen">
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
                value={selectedWorldId ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  handleSelectWorld(v ? Number(v) : null);
                }}
              >
                <option value="">(local session)</option>
                {worlds.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel className="space-y-3">
          <h2 className="text-sm font-semibold">Locations</h2>
          {locations.length === 0 && <p className="text-xs text-neutral-500">No locations yet.</p>}
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
                {loc.asset_id != null && (
                  <span className="ml-2 text-[10px] text-neutral-400">asset #{loc.asset_id}</span>
                )}
              </button>
            ))}
          </div>
        </Panel>

        <Panel className="space-y-3 lg:col-span-2">
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
                {locationDetail.asset_id != null && (
                  <Badge color="blue" className="text-[10px]">
                    Asset #{locationDetail.asset_id}
                  </Badge>
                )}
              </div>
              {/* Background + clickable overlays */}
              {backgroundAsset && backgroundAsset.file_url && (
                <div className="relative w-full max-w-xl aspect-video bg-black/80 rounded overflow-hidden">
                  {backgroundAsset.media_type === 'image' ? (
                    <img
                      src={backgroundAsset.file_url}
                      alt="location background"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <video
                      src={backgroundAsset.file_url}
                      className="w-full h-full object-cover"
                      muted
                      loop
                      autoPlay
                      playsInline
                    />
                  )}
                  {/* rect2d overlays from hotspot meta */}
                  {locationDetail.hotspots.map((h) => {
                    const rect = (h.meta && (h.meta as any).rect2d) || null;
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
                    const canPlay = Boolean(h.linked_scene_id);
                    return (
                      <button
                        key={`hs-rect-${h.id ?? h.hotspot_id}`}
                        className={`absolute border-2 rounded-sm border-blue-400/70 hover:border-blue-600 bg-blue-500/10 hover:bg-blue-500/20 text-[10px] text-white flex items-center justify-center`}
                        style={style}
                        disabled={!canPlay || isLoadingScene}
                        onClick={() => handlePlayHotspot(h)}
                        title={h.hotspot_id || h.object_name}
                      >
                        {h.hotspot_id || h.object_name}
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
                  {locationDetail.hotspots.map((h) => (
                    <Button
                      key={h.id ?? `${h.object_name}-${h.hotspot_id}`}
                      size="sm"
                      variant={h.linked_scene_id ? 'primary' : 'secondary'}
                      disabled={!h.linked_scene_id || isLoadingScene}
                      onClick={() => handlePlayHotspot(h)}
                    >
                      {h.hotspot_id || h.object_name}
                      {h.linked_scene_id && (
                        <span className="ml-1 text-[10px] opacity-70">#{h.linked_scene_id}</span>
                      )}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-neutral-500">
              Select a location to see interactions.
            </p>
          )}
        </Panel>
      </div>

      {isSceneOpen && currentScene && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70">
          <div className="absolute top-4 right-4 flex items-center gap-2">
            {activeNpcId && npcPortraitAsset && npcPortraitAsset.file_url && (
              <Panel className="flex items-center gap-2 py-1 px-2 bg-black/80 border border-neutral-700">
                {npcPortraitAsset.media_type === 'image' ? (
                  <img
                    src={npcPortraitAsset.file_url}
                    alt="NPC portrait"
                    className="w-12 h-12 object-cover rounded"
                  />
                ) : (
                  <video
                    src={npcPortraitAsset.file_url}
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
              setIsSceneOpen(false);
              setScenePhase(null);

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

      {/* Dialogue UI */}
      {showDialogue && dialogueNpcId && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70">
          <SimpleDialogue
            npcId={dialogueNpcId}
            onStartScene={async (sceneId) => {
              setShowDialogue(false);
              setIsLoadingScene(true);
              try {
                if (!gameSession) {
                  const created = await createGameSession(sceneId);
                  setGameSession(created);
                  const worldTimeSeconds = worldTimeToSeconds(worldTime);
                  saveWorldSession({ worldTimeSeconds, gameSessionId: created.id, worldId: selectedWorldId || undefined });
                  updateGameSession(created.id, { world_time: worldTimeSeconds }).catch(() => {});
                }
                const scene = await getGameScene(sceneId);
                setCurrentScene(scene);
                setIsSceneOpen(true);
                setScenePhase('playing');
              } catch (e: any) {
                addNotification('error', 'Scene Error', String(e?.message ?? e));
              } finally {
                setIsLoadingScene(false);
              }
            }}
            onClose={() => {
              setShowDialogue(false);

              // Return to room mode when closing dialogue (Task 22)
              if (selectedLocationId) {
                enterRoom(selectedLocationId);
              }
            }}
          />
        </div>
      )}

      {/* Game Notifications */}
      <GameNotifications notifications={notifications} onDismiss={dismissNotification} />

      {/* HUD Layout Editor */}
      {showHudEditor && worldDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-auto">
            <HudLayoutEditor
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

      {/* Interaction Preset Editor */}
      {showPresetEditor && worldDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-auto">
            <InteractionPresetEditor
              worldDetail={worldDetail}
              onWorldUpdate={(updatedWorld) => {
                setWorldDetail(updatedWorld);
              }}
              onClose={() => setShowPresetEditor(false)}
            />
          </div>
        </div>
      )}

      {/* User Preferences Panel */}
      {showUserPreferences && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-auto">
            <UserPreferencesPanel
              onClose={() => setShowUserPreferences(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Model 3D Store
 *
 * Global state for the Model Inspector panel.
 * Manages model loading, zone configuration, and animation playback.
 */

import { getFilenameFromUrl } from '@pixsim7/shared.media.core';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type {
  InspectorMode,
  RenderMode,
  ZoneProperties,
  Tool3DModel,
  AnimationClipInfo,
  ModelParseResult,
} from '@lib/models/types';
import { DEFAULT_ZONE_PROPERTIES, getZoneColor } from '@lib/models/types';

/**
 * Settings persisted to localStorage.
 */
interface Model3DSettings {
  /** Default render mode */
  defaultRenderMode: RenderMode;
  /** Show grid helper */
  showGrid: boolean;
  /** Show axes helper */
  showAxes: boolean;
  /** Default playback speed */
  defaultPlaybackSpeed: number;
  /** Auto-play animations on load */
  autoPlayAnimations: boolean;
}

/**
 * Complete store state.
 */
interface Model3DState {
  // Model loading state
  /** Currently loaded model URL */
  modelUrl: string | null;
  /** File name for display */
  modelFileName: string | null;
  /** Loading state */
  isLoading: boolean;
  /** Error message if load failed */
  error: string | null;
  /** Parse result from loaded model */
  parseResult: ModelParseResult | null;

  // Viewport state
  /** Current inspector mode */
  mode: InspectorMode;
  /** Render mode (solid/wireframe/zones) */
  renderMode: RenderMode;
  /** Currently selected zone ID */
  selectedZoneId: string | null;
  /** Hovered zone ID */
  hoveredZoneId: string | null;
  /** Model scale override */
  modelScale: number;

  // Animation state
  /** Available animation clips */
  animations: AnimationClipInfo[];
  /** Currently playing animation name */
  currentAnimation: string | null;
  /** Is animation playing */
  isPlaying: boolean;
  /** Playback speed multiplier */
  playbackSpeed: number;
  /** Current playback time in seconds */
  currentTime: number;
  /** Total duration of current animation */
  duration: number;

  // Zone configurations
  /** Zone properties by zone ID */
  zoneConfigs: Record<string, ZoneProperties>;

  // Settings (persisted)
  settings: Model3DSettings;

  // Actions
  /** Start loading a model from URL */
  loadModel: (url: string, fileName?: string) => void;
  /** Set loading complete with parse result */
  setModelLoaded: (result: ModelParseResult) => void;
  /** Set loading error */
  setError: (error: string) => void;
  /** Clear current model */
  clearModel: () => void;

  /** Set inspector mode */
  setMode: (mode: InspectorMode) => void;
  /** Set render mode */
  setRenderMode: (mode: RenderMode) => void;
  /** Set model scale */
  setModelScale: (scale: number) => void;

  /** Select a zone */
  selectZone: (zoneId: string | null) => void;
  /** Set hovered zone */
  setHoveredZone: (zoneId: string | null) => void;
  /** Update a zone property */
  updateZoneProperty: <K extends keyof ZoneProperties>(
    zoneId: string,
    key: K,
    value: ZoneProperties[K]
  ) => void;
  /** Update multiple zone properties */
  updateZoneProperties: (zoneId: string, properties: Partial<ZoneProperties>) => void;
  /** Add a stat modifier to a zone */
  addZoneStatModifier: (zoneId: string, statName: string, value: number) => void;
  /** Remove a stat modifier from a zone */
  removeZoneStatModifier: (zoneId: string, statName: string) => void;
  /** Reset zone to defaults */
  resetZone: (zoneId: string) => void;

  /** Set current animation */
  setCurrentAnimation: (name: string | null) => void;
  /** Toggle play/pause */
  togglePlayback: () => void;
  /** Set playback state */
  setIsPlaying: (playing: boolean) => void;
  /** Set playback speed */
  setPlaybackSpeed: (speed: number) => void;
  /** Set current time (for scrubbing) */
  setCurrentTime: (time: number) => void;
  /** Set animation duration */
  setDuration: (duration: number) => void;

  /** Update settings */
  updateSettings: (settings: Partial<Model3DSettings>) => void;

  /** Export current configuration as Tool3DModel */
  exportConfig: () => Tool3DModel | null;
  /** Import configuration */
  importConfig: (config: Tool3DModel) => void;
}

const defaultSettings: Model3DSettings = {
  defaultRenderMode: 'solid',
  showGrid: true,
  showAxes: false,
  defaultPlaybackSpeed: 1,
  autoPlayAnimations: false,
};

export const useModel3DStore = create<Model3DState>()(
  persist(
    (set, get) => ({
      // Initial state
      modelUrl: null,
      modelFileName: null,
      isLoading: false,
      error: null,
      parseResult: null,

      mode: 'view',
      renderMode: 'solid',
      selectedZoneId: null,
      hoveredZoneId: null,
      modelScale: 1,

      animations: [],
      currentAnimation: null,
      isPlaying: false,
      playbackSpeed: 1,
      currentTime: 0,
      duration: 0,

      zoneConfigs: {},
      settings: defaultSettings,

      // Actions
      loadModel: (url, fileName) => {
        set({
          modelUrl: url,
          modelFileName: fileName || getFilenameFromUrl(url) || 'model.glb',
          isLoading: true,
          error: null,
          parseResult: null,
          selectedZoneId: null,
          hoveredZoneId: null,
          zoneConfigs: {},
          animations: [],
          currentAnimation: null,
          isPlaying: false,
          currentTime: 0,
          duration: 0,
        });
      },

      setModelLoaded: (result) => {
        const { settings } = get();

        // Initialize zone configs with defaults
        const zoneConfigs: Record<string, ZoneProperties> = {};
        result.zoneIds.forEach((zoneId, index) => {
          zoneConfigs[zoneId] = {
            ...DEFAULT_ZONE_PROPERTIES,
            highlightColor: getZoneColor(index),
          };
        });

        // Auto-select first animation if available
        const firstAnim = result.animations[0]?.name || null;

        set({
          isLoading: false,
          error: null,
          parseResult: result,
          animations: result.animations,
          zoneConfigs,
          currentAnimation: firstAnim,
          isPlaying: settings.autoPlayAnimations && firstAnim !== null,
          duration: result.animations[0]?.duration || 0,
        });
      },

      setError: (error) => {
        set({
          isLoading: false,
          error,
          parseResult: null,
        });
      },

      clearModel: () => {
        set({
          modelUrl: null,
          modelFileName: null,
          isLoading: false,
          error: null,
          parseResult: null,
          selectedZoneId: null,
          hoveredZoneId: null,
          zoneConfigs: {},
          animations: [],
          currentAnimation: null,
          isPlaying: false,
          currentTime: 0,
          duration: 0,
        });
      },

      setMode: (mode) => set({ mode }),
      setRenderMode: (renderMode) => set({ renderMode }),
      setModelScale: (modelScale) => set({ modelScale }),

      selectZone: (zoneId) => set({ selectedZoneId: zoneId }),
      setHoveredZone: (zoneId) => set({ hoveredZoneId: zoneId }),

      updateZoneProperty: (zoneId, key, value) => {
        set((state) => ({
          zoneConfigs: {
            ...state.zoneConfigs,
            [zoneId]: {
              ...state.zoneConfigs[zoneId],
              [key]: value,
            },
          },
        }));
      },

      updateZoneProperties: (zoneId, properties) => {
        set((state) => ({
          zoneConfigs: {
            ...state.zoneConfigs,
            [zoneId]: {
              ...state.zoneConfigs[zoneId],
              ...properties,
            },
          },
        }));
      },

      addZoneStatModifier: (zoneId, statName, value) => {
        set((state) => {
          const zone = state.zoneConfigs[zoneId];
          if (!zone) return state;

          return {
            zoneConfigs: {
              ...state.zoneConfigs,
              [zoneId]: {
                ...zone,
                statModifiers: {
                  ...(zone.statModifiers || {}),
                  [statName]: value,
                },
              },
            },
          };
        });
      },

      removeZoneStatModifier: (zoneId, statName) => {
        set((state) => {
          const zone = state.zoneConfigs[zoneId];
          if (!zone || !zone.statModifiers) return state;

          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [statName]: _omitted, ...remainingModifiers } = zone.statModifiers;
          return {
            zoneConfigs: {
              ...state.zoneConfigs,
              [zoneId]: {
                ...zone,
                statModifiers:
                  Object.keys(remainingModifiers).length > 0
                    ? remainingModifiers
                    : undefined,
              },
            },
          };
        });
      },

      resetZone: (zoneId) => {
        set((state) => {
          const index = state.parseResult?.zoneIds.indexOf(zoneId) || 0;

          return {
            zoneConfigs: {
              ...state.zoneConfigs,
              [zoneId]: {
                ...DEFAULT_ZONE_PROPERTIES,
                highlightColor: getZoneColor(index),
              },
            },
          };
        });
      },

      setCurrentAnimation: (name) => {
        const { animations } = get();
        const anim = animations.find((a) => a.name === name);
        set({
          currentAnimation: name,
          currentTime: 0,
          duration: anim?.duration || 0,
        });
      },

      togglePlayback: () => {
        set((state) => ({ isPlaying: !state.isPlaying }));
      },

      setIsPlaying: (playing) => set({ isPlaying: playing }),
      setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
      setCurrentTime: (time) => set({ currentTime: time }),
      setDuration: (duration) => set({ duration }),

      updateSettings: (newSettings) => {
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        }));
      },

      exportConfig: () => {
        const { modelUrl, modelScale, zoneConfigs, currentAnimation } = get();
        if (!modelUrl) return null;

        // Filter out zones with default values only
        const zones: Record<string, ZoneProperties> = {};
        for (const [zoneId, props] of Object.entries(zoneConfigs)) {
          // Only include zones that have been customized
          zones[zoneId] = {
            sensitivity: props.sensitivity,
            ...(props.label && { label: props.label }),
            ...(props.ticklishness && props.ticklishness > 0 && { ticklishness: props.ticklishness }),
            ...(props.pleasure && props.pleasure > 0 && { pleasure: props.pleasure }),
            ...(props.statModifiers && Object.keys(props.statModifiers).length > 0 && {
              statModifiers: props.statModifiers,
            }),
          };
        }

        return {
          url: modelUrl,
          ...(modelScale !== 1 && { scale: modelScale }),
          ...(currentAnimation && { defaultAnimation: currentAnimation }),
          zones,
        };
      },

      importConfig: (config) => {
        set({
          modelUrl: config.url,
          modelScale: config.scale || 1,
          currentAnimation: config.defaultAnimation || null,
          zoneConfigs: Object.fromEntries(
            Object.entries(config.zones).map(([zoneId, props]) => [
              zoneId,
              { ...DEFAULT_ZONE_PROPERTIES, ...props },
            ])
          ),
        });
      },
    }),
    {
      name: 'model_3d_inspector_v1',
      partialize: (state) => ({
        settings: state.settings,
      }),
    }
  )
);

// Selector helpers
export const selectHasModel = (state: Model3DState) => state.modelUrl !== null;
export const selectIsInZoneMode = (state: Model3DState) => state.mode === 'zones';
export const selectHasAnimations = (state: Model3DState) => state.animations.length > 0;
export const selectZoneIds = (state: Model3DState) => state.parseResult?.zoneIds || [];
export const selectSelectedZoneConfig = (state: Model3DState) =>
  state.selectedZoneId ? state.zoneConfigs[state.selectedZoneId] : null;

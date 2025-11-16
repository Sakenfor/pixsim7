import { useEffect, useState } from 'react';
import type { Scene } from '@pixsim7/types';
import { ScenePlayer } from '@pixsim7/game-ui';
import { Button, Panel, Badge } from '@pixsim7/ui';
import { listGameLocations, getGameLocation, getGameScene, type GameLocationSummary, type GameLocationDetail, type GameHotspotDTO } from '../lib/api/game';
import { getAsset, type AssetResponse } from '../lib/api/assets';

interface WorldTime {
  day: number;
  hour: number;
}

export function Game2D() {
  const [locations, setLocations] = useState<GameLocationSummary[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
  const [locationDetail, setLocationDetail] = useState<GameLocationDetail | null>(null);
  const [worldTime, setWorldTime] = useState<WorldTime>({ day: 1, hour: 8 });
  const [currentScene, setCurrentScene] = useState<Scene | null>(null);
  const [isSceneOpen, setIsSceneOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [isLoadingScene, setIsLoadingScene] = useState(false);
  const [backgroundAsset, setBackgroundAsset] = useState<AssetResponse | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const locs = await listGameLocations();
        setLocations(locs);
        if (!selectedLocationId && locs.length > 0) {
          setSelectedLocationId(locs[0].id);
        }
      } catch (e: any) {
        setError(String(e?.message ?? e));
      }
    })();
  }, []);

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
      } catch (e: any) {
        setError(String(e?.message ?? e));
      } finally {
        setIsLoadingLocation(false);
      }
    })();
  }, [selectedLocationId]);

  const advanceTime = () => {
    setWorldTime((prev) => {
      let hour = prev.hour + 1;
      let day = prev.day;
      if (hour >= 24) {
        hour = 0;
        day = prev.day + 1;
        if (day > 7) day = 1;
      }
      return { day, hour };
    });
  };

  const handlePlayHotspot = async (hotspot: GameHotspotDTO) => {
    const action = (hotspot.meta as any)?.action || null;

    // Change location
    if (action?.type === 'change_location' && action.target_location_id) {
      const newLoc = Number(action.target_location_id);
      if (Number.isFinite(newLoc)) {
        setSelectedLocationId(newLoc);
      }
      return;
    }

    // Default: play scene (from action.scene_id or linked_scene_id)
    const sceneId = action?.scene_id ?? hotspot.linked_scene_id;
    if (!sceneId) return;

    setIsLoadingScene(true);
    setError(null);
    try {
      const scene = await getGameScene(sceneId);
      setCurrentScene(scene);
      setIsSceneOpen(true);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setIsLoadingScene(false);
    }
  };

  return (
    <div className="p-6 space-y-4 content-with-dock min-h-screen">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">PixSim7 2D Game</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Turn-based day cycle with locations and interactions, rendered in 2D using existing scenes.
          </p>
        </div>
        <Panel className="flex items-center gap-3 py-2 px-3">
          <div className="flex flex-col text-xs">
            <span className="font-semibold">Day {worldTime.day}</span>
            <span>{worldTime.hour.toString().padStart(2, '0')}:00</span>
          </div>
          <Button size="sm" variant="primary" onClick={advanceTime}>
            Next Hour
          </Button>
        </Panel>
      </div>

      {error && <p className="text-sm text-red-500">Error: {error}</p>}

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
          <div className="absolute top-4 right-4">
            <Button size="sm" variant="secondary" onClick={() => setIsSceneOpen(false)}>
              Close
            </Button>
          </div>
          <div className="w-full max-w-4xl mx-auto bg-black rounded shadow-lg p-4">
            <ScenePlayer scene={currentScene} initialState={{ flags: { focus: 0 } }} />
          </div>
        </div>
      )}
    </div>
  );
}

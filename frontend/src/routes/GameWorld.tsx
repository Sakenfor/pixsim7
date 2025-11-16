import { useEffect, useState } from 'react';
import { Button, Panel, Input, Select } from '@pixsim7/ui';
import type { GameLocationSummary, GameLocationDetail, GameHotspotDTO } from '../lib/api/game';
import { listGameLocations, getGameLocation, saveGameLocationHotspots } from '../lib/api/game';

export function GameWorld() {
  const [locations, setLocations] = useState<GameLocationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<GameLocationDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setError(null);
        const locs = await listGameLocations();
        setLocations(locs);
        if (!selectedId && locs.length > 0) {
          setSelectedId(locs[0].id);
        }
      } catch (e: any) {
        setError(String(e?.message ?? e));
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const d = await getGameLocation(selectedId);
        setDetail(d);
      } catch (e: any) {
        setError(String(e?.message ?? e));
      } finally {
        setIsLoading(false);
      }
    })();
  }, [selectedId]);

  const handleHotspotChange = (index: number, patch: Partial<GameHotspotDTO>) => {
    if (!detail) return;
    const nextHotspots = detail.hotspots.map((h, i) =>
      i === index ? { ...h, ...patch } : h,
    );
    setDetail({ ...detail, hotspots: nextHotspots });
  };

  const handleAddHotspot = () => {
    if (!detail) return;
    setDetail({
      ...detail,
      hotspots: [
        ...detail.hotspots,
        { object_name: '', hotspot_id: '', linked_scene_id: undefined, meta: {} },
      ],
    });
  };

  const handleSave = async () => {
    if (!detail) return;
    setIsLoading(true);
    setError(null);
    try {
      const cleaned = detail.hotspots.filter(h => h.object_name && h.hotspot_id);
      const saved = await saveGameLocationHotspots(detail.id, cleaned);
      setDetail(saved);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Game World Editor</h1>
      {error && <p className="text-sm text-red-500">Error: {error}</p>}
      <Panel className="space-y-3">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium">Location</label>
          <Select
            value={selectedId ? String(selectedId) : ''}
            onChange={(e: any) => setSelectedId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Select location...</option>
            {locations.map(loc => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </Select>
          <Button size="sm" variant="primary" onClick={handleSave} disabled={!detail || isLoading}>
            {isLoading ? 'Saving…' : 'Save Hotspots'}
          </Button>
        </div>
        {detail && (
          <div className="space-y-3">
            <p className="text-xs text-neutral-500">
              Asset ID: {detail.asset_id ?? 'none'} | Default spawn: {detail.default_spawn ?? 'none'}
            </p>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Hotspots</h2>
              <Button size="sm" variant="secondary" onClick={handleAddHotspot}>
                Add Hotspot
              </Button>
            </div>
            <div className="space-y-2">
              {detail.hotspots.map((h, idx) => (
                <div key={idx} className="space-y-1 text-xs">
                  <div className="grid grid-cols-4 gap-2 items-center">
                    <Input
                      placeholder="object_name (from glTF)"
                      value={h.object_name}
                      onChange={(e: any) => handleHotspotChange(idx, { object_name: e.target.value })}
                    />
                    <Input
                      placeholder="hotspot_id"
                      value={h.hotspot_id}
                      onChange={(e: any) => handleHotspotChange(idx, { hotspot_id: e.target.value })}
                    />
                    <Input
                      placeholder="linked_scene_id"
                      value={h.linked_scene_id ?? ''}
                      onChange={(e: any) => {
                        const v = e.target.value.trim();
                        handleHotspotChange(idx, {
                          linked_scene_id: v ? Number(v) : undefined,
                        });
                      }}
                    />
                    <Input
                      placeholder="meta JSON (optional)"
                      value={h.meta ? JSON.stringify(h.meta) : ''}
                      onChange={(e: any) => {
                        const v = e.target.value.trim();
                        let parsed: Record<string, unknown> | undefined;
                        if (v) {
                          try {
                            parsed = JSON.parse(v);
                          } catch {
                            parsed = h.meta ?? {};
                          }
                        }
                        handleHotspotChange(idx, { meta: parsed });
                      }}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2 items-center">
                    {(() => {
                      const meta: any = h.meta || {};
                      const action = meta.action || {};
                      const actionType = action.type ?? '';
                      const sceneId = action.scene_id ?? '';
                      const targetLocationId = action.target_location_id ?? '';
                      return (
                        <>
                          <Input
                            placeholder="action type (play_scene/change_location/npc_talk)"
                            value={actionType}
                            onChange={(e: any) => {
                              const v = e.target.value.trim();
                              const nextMeta: any = { ...(h.meta || {}) };
                              const nextAction: any = { ...(nextMeta.action || {}) };
                              nextAction.type = v || undefined;
                              nextMeta.action = nextAction;
                              handleHotspotChange(idx, { meta: nextMeta });
                            }}
                          />
                          <Input
                            placeholder="action.scene_id"
                            value={sceneId}
                            onChange={(e: any) => {
                              const v = e.target.value.trim();
                              const nextMeta: any = { ...(h.meta || {}) };
                              const nextAction: any = { ...(nextMeta.action || {}) };
                              nextAction.scene_id = v ? Number(v) : undefined;
                              nextMeta.action = nextAction;
                              handleHotspotChange(idx, { meta: nextMeta });
                            }}
                          />
                          <Input
                            placeholder="action.target_location_id"
                            value={targetLocationId}
                            onChange={(e: any) => {
                              const v = e.target.value.trim();
                              const nextMeta: any = { ...(h.meta || {}) };
                              const nextAction: any = { ...(nextMeta.action || {}) };
                              nextAction.target_location_id = v ? Number(v) : undefined;
                              nextMeta.action = nextAction;
                              handleHotspotChange(idx, { meta: nextMeta });
                            }}
                          />
                        </>
                      );
                    })()}
                  </div>
                </div>
              ))}
              {detail.hotspots.length === 0 && (
                <p className="text-xs text-neutral-500">No hotspots yet. Add one above.</p>
              )}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

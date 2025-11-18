import { useEffect, useState } from 'react';
import { Button, Panel, Input, Select } from '@pixsim7/ui';
import type { GameLocationSummary, GameLocationDetail } from '../lib/api/game';
import { listGameLocations, getGameLocation, saveGameLocationHotspots } from '../lib/api/game';
import { NpcSlotEditor } from '../components/NpcSlotEditor';
import { HotspotEditor } from '../components/HotspotEditor';

export function GameWorld() {
  const [locations, setLocations] = useState<GameLocationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<GameLocationDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'hotspots' | '2d-layout'>('hotspots');

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

  const handleHotspotsChange = (newHotspots: typeof detail.hotspots) => {
    if (!detail) return;
    setDetail({ ...detail, hotspots: newHotspots });
  };

  const handleSave = async () => {
    if (!detail) return;
    setIsLoading(true);
    setError(null);
    try {
      const cleaned = detail.hotspots.filter((h) => h.object_name && h.hotspot_id);
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
          {activeTab === 'hotspots' && (
            <Button size="sm" variant="primary" onClick={handleSave} disabled={!detail || isLoading}>
              {isLoading ? 'Saving…' : 'Save Hotspots'}
            </Button>
          )}
        </div>
        {detail && (
          <div className="space-y-3">
            <p className="text-xs text-neutral-500">
              Asset ID: {detail.asset_id ?? 'none'} | Default spawn: {detail.default_spawn ?? 'none'}
            </p>

            {/* Tab Navigation */}
            <div className="flex gap-2 border-b border-neutral-200 dark:border-neutral-700">
              <button
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'hotspots'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
                }`}
                onClick={() => setActiveTab('hotspots')}
              >
                Hotspots
              </button>
              <button
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === '2d-layout'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
                }`}
                onClick={() => setActiveTab('2d-layout')}
              >
                2D Layout
              </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'hotspots' ? (
              /* Hotspots Tab */
              <HotspotEditor
                hotspots={detail.hotspots}
                onChange={handleHotspotsChange}
              />
            ) : (
              /* 2D Layout Tab */
              <NpcSlotEditor
                location={detail}
                onLocationUpdate={(updatedLocation) => setDetail(updatedLocation)}
              />
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}

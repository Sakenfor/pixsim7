import type { GameLocationDetail } from '@lib/api/game';

import {
  GameWorldTabEmptyState,
  useGameWorldEditorContext,
} from '@/components/game/gameWorldEditorContext';
import { HotspotListEditor } from '@/components/game/HotspotListEditor';

/**
 * Hotspots tab — reads the selected location's hotspots + callbacks from the
 * GameWorld editor capability. The Save button + dirty tracking live in
 * GameWorld's sidebar (it owns `detail`); this only stages edits via
 * `onHotspotsChange`.
 */
export function HotspotsTab() {
  const ctx = useGameWorldEditorContext();
  if (!ctx?.locationDetail) {
    return (
      <GameWorldTabEmptyState
        message={
          ctx?.isLoadingDetail
            ? 'Loading location details...'
            : 'Select a world location to begin editing.'
        }
      />
    );
  }
  const { locationDetail, selectedWorldId, locations, onHotspotsChange } = ctx;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Hotspots</h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Asset ID:{' '}
          {(locationDetail as GameLocationDetail & { asset_id?: number | null }).asset_id ?? 'none'}{' '}
          | Default spawn: {locationDetail.default_spawn ?? 'none'}
        </p>
      </div>
      <HotspotListEditor
        hotspots={locationDetail.hotspots}
        worldId={selectedWorldId}
        locations={locations}
        onChange={onHotspotsChange}
      />
    </div>
  );
}

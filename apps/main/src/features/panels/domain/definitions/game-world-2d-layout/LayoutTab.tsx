import {
  GameWorldTabEmptyState,
  useGameWorldEditorContext,
} from '@/components/game/gameWorldEditorContext';
import { NpcSlotEditor } from '@/components/NpcSlotEditor';

/** 2D Layout tab — NPC slot editor for the selected location. */
export function LayoutTab() {
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
  return (
    <NpcSlotEditor
      location={ctx.locationDetail}
      world={ctx.worldDetail}
      onLocationUpdate={ctx.onLocationUpdate}
    />
  );
}

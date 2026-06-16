import {
  GameWorldTabEmptyState,
  useGameWorldEditorContext,
} from '@/components/game/gameWorldEditorContext';
import { RoomNavigationEditor } from '@/components/game/RoomNavigationEditor';

/** Room Nav tab — local room movement editor for the selected location. */
export function RoomNavTab() {
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
    <RoomNavigationEditor location={ctx.locationDetail} onLocationUpdate={ctx.onLocationUpdate} />
  );
}

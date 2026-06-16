import {
  GameWorldTabEmptyState,
  useGameWorldEditorContext,
} from '@/components/game/gameWorldEditorContext';
import { WorldValidationPanel } from '@/components/game/panels/WorldValidationPanel';

/** Validation tab — world health checks (read-only); needs only the world id. */
export function ValidationTab() {
  const ctx = useGameWorldEditorContext();
  if (ctx?.selectedWorldId == null) {
    return <GameWorldTabEmptyState message="Select a world to run validation checks." />;
  }
  return <WorldValidationPanel worldId={ctx.selectedWorldId} />;
}

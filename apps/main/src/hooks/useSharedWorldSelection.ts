import { useCallback, useEffect, useRef, useState } from "react";

import type { GameWorldSummary } from "@lib/api";
import { useEditorContext } from "@lib/context";
import { resolveGameWorlds } from "@lib/resolvers";

import { useWorldContextStore } from "@features/scene";

interface UseSharedWorldSelectionOptions {
  autoSelectFirst?: boolean;
}

interface UseSharedWorldSelectionResult {
  worlds: GameWorldSummary[];
  selectedWorldId: number | null;
  setSelectedWorldId: (worldId: number | null) => void;
  isLoadingWorlds: boolean;
  worldLoadError: string | null;
  reloadWorlds: () => Promise<void>;
}

export function useSharedWorldSelection(
  options: UseSharedWorldSelectionOptions = {},
): UseSharedWorldSelectionResult {
  const { autoSelectFirst = false } = options;
  const editorContext = useEditorContext();
  const selectedWorldId = editorContext.world.id;
  const setWorldId = useWorldContextStore((s) => s.setWorldId);

  const [worlds, setWorlds] = useState<GameWorldSummary[]>([]);
  const [isLoadingWorlds, setIsLoadingWorlds] = useState(true);
  const [worldLoadError, setWorldLoadError] = useState<string | null>(null);

  const selectedWorldIdRef = useRef<number | null>(selectedWorldId);
  useEffect(() => {
    selectedWorldIdRef.current = selectedWorldId;
  }, [selectedWorldId]);

  const loadWorlds = useCallback(async () => {
    setIsLoadingWorlds(true);
    setWorldLoadError(null);

    try {
      const worldList = await resolveGameWorlds({
        consumerId: 'useSharedWorldSelection.loadWorlds',
      });
      setWorlds(worldList);

      if (autoSelectFirst && worldList.length > 0 && selectedWorldIdRef.current == null) {
        setWorldId(worldList[0].id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setWorldLoadError(message);
      setWorlds([]);
    } finally {
      setIsLoadingWorlds(false);
    }
  }, [autoSelectFirst, setWorldId]);

  useEffect(() => {
    void loadWorlds();
  }, [loadWorlds]);

  return {
    worlds,
    selectedWorldId,
    setSelectedWorldId: setWorldId,
    isLoadingWorlds,
    worldLoadError,
    reloadWorlds: loadWorlds,
  };
}

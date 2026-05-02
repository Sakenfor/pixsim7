import { useCallback, useState } from 'react';

export interface UseDialogueControllerResult {
  showDialogue: boolean;
  dialogueNpcId: number | null;
  openDialogue: (npcId: number) => void;
  closeDialogue: () => void;
}

/**
 * Owns the SimpleDialogue modal's open/closed state and which NPC it's
 * targeting. Pure state container — side effects coupled to opening or
 * closing (e.g., entering conversation/room context) stay at call sites
 * so the coupling remains visible where it matters.
 */
export function useDialogueController(): UseDialogueControllerResult {
  const [showDialogue, setShowDialogue] = useState(false);
  const [dialogueNpcId, setDialogueNpcId] = useState<number | null>(null);

  const openDialogue = useCallback((npcId: number) => {
    setDialogueNpcId(npcId);
    setShowDialogue(true);
  }, []);

  const closeDialogue = useCallback(() => {
    setShowDialogue(false);
  }, []);

  return { showDialogue, dialogueNpcId, openDialogue, closeDialogue };
}

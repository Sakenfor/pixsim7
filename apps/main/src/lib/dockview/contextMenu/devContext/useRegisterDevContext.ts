/**
 * Hook for panels to register their dev context provider.
 *
 * @example
 * ```tsx
 * useRegisterDevContext('prompt-authoring', () => ({
 *   panelId: 'prompt-authoring',
 *   panelTitle: 'Prompt Authoring',
 *   summary: `Editing family "${selectedFamily?.name}"`,
 *   state: { familyId: selectedFamily?.id, versionId: selectedVersion?.id },
 *   keyFiles: ['features/prompts/context/PromptAuthoringContext.tsx'],
 * }));
 * ```
 */

import { useEffect } from 'react';

import { devContextRegistry, type DevContextProvider } from './devContextRegistry';

export function useRegisterDevContext(panelId: string, provider: DevContextProvider) {
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    return devContextRegistry.register(panelId, provider);
  }, [panelId, provider]);
}

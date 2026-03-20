/**
 * Dev Context Registry
 *
 * Panels register a provider function that describes their current state
 * for AI-assisted development. Used by the "Send to AI Assistant" context
 * menu action (DEV only).
 *
 * The provider is a plain function (not React) that returns a snapshot of
 * the panel's current meaningful state — what it's showing, what's selected,
 * what the user is working on.
 */

export interface DevContextSnapshot {
  /** Panel definition ID */
  panelId: string;
  /** Human-readable panel title */
  panelTitle: string;
  /** One-line summary of current state */
  summary: string;
  /** Structured key-value state (rendered as bullet points) */
  state?: Record<string, string | number | boolean | null | undefined>;
  /** Source files relevant to what's being shown */
  keyFiles?: string[];
  /** Freeform notes for the AI (e.g. current errors, recent actions) */
  notes?: string[];
}

export type DevContextProvider = () => DevContextSnapshot | null;

const providers = new Map<string, DevContextProvider>();

export const devContextRegistry = {
  /**
   * Register a dev context provider for a panel.
   * Call from useEffect; returns an unregister function.
   */
  register(panelId: string, provider: DevContextProvider): () => void {
    providers.set(panelId, provider);
    return () => {
      if (providers.get(panelId) === provider) {
        providers.delete(panelId);
      }
    };
  },

  /** Get provider for a panel (if registered). */
  get(panelId: string): DevContextProvider | undefined {
    return providers.get(panelId);
  },

  /** Check if any panel has registered a provider. */
  hasAny(): boolean {
    return providers.size > 0;
  },
};

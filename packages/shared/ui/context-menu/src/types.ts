/**
 * Shared context menu types
 *
 * Re-exports base types from shared.ui.panels and defines
 * interfaces for dependency injection.
 */

export type {
  ContextMenuContext,
  MenuActionContextBase,
  MenuActionBase,
  MenuItem,
} from '@pixsim7/shared.ui.panels';

/**
 * Interface for tracking recently used context menu actions.
 * Injected into ContextMenuRegistry to surface recent actions at menu top.
 */
export interface ContextMenuHistoryProvider {
  getRecentForContext(contextType: string, limit?: number): string[];
  recordUsage(actionId: string, contextType: string): void;
}

/**
 * Interface for injecting capability actions into the context menu registry.
 */
export interface CapabilityActionSource {
  getAllActions(): CapabilityActionLike[];
}

/**
 * Minimal interface for a capability action (matches ActionCapability shape).
 */
export interface CapabilityActionLike {
  id: string;
  name: string;
  icon?: string;
  shortcut?: string;
  category?: string;
  visibility?: string;
  contexts?: string[];
  enabled?: () => boolean;
  execute: (ctx: { source: string; event: undefined; target: unknown }) => void;
  contextMenu?: {
    availableIn?: string[];
    visible?: (ctx?: unknown) => boolean;
    disabled?: (ctx?: unknown) => boolean | string;
    iconColor?: string;
    category?: string;
    variant?: 'default' | 'danger' | 'success';
    divider?: boolean;
  };
}

/**
 * Interface for injecting capabilities snapshot into the provider.
 */
export interface CapabilitiesSnapshotProvider {
  subscribe(listener: () => void): () => void;
  getSnapshot(): { keys: string[]; map: Record<string, unknown> };
}

/**
 * App-specific panel registry interface for context menu actions.
 */
export interface PanelRegistryLike {
  getAll: () => Array<{
    id: string;
    title: string;
    icon?: string;
    category?: string;
    supportsMultipleInstances?: boolean;
  }>;
  getPublicPanels?: () => Array<{
    id: string;
    title: string;
    icon?: string;
    category?: string;
    supportsMultipleInstances?: boolean;
  }>;
}

/**
 * Panel Definition Helper
 *
 * Simplified API for defining panels with auto-discovery support.
 * Each panel is self-contained in a single file with all its configuration.
 *
 * @example
 * ```typescript
 * // panels/interactive-surface/index.ts
 * import { definePanel } from '@features/panels/lib/definePanel';
 * import { InteractiveSurfacePanel } from './InteractiveSurfacePanel';
 *
 * export default definePanel({
 *   id: 'interactive-surface',
 *   title: 'Interactive Surface',
 *   category: 'tools',
 *   component: InteractiveSurfacePanel,
 *   contexts: ['asset-viewer'],
 *   showWhen: (ctx) => !!ctx.currentAsset,
 * });
 * ```
 */

import type { CapabilityDeclaration, PanelAvailabilityPolicy, PanelInstancePolicy } from '@pixsim7/shared.ui.panels';
import type { ComponentType } from 'react';

import type { PanelRole } from './panelConstants';
import type {
  ContextLabelStrategy,
  CoreEditorRole,
  PanelDefinition,
  PanelNavigationContribution,
  PanelCategory,
  PanelSettingsFormSchema,
  PanelSettingsProps,
  PanelSettingsSection,
  PanelSettingsTab,
  WorkspaceContext,
} from './panelRegistry';
import type { PanelOrchestrationMetadata } from './panelRegistry';

/**
 * Simplified panel definition options.
 * Provides sensible defaults and cleaner API than raw PanelDefinition.
 */
export interface DefinePanelOptions<TSettings = any> {
  // Required
  id: string;
  title: string;
  component: ComponentType<any>;

  // Latest update metadata (recommended, required by definePanelWithMeta)
  updatedAt?: string;
  changeNote?: string;
  featureHighlights?: string[];

  // Categorization (with defaults)
  category?: PanelCategory;
  /**
   * Semantic role of the panel — describes *what* it does independent of domain.
   * Used for smarter defaults and UI grouping.  Optional; omit for standard panels.
   */
  panelRole?: PanelRole;
  /**
   * Whether this panel appears in the main Panel Browser sidebar.
   * Defaults to `true`.  Set `false` for context-pickers and sub-panels that
   * are primarily used embedded/alongside other panels.
   * Panels with `browsable: false` are still available via right-click "Add Panel".
   */
  browsable?: boolean;
  tags?: string[];
  icon?: string;
  description?: string;
  order?: number;
  enabledByDefault?: boolean;

  // Availability - which dockviews this panel can appear in
  // Prefer availability.docks over contexts
  availability?: PanelAvailabilityPolicy;
  // Legacy: dockview contexts (deprecated - use availability.docks)
  contexts?: string[];
  // Legacy: direct availableIn for dock scopes
  availableIn?: string[];

  // Visibility
  showWhen?: (context: WorkspaceContext) => boolean;
  requiresContext?: boolean;
  /**
   * Controls whether this panel is eligible for scope-based discovery
   * in other hosts that share settingScopes.
   * Defaults to true.
   */
  scopeDiscoverable?: boolean;

  // Capabilities
  supportsCompactMode?: boolean;
  supportsMultipleInstances?: boolean;
  instances?: PanelInstancePolicy;
  maxInstances?: number;
  consumesCapabilities?: CapabilityDeclaration[];
  providesCapabilities?: CapabilityDeclaration[];
  settingScopes?: string[];
  scopes?: string[];

  /**
   * @deprecated Use `consumesCapabilities: ['generation:scope']` instead.
   * Shorthand that auto-adds 'generation' to settingScopes.
   * Kept for backward compatibility — maps to consumesCapabilities internally.
   */
  generationCapable?: boolean;

  // Settings
  defaultSettings?: TSettings;
  settingsVersion?: number;
  settingsSchema?: {
    safeParse: (data: unknown) => { success: boolean; data: TSettings; error: unknown };
  };
  settingsComponent?: ComponentType<PanelSettingsProps<TSettings>>;
  settingsSections?: PanelSettingsSection<TSettings>[];
  settingsTabs?: PanelSettingsTab<TSettings>[];
  settingsForm?: PanelSettingsFormSchema;
  componentSettings?: string[];
  migrateSettings?: (oldSettings: unknown, oldVersion: number) => TSettings;

  // Orchestration
  orchestration?: PanelOrchestrationMetadata;

  // Context labeling + core editor role
  contextLabel?: ContextLabelStrategy;
  coreEditorRole?: CoreEditorRole;

  // Sibling panels (related panels for quick-add dropdown)
  siblings?: string[];
  /** Panel IDs considered equivalent for Add Panel "already represented" checks. */
  addPanelEquivalentIds?: string[];

  // Optional sidebar navigation contribution metadata
  navigation?: PanelNavigationContribution;

  // Internal panel (hidden from user lists)
  internal?: boolean;

  // Lifecycle hooks
  onMount?: () => void;
  onUnmount?: () => void;
}

/**
 * Panel module structure for auto-discovery.
 * Each panel file/folder exports this structure.
 */
export interface PanelModule {
  /** The panel definition */
  default: PanelDefinition;
  /** Optional: The panel component (for lazy loading) */
  Component?: ComponentType<any>;
}

export interface DefinePanelOptionsWithMeta<TSettings = any>
  extends DefinePanelOptions<TSettings> {
  updatedAt: string;
  changeNote: string;
}

/**
 * Define a panel with simplified options.
 * Returns a full PanelDefinition compatible with the registry.
 */
export function definePanel<TSettings = any>(
  options: DefinePanelOptions<TSettings>
): PanelDefinition<TSettings> {
  const {
    id,
    title,
    component,
    updatedAt,
    changeNote,
    featureHighlights,
    category = 'tools',
    panelRole,
    browsable,
    tags = [],
    icon,
    description,
    order,
    enabledByDefault,
    availability,
    contexts = [],
    availableIn,
    showWhen,
    requiresContext = false,
    scopeDiscoverable = true,
    supportsCompactMode = false,
    supportsMultipleInstances = false,
    instances,
    maxInstances,
    consumesCapabilities,
    providesCapabilities,
    settingScopes,
    scopes,
    generationCapable,
    defaultSettings,
    settingsVersion,
    settingsSchema,
    settingsComponent,
    settingsSections,
    settingsTabs,
    settingsForm,
    componentSettings,
    migrateSettings,
    orchestration,
    contextLabel,
    coreEditorRole,
    siblings,
    addPanelEquivalentIds,
    navigation,
    internal = false,
    onMount,
    onUnmount,
  } = options;

  const resolvedContexts = availability?.docks ?? availableIn ?? contexts;
  let resolvedSettingScopes = settingScopes ?? scopes;

  // Backward compat: generationCapable maps to consumesCapabilities
  let resolvedConsumes = consumesCapabilities;
  if (generationCapable) {
    resolvedConsumes = resolvedConsumes ? [...resolvedConsumes] : [];
    const keys = resolvedConsumes.map((d) => (typeof d === 'string' ? d : d.key));
    if (!keys.includes('generation:scope')) {
      resolvedConsumes.push('generation:scope');
    }
  }

  // Auto-derive settingScopes from consumesCapabilities.
  // Capability keys like "generation:scope" map to scope ID "generation".
  if (resolvedConsumes?.length) {
    resolvedSettingScopes = resolvedSettingScopes ? [...resolvedSettingScopes] : [];
    for (const cap of resolvedConsumes) {
      const key = typeof cap === 'string' ? cap : cap.key;
      // Convention: "scopeId:detail" → extract scopeId before ":"
      const scopeId = key.includes(':') ? key.split(':')[0] : key;
      if (scopeId && !resolvedSettingScopes.includes(scopeId)) {
        resolvedSettingScopes.push(scopeId);
      }
    }
  }

  // Warn about unregistered scopes in development
  if (import.meta.env.DEV && resolvedSettingScopes?.length) {
    // Lazy import to avoid circular dependency - validation runs after registration
    queueMicrotask(() => {
      import('./panelSettingsScopes').then(({ panelSettingsScopeRegistry }) => {
        for (const scopeId of resolvedSettingScopes) {
          if (!panelSettingsScopeRegistry.get(scopeId)) {
            console.warn(
              `[definePanel] Panel "${id}" declares settingScope "${scopeId}" which is not registered. ` +
              `Ensure the scope is registered before panels mount.`,
            );
          }
        }
      });
    });
  }

  const resolvedInstances =
    instances === "single"
      ? { supportsMultipleInstances: false, maxInstances: 1 }
      : instances === "multiple"
        ? { supportsMultipleInstances: true, maxInstances }
        : typeof instances === "object" && typeof instances.max === "number"
          ? { supportsMultipleInstances: instances.max > 1, maxInstances: instances.max }
          : { supportsMultipleInstances, maxInstances };

  // Auto-generate tags from contexts if not provided
  const derivedTags = [...tags];
  if (resolvedContexts.length > 0 && !tags.some((t) => resolvedContexts.includes(t))) {
    derivedTags.push(...resolvedContexts);
  }

  return {
    id,
    title,
    updatedAt,
    changeNote,
    featureHighlights,
    component,
    category,
    panelRole,
    browsable,
    tags: derivedTags,
    icon,
    description,
    order,
    enabledByDefault,
    showWhen,
    requiresContext,
    scopeDiscoverable,
    supportsCompactMode,
    supportsMultipleInstances: resolvedInstances.supportsMultipleInstances,
    maxInstances: resolvedInstances.maxInstances,
    instances,
    consumesCapabilities: resolvedConsumes,
    providesCapabilities,
    settingScopes: resolvedSettingScopes,
    scopes,
    defaultSettings,
    settingsSchema,
    settingsComponent,
    settingsSections,
    settingsTabs,
    settingsForm,
    componentSettings,
    settingsVersion,
    migrateSettings,
    orchestration,
    contextLabel,
    coreEditorRole,
    siblings,
    addPanelEquivalentIds,
    navigation,
    onMount,
    onUnmount,
    isInternal: internal,

    // Map contexts to availableIn for SmartDockview scope filtering
    availableIn: resolvedContexts.length > 0 ? resolvedContexts : undefined,
    availability,

    // Store contexts in metadata for legacy filtering
    metadata: {
      contexts: resolvedContexts,
    },
  } as PanelDefinition<TSettings>;
}

/**
 * Strict panel definition helper.
 * Requires latest-update metadata for better changelog hygiene.
 */
export function definePanelWithMeta<TSettings = any>(
  options: DefinePanelOptionsWithMeta<TSettings>
): PanelDefinition<TSettings> {
  return definePanel(options);
}

/**
 * Get contexts from a panel definition.
 * Used by dockviews to filter which panels to include.
 */
export function getPanelContexts(panel: PanelDefinition): string[] {
  return (panel as any).metadata?.contexts ?? [];
}

/**
 * Check if a panel belongs to a specific context.
 */
export function panelBelongsToContext(
  panel: PanelDefinition,
  context: string
): boolean {
  const contexts = getPanelContexts(panel);
  // If no contexts specified, panel is available everywhere
  if (contexts.length === 0) return true;
  return contexts.includes(context);
}

/**
 * Prompt Companion Slot
 *
 * Extension slot system for injecting interactive toolbars alongside prompt input surfaces.
 * Provides both explicit host components AND automatic detection via context/refs.
 *
 * ## Usage Patterns
 *
 * ### Pattern 1: Explicit Host (Original)
 * ```tsx
 * <PromptCompanionHost
 *   surface="prompt-lab"
 *   promptValue={prompt}
 *   setPromptValue={setPrompt}
 * />
 * ```
 *
 * ### Pattern 2: Context Provider (Auto-detection)
 * ```tsx
 * <PromptSurfaceProvider surface="quick-generate">
 *   <PromptInput value={prompt} onChange={setPrompt} />
 *   {/* Companion auto-injected at bottom of provider */}
 * </PromptSurfaceProvider>
 * ```
 *
 * ### Pattern 3: Hook with Ref (Most Flexible)
 * ```tsx
 * const { bind, CompanionSlot } = usePromptSurface({
 *   surface: 'generation-workbench',
 *   value: prompt,
 *   onChange: setPrompt,
 * });
 *
 * return (
 *   <div>
 *     <textarea {...bind} />
 *     <CompanionSlot /> {/* Or omit - renders via portal */}
 *   </div>
 * );
 * ```
 *
 * ### Pattern 4: Global Detection (Zero Config)
 * ```tsx
 * // Any element with data-prompt-surface gets companion
 * <textarea data-prompt-surface="my-surface" data-prompt-id="unique-id" />
 * ```
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

// ============================================================================
// Types
// ============================================================================

/**
 * Supported prompt surfaces
 */
export type PromptCompanionSurface = 'prompt-lab' | 'quick-generate' | 'generation-workbench' | string;

/**
 * Context provided to prompt companion plugins
 */
export interface PromptCompanionContext {
  /** Current prompt text value */
  promptValue: string;

  /** Update the prompt value */
  setPromptValue: (next: string) => void;

  /** Which surface this companion is attached to */
  surface: PromptCompanionSurface;

  /** Optional metadata from the host surface */
  metadata?: Record<string, unknown>;

  /** Whether running in dev mode */
  isDevMode: boolean;
}

/**
 * A registered companion plugin
 */
export interface PromptCompanionPlugin {
  /** Unique plugin ID */
  id: string;

  /** Display name */
  name: string;

  /** Plugin priority (higher = rendered first) */
  priority?: number;

  /** The component to render */
  component: React.ComponentType<PromptCompanionContext>;

  /** Which surfaces this plugin supports (empty = all) */
  supportedSurfaces?: PromptCompanionSurface[];

  /** Whether to only show in dev mode */
  devOnly?: boolean;
}

/**
 * Props for the PromptCompanionHost component
 */
export interface PromptCompanionHostProps {
  /** Current prompt value */
  promptValue: string;

  /** Callback to update prompt value */
  setPromptValue: (next: string) => void;

  /** Which surface this host is rendered in */
  surface: PromptCompanionSurface;

  /** Optional metadata passed to plugins */
  metadata?: Record<string, unknown>;

  /** Additional class name for styling */
  className?: string;

  /** Override dev mode detection */
  forceDevMode?: boolean;
}

/**
 * Registered prompt surface for global detection
 */
interface RegisteredSurface {
  id: string;
  surface: PromptCompanionSurface;
  element: HTMLElement;
  getValue: () => string;
  setValue: (value: string) => void;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Registry
// ============================================================================

/**
 * Registry of prompt companion plugins
 */
class PromptCompanionRegistry {
  private plugins = new Map<string, PromptCompanionPlugin>();
  private listeners = new Set<() => void>();

  /**
   * Register a companion plugin
   */
  register(plugin: PromptCompanionPlugin): () => void {
    if (this.plugins.has(plugin.id)) {
      console.warn(`[PromptCompanion] Plugin "${plugin.id}" is already registered, overwriting`);
    }

    this.plugins.set(plugin.id, plugin);
    this.notifyListeners();

    // Return unregister function
    return () => {
      this.unregister(plugin.id);
    };
  }

  /**
   * Unregister a companion plugin
   */
  unregister(id: string): boolean {
    const existed = this.plugins.delete(id);
    if (existed) {
      this.notifyListeners();
    }
    return existed;
  }

  /**
   * Get a plugin by ID
   */
  get(id: string): PromptCompanionPlugin | undefined {
    return this.plugins.get(id);
  }

  /**
   * Get all registered plugins
   */
  getAll(): PromptCompanionPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get plugins that support a specific surface
   */
  getForSurface(surface: PromptCompanionSurface, isDevMode: boolean): PromptCompanionPlugin[] {
    return this.getAll()
      .filter((plugin) => {
        // Check surface support
        if (plugin.supportedSurfaces && plugin.supportedSurfaces.length > 0) {
          if (!plugin.supportedSurfaces.includes(surface)) {
            return false;
          }
        }

        // Check dev mode requirement
        if (plugin.devOnly && !isDevMode) {
          return false;
        }

        return true;
      })
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  /**
   * Subscribe to registry changes
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (error) {
        console.error('[PromptCompanion] Error in registry listener:', error);
      }
    }
  }
}

/**
 * Global prompt companion registry
 */
export const promptCompanionRegistry = new PromptCompanionRegistry();

// ============================================================================
// Surface Registry (for global detection)
// ============================================================================

/**
 * Registry of prompt surfaces for global auto-detection
 */
class PromptSurfaceRegistry {
  private surfaces = new Map<string, RegisteredSurface>();
  private listeners = new Set<() => void>();

  register(surface: RegisteredSurface): () => void {
    this.surfaces.set(surface.id, surface);
    this.notifyListeners();
    return () => this.unregister(surface.id);
  }

  unregister(id: string): void {
    this.surfaces.delete(id);
    this.notifyListeners();
  }

  getAll(): RegisteredSurface[] {
    return Array.from(this.surfaces.values());
  }

  get(id: string): RegisteredSurface | undefined {
    return this.surfaces.get(id);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (error) {
        console.error('[PromptSurface] Error in listener:', error);
      }
    }
  }
}

export const promptSurfaceRegistry = new PromptSurfaceRegistry();

// ============================================================================
// Context
// ============================================================================

const PromptCompanionCtx = createContext<PromptCompanionContext | null>(null);

/**
 * Hook to access prompt companion context from within a plugin
 */
export function usePromptCompanionContext(): PromptCompanionContext {
  const ctx = useContext(PromptCompanionCtx);
  if (!ctx) {
    throw new Error('usePromptCompanionContext must be used within a PromptCompanionHost');
  }
  return ctx;
}

// ============================================================================
// Pattern 1: Explicit Host Component
// ============================================================================

/**
 * Hook to use the prompt companion slot system
 */
export function usePromptCompanionSlot(options: {
  promptValue: string;
  setPromptValue: (next: string) => void;
  surface: PromptCompanionSurface;
  metadata?: Record<string, unknown>;
  forceDevMode?: boolean;
}) {
  const { promptValue, setPromptValue, surface, metadata, forceDevMode } = options;

  // Track registry updates
  const [, setVersion] = useState(0);

  useEffect(() => {
    return promptCompanionRegistry.subscribe(() => {
      setVersion((v) => v + 1);
    });
  }, []);

  // Determine dev mode
  const isDevMode = forceDevMode ?? import.meta.env.DEV;

  // Build context
  const context = useMemo<PromptCompanionContext>(
    () => ({
      promptValue,
      setPromptValue,
      surface,
      metadata,
      isDevMode,
    }),
    [promptValue, setPromptValue, surface, metadata, isDevMode]
  );

  // Get applicable plugins
  const plugins = useMemo(
    () => promptCompanionRegistry.getForSurface(surface, isDevMode),
    [surface, isDevMode]
  );

  return {
    plugins,
    context,
    hasPlugins: plugins.length > 0,
    registry: promptCompanionRegistry,
  };
}

/**
 * Hook for plugins to register themselves
 */
export function useRegisterPromptCompanion(plugin: PromptCompanionPlugin): void {
  useEffect(() => {
    return promptCompanionRegistry.register(plugin);
  }, [plugin.id]);
}

/**
 * Host component that renders registered prompt companion plugins.
 */
export function PromptCompanionHost({
  promptValue,
  setPromptValue,
  surface,
  metadata,
  className,
  forceDevMode,
}: PromptCompanionHostProps) {
  const { plugins, context, hasPlugins } = usePromptCompanionSlot({
    promptValue,
    setPromptValue,
    surface,
    metadata,
    forceDevMode,
  });

  // Don't render anything if no plugins
  if (!hasPlugins) {
    return null;
  }

  return (
    <PromptCompanionCtx.Provider value={context}>
      <div
        className={className}
        data-prompt-companion-surface={surface}
        data-prompt-companion-plugins={plugins.map((p) => p.id).join(',')}
      >
        {plugins.map((plugin) => {
          const PluginComponent = plugin.component;
          return <PluginComponent key={plugin.id} {...context} />;
        })}
      </div>
    </PromptCompanionCtx.Provider>
  );
}

// ============================================================================
// Pattern 2: Context Provider (Auto-detection within tree)
// ============================================================================

interface PromptSurfaceContextValue {
  surface: PromptCompanionSurface;
  metadata?: Record<string, unknown>;
  promptValue: string;
  setPromptValue: (value: string) => void;
  registerInput: (getValue: () => string, setValue: (v: string) => void) => void;
}

const PromptSurfaceCtx = createContext<PromptSurfaceContextValue | null>(null);

export interface PromptSurfaceProviderProps {
  /** Surface identifier */
  surface: PromptCompanionSurface;
  /** Initial prompt value (if managing state internally) */
  initialValue?: string;
  /** Controlled prompt value */
  value?: string;
  /** Controlled onChange */
  onChange?: (value: string) => void;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
  /** Position for companion: 'top' | 'bottom' | 'none' */
  companionPosition?: 'top' | 'bottom' | 'none';
  /** Children */
  children: ReactNode;
  /** Class name for wrapper */
  className?: string;
}

/**
 * Provider that auto-injects companion for any prompt inputs inside.
 *
 * @example
 * ```tsx
 * <PromptSurfaceProvider surface="my-feature" companionPosition="bottom">
 *   <PromptInput value={prompt} onChange={setPrompt} />
 * </PromptSurfaceProvider>
 * ```
 */
export function PromptSurfaceProvider({
  surface,
  initialValue = '',
  value: controlledValue,
  onChange: controlledOnChange,
  metadata,
  companionPosition = 'bottom',
  children,
  className,
}: PromptSurfaceProviderProps) {
  // Internal state for uncontrolled mode
  const [internalValue, setInternalValue] = useState(initialValue);

  // Determine if controlled
  const isControlled = controlledValue !== undefined;
  const promptValue = isControlled ? controlledValue : internalValue;
  const setPromptValue = useCallback(
    (next: string) => {
      if (isControlled) {
        controlledOnChange?.(next);
      } else {
        setInternalValue(next);
      }
    },
    [isControlled, controlledOnChange]
  );

  // Allow child inputs to register their get/set functions
  const inputRef = useRef<{ getValue: () => string; setValue: (v: string) => void } | null>(null);

  const registerInput = useCallback((getValue: () => string, setValue: (v: string) => void) => {
    inputRef.current = { getValue, setValue };
  }, []);

  const contextValue = useMemo<PromptSurfaceContextValue>(
    () => ({
      surface,
      metadata,
      promptValue,
      setPromptValue,
      registerInput,
    }),
    [surface, metadata, promptValue, setPromptValue, registerInput]
  );

  const companion =
    companionPosition !== 'none' ? (
      <PromptCompanionHost
        surface={surface}
        promptValue={promptValue}
        setPromptValue={setPromptValue}
        metadata={metadata}
      />
    ) : null;

  return (
    <PromptSurfaceCtx.Provider value={contextValue}>
      <div className={className} data-prompt-surface-provider={surface}>
        {companionPosition === 'top' && companion}
        {children}
        {companionPosition === 'bottom' && companion}
      </div>
    </PromptSurfaceCtx.Provider>
  );
}

/**
 * Hook to access prompt surface context (for inputs inside PromptSurfaceProvider)
 */
export function usePromptSurfaceContext(): PromptSurfaceContextValue | null {
  return useContext(PromptSurfaceCtx);
}

// ============================================================================
// Pattern 3: Hook with Ref (Most Flexible)
// ============================================================================

export interface UsePromptSurfaceOptions {
  /** Surface identifier */
  surface: PromptCompanionSurface;
  /** Current value (controlled) */
  value: string;
  /** Change handler (controlled) */
  onChange: (value: string) => void;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
  /** Use portal for companion (renders at body level) */
  usePortal?: boolean;
}

export interface UsePromptSurfaceReturn {
  /** Bind props for the textarea/input */
  bind: {
    value: string;
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => void;
    'data-prompt-surface': string;
    'data-prompt-surface-id': string;
  };
  /** Ref to attach to container (for portal positioning) */
  containerRef: React.RefObject<HTMLDivElement>;
  /** Companion slot component - render this where you want the companion */
  CompanionSlot: React.FC<{ className?: string }>;
  /** Prompt value */
  promptValue: string;
  /** Set prompt value */
  setPromptValue: (value: string) => void;
}

let surfaceIdCounter = 0;

/**
 * Hook that provides prompt surface bindings with automatic companion support.
 *
 * @example
 * ```tsx
 * const { bind, CompanionSlot } = usePromptSurface({
 *   surface: 'my-feature',
 *   value: prompt,
 *   onChange: setPrompt,
 * });
 *
 * return (
 *   <div>
 *     <textarea {...bind} />
 *     <CompanionSlot />
 *   </div>
 * );
 * ```
 */
export function usePromptSurface(options: UsePromptSurfaceOptions): UsePromptSurfaceReturn {
  const { surface, value, onChange, metadata, usePortal = false } = options;

  const containerRef = useRef<HTMLDivElement>(null);
  const surfaceId = useRef(`prompt-surface-${++surfaceIdCounter}`);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  const bind = useMemo(
    () => ({
      value,
      onChange: handleChange,
      'data-prompt-surface': surface,
      'data-prompt-surface-id': surfaceId.current,
    }),
    [value, handleChange, surface]
  );

  // Companion slot component
  const CompanionSlot = useCallback(
    ({ className }: { className?: string }) => {
      const host = (
        <PromptCompanionHost
          surface={surface}
          promptValue={value}
          setPromptValue={onChange}
          metadata={metadata}
          className={className}
        />
      );

      if (usePortal && containerRef.current) {
        return createPortal(host, containerRef.current);
      }

      return host;
    },
    [surface, value, onChange, metadata, usePortal]
  );

  return {
    bind,
    containerRef,
    CompanionSlot,
    promptValue: value,
    setPromptValue: onChange,
  };
}

// ============================================================================
// Pattern 4: Global Detection (via MutationObserver)
// ============================================================================

/**
 * Global companion injector that watches for data-prompt-surface attributes.
 * Mount this once at app root to enable zero-config companion injection.
 *
 * @example
 * ```tsx
 * // In App.tsx
 * <GlobalPromptCompanionInjector />
 *
 * // Anywhere in the app - companion auto-injects
 * <textarea data-prompt-surface="my-feature" value={...} onChange={...} />
 * ```
 */
export function GlobalPromptCompanionInjector() {
  const [surfaces, setSurfaces] = useState<RegisteredSurface[]>([]);

  useEffect(() => {
    // Subscribe to surface registry
    return promptSurfaceRegistry.subscribe(() => {
      setSurfaces(promptSurfaceRegistry.getAll());
    });
  }, []);

  // Observe DOM for data-prompt-surface elements
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // Check added nodes
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            const surfaceAttr = node.getAttribute('data-prompt-surface');
            const surfaceId = node.getAttribute('data-prompt-surface-id');
            if (surfaceAttr && surfaceId) {
              // Auto-register detected surface
              const getValue = () => (node as HTMLTextAreaElement | HTMLInputElement).value || '';
              const setValue = (v: string) => {
                if (node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement) {
                  node.value = v;
                  node.dispatchEvent(new Event('input', { bubbles: true }));
                }
              };

              promptSurfaceRegistry.register({
                id: surfaceId,
                surface: surfaceAttr,
                element: node,
                getValue,
                setValue,
              });
            }
          }
        });

        // Check removed nodes
        mutation.removedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            const surfaceId = node.getAttribute('data-prompt-surface-id');
            if (surfaceId) {
              promptSurfaceRegistry.unregister(surfaceId);
            }
          }
        });
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, []);

  // Render companions for detected surfaces
  return (
    <>
      {surfaces.map((surface) => {
        // Find sibling container to portal into
        const container = surface.element.parentElement;
        if (!container) return null;

        return createPortal(
          <PromptCompanionHost
            key={surface.id}
            surface={surface.surface}
            promptValue={surface.getValue()}
            setPromptValue={surface.setValue}
            metadata={surface.metadata}
            className="mt-2"
          />,
          container
        );
      })}
    </>
  );
}

// ============================================================================
// Event System (for advanced plugin communication)
// ============================================================================

/**
 * Events that prompt companion plugins can dispatch
 */
export type PromptCompanionEvent =
  | { type: 'analyze-request'; prompt: string }
  | { type: 'analyze-complete'; prompt: string; segments: unknown[] }
  | { type: 'suggest-variants'; prompt: string; variants: string[] }
  | { type: 'insert-block'; block: string; position?: 'start' | 'end' | 'cursor' }
  | { type: 'replace-prompt'; newPrompt: string }
  | { type: 'pack-hints-request'; prompt: string }
  | { type: 'pack-hints-response'; hints: unknown };

type PromptCompanionEventHandler = (event: PromptCompanionEvent) => void;

/**
 * Simple event bus for prompt companion plugins
 */
class PromptCompanionEventBus {
  private handlers = new Set<PromptCompanionEventHandler>();

  /**
   * Subscribe to events
   */
  subscribe(handler: PromptCompanionEventHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  /**
   * Dispatch an event to all handlers
   */
  dispatch(event: PromptCompanionEvent): void {
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch (error) {
        console.error('[PromptCompanion] Error in event handler:', error);
      }
    }
  }
}

/**
 * Global event bus for prompt companion communication
 */
export const promptCompanionEvents = new PromptCompanionEventBus();

/**
 * Hook to dispatch prompt companion events
 */
export function usePromptCompanionEvents() {
  const dispatch = useCallback((event: PromptCompanionEvent) => {
    promptCompanionEvents.dispatch(event);
  }, []);

  const subscribe = useCallback((handler: PromptCompanionEventHandler) => {
    return promptCompanionEvents.subscribe(handler);
  }, []);

  return { dispatch, subscribe };
}

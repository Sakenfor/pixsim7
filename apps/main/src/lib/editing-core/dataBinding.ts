/**
 * Editable UI Core - Data Binding Types
 *
 * Shared data binding abstraction for all editable UI systems. This allows
 * us to express static values, property-path bindings, and developer-defined
 * functions in a single model.
 *
 * Serializable subsets of these bindings are represented in unifiedConfig.ts
 * as UnifiedDataBinding.
 */

export type DataBindingKind = 'static' | 'path' | 'fn';

export interface DataBinding<T = unknown> {
  kind: DataBindingKind;

  /**
   * Logical target within a widget configuration, e.g. "value", "label", "icon".
   */
  target: string;

  /**
   * Property path for kind === "path", e.g. "uploadProgress" or "hud.health".
   */
  path?: string;

  /**
   * Static value for kind === "static".
   */
  staticValue?: T;

  /**
   * Developer-defined function for kind === "fn".
   * This is not serializable and should only be used at runtime.
   */
  fn?: (data: any) => T;
}


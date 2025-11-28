/**
 * Configuration merging utilities
 *
 * Handles priority-based merging of overlay configurations from multiple sources
 * (e.g., system defaults, surface defaults, panel settings, widget overrides)
 */

import type {
  OverlayConfiguration,
  OverlayWidget,
  VisibilityConfig,
  WidgetStyle,
} from '../types';

/**
 * Deep merges two partial configurations with priority to the override
 */
export function mergeConfigurations(
  base: Partial<OverlayConfiguration>,
  override: Partial<OverlayConfiguration>,
): Partial<OverlayConfiguration> {
  return {
    ...base,
    ...override,
    widgets: mergeWidgets(base.widgets ?? [], override.widgets ?? []),
    defaultVisibility: mergeVisibilityConfig(
      base.defaultVisibility,
      override.defaultVisibility,
    ),
    defaultStyle: mergeWidgetStyle(base.defaultStyle, override.defaultStyle),
  };
}

/**
 * Merges multiple configurations with increasing priority (last wins)
 */
export function mergeMultipleConfigurations(
  ...configs: Array<Partial<OverlayConfiguration>>
): Partial<OverlayConfiguration> {
  return configs.reduce(
    (acc, config) => mergeConfigurations(acc, config),
    {} as Partial<OverlayConfiguration>,
  );
}

/**
 * Merges widget arrays by ID
 *
 * Widgets from override take precedence. Widgets only in base are kept.
 * New widgets in override are added.
 */
export function mergeWidgets(
  base: OverlayWidget[],
  override: OverlayWidget[],
): OverlayWidget[] {
  const merged = new Map<string, OverlayWidget>();

  // Add all base widgets
  for (const widget of base) {
    merged.set(widget.id, widget);
  }

  // Override/add widgets from override
  for (const widget of override) {
    const existing = merged.get(widget.id);

    if (existing) {
      // Merge existing widget
      merged.set(widget.id, mergeWidget(existing, widget));
    } else {
      // Add new widget
      merged.set(widget.id, widget);
    }
  }

  // Return sorted by priority (higher priority first)
  return Array.from(merged.values()).sort(
    (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
  );
}

/**
 * Merges two widgets with priority to the override
 */
export function mergeWidget(
  base: OverlayWidget,
  override: Partial<OverlayWidget>,
): OverlayWidget {
  return {
    ...base,
    ...override,
    // Explicitly merge nested objects
    position: override.position ?? base.position,
    visibility: mergeVisibilityConfig(base.visibility, override.visibility),
    style: mergeWidgetStyle(base.style, override.style),
    // Preserve functions from override if present
    render: override.render ?? base.render,
    onClick: override.onClick ?? base.onClick,
  };
}

/**
 * Merges visibility configurations
 */
export function mergeVisibilityConfig(
  base?: VisibilityConfig,
  override?: Partial<VisibilityConfig>,
): VisibilityConfig | undefined {
  if (!base && !override) return undefined;
  if (!base) return override as VisibilityConfig;
  if (!override) return base;

  return {
    ...base,
    ...override,
  };
}

/**
 * Merges widget styles
 */
export function mergeWidgetStyle(
  base?: WidgetStyle,
  override?: Partial<WidgetStyle>,
): WidgetStyle | undefined {
  if (!base && !override) return undefined;
  if (!base) return override as WidgetStyle;
  if (!override) return base;

  return {
    ...base,
    ...override,
    // Combine class names
    className: combineClassNames(base.className, override.className),
  };
}

/**
 * Combines CSS class names, removing duplicates
 */
export function combineClassNames(
  ...classNames: Array<string | undefined>
): string | undefined {
  const classes = classNames
    .filter((c): c is string => Boolean(c))
    .flatMap((c) => c.split(/\s+/))
    .filter((c) => c.length > 0);

  // Remove duplicates while preserving order
  const unique = Array.from(new Set(classes));

  return unique.length > 0 ? unique.join(' ') : undefined;
}

/**
 * Applies default configurations to widgets that don't have them
 */
export function applyDefaults(
  config: OverlayConfiguration,
): OverlayConfiguration {
  const { defaultVisibility, defaultStyle } = config;

  return {
    ...config,
    widgets: config.widgets.map((widget) => ({
      ...widget,
      visibility: mergeVisibilityConfig(defaultVisibility, widget.visibility)!,
      style: mergeWidgetStyle(defaultStyle, widget.style),
    })),
  };
}

/**
 * Filters widgets by group
 */
export function filterWidgetsByGroup(
  widgets: OverlayWidget[],
  group?: string,
): OverlayWidget[] {
  if (!group) return widgets;
  return widgets.filter((w) => w.group === group);
}

/**
 * Groups widgets by their group property
 */
export function groupWidgets(
  widgets: OverlayWidget[],
): Map<string | undefined, OverlayWidget[]> {
  const groups = new Map<string | undefined, OverlayWidget[]>();

  for (const widget of widgets) {
    const group = widget.group;
    const existing = groups.get(group) ?? [];
    existing.push(widget);
    groups.set(group, existing);
  }

  return groups;
}

/**
 * Removes widgets by ID
 */
export function removeWidgets(
  config: OverlayConfiguration,
  widgetIds: string[],
): OverlayConfiguration {
  const idsToRemove = new Set(widgetIds);

  return {
    ...config,
    widgets: config.widgets.filter((w) => !idsToRemove.has(w.id)),
  };
}

/**
 * Adds or updates widgets in a configuration
 */
export function upsertWidgets(
  config: OverlayConfiguration,
  widgets: OverlayWidget[],
): OverlayConfiguration {
  const merged = mergeWidgets(config.widgets, widgets);

  return {
    ...config,
    widgets: merged,
  };
}

/**
 * Creates a configuration subset with only specified widgets
 */
export function pickWidgets(
  config: OverlayConfiguration,
  widgetIds: string[],
): OverlayConfiguration {
  const idsToKeep = new Set(widgetIds);

  return {
    ...config,
    widgets: config.widgets.filter((w) => idsToKeep.has(w.id)),
  };
}

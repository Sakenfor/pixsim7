/**
 * Plugin Dependencies Panel
 *
 * Shows what capabilities a plugin provides and consumes.
 * Helps developers understand plugin integration points.
 */

import type { PluginMeta } from '@/lib/plugins/catalog';
import { useFeature, useAction } from '@/lib/capabilities';

interface PluginDependenciesProps {
  plugin: PluginMeta;
}

export function PluginDependencies({ plugin }: PluginDependenciesProps) {
  const hasAnyDependencies =
    (plugin.providesFeatures && plugin.providesFeatures.length > 0) ||
    (plugin.consumesFeatures && plugin.consumesFeatures.length > 0) ||
    (plugin.consumesActions && plugin.consumesActions.length > 0) ||
    (plugin.consumesState && plugin.consumesState.length > 0);

  if (!hasAnyDependencies) {
    return (
      <div className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50">
        <div className="text-sm text-neutral-600 dark:text-neutral-400 text-center">
          This plugin has no declared capability dependencies
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 uppercase">
        Capability Dependencies
      </h3>

      {/* Provides Features */}
      {plugin.providesFeatures && plugin.providesFeatures.length > 0 && (
        <DependencySection
          title="Provides Features"
          icon="🎁"
          description="Features this plugin adds to the app"
          items={plugin.providesFeatures}
          type="feature"
          direction="provides"
        />
      )}

      {/* Consumes Features */}
      {plugin.consumesFeatures && plugin.consumesFeatures.length > 0 && (
        <DependencySection
          title="Consumes Features"
          icon="📦"
          description="Features this plugin depends on"
          items={plugin.consumesFeatures}
          type="feature"
          direction="consumes"
        />
      )}

      {/* Consumes Actions */}
      {plugin.consumesActions && plugin.consumesActions.length > 0 && (
        <DependencySection
          title="Uses Actions"
          icon="⚡"
          description="Actions this plugin can execute"
          items={plugin.consumesActions}
          type="action"
          direction="consumes"
        />
      )}

      {/* Consumes State */}
      {plugin.consumesState && plugin.consumesState.length > 0 && (
        <DependencySection
          title="Reads State"
          icon="📊"
          description="State this plugin accesses"
          items={plugin.consumesState}
          type="state"
          direction="consumes"
        />
      )}
    </div>
  );
}

// ============================================================================
// Dependency Section
// ============================================================================

interface DependencySectionProps {
  title: string;
  icon: string;
  description: string;
  items: string[];
  type: 'feature' | 'action' | 'state';
  direction: 'provides' | 'consumes';
}

function DependencySection({
  title,
  icon,
  description,
  items,
  type,
  direction,
}: DependencySectionProps) {
  const colorClass =
    direction === 'provides'
      ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20'
      : 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20';

  return (
    <div className={`p-4 rounded-lg border ${colorClass}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <h4 className="font-medium text-neutral-900 dark:text-neutral-100">{title}</h4>
      </div>
      <p className="text-xs text-neutral-600 dark:text-neutral-400 mb-3">{description}</p>

      <div className="space-y-2">
        {items.map((itemId) => (
          <DependencyItem key={itemId} id={itemId} type={type} />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Dependency Item
// ============================================================================

interface DependencyItemProps {
  id: string;
  type: 'feature' | 'action' | 'state';
}

function DependencyItem({ id, type }: DependencyItemProps) {
  if (type === 'feature') {
    return <FeatureItem id={id} />;
  } else if (type === 'action') {
    return <ActionItem id={id} />;
  } else {
    return <StateItem id={id} />;
  }
}

// Feature item with details from capability registry
function FeatureItem({ id }: { id: string }) {
  const feature = useFeature(id);

  if (!feature) {
    return (
      <div className="p-3 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700">
        <div className="flex items-start gap-2">
          <span className="text-lg">⚠️</span>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm text-amber-900 dark:text-amber-100">
              Feature Not Registered
            </div>
            <code className="text-xs text-amber-700 dark:text-amber-300 block mt-1">
              {id}
            </code>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">
              This feature is not currently registered in the capability system.
              The plugin may not work correctly until this feature is available.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 rounded bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
      <div className="flex items-start gap-2">
        {feature.icon && <span className="text-lg">{feature.icon}</span>}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm text-neutral-900 dark:text-neutral-100">
            {feature.name}
          </div>
          <code className="text-xs text-neutral-600 dark:text-neutral-400 block mt-1">
            {feature.id}
          </code>
          {feature.description && (
            <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
              {feature.description}
            </p>
          )}
          <div className="flex gap-2 mt-2">
            <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300">
              {feature.category}
            </span>
            {feature.priority && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                Priority: {feature.priority}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Action item with details from capability registry
function ActionItem({ id }: { id: string }) {
  const action = useAction(id);

  if (!action) {
    return (
      <div className="p-3 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700">
        <div className="flex items-start gap-2">
          <span className="text-lg">⚠️</span>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm text-amber-900 dark:text-amber-100">
              Action Not Registered
            </div>
            <code className="text-xs text-amber-700 dark:text-amber-300 block mt-1">
              {id}
            </code>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">
              This action is not currently registered. The plugin may not be able to execute this operation.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 rounded bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
      <div className="flex items-start gap-2">
        {action.icon && <span className="text-lg">{action.icon}</span>}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="font-medium text-sm text-neutral-900 dark:text-neutral-100">
              {action.name}
            </div>
            {action.shortcut && (
              <kbd className="text-xs px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 whitespace-nowrap">
                {action.shortcut}
              </kbd>
            )}
          </div>
          <code className="text-xs text-neutral-600 dark:text-neutral-400 block mt-1">
            {action.id}
          </code>
          {action.description && (
            <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
              {action.description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// State item (simplified since we don't have useState hook to avoid conflict)
function StateItem({ id }: { id: string }) {
  // Note: We can't use useState hook name here as it conflicts with React's useState
  // So we just show the ID for now
  return (
    <div className="p-3 rounded bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
      <code className="text-xs text-neutral-600 dark:text-neutral-400">{id}</code>
      <div className="flex gap-2 mt-2">
        <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300">
          State
        </span>
      </div>
    </div>
  );
}

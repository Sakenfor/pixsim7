/**
 * FeaturesView - Features & Routes tab for App Map
 *
 * Shows registered features grouped by category with their routes and actions.
 */

import type { AppMapMetadata } from '@pixsim7/shared.types';
import { useEffect, useMemo, useState } from 'react';

import type {
  FeatureCapability,
  RouteCapability,
  ActionCapability,
} from '@lib/capabilities';
import { Icon } from '@lib/icons';

import { DocViewer } from './DocViewer';

const getDocLabel = (docPath: string) => {
  const parts = docPath.split('/');
  return parts[parts.length - 1] || docPath;
};

interface FeaturesViewProps {
  features: FeatureCapability[];
  selectedFeature?: FeatureCapability;
  selectedFeatureRoutes: RouteCapability[];
  selectedFeatureActions: ActionCapability[];
  onSelectFeature: (id: string | null) => void;
}

export function FeaturesView({
  features,
  selectedFeature,
  selectedFeatureRoutes,
  selectedFeatureActions,
  onSelectFeature,
}: FeaturesViewProps) {
  const [selectedDocPath, setSelectedDocPath] = useState<string | null>(null);

  useEffect(() => {
    setSelectedDocPath(null);
  }, [selectedFeature?.id]);

  const featuresByCategory = useMemo(() => {
    const grouped: Record<string, FeatureCapability[]> = {};
    features.forEach((f) => {
      const cat = f.category || 'other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(f);
    });
    return grouped;
  }, [features]);

  const categories = Object.keys(featuresByCategory).sort();
  // Prefer top-level appMap, fall back to metadata.appMap for compatibility
  const appMapMeta = (selectedFeature?.appMap ?? selectedFeature?.metadata?.appMap) as AppMapMetadata | undefined;
  const docItems = appMapMeta?.docs ?? [];
  const appMapSections = [
    { label: 'Frontend', items: appMapMeta?.frontend },
    { label: 'Backend', items: appMapMeta?.backend },
    { label: 'Notes', items: appMapMeta?.notes },
  ].filter((section) => section.items && section.items.length > 0);

  return (
    <div className="flex h-full">
      {/* Feature List */}
      <div className="w-1/3 border-r border-neutral-200 dark:border-neutral-700 overflow-y-auto">
        <div className="p-4 space-y-6">
          {categories.map((category) => (
            <div key={category}>
              <h3 className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400 mb-2">
                {category}
              </h3>
              <div className="space-y-1">
                {featuresByCategory[category].map((feature) => (
                  <button
                    key={feature.id}
                    onClick={() => onSelectFeature(feature.id)}
                    className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
                      selectedFeature?.id === feature.id
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                        : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {feature.icon && <Icon name={feature.icon} size={16} />}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {feature.name}
                        </div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                          {feature.id}
                        </div>
                      </div>
                      {feature.priority !== undefined && (
                        <span className="text-xs text-neutral-400 dark:text-neutral-500">
                          {feature.priority}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Feature Details */}
      <div className="flex-1 overflow-y-auto">
        {selectedFeature ? (
          <div className="p-6 space-y-6">
            {/* Feature Header */}
            <div>
              <div className="flex items-center gap-3 mb-2">
                {selectedFeature.icon && (
                  <Icon name={selectedFeature.icon} size={30} />
                )}
                <div>
                  <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
                    {selectedFeature.name}
                  </h2>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    {selectedFeature.id}
                  </p>
                </div>
              </div>
              {selectedFeature.description && (
                <p className="text-neutral-700 dark:text-neutral-300">
                  {selectedFeature.description}
                </p>
              )}
            </div>

            {(docItems.length > 0 || appMapSections.length > 0) && (
              <div>
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-3">
                  Notes & References
                </h3>
                <div className="space-y-3">
                  {docItems.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">
                        Docs
                      </div>
                      <div className="mt-1 space-y-1">
                        {docItems.map((item) => (
                          <button
                            key={item}
                            onClick={() => setSelectedDocPath(item)}
                            className={`w-full text-left px-2 py-1 rounded transition-colors ${
                              selectedDocPath === item
                                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200'
                                : 'hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
                            }`}
                          >
                            <code className="text-xs font-mono text-neutral-600 dark:text-neutral-400">
                              {getDocLabel(item)}
                            </code>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {appMapSections.map((section) => (
                    <div key={section.label}>
                      <div className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">
                        {section.label}
                      </div>
                      <ul className="mt-1 space-y-1">
                        {section.items?.map((item) => (
                          <li key={item} className="text-sm text-neutral-700 dark:text-neutral-300">
                            <code className="text-xs font-mono text-neutral-600 dark:text-neutral-400">
                              {item}
                            </code>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedDocPath && (
              <DocViewer
                docPath={selectedDocPath}
                onNavigateDoc={setSelectedDocPath}
              />
            )}

            {/* Routes */}
            {selectedFeatureRoutes.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-3">
                  Routes ({selectedFeatureRoutes.length})
                </h3>
                <div className="space-y-2">
                  {selectedFeatureRoutes.map((route, i) => (
                    <div
                      key={i}
                      className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded-md border border-neutral-200 dark:border-neutral-700"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {route.icon && <Icon name={route.icon} size={16} />}
                        <code className="text-sm font-mono text-blue-600 dark:text-blue-400">
                          {route.path}
                        </code>
                        {route.protected && (
                          <span className="text-xs px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded">
                            protected
                          </span>
                        )}
                        {route.showInNav && (
                          <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">
                            in nav
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        {route.name}
                      </div>
                      {route.description && (
                        <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                          {route.description}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            {selectedFeatureActions.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-3">
                  Actions ({selectedFeatureActions.length})
                </h3>
                <div className="space-y-2">
                  {selectedFeatureActions.map((action) => (
                    <div
                      key={action.id}
                      className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded-md border border-neutral-200 dark:border-neutral-700"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {action.icon && <Icon name={action.icon} size={16} />}
                        <code className="text-xs font-mono text-neutral-600 dark:text-neutral-400">
                          {action.id}
                        </code>
                        {action.shortcut && (
                          <kbd className="text-xs px-2 py-0.5 bg-neutral-200 dark:bg-neutral-700 rounded font-mono">
                            {action.shortcut}
                          </kbd>
                        )}
                      </div>
                      <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                        {action.name}
                      </div>
                      {action.description && (
                        <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                          {action.description}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-neutral-500 dark:text-neutral-400">
            Select a feature to view details
          </div>
        )}
      </div>
    </div>
  );
}

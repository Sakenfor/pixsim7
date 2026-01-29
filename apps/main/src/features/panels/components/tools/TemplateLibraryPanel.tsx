import { Button } from '@pixsim7/shared.ui';
import { useState, useEffect, useMemo, useCallback } from 'react';

import { pixsimClient } from '@lib/api/client';

import { PanelHeader } from '@features/panels';

/**
 * Template Library Panel
 *
 * Browse and manage templates and runtime entities via the generic CRUD API.
 * - View all registered template types from /templates/registry
 * - Browse entities of each type with pagination
 * - Create, edit, delete entities
 * - View nested entities (e.g., hotspots under locations)
 */

interface TemplateTypeInfo {
  kind: string;
  url_prefix: string;
  supports_soft_delete: boolean;
  supports_upsert: boolean;
  scope_to_owner: boolean;
  ownership?: {
    scope: 'global' | 'user' | 'world' | 'session';
    owner_field?: string | null;
    world_field?: string | null;
    session_field?: string | null;
    requires_admin: boolean;
  } | null;
  filterable_fields: string[];
  search_fields: string[];
  endpoints: {
    list: boolean;
    get: boolean;
    create: boolean;
    update: boolean;
    delete: boolean;
  };
  custom_actions: string[];
  nested_entities: string[];
  has_hierarchy: boolean;
}

interface RegistryResponse {
  template_types: TemplateTypeInfo[];
  count: number;
}

interface EntityListResponse {
  items: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

type ViewMode = 'types' | 'list' | 'detail' | 'edit' | 'create';

const WORLD_ID_STORAGE_KEY = 'templateLibrary.worldId';
const SESSION_ID_STORAGE_KEY = 'templateLibrary.sessionId';

export function TemplateLibraryPanel() {
  // Registry state
  const [templateTypes, setTemplateTypes] = useState<TemplateTypeInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Navigation state
  const [viewMode, setViewMode] = useState<ViewMode>('types');
  const [selectedType, setSelectedType] = useState<TemplateTypeInfo | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<Record<string, unknown> | null>(null);

  // List state
  const [entities, setEntities] = useState<Record<string, unknown>[]>([]);
  const [totalEntities, setTotalEntities] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const pageSize = 20;

  // Form state
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [worldIdInput, setWorldIdInput] = useState('');
  const [sessionIdInput, setSessionIdInput] = useState('');
  const ownershipScope = selectedType?.ownership?.scope;
  const requiresWorldId = ownershipScope === 'world';
  const requiresSessionId = ownershipScope === 'session';

  const appendScopeParams = useCallback((params: URLSearchParams) => {
    const worldId = worldIdInput.trim();
    const sessionId = sessionIdInput.trim();
    if (worldId) params.set('world_id', worldId);
    if (sessionId) params.set('session_id', sessionId);
  }, [worldIdInput, sessionIdInput]);

  const withScopeQuery = useCallback((path: string) => {
    const params = new URLSearchParams();
    appendScopeParams(params);
    const query = params.toString();
    return query ? `${path}?${query}` : path;
  }, [appendScopeParams]);

  const ensureScopeReady = useCallback(() => {
    if (requiresWorldId && !worldIdInput.trim()) {
      setError('world_id required');
      return false;
    }
    if (requiresSessionId && !sessionIdInput.trim()) {
      setError('session_id required');
      return false;
    }
    return true;
  }, [requiresWorldId, requiresSessionId, worldIdInput, sessionIdInput]);

  // Load template types from registry
  useEffect(() => {
    let cancelled = false;
    async function loadRegistry() {
      setLoading(true);
      setError(null);
      try {
        const data = await pixsimClient.get<RegistryResponse>('/game/templates/registry');
        if (!cancelled) {
          setTemplateTypes(data.template_types);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load template registry');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadRegistry();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedWorldId = window.localStorage.getItem(WORLD_ID_STORAGE_KEY);
    const savedSessionId = window.localStorage.getItem(SESSION_ID_STORAGE_KEY);
    if (savedWorldId !== null) setWorldIdInput(savedWorldId);
    if (savedSessionId !== null) setSessionIdInput(savedSessionId);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(WORLD_ID_STORAGE_KEY, worldIdInput);
  }, [worldIdInput]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SESSION_ID_STORAGE_KEY, sessionIdInput);
  }, [sessionIdInput]);

  useEffect(() => {
    if (!requiresWorldId && !requiresSessionId) return;
    if (!ensureScopeReady()) return;
    setError(null);
  }, [requiresWorldId, requiresSessionId, worldIdInput, sessionIdInput, ensureScopeReady]);

  // Load entities when type is selected
  const loadEntities = useCallback(async () => {
    if (!selectedType || !selectedType.endpoints.list) return;
    if (!ensureScopeReady()) {
      setEntities([]);
      setTotalEntities(0);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(currentPage * pageSize),
        include_inactive: 'true',
      });
      if (searchQuery) {
        params.set('search', searchQuery);
      }
      appendScopeParams(params);

      const data = await pixsimClient.get<EntityListResponse>(
        `/game/${selectedType.url_prefix}?${params.toString()}`
      );
      setEntities(data.items);
      setTotalEntities(data.total);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load entities');
    } finally {
      setLoading(false);
    }
  }, [selectedType, currentPage, searchQuery, appendScopeParams, ensureScopeReady]);

  useEffect(() => {
    if (viewMode === 'list' && selectedType) {
      loadEntities();
    }
  }, [viewMode, selectedType, loadEntities]);

  // Handlers
  const handleSelectType = (type: TemplateTypeInfo) => {
    setSelectedType(type);
    setSelectedEntity(null);
    setCurrentPage(0);
    setSearchQuery('');
    setViewMode('list');
  };

  const handleSelectEntity = async (entity: Record<string, unknown>) => {
    setSelectedEntity(entity);
    setViewMode('detail');
  };

  const handleBack = () => {
    if (viewMode === 'detail' || viewMode === 'edit') {
      setViewMode('list');
      setSelectedEntity(null);
    } else if (viewMode === 'list' || viewMode === 'create') {
      setViewMode('types');
      setSelectedType(null);
    }
  };

  const handleCreate = () => {
    setFormData({});
    setViewMode('create');
  };

  const handleEdit = () => {
    if (selectedEntity) {
      setFormData({ ...selectedEntity });
      setViewMode('edit');
    }
  };

  const handleDelete = async () => {
    if (!selectedType || !selectedEntity) return;
    if (!ensureScopeReady()) return;

    const id = selectedEntity.id;
    if (!confirm(`Delete this ${selectedType.kind}?`)) return;

    try {
      await pixsimClient.delete(withScopeQuery(`/game/${selectedType.url_prefix}/${id}`));
      setViewMode('list');
      setSelectedEntity(null);
      loadEntities();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    }
  };

  const handleSave = async () => {
    if (!selectedType) return;
    if (!ensureScopeReady()) return;

    setSaving(true);
    setError(null);
    try {
      if (viewMode === 'create') {
        await pixsimClient.post(withScopeQuery(`/game/${selectedType.url_prefix}`), formData);
      } else if (viewMode === 'edit' && selectedEntity) {
        const id = selectedEntity.id;
        await pixsimClient.put(withScopeQuery(`/game/${selectedType.url_prefix}/${id}`), formData);
      }
      setViewMode('list');
      setSelectedEntity(null);
      loadEntities();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // Group types by tag
  const groupedTypes = useMemo(() => {
    const groups: Record<string, TemplateTypeInfo[]> = {
      templates: [],
      runtime: [],
      other: [],
    };

    for (const type of templateTypes) {
      // Check tags array - types have a 'tags' array like ["templates", "locations"]
      const isTemplate = type.kind.toLowerCase().includes('template');
      const isRuntime = !isTemplate;

      if (isTemplate) {
        groups.templates.push(type);
      } else if (isRuntime) {
        groups.runtime.push(type);
      } else {
        groups.other.push(type);
      }
    }

    return groups;
  }, [templateTypes]);

  // Render type card
  const renderTypeCard = (type: TemplateTypeInfo) => (
    <button
      key={type.kind}
      type="button"
      onClick={() => handleSelectType(type)}
      className="w-full text-left p-3 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 transition-colors"
    >
      <div className="font-medium text-sm text-neutral-800 dark:text-neutral-100">
        {type.kind}
      </div>
      <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
        /{type.url_prefix}
      </div>
      <div className="flex flex-wrap gap-1 mt-2">
        {type.nested_entities.length > 0 && (
          <span className="px-1.5 py-0.5 text-[10px] rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
            +{type.nested_entities.length} nested
          </span>
        )}
        {type.scope_to_owner && (
          <span className="px-1.5 py-0.5 text-[10px] rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
            owner-scoped
          </span>
        )}
        {type.ownership?.scope === 'world' && (
          <span className="px-1.5 py-0.5 text-[10px] rounded bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300">
            world-scoped
          </span>
        )}
        {type.ownership?.scope === 'session' && (
          <span className="px-1.5 py-0.5 text-[10px] rounded bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">
            session-scoped
          </span>
        )}
        {type.ownership?.requires_admin && (
          <span className="px-1.5 py-0.5 text-[10px] rounded bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300">
            admin-only
          </span>
        )}
        {type.supports_soft_delete && (
          <span className="px-1.5 py-0.5 text-[10px] rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
            soft-delete
          </span>
        )}
      </div>
    </button>
  );

  // Render types view
  const renderTypesView = () => (
    <div className="p-4 space-y-6">
      {Object.entries(groupedTypes).map(([group, types]) => {
        if (types.length === 0) return null;
        return (
          <div key={group}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-2">
              {group === 'templates' ? 'Authoring Templates' : group === 'runtime' ? 'Runtime Entities' : 'Other'}
            </h3>
            <div className="grid grid-cols-1 gap-2">
              {types.map(renderTypeCard)}
            </div>
          </div>
        );
      })}

      {templateTypes.length === 0 && !loading && (
        <div className="text-center text-neutral-500 dark:text-neutral-400 py-8">
          No template types registered
        </div>
      )}
    </div>
  );

  // Render entity list
  const renderListView = () => {
    if (!selectedType) return null;

    const totalPages = Math.ceil(totalEntities / pageSize);
    const listEnabled = selectedType.endpoints.list;

    return (
      <div className="flex flex-col h-full">
        {/* Search and actions */}
        <div className="p-3 border-b border-neutral-200 dark:border-neutral-700 flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder={listEnabled ? 'Search...' : 'Search disabled'}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(0);
              }}
              disabled={!listEnabled}
              className="flex-1 px-2 py-1 text-sm rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 disabled:opacity-60"
            />
            {selectedType.endpoints.create && (
              <Button size="sm" onClick={handleCreate}>
                + New
              </Button>
            )}
          </div>
          {(requiresWorldId || requiresSessionId) && (
            <div className="flex gap-2">
              {requiresWorldId && (
                <div className="flex-1 flex flex-col gap-1">
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder="World ID"
                    value={worldIdInput}
                    onChange={(e) => {
                      setWorldIdInput(e.target.value);
                      setCurrentPage(0);
                    }}
                    className="w-full px-2 py-1 text-xs rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800"
                  />
                  <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                    Required for world-scoped types
                  </span>
                </div>
              )}
              {requiresSessionId && (
                <div className="flex-1 flex flex-col gap-1">
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder="Session ID"
                    value={sessionIdInput}
                    onChange={(e) => {
                      setSessionIdInput(e.target.value);
                      setCurrentPage(0);
                    }}
                    className="w-full px-2 py-1 text-xs rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800"
                  />
                  <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                    Required for session-scoped types
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Entity list */}
        <div className="flex-1 overflow-auto">
          {!listEnabled && (
            <div className="text-center text-neutral-500 dark:text-neutral-400 py-8">
              Listing is disabled for this type.
            </div>
          )}
          {entities.map((entity, idx) => (
            <button
              key={String(entity.id ?? idx)}
              type="button"
              onClick={() => handleSelectEntity(entity)}
              className="w-full text-left px-3 py-2 border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
            >
              <div className="font-medium text-sm text-neutral-800 dark:text-neutral-100">
                {String(entity.name ?? entity.title ?? entity.id ?? `Item ${idx}`)}
              </div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                ID: {String(entity.id)}
              </div>
            </button>
          ))}

          {listEnabled && entities.length === 0 && !loading && (
            <div className="text-center text-neutral-500 dark:text-neutral-400 py-8">
              No {selectedType.kind} found
            </div>
          )}
        </div>

        {/* Pagination */}
        {listEnabled && totalPages > 1 && (
          <div className="p-2 border-t border-neutral-200 dark:border-neutral-700 flex items-center justify-between text-xs">
            <Button
              size="sm"
              variant="ghost"
              disabled={currentPage === 0}
              onClick={() => setCurrentPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span className="text-neutral-500 dark:text-neutral-400">
              Page {currentPage + 1} of {totalPages} ({totalEntities} total)
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={currentPage >= totalPages - 1}
              onClick={() => setCurrentPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    );
  };

  // Render entity detail
  const renderDetailView = () => {
    if (!selectedType || !selectedEntity) return null;

    return (
      <div className="flex flex-col h-full">
        {/* Actions */}
        <div className="p-3 border-b border-neutral-200 dark:border-neutral-700 flex gap-2">
          {selectedType.endpoints.update && (
            <Button size="sm" onClick={handleEdit}>
              Edit
            </Button>
          )}
          {selectedType.endpoints.delete && (
            <Button size="sm" variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          )}
        </div>

        {/* Entity data */}
        <div className="flex-1 overflow-auto p-3">
          <pre className="text-xs bg-neutral-100 dark:bg-neutral-800 p-3 rounded overflow-auto whitespace-pre-wrap">
            {JSON.stringify(selectedEntity, null, 2)}
          </pre>
        </div>

        {/* Nested entities */}
        {selectedType.nested_entities.length > 0 && (
          <div className="p-3 border-t border-neutral-200 dark:border-neutral-700">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-2">
              Nested Entities
            </h4>
            <div className="flex flex-wrap gap-2">
              {selectedType.nested_entities.map((nested) => (
                <span
                  key={nested}
                  className="px-2 py-1 text-xs rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                >
                  {nested}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render form (create/edit)
  const renderFormView = () => {
    if (!selectedType) return null;

    return (
      <div className="flex flex-col h-full">
        {/* Form header */}
        <div className="p-3 border-b border-neutral-200 dark:border-neutral-700 flex gap-2">
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
          <Button size="sm" variant="ghost" onClick={handleBack}>
            Cancel
          </Button>
        </div>

        {/* JSON editor */}
        <div className="flex-1 overflow-auto p-3">
          <textarea
            value={JSON.stringify(formData, null, 2)}
            onChange={(e) => {
              try {
                setFormData(JSON.parse(e.target.value));
                setError(null);
              } catch {
                setError('Invalid JSON');
              }
            }}
            className="w-full h-full min-h-[300px] font-mono text-xs p-3 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 resize-none"
          />
        </div>
      </div>
    );
  };

  // Get breadcrumb / title
  const getTitle = () => {
    if (viewMode === 'types') return 'Template Library';
    if (selectedType) {
      if (viewMode === 'create') return `New ${selectedType.kind}`;
      if (viewMode === 'edit') return `Edit ${selectedType.kind}`;
      if (viewMode === 'detail') return selectedType.kind;
      return selectedType.kind;
    }
    return 'Template Library';
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-neutral-900">
      <PanelHeader
        title={getTitle()}
        icon="📚"
        category="tools"
        onClickTitle={viewMode !== 'types' ? handleBack : undefined}
      >
        {viewMode !== 'types' && (
          <Button size="sm" variant="ghost" onClick={handleBack}>
            ← Back
          </Button>
        )}
      </PanelHeader>

      {/* Error banner */}
      {error && (
        <div className="px-3 py-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-xs">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="px-3 py-2 text-xs text-neutral-500 dark:text-neutral-400">
          Loading...
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'types' && renderTypesView()}
        {viewMode === 'list' && renderListView()}
        {viewMode === 'detail' && renderDetailView()}
        {(viewMode === 'create' || viewMode === 'edit') && renderFormView()}
      </div>
    </div>
  );
}

import {
  Button,
  SearchInput,
  SidebarContentLayout,
  type SidebarContentLayoutSection,
  useSidebarNav,
  useTheme,
} from '@pixsim7/shared.ui';
import { useState, useEffect, useMemo, useCallback } from 'react';

import { pixsimClient } from '@lib/api/client';
import {
  createGameObject,
  getGameObject,
  listGameObjects,
  updateGameObject,
} from '@lib/api/game';

import { useEffectiveAuthoringIds } from '@features/contextHub';
import { PanelHeader } from '@features/panels';

/**
 * Template Library Panel
 *
 * Browse and manage templates and runtime entities via the generic CRUD API.
 * - View registered template types from /templates/registry (when available)
 * - Browse entities of each type with pagination
 * - Create, edit, delete entities
 * - View nested entities (e.g., hotspots under locations)
 */

interface TemplateTypeInfo {
  kind: string;
  url_prefix: string;
  source?: 'registry' | 'native';
  list_mode?: 'paginated' | 'array';
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

function normalizeEntityListResponse(
  data: unknown,
): { items: Record<string, unknown>[]; total: number } {
  if (Array.isArray(data)) {
    return {
      items: data as Record<string, unknown>[],
      total: data.length,
    };
  }

  if (data && typeof data === 'object') {
    const maybeItems = (data as { items?: unknown }).items;
    if (Array.isArray(maybeItems)) {
      const maybeTotal = (data as { total?: unknown }).total;
      return {
        items: maybeItems as Record<string, unknown>[],
        total: typeof maybeTotal === 'number' ? maybeTotal : maybeItems.length,
      };
    }
  }

  return { items: [], total: 0 };
}

type ViewMode = 'types' | 'list' | 'detail' | 'edit' | 'create';

const WORLD_ID_STORAGE_KEY = 'templateLibrary.worldId';
const SESSION_ID_STORAGE_KEY = 'templateLibrary.sessionId';

const GAME_OBJECT_TYPE: TemplateTypeInfo = {
  kind: 'gameObject',
  url_prefix: 'objects',
  source: 'native',
  list_mode: 'array',
  supports_soft_delete: false,
  supports_upsert: false,
  scope_to_owner: false,
  ownership: {
    scope: 'world',
    owner_field: null,
    world_field: 'world_id',
    session_field: null,
    requires_admin: false,
  },
  filterable_fields: ['name', 'objectKind'],
  search_fields: ['name', 'objectKind'],
  endpoints: {
    list: true,
    get: true,
    create: true,
    update: true,
    delete: false,
  },
  custom_actions: [],
  nested_entities: [],
  has_hierarchy: false,
};

function getTemplateTypeNavId(type: TemplateTypeInfo): string {
  return `${type.kind}::${type.url_prefix}`;
}

export function TemplateLibraryPanel() {
  const effectiveIds = useEffectiveAuthoringIds();

  // Registry state
  const [templateTypes, setTemplateTypes] = useState<TemplateTypeInfo[]>([GAME_OBJECT_TYPE]);
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
  const [typeFilter, setTypeFilter] = useState('');
  const pageSize = 20;
  const { theme: sidebarVariant } = useTheme();

  // Form state
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [worldIdInput, setWorldIdInput] = useState('');
  const [sessionIdInput, setSessionIdInput] = useState('');
  const ownershipScope = selectedType?.ownership?.scope;
  const requiresWorldId = ownershipScope === 'world';
  const requiresSessionId = ownershipScope === 'session';

  const getEffectiveWorldIdText = useCallback(() => {
    const manual = worldIdInput.trim();
    if (manual) return manual;
    if (effectiveIds.worldId != null) return String(effectiveIds.worldId);
    return '';
  }, [worldIdInput, effectiveIds.worldId]);

  const appendScopeParams = useCallback((params: URLSearchParams) => {
    const worldId = getEffectiveWorldIdText();
    const sessionId = sessionIdInput.trim();
    if (worldId && (worldIdInput.trim() || requiresWorldId)) params.set('world_id', worldId);
    if (sessionId) params.set('session_id', sessionId);
  }, [worldIdInput, sessionIdInput, requiresWorldId, getEffectiveWorldIdText]);

  const withScopeQuery = useCallback((path: string) => {
    const params = new URLSearchParams();
    appendScopeParams(params);
    const query = params.toString();
    return query ? `${path}?${query}` : path;
  }, [appendScopeParams]);

  const getTypeApiBasePath = useCallback((type: TemplateTypeInfo) => {
    if (type.source === 'native') {
      return `/game/${type.url_prefix}`;
    }
    return `/game/templates/${type.url_prefix}`;
  }, []);

  const ensureScopeReady = useCallback(() => {
    const worldId = getEffectiveWorldIdText();
    if (requiresWorldId && !worldId) {
      setError('world_id required (no active world context)');
      return false;
    }
    if (requiresSessionId && !sessionIdInput.trim()) {
      setError('session_id required');
      return false;
    }
    return true;
  }, [requiresWorldId, requiresSessionId, sessionIdInput, getEffectiveWorldIdText]);

  const parseWorldId = useCallback((): number | null => {
    const raw = getEffectiveWorldIdText();
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }, [getEffectiveWorldIdText]);

  // Load template types from registry
  useEffect(() => {
    let cancelled = false;
    async function loadRegistry() {
      setLoading(true);
      setError(null);
      try {
        const data = await pixsimClient.get<RegistryResponse>('/game/templates/registry');
        if (!cancelled) {
          const registryTypes = data.template_types.map((item) => ({
            ...item,
            source: item.source ?? 'registry',
          }));
          const hasGameObject = data.template_types.some(
            (item) =>
              String(item.kind).toLowerCase() === 'gameobject' ||
              String(item.url_prefix).toLowerCase() === 'objects',
          );
          setTemplateTypes(
            hasGameObject
              ? registryTypes
              : [GAME_OBJECT_TYPE, ...registryTypes],
          );
        }
      } catch (e: unknown) {
        if (!cancelled) {
          const status = (e as any)?.response?.status ?? (e as any)?.status;
          // Registry route is optional in some backend profiles; keep native types usable.
          if (status === 404) {
            setTemplateTypes((prev) => (prev.length > 0 ? prev : [GAME_OBJECT_TYPE]));
            setError(null);
          } else {
            setError(e instanceof Error ? e.message : 'Failed to load template registry');
          }
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
      if (selectedType.kind === 'gameObject') {
        const allObjects = await listGameObjects({ worldId: parseWorldId() });
        const normalizedQuery = searchQuery.trim().toLowerCase();
        const filtered = normalizedQuery
          ? allObjects.filter((obj) => {
            const name = String(obj.name ?? '').toLowerCase();
            const kind = String(obj.objectKind ?? '').toLowerCase();
            const id = String(obj.id ?? '').toLowerCase();
            return (
              name.includes(normalizedQuery) ||
              kind.includes(normalizedQuery) ||
              id.includes(normalizedQuery)
            );
          })
          : allObjects;

        const start = currentPage * pageSize;
        const page = filtered.slice(start, start + pageSize);
        setEntities(page as Record<string, unknown>[]);
        setTotalEntities(filtered.length);
        return;
      }

      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(currentPage * pageSize),
        include_inactive: 'true',
      });
      if (searchQuery) {
        params.set('search', searchQuery);
      }
      appendScopeParams(params);

      const data = await pixsimClient.get<EntityListResponse | Record<string, unknown>[]>(
        `${getTypeApiBasePath(selectedType)}?${params.toString()}`
      );
      const normalized = normalizeEntityListResponse(data);
      setEntities(normalized.items);
      setTotalEntities(normalized.total);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load entities');
    } finally {
      setLoading(false);
    }
  }, [
    selectedType,
    currentPage,
    searchQuery,
    appendScopeParams,
    ensureScopeReady,
    parseWorldId,
    getTypeApiBasePath,
  ]);

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
    if (selectedType?.kind === 'gameObject' && selectedType.endpoints.get) {
      const objectId = Number(entity.id);
      if (Number.isFinite(objectId)) {
        setLoading(true);
        setError(null);
        try {
          const detail = await getGameObject(objectId, { worldId: parseWorldId() });
          setSelectedEntity(detail as Record<string, unknown>);
          setViewMode('detail');
          return;
        } catch (e: unknown) {
          setError(e instanceof Error ? e.message : 'Failed to load entity detail');
        } finally {
          setLoading(false);
        }
      }
    }
    setSelectedEntity(entity);
    setViewMode('detail');
  };

  const handleBack = () => {
    if (viewMode === 'detail' || viewMode === 'edit' || viewMode === 'create') {
      setViewMode('list');
      setSelectedEntity(null);
    } else if (viewMode === 'list') {
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
      await pixsimClient.delete(withScopeQuery(`${getTypeApiBasePath(selectedType)}/${id}`));
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
      if (selectedType.kind === 'gameObject') {
        if (viewMode === 'create') {
          await createGameObject(formData, { worldId: parseWorldId() });
        } else if (viewMode === 'edit' && selectedEntity) {
          const id = Number(selectedEntity.id);
          if (!Number.isFinite(id)) {
            throw new Error('Invalid object id');
          }
          await updateGameObject(id, formData, { worldId: parseWorldId() });
        }
      } else if (viewMode === 'create') {
        await pixsimClient.post(withScopeQuery(getTypeApiBasePath(selectedType)), formData);
      } else if (viewMode === 'edit' && selectedEntity) {
        const id = selectedEntity.id;
        await pixsimClient.put(withScopeQuery(`${getTypeApiBasePath(selectedType)}/${id}`), formData);
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

  // Group types for sidebar and apply sidebar filter.
  const visibleTemplateTypes = useMemo(() => {
    const query = typeFilter.trim().toLowerCase();
    if (!query) return templateTypes;
    return templateTypes.filter((type) => {
      const nested = type.nested_entities.join(' ').toLowerCase();
      return (
        type.kind.toLowerCase().includes(query) ||
        type.url_prefix.toLowerCase().includes(query) ||
        nested.includes(query)
      );
    });
  }, [templateTypes, typeFilter]);

  const groupedTypes = useMemo(() => {
    const groups: Record<string, TemplateTypeInfo[]> = {
      templates: [],
      runtime: [],
      other: [],
    };

    for (const type of visibleTemplateTypes) {
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

    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => a.kind.localeCompare(b.kind));
    }

    return groups;
  }, [visibleTemplateTypes]);

  const templateTypeByNavId = useMemo(() => {
    const map = new Map<string, TemplateTypeInfo>();
    for (const type of templateTypes) {
      map.set(getTemplateTypeNavId(type), type);
    }
    return map;
  }, [templateTypes]);

  const sidebarSections = useMemo<SidebarContentLayoutSection[]>(() => {
    const sections: SidebarContentLayoutSection[] = [];
    const orderedGroups: Array<{
      id: 'templates' | 'runtime' | 'other';
      label: string;
    }> = [
      { id: 'templates', label: 'Authoring Templates' },
      { id: 'runtime', label: 'Runtime Entities' },
      { id: 'other', label: 'Other' },
    ];

    for (const group of orderedGroups) {
      const types = groupedTypes[group.id];
      if (!types || types.length === 0) continue;
      sections.push({
        id: group.id,
        label: group.label,
        children: types.map((type) => ({
          id: getTemplateTypeNavId(type),
          label: type.kind,
        })),
      });
    }

    return sections;
  }, [groupedTypes]);

  const sidebarNav = useSidebarNav<string, string>({
    sections: sidebarSections,
    storageKey: 'template-library:nav',
  });

  const handleSidebarSelectSection = (sectionId: string) => {
    sidebarNav.selectSection(sectionId);
    const section = sidebarSections.find((item) => item.id === sectionId);
    const firstChildId = section?.children?.[0]?.id;
    if (!firstChildId) {
      setViewMode('types');
      setSelectedType(null);
      return;
    }
    const type = templateTypeByNavId.get(firstChildId);
    if (type) {
      handleSelectType(type);
    }
  };

  const handleSidebarSelectChild = (parentId: string, childId: string) => {
    sidebarNav.selectChild(parentId, childId);
    const type = templateTypeByNavId.get(childId);
    if (type) {
      handleSelectType(type);
    }
  };

  // Render types view
  const renderTypesView = () => (
    <div className="h-full min-h-0 overflow-auto p-4">
      <div className="max-w-xl rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-900/50 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          Template Library
        </h3>
        <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
          Select a template type from the left sidebar to browse entities, inspect details, or edit JSON payloads.
        </p>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-2">
            <div className="text-neutral-500 dark:text-neutral-400">Templates</div>
            <div className="font-semibold text-neutral-800 dark:text-neutral-100">
              {groupedTypes.templates.length}
            </div>
          </div>
          <div className="rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-2">
            <div className="text-neutral-500 dark:text-neutral-400">Runtime</div>
            <div className="font-semibold text-neutral-800 dark:text-neutral-100">
              {groupedTypes.runtime.length}
            </div>
          </div>
          <div className="rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-2">
            <div className="text-neutral-500 dark:text-neutral-400">Total</div>
            <div className="font-semibold text-neutral-800 dark:text-neutral-100">
              {visibleTemplateTypes.length}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Render entity list
  const renderListView = () => {
    if (!selectedType) return null;

    const safeEntities = Array.isArray(entities) ? entities : [];
    const totalPages = Math.ceil(totalEntities / pageSize);
    const listEnabled = selectedType.endpoints.list;
    const worldFallbackSource = !worldIdInput.trim() && effectiveIds.worldId != null
      ? `${effectiveIds.worldId} (${effectiveIds.worldSource})`
      : null;

    return (
      <div className="flex flex-col h-full min-h-0">
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
                    {worldFallbackSource
                      ? `Using active world #${worldFallbackSource}; enter value to override`
                      : 'Required for world-scoped types'}
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
        <div className="flex-1 min-h-0 overflow-auto">
          {!listEnabled && (
            <div className="text-center text-neutral-500 dark:text-neutral-400 py-8">
              Listing is disabled for this type.
            </div>
          )}
          {safeEntities.map((entity, idx) => (
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

          {listEnabled && safeEntities.length === 0 && !loading && (
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
      <div className="flex flex-col h-full min-h-0">
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
        <div className="flex-1 min-h-0 overflow-auto p-3">
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
      <div className="flex flex-col h-full min-h-0">
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
        <div className="flex-1 min-h-0 overflow-auto p-3">
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
  const canNavigateBack = viewMode === 'detail' || viewMode === 'edit' || viewMode === 'create';

  return (
    <div className="h-full flex flex-col bg-white dark:bg-neutral-900">
      <PanelHeader
        title={getTitle()}
        icon="📚"
        category="tools"
        onClickTitle={canNavigateBack ? handleBack : undefined}
      >
        {canNavigateBack && (
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
      <div className="flex-1 min-h-0 overflow-hidden">
        <SidebarContentLayout
          sections={sidebarSections}
          activeSectionId={sidebarNav.activeSectionId}
          activeChildId={sidebarNav.activeChildId}
          onSelectSection={handleSidebarSelectSection}
          onSelectChild={handleSidebarSelectChild}
          expandedSectionIds={sidebarNav.expandedSectionIds}
          onToggleExpand={sidebarNav.toggleExpand}
          sidebarTitle={(
            <div className="space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                Template Types
              </div>
              <SearchInput
                value={typeFilter}
                onChange={setTypeFilter}
                placeholder="Filter types..."
                size="sm"
              />
            </div>
          )}
          sidebarWidth="w-60"
          variant={sidebarVariant}
          navClassName="space-y-1"
          contentClassName="overflow-hidden min-h-0"
          collapsible
          expandedWidth={240}
          persistKey="template-library-sidebar"
        >
          {viewMode === 'types' && renderTypesView()}
          {viewMode === 'list' && renderListView()}
          {viewMode === 'detail' && renderDetailView()}
          {(viewMode === 'create' || viewMode === 'edit') && renderFormView()}
        </SidebarContentLayout>
      </div>
    </div>
  );
}

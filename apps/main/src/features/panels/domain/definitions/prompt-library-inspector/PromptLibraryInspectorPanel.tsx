import { ROLE_COLORS } from '@pixsim7/shared.types/composition-roles.generated';
import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  getTemplateDiagnostics,
  getTemplate,
  listBlockPackages,
  listBlockRoles,
  listContentPacks,
  listTemplates,
  type BlockRoleSummary,
  type TemplateDiagnosticsResponse,
  type BlockTemplateDetail,
  type BlockTemplateSummary,
} from '@lib/api/blockTemplates';
import { Icon } from '@lib/icons';

import { useWorkspaceStore } from '@features/workspace';

import { useCompositionPackages } from '@/stores/compositionPackageStore';

import { BlockExplorerPanel } from '../block-explorer/BlockExplorerPanel';
import { BlockMatrixView, type BlockMatrixPreset } from '../block-matrix/BlockMatrixView';

type TabId = 'packages' | 'templates' | 'blocks' | 'matrix';

const MATRIX_PRESETS: BlockMatrixPreset[] = [
  {
    label: 'Role x Category',
    description: 'Overview of all blocks by role and category',
    query: { row_key: 'role', col_key: 'category' },
  },
  {
    label: 'Pose Lock Coverage',
    description: 'Pose lock blocks by rigidity and approach',
    query: {
      row_key: 'tag:rigidity',
      col_key: 'tag:approach',
      package_name: 'shared',
      role: 'subject',
      category: 'pose_lock',
      include_empty: true,
      expected_row_values: 'minimal,low,medium,high,maximum',
      expected_col_values: 'skeletal,contour,gravity,i2v',
    },
  },
  {
    label: 'POV Progression',
    description: 'POV approach response blocks by beat axis and response mode',
    query: {
      row_key: 'tag:beat_axis',
      col_key: 'tag:response_mode',
      tags: 'sequence_family:pov_approach_response',
      include_empty: true,
    },
  },
];

interface PromptLibraryInspectorPanelProps {
  tab?: TabId;
  focusTemplateId?: string;
  focusPackage?: string;
  focusRoleId?: string;
  context?: Record<string, unknown>;
}

interface PackageStats {
  loading: boolean;
  error: string | null;
  blockCount: number;
  roleCount: number;
  categoryCount: number;
  roles: BlockRoleSummary[];
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
}

function formatDate(value?: string | null): string {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

function roleBadgeClasses(color?: string): string {
  switch (color) {
    case 'blue':
      return 'border-blue-200 text-blue-700 dark:border-blue-800/40 dark:text-blue-300';
    case 'purple':
      return 'border-purple-200 text-purple-700 dark:border-purple-800/40 dark:text-purple-300';
    case 'green':
      return 'border-green-200 text-green-700 dark:border-green-800/40 dark:text-green-300';
    case 'orange':
      return 'border-orange-200 text-orange-700 dark:border-orange-800/40 dark:text-orange-300';
    case 'cyan':
      return 'border-cyan-200 text-cyan-700 dark:border-cyan-800/40 dark:text-cyan-300';
    case 'amber':
      return 'border-amber-200 text-amber-700 dark:border-amber-800/40 dark:text-amber-300';
    case 'red':
      return 'border-red-200 text-red-700 dark:border-red-900/40 dark:text-red-300';
    case 'pink':
      return 'border-pink-200 text-pink-700 dark:border-pink-800/40 dark:text-pink-300';
    case 'slate':
      return 'border-slate-200 text-slate-700 dark:border-slate-700/40 dark:text-slate-300';
    default:
      return 'border-neutral-200 text-neutral-600 dark:border-neutral-700 dark:text-neutral-300';
  }
}

export function PromptLibraryInspectorPanel(props: PromptLibraryInspectorPanelProps = {}) {
  const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);
  const { roles: compositionRoles, packages: compositionPackages } = useCompositionPackages();
  const contextTab = ((): TabId | undefined => {
    const raw = props.context?.tab;
    return raw === 'packages' || raw === 'templates' || raw === 'blocks' || raw === 'matrix' ? raw : undefined;
  })();
  const contextFocusTemplateId =
    typeof props.context?.focusTemplateId === 'string' ? props.context.focusTemplateId : undefined;
  const contextFocusPackage =
    typeof props.context?.focusPackage === 'string' ? props.context.focusPackage : undefined;
  const contextFocusRoleId =
    typeof props.context?.focusRoleId === 'string' ? props.context.focusRoleId : undefined;
  const focusRoleId = props.focusRoleId ?? contextFocusRoleId;
  const [tab, setTab] = useState<TabId>('packages');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [contentPacks, setContentPacks] = useState<string[]>([]);
  const [blockPackages, setBlockPackages] = useState<string[]>([]);
  const [templates, setTemplates] = useState<BlockTemplateSummary[]>([]);

  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [packageStats, setPackageStats] = useState<Record<string, PackageStats>>({});

  const [templateSearch, setTemplateSearch] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateDetail, setTemplateDetail] = useState<BlockTemplateDetail | null>(null);
  const [templateDetailLoading, setTemplateDetailLoading] = useState(false);
  const [templateDetailError, setTemplateDetailError] = useState<string | null>(null);
  const [templateDiagnostics, setTemplateDiagnostics] = useState<TemplateDiagnosticsResponse | null>(null);
  const [templateDiagnosticsLoading, setTemplateDiagnosticsLoading] = useState(false);
  const [templateDiagnosticsError, setTemplateDiagnosticsError] = useState<string | null>(null);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [packs, dbPkgs, rows] = await Promise.all([
        listContentPacks(),
        listBlockPackages(),
        listTemplates({ limit: 200 }),
      ]);
      setContentPacks(packs);
      setBlockPackages(dbPkgs);
      setTemplates(rows);
      setSelectedPackage((prev) => (prev && [...packs, ...dbPkgs].includes(prev) ? prev : (packs[0] ?? dbPkgs[0] ?? null)));
      setSelectedTemplateId((prev) => (prev && rows.some((t) => t.id === prev) ? prev : (rows[0]?.id ?? null)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load prompt library data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    const nextTab = props.tab ?? contextTab;
    if (!nextTab) return;
    setTab(nextTab);
  }, [contextTab, props.tab]);

  useEffect(() => {
    const targetTemplateId = props.focusTemplateId ?? contextFocusTemplateId;
    if (!targetTemplateId) return;
    setSelectedTemplateId(targetTemplateId);
    setTab('templates');
  }, [contextFocusTemplateId, props.focusTemplateId]);

  useEffect(() => {
    const targetPackage = props.focusPackage ?? contextFocusPackage;
    if (!targetPackage) return;
    setSelectedPackage(targetPackage);
    if ((props.tab ?? contextTab) !== 'templates') {
      setTab('packages');
    }
  }, [contextFocusPackage, contextTab, props.focusPackage, props.tab]);

  const packageRows = useMemo(() => {
    const discovered = new Set(contentPacks);
    const withBlocks = new Set(blockPackages);
    const templateCounts = new Map<string, number>();
    for (const t of templates) {
      if (!t.package_name) continue;
      templateCounts.set(t.package_name, (templateCounts.get(t.package_name) ?? 0) + 1);
    }
    return Array.from(new Set([...contentPacks, ...blockPackages, ...templateCounts.keys()]))
      .sort()
      .map((name) => ({
        name,
        discovered: discovered.has(name),
        hasBlocks: withBlocks.has(name),
        templateCount: templateCounts.get(name) ?? 0,
      }));
  }, [blockPackages, contentPacks, templates]);

  useEffect(() => {
    if (!selectedPackage) return;
    if (packageStats[selectedPackage]?.loading || packageStats[selectedPackage]?.roles) return;
    setPackageStats((prev) => ({
      ...prev,
      [selectedPackage]: {
        loading: true,
        error: null,
        blockCount: 0,
        roleCount: 0,
        categoryCount: 0,
        roles: [],
      },
    }));
    void listBlockRoles(selectedPackage)
      .then((rows) => {
        const blockCount = rows.reduce((sum, r) => sum + (r.count ?? 0), 0);
        const roleCount = new Set(rows.map((r) => r.role ?? 'uncategorized')).size;
        const categoryCount = new Set(rows.map((r) => `${r.role ?? ''}:${r.category ?? ''}`)).size;
        setPackageStats((prev) => ({
          ...prev,
          [selectedPackage]: { loading: false, error: null, blockCount, roleCount, categoryCount, roles: rows },
        }));
      })
      .catch((err) => {
        setPackageStats((prev) => ({
          ...prev,
          [selectedPackage]: {
            loading: false,
            error: err instanceof Error ? err.message : 'Failed to load package stats',
            blockCount: 0,
            roleCount: 0,
            categoryCount: 0,
            roles: [],
          },
        }));
      });
  }, [packageStats, selectedPackage]);

  const filteredTemplates = useMemo(() => {
    const q = templateSearch.trim().toLowerCase();
    return templates.filter((t) => {
      if (!q) return true;
      return t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q);
    });
  }, [templateSearch, templates]);

  useEffect(() => {
    if (!selectedTemplateId || !filteredTemplates.some((t) => t.id === selectedTemplateId)) {
      setSelectedTemplateId(filteredTemplates[0]?.id ?? null);
    }
  }, [filteredTemplates, selectedTemplateId]);

  useEffect(() => {
    if (!selectedTemplateId) {
      setTemplateDetail(null);
      setTemplateDiagnostics(null);
      return;
    }
    setTemplateDetailLoading(true);
    setTemplateDetailError(null);
    void getTemplate(selectedTemplateId)
      .then(setTemplateDetail)
      .catch((err) => {
        setTemplateDetailError(err instanceof Error ? err.message : 'Failed to load template');
        setTemplateDetail(null);
      })
      .finally(() => setTemplateDetailLoading(false));
  }, [selectedTemplateId]);

  useEffect(() => {
    if (!selectedTemplateId) {
      setTemplateDiagnostics(null);
      return;
    }
    setTemplateDiagnosticsLoading(true);
    setTemplateDiagnosticsError(null);
    void getTemplateDiagnostics(selectedTemplateId)
      .then(setTemplateDiagnostics)
      .catch((err) => {
        setTemplateDiagnosticsError(err instanceof Error ? err.message : 'Failed to load diagnostics');
        setTemplateDiagnostics(null);
      })
      .finally(() => setTemplateDiagnosticsLoading(false));
  }, [selectedTemplateId]);

  const selectedPackageRow = packageRows.find((p) => p.name === selectedPackage) ?? null;
  const selectedPackageTemplates = templates.filter((t) => t.package_name === selectedPackage);
  const currentPackageStats = selectedPackage ? packageStats[selectedPackage] : undefined;

  const templateMeta = (templateDetail?.template_metadata ?? {}) as Record<string, unknown>;
  const source = (templateMeta.source ?? {}) as Record<string, unknown>;
  const dependencies = (templateMeta.dependencies ?? {}) as Record<string, unknown>;
  const requiredPackages = readStringArray(dependencies.required_block_packages);
  const preferredPackages = readStringArray(dependencies.preferred_block_packages);
  const slotPackages = Array.from(
    new Set((templateDetail?.slots ?? []).map((s) => s.package_name).filter((v): v is string => Boolean(v))),
  ).sort();
  const slotDiagnosticsByIndex = useMemo(() => {
    const map = new Map<number, NonNullable<TemplateDiagnosticsResponse['slots']>[number]>();
    for (const slot of templateDiagnostics?.slots ?? []) {
      map.set(slot.slot_index, slot);
    }
    return map;
  }, [templateDiagnostics]);
  const compositionRoleMap = useMemo(
    () => new Map(compositionRoles.map((r) => [r.id, r])),
    [compositionRoles],
  );
  const compositionRolePackageMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const pkg of compositionPackages) {
      for (const role of pkg.roles ?? []) {
        map.set(role.id, pkg.id);
      }
    }
    return map;
  }, [compositionPackages]);
  const openCompositionRole = useCallback((roleId: string) => {
    openFloatingPanel('composition-roles', {
      width: 920,
      height: 680,
      context: { focusRoleId: roleId },
    });
  }, [openFloatingPanel]);

  if (loading) {
    return <div className="h-full flex items-center justify-center text-sm text-neutral-500">Loading prompt library...</div>;
  }
  if (error) {
    return <div className="h-full flex items-center justify-center text-sm text-red-500">{error}</div>;
  }

  return (
    <div className="h-full min-h-0 flex flex-col bg-neutral-50 dark:bg-neutral-900">
      <div className="px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
        <div className="flex items-center gap-1">
          {([
            ['packages', 'Packages', 'library'],
            ['templates', 'Templates', 'layers'],
            ['blocks', 'Blocks', 'grid'],
            ['matrix', 'Matrix', 'grid'],
          ] as Array<[TabId, string, string]>).map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={clsx(
                'text-xs px-2 py-1 rounded border inline-flex items-center gap-1.5',
                tab === id
                  ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800/60 dark:bg-blue-900/20 dark:text-blue-300'
                  : 'border-neutral-200 text-neutral-600 dark:border-neutral-700 dark:text-neutral-300',
              )}
            >
              <Icon name={icon} size={12} />
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void refreshAll()}
          className="text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 inline-flex items-center gap-1"
        >
          <Icon name="refresh" size={12} />
          Refresh
        </button>
      </div>

      {tab === 'blocks' && (
        <div className="flex-1 min-h-0">
          <BlockExplorerPanel />
        </div>
      )}

      {tab === 'packages' && (
        <div className="flex-1 min-h-0 flex">
          <div className="w-72 shrink-0 border-r border-neutral-200 dark:border-neutral-800 overflow-y-auto p-2 space-y-1">
            {packageRows.map((row) => (
              <button
                key={row.name}
                type="button"
                onClick={() => setSelectedPackage(row.name)}
                className={clsx(
                  'w-full text-left rounded border p-2',
                  row.name === selectedPackage
                    ? 'border-blue-300 bg-blue-50 dark:border-blue-800/60 dark:bg-blue-900/20'
                    : 'border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800',
                )}
              >
                <div className="text-xs font-medium text-neutral-800 dark:text-neutral-100 truncate">{row.name}</div>
                <div className="mt-1 flex items-center gap-1 flex-wrap">
                  {row.discovered && <span className="text-[10px] px-1 py-0.5 rounded border border-emerald-200 text-emerald-700 dark:border-emerald-800/40 dark:text-emerald-300">pack</span>}
                  {row.hasBlocks && <span className="text-[10px] px-1 py-0.5 rounded border border-blue-200 text-blue-700 dark:border-blue-800/40 dark:text-blue-300">blocks</span>}
                  {row.templateCount > 0 && <span className="text-[10px] px-1 py-0.5 rounded border border-purple-200 text-purple-700 dark:border-purple-800/40 dark:text-purple-300">{row.templateCount} templates</span>}
                </div>
              </button>
            ))}
          </div>
          <div className="flex-1 min-w-0 overflow-y-auto p-3">
            {!selectedPackageRow && <div className="text-sm text-neutral-500">Select a package</div>}
            {selectedPackageRow && (
              <div className="space-y-3">
                <div className="rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 p-3">
                  <div className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">{selectedPackageRow.name}</div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">Discovered pack, DB block package, and template assignment overview.</div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 p-3">
                    <div className="text-[10px] text-neutral-500 uppercase">Templates</div>
                    <div className="text-lg font-semibold text-neutral-800 dark:text-neutral-100">{selectedPackageRow.templateCount}</div>
                  </div>
                  <div className="rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 p-3">
                    <div className="text-[10px] text-neutral-500 uppercase">Blocks</div>
                    <div className="text-lg font-semibold text-neutral-800 dark:text-neutral-100">{currentPackageStats?.loading ? '...' : currentPackageStats?.blockCount ?? '-'}</div>
                  </div>
                  <div className="rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 p-3">
                    <div className="text-[10px] text-neutral-500 uppercase">Roles / Cats</div>
                    <div className="text-lg font-semibold text-neutral-800 dark:text-neutral-100">
                      {currentPackageStats?.loading ? '...' : `${currentPackageStats?.roleCount ?? 0} / ${currentPackageStats?.categoryCount ?? 0}`}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 p-3">
                    <div className="text-xs font-medium text-neutral-700 dark:text-neutral-200 mb-2">Templates in package</div>
                    <div className="space-y-1 max-h-80 overflow-y-auto">
                      {selectedPackageTemplates.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setSelectedTemplateId(t.id);
                            setTab('templates');
                          }}
                          className="w-full text-left px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                        >
                          <div className="text-xs font-medium text-neutral-800 dark:text-neutral-100 truncate">{t.name}</div>
                          <div className="text-[10px] text-neutral-500 dark:text-neutral-400">{t.slug} | {t.slot_count} slots</div>
                        </button>
                      ))}
                      {selectedPackageTemplates.length === 0 && <div className="text-xs text-neutral-500">No templates in this package.</div>}
                    </div>
                  </div>
                  <div className="rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 p-3">
                    <div className="text-xs font-medium text-neutral-700 dark:text-neutral-200 mb-2">Block role/category counts</div>
                    {currentPackageStats?.error && <div className="text-xs text-red-500">{currentPackageStats.error}</div>}
                    {!currentPackageStats?.error && (
                      <div className="space-y-1 max-h-80 overflow-y-auto">
                        {(currentPackageStats?.roles ?? []).map((r, i) => (
                          <div key={`${r.role ?? 'none'}:${r.category ?? 'none'}:${i}`} className="flex items-center justify-between text-xs border-b border-neutral-100 dark:border-neutral-800 py-1">
                            <div className="min-w-0 flex items-center gap-1.5">
                              {r.role ? (() => {
                                const roleDef = compositionRoleMap.get(r.role);
                                return (
                                  <button
                                    type="button"
                                    onClick={() => openCompositionRole(r.role!)}
                                    className={clsx(
                                      'text-[10px] px-1 py-0.5 rounded border shrink-0',
                                      roleBadgeClasses(roleDef?.color),
                                    )}
                                    title={roleDef ? `Open Composition Roles (${roleDef.label})` : 'Open Composition Roles'}
                                  >
                                    {roleDef?.label ?? r.role}
                                  </button>
                                );
                              })() : (
                                <span className="text-[10px] px-1 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400">uncategorized</span>
                              )}
                              <span className="truncate text-neutral-700 dark:text-neutral-200">
                                / {r.category ?? 'default'}
                              </span>
                            </div>
                            <span className="tabular-nums text-neutral-500">{r.count}</span>
                          </div>
                        ))}
                        {!currentPackageStats?.loading && (currentPackageStats?.roles.length ?? 0) === 0 && (
                          <div className="text-xs text-neutral-500">No block rows for this package.</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'templates' && (
        <div className="flex-1 min-h-0 flex">
          <div className="w-80 shrink-0 border-r border-neutral-200 dark:border-neutral-800 flex flex-col">
            <div className="p-3 border-b border-neutral-200 dark:border-neutral-800 space-y-2">
              <div className="text-xs font-medium text-neutral-700 dark:text-neutral-200">Templates ({filteredTemplates.length})</div>
              <div className="flex items-center gap-1 px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800">
                <Icon name="search" size={12} className="text-neutral-400" />
                <input
                  value={templateSearch}
                  onChange={(e) => setTemplateSearch(e.target.value)}
                  placeholder="Search..."
                  className="flex-1 bg-transparent outline-none text-xs text-neutral-700 dark:text-neutral-200"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filteredTemplates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedTemplateId(t.id)}
                  className={clsx(
                    'w-full text-left rounded border p-2',
                    t.id === selectedTemplateId
                      ? 'border-blue-300 bg-blue-50 dark:border-blue-800/60 dark:bg-blue-900/20'
                      : 'border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800',
                  )}
                >
                  <div className="text-xs font-medium text-neutral-800 dark:text-neutral-100 truncate">{t.name}</div>
                  <div className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">{t.slug}</div>
                  <div className="mt-1 flex items-center gap-1.5 text-[10px] text-neutral-500 dark:text-neutral-400">
                    <span>{t.package_name ?? 'unscoped'} | {t.slot_count} slots</span>
                    {(t.composition_role_gap_count ?? 0) > 0 && (
                      <span
                        className="px-1 py-0.5 rounded border border-amber-200 text-amber-700 dark:border-amber-800/40 dark:text-amber-300"
                        title={`${t.composition_role_gap_count} slot(s) with unknown/ambiguous composition role`}
                      >
                        {t.composition_role_gap_count} unmapped
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 min-w-0 overflow-y-auto p-3">
            {templateDetailLoading && <div className="text-sm text-neutral-500">Loading template...</div>}
            {!templateDetailLoading && templateDetailError && <div className="text-sm text-red-500">{templateDetailError}</div>}
            {!templateDetailLoading && !templateDetailError && templateDetail && (
              <div className="space-y-3">
                <div className="rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-neutral-800 dark:text-neutral-100 truncate">{templateDetail.name}</div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400 font-mono mt-1">{templateDetail.slug}</div>
                      {templateDetail.description && <div className="text-xs text-neutral-600 dark:text-neutral-300 mt-2">{templateDetail.description}</div>}
                    </div>
                    <div className="text-[11px] text-neutral-500 dark:text-neutral-400 shrink-0">
                      <div>Created: {formatDate(templateDetail.created_at)}</div>
                      <div>Updated: {formatDate(templateDetail.updated_at)}</div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 p-3">
                    <div className="text-xs font-medium text-neutral-700 dark:text-neutral-200 mb-2">Package references</div>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between gap-2"><span className="text-neutral-500">template.package_name</span><span>{templateDetail.package_name ?? '-'}</span></div>
                      <div className="flex justify-between gap-2"><span className="text-neutral-500">source.kind</span><span>{String(source.kind ?? '-')}</span></div>
                      <div className="flex justify-between gap-2"><span className="text-neutral-500">source.pack</span><span>{String(source.pack ?? '-')}</span></div>
                      <div>
                        <div className="text-neutral-500 mb-1">required deps</div>
                        <div className="flex flex-wrap gap-1">
                          {requiredPackages.length ? requiredPackages.map((pkg) => <span key={pkg} className="text-[10px] px-1 py-0.5 rounded border border-blue-200 text-blue-700 dark:border-blue-800/40 dark:text-blue-300">{pkg}</span>) : <span className="text-neutral-400">-</span>}
                        </div>
                      </div>
                      <div>
                        <div className="text-neutral-500 mb-1">preferred deps</div>
                        <div className="flex flex-wrap gap-1">
                          {preferredPackages.length ? preferredPackages.map((pkg) => <span key={pkg} className="text-[10px] px-1 py-0.5 rounded border border-purple-200 text-purple-700 dark:border-purple-800/40 dark:text-purple-300">{pkg}</span>) : <span className="text-neutral-400">-</span>}
                        </div>
                      </div>
                      <div>
                        <div className="text-neutral-500 mb-1">slot override packages</div>
                        <div className="flex flex-wrap gap-1">
                          {slotPackages.length ? slotPackages.map((pkg) => (
                            <button
                              key={pkg}
                              type="button"
                              onClick={() => {
                                setSelectedPackage(pkg);
                                setTab('packages');
                              }}
                              className="text-[10px] px-1 py-0.5 rounded border border-emerald-200 text-emerald-700 dark:border-emerald-800/40 dark:text-emerald-300"
                            >
                              {pkg}
                            </button>
                          )) : <span className="text-neutral-400">none</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 p-3">
                    <div className="text-xs font-medium text-neutral-700 dark:text-neutral-200 mb-2">Slots</div>
                    {templateDiagnosticsError && (
                      <div className="text-xs text-red-600 dark:text-red-400 mb-2">{templateDiagnosticsError}</div>
                    )}
                    {templateDiagnosticsLoading && (
                      <div className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">Loading diagnostics...</div>
                    )}
                    <div className="space-y-1 max-h-80 overflow-y-auto">
                      {templateDetail.slots.map((slot, i) => (
                        <div
                          key={`${slot.label}-${i}`}
                          className={clsx(
                            'rounded border px-2 py-1.5 space-y-1',
                            focusRoleId && slot.role === focusRoleId
                              ? 'border-cyan-300 bg-cyan-50/50 dark:border-cyan-800/50 dark:bg-cyan-900/10'
                              : 'border-neutral-200 dark:border-neutral-800',
                          )}
                        >
                          {(() => {
                            const roleId = slot.role ?? null;
                            const diag = slotDiagnosticsByIndex.get(slot.slot_index ?? i);
                            const hintId = diag?.composition_role_hint;
                            // Try direct composition role lookup first, then fall back to inferred hint
                            const roleDef = (roleId ? compositionRoleMap.get(roleId) : undefined)
                              ?? (hintId ? compositionRoleMap.get(hintId) : undefined);
                            const effectiveRoleId = roleDef ? (compositionRoleMap.has(roleId ?? '') ? roleId! : hintId!) : null;
                            const rolePkg = effectiveRoleId ? compositionRolePackageMap.get(effectiveRoleId) : undefined;
                            const hintColor = hintId ? (ROLE_COLORS as Record<string, string>)[hintId] : undefined;
                            return (
                              <div className="flex items-center gap-1 flex-wrap">
                                {effectiveRoleId && roleDef ? (
                                  <button
                                    type="button"
                                    onClick={() => openCompositionRole(effectiveRoleId)}
                                    className={clsx(
                                      'text-[10px] px-1 py-0.5 rounded border',
                                      roleBadgeClasses(roleDef.color),
                                    )}
                                    title={`Open Composition Roles (${roleDef.label})`}
                                  >
                                    {roleDef.label}
                                  </button>
                                ) : hintId ? (
                                  <button
                                    type="button"
                                    onClick={() => openCompositionRole(hintId)}
                                    className={clsx(
                                      'text-[10px] px-1 py-0.5 rounded border',
                                      roleBadgeClasses(hintColor),
                                    )}
                                    title={diag?.composition_role_reason ?? `Inferred: ${hintId}`}
                                  >
                                    {hintId}
                                  </button>
                                ) : roleId ? (
                                  <span className="text-[10px] px-1 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400">
                                    {roleId}
                                  </span>
                                ) : (
                                  <span className="text-[10px] px-1 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400">
                                    no role
                                  </span>
                                )}
                                {roleId && !roleDef && !hintId && (
                                  <span className="text-[10px] px-1 py-0.5 rounded border border-red-200 text-red-700 dark:border-red-900/40 dark:text-red-300">
                                    unknown role
                                  </span>
                                )}
                                {rolePkg && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedPackage(rolePkg);
                                      setTab('packages');
                                    }}
                                    className="text-[10px] px-1 py-0.5 rounded border border-cyan-200 text-cyan-700 dark:border-cyan-800/40 dark:text-cyan-300"
                                    title="Inspect role's composition package"
                                  >
                                    role pkg:{rolePkg}
                                  </button>
                                )}
                              </div>
                            );
                          })()}
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-xs font-medium truncate">{i + 1}. {slot.label || '(unnamed)'}</div>
                              <div className="text-[10px] text-neutral-500 truncate">
                                {slot.kind ? `kind:${slot.kind}` : `${slot.role ?? '-'} / ${slot.category ?? '-'}`}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-[10px] px-1 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-500">
                                {slot.selection_strategy}
                              </span>
                              {slot.package_name && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedPackage(slot.package_name!);
                                    setTab('packages');
                                  }}
                                  className="text-[10px] px-1 py-0.5 rounded border border-emerald-200 text-emerald-700 dark:border-emerald-800/40 dark:text-emerald-300"
                                >
                                  {slot.package_name}
                                </button>
                              )}
                            </div>
                          </div>
                          {(() => {
                            const diag = slotDiagnosticsByIndex.get(slot.slot_index ?? i);
                            if (!diag) return null;

                            const crHint = diag.composition_role_hint;
                            const crConf = diag.composition_role_confidence;
                            const crReason = diag.composition_role_reason;
                            const crColor = crHint ? (ROLE_COLORS as Record<string, string>)[crHint] : undefined;
                            const isWeak = crConf === 'ambiguous' || crConf === 'unknown';
                            const compositionRoleBadge = crHint ? (
                              <button
                                type="button"
                                onClick={() => openCompositionRole(crHint)}
                                className={clsx(
                                  'text-[10px] px-1 py-0.5 rounded border',
                                  roleBadgeClasses(crColor),
                                )}
                                title={crReason ?? crHint}
                              >
                                {crHint}
                                {crConf === 'exact' ? '' : crConf === 'heuristic' ? ' ~' : ' ?'}
                              </button>
                            ) : isWeak ? (
                              <span
                                className="text-[10px] px-1 py-0.5 rounded border border-amber-200 text-amber-700 dark:border-amber-800/40 dark:text-amber-300"
                                title={crReason ?? 'Could not infer composition role'}
                              >
                                {crConf === 'ambiguous' ? 'ambiguous role' : 'no role hint'}
                              </span>
                            ) : null;

                            if (diag.status_hint !== 'queryable') {
                              return (
                                <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-neutral-500 dark:text-neutral-400">
                                  <span>{diag.status_hint === 'reinforcement' ? 'Reinforcement slot (no block query)' : 'Audio cue slot (no block query)'}</span>
                                  {compositionRoleBadge}
                                </div>
                              );
                            }
                            const topPackages = diag.package_match_counts.slice(0, 3);
                            return (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                                  <span className={clsx(
                                    'px-1 py-0.5 rounded border',
                                    diag.total_matches > 0
                                      ? 'border-blue-200 text-blue-700 dark:border-blue-800/40 dark:text-blue-300'
                                      : 'border-red-200 text-red-700 dark:border-red-900/40 dark:text-red-300',
                                  )}>
                                    {diag.total_matches} matches
                                  </span>
                                  {diag.template_package_name && (
                                    <span className="px-1 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400">
                                      in template pkg: {diag.template_package_match_count}
                                    </span>
                                  )}
                                  {diag.would_need_fallback_if_template_package_restricted && (
                                    <span className="px-1 py-0.5 rounded border border-amber-200 text-amber-700 dark:border-amber-800/40 dark:text-amber-300">
                                      needs package fallback
                                    </span>
                                  )}
                                  {compositionRoleBadge}
                                </div>
                                {topPackages.length > 0 && (
                                  <div className="flex items-center gap-1 flex-wrap">
                                    {topPackages.map((pkg) => (
                                      <button
                                        key={`${diag.slot_index}:${pkg.package_name ?? '__none__'}`}
                                        type="button"
                                        onClick={() => {
                                          if (pkg.package_name) {
                                            setSelectedPackage(pkg.package_name);
                                            setTab('packages');
                                          }
                                        }}
                                        disabled={!pkg.package_name}
                                        className={clsx(
                                          'text-[10px] px-1 py-0.5 rounded border',
                                          pkg.package_name
                                            ? 'border-emerald-200 text-emerald-700 dark:border-emerald-800/40 dark:text-emerald-300'
                                            : 'border-neutral-200 text-neutral-500 dark:border-neutral-700 dark:text-neutral-400',
                                        )}
                                        title={pkg.package_name ? 'Inspect package' : 'Unpackaged blocks'}
                                      >
                                        {(pkg.package_name ?? '(none)')}: {pkg.count}
                                      </button>
                                    ))}
                                    {diag.package_match_counts.length > 3 && (
                                      <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                                        +{diag.package_match_counts.length - 3} more
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {focusRoleId && (
                  <div className="rounded border border-cyan-200 text-cyan-700 bg-cyan-50 dark:border-cyan-800/40 dark:text-cyan-300 dark:bg-cyan-900/10 px-2 py-1 text-xs">
                    Role focus: <span className="font-mono">{focusRoleId}</span> (slot rows using this role are highlighted)
                  </div>
                )}
              </div>
            )}
            {!templateDetailLoading && !templateDetailError && !templateDetail && (
              <div className="text-sm text-neutral-500">Select a template to inspect</div>
            )}
          </div>
        </div>
      )}

      {tab === 'matrix' && (
        <div className="flex-1 min-h-0">
          <BlockMatrixView
            embedded
            initialQuery={selectedPackage ? { package_name: selectedPackage } : undefined}
            lockedFields={selectedPackage ? { package_name: true } : undefined}
            presets={MATRIX_PRESETS}
          />
        </div>
      )}
    </div>
  );
}

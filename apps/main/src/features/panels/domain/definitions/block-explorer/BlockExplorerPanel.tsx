/**
 * BlockExplorerPanel - Browse prompt blocks from content packs
 *
 * Left sidebar: role/category tree with counts.
 * Right detail: selected block text, tags, metadata.
 * Fetches from GET /block-templates/blocks (DB-backed).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  searchBlocks,
  listBlockRoles,
  listBlockPackages,
  listBlockTagFacets,
  type PromptBlockResponse,
  type BlockRoleSummary,
} from '@lib/api/blockTemplates';
import { Icon } from '@lib/icons';

import { BlockFilters, type TagFilter } from './BlockFilters';
import { useVocabResolver, type ResolvedTag } from './useVocabResolver';

// ============================================================================
// Color mapping by role name
// ============================================================================

const ROLE_COLORS: Record<string, string> = {
  subject: 'blue',
  environment: 'green',
  lighting: 'amber',
  camera: 'slate',
  style: 'pink',
  placement: 'purple',
  composition: 'cyan',
};

const COLOR_DOT: Record<string, string> = {
  blue: 'bg-blue-400',
  green: 'bg-green-400',
  amber: 'bg-amber-400',
  slate: 'bg-slate-400',
  pink: 'bg-pink-400',
  purple: 'bg-purple-400',
  cyan: 'bg-cyan-400',
  gray: 'bg-gray-400',
};

const COLOR_BADGE: Record<string, string> = {
  blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  green: 'bg-green-500/20 text-green-400 border-green-500/30',
  amber: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  slate: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  pink: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  purple: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  cyan: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  gray: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

function roleColor(role: string | null): string {
  return ROLE_COLORS[role ?? ''] ?? 'gray';
}

// ============================================================================
// Types
// ============================================================================

interface RoleNode {
  role: string;
  categories: { category: string; count: number }[];
  totalCount: number;
}

function buildRoleTree(summaries: BlockRoleSummary[]): RoleNode[] {
  const map = new Map<string, { category: string; count: number }[]>();
  for (const s of summaries) {
    const role = s.role ?? 'uncategorized';
    if (!map.has(role)) map.set(role, []);
    map.get(role)!.push({ category: s.category ?? 'default', count: s.count });
  }
  return Array.from(map.entries()).map(([role, categories]) => ({
    role,
    categories,
    totalCount: categories.reduce((sum, c) => sum + c.count, 0),
  }));
}

// ============================================================================
// Sidebar
// ============================================================================

function SidebarRoleNode({
  node,
  selectedRole,
  selectedCategory,
  onSelectRole,
  onSelectCategory,
}: {
  node: RoleNode;
  selectedRole: string | null;
  selectedCategory: string | null;
  onSelectRole: (role: string) => void;
  onSelectCategory: (role: string, category: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const color = roleColor(node.role);
  const dotClass = COLOR_DOT[color] ?? COLOR_DOT.gray;
  const isRoleSelected = selectedRole === node.role && !selectedCategory;

  return (
    <div className="mb-0.5">
      <button
        onClick={() => {
          setExpanded(!expanded);
          onSelectRole(node.role);
        }}
        className={`w-full flex items-center gap-1.5 px-2 py-1 rounded transition-colors ${
          isRoleSelected
            ? 'bg-neutral-700/80 text-neutral-100'
            : 'hover:bg-neutral-800/60 text-neutral-300'
        }`}
      >
        <Icon
          name={expanded ? 'chevronDown' : 'chevronRight'}
          size={10}
          className="text-neutral-500 shrink-0"
        />
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`} />
        <span className="text-[11px] font-semibold uppercase tracking-wider truncate">
          {node.role}
        </span>
        <span className="text-[10px] text-neutral-500 ml-auto">{node.totalCount}</span>
      </button>

      {expanded && (
        <div className="ml-3 mt-px">
          {node.categories.map((cat) => {
            const isCatSelected =
              selectedRole === node.role && selectedCategory === cat.category;
            return (
              <button
                key={cat.category}
                onClick={() => onSelectCategory(node.role, cat.category)}
                className={`w-full flex items-center gap-1.5 px-2 py-0.5 rounded text-left transition-colors ${
                  isCatSelected
                    ? 'bg-neutral-700/80 text-neutral-100'
                    : 'text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200'
                }`}
              >
                <span className={`w-1 h-1 rounded-full shrink-0 ${dotClass}`} />
                <span className="text-[11px] truncate flex-1">{cat.category}</span>
                <span className="text-[9px] text-neutral-600 tabular-nums">{cat.count}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Detail
// ============================================================================

function TagValue({
  raw,
  resolveTagValue,
}: {
  raw: string;
  resolveTagValue: (raw: string) => ResolvedTag;
}) {
  const resolved = resolveTagValue(raw);
  if (resolved.isVocab) {
    return (
      <span>
        <span className="text-blue-400">{resolved.label}</span>
        <span className="text-neutral-600 ml-1">({raw})</span>
      </span>
    );
  }
  return <span className="text-neutral-300">{raw}</span>;
}

function BlockDetail({
  block,
  resolveTagValue,
}: {
  block: PromptBlockResponse;
  resolveTagValue: (raw: string) => ResolvedTag;
}) {
  const color = roleColor(block.role);
  const badgeClass = COLOR_BADGE[color] ?? COLOR_BADGE.gray;

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${badgeClass}`}>
            {block.role}:{block.category}
          </span>
          {block.default_intent && (
            <span className="text-[10px] text-neutral-500 bg-neutral-800 px-1.5 py-0.5 rounded">
              {block.default_intent}
            </span>
          )}
          {block.complexity_level && (
            <span className="text-[10px] text-neutral-500 bg-neutral-800 px-1.5 py-0.5 rounded">
              {block.complexity_level}
            </span>
          )}
        </div>
        <code className="text-[11px] text-neutral-400 font-mono">{block.block_id}</code>
      </div>

      {/* Text */}
      <div>
        <h4 className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">
          Prompt Text
        </h4>
        <p className="text-xs text-neutral-300 leading-relaxed whitespace-pre-wrap bg-neutral-800/50 rounded-md p-3 border border-neutral-700/50">
          {block.text}
        </p>
        <p className="text-[10px] text-neutral-600 mt-1">{block.word_count} words</p>
      </div>

      {/* Tags */}
      {Object.keys(block.tags).length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">
            Tags
          </h4>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
            {Object.entries(block.tags).map(([key, value]) => (
              <div key={key} className="contents">
                <span className="text-neutral-500">{key}</span>
                <TagValue raw={String(value)} resolveTagValue={resolveTagValue} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metadata */}
      <div>
        <h4 className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">
          Properties
        </h4>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
          <span className="text-neutral-500">Kind</span>
          <span className="text-neutral-300">{block.kind}</span>
          {block.package_name && (
            <>
              <span className="text-neutral-500">Package</span>
              <span className="text-neutral-300">{block.package_name}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Block list (middle section when no block selected)
// ============================================================================

function BlockList({
  blocks,
  selectedId,
  onSelect,
}: {
  blocks: PromptBlockResponse[];
  selectedId: string | null;
  onSelect: (block: PromptBlockResponse) => void;
}) {
  return (
    <div className="divide-y divide-neutral-800/50">
      {blocks.map((block) => {
        const color = roleColor(block.role);
        const dotClass = COLOR_DOT[color] ?? COLOR_DOT.gray;
        const isSelected = block.block_id === selectedId;

        return (
          <button
            key={block.block_id}
            onClick={() => onSelect(block)}
            className={`w-full text-left px-3 py-2 transition-colors ${
              isSelected
                ? 'bg-neutral-700/60'
                : 'hover:bg-neutral-800/50'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`} />
              <span className="text-[11px] text-neutral-200 truncate font-medium">
                {block.block_id}
              </span>
            </div>
            <p className="text-[10px] text-neutral-500 mt-0.5 line-clamp-1 ml-3">
              {block.text}
            </p>
          </button>
        );
      })}
      {blocks.length === 0 && (
        <p className="text-xs text-neutral-500 text-center py-8">No blocks found</p>
      )}
    </div>
  );
}

// ============================================================================
// Main panel
// ============================================================================

export function BlockExplorerPanel() {
  const [roleTree, setRoleTree] = useState<RoleNode[]>([]);
  const [blocks, setBlocks] = useState<PromptBlockResponse[]>([]);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<PromptBlockResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [packages, setPackages] = useState<string[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [tagFacets, setTagFacets] = useState<Record<string, string[]>>({});
  const [activeTagFilters, setActiveTagFilters] = useState<TagFilter[]>([]);

  const { resolveTagValue } = useVocabResolver();

  // Load role tree and packages on mount
  useEffect(() => {
    Promise.all([listBlockRoles(), listBlockPackages()])
      .then(([summaries, pkgs]) => {
        setRoleTree(buildRoleTree(summaries));
        setPackages(pkgs);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load');
        setIsLoading(false);
      });
  }, []);

  // Fetch tag facets when role/category changes
  useEffect(() => {
    if (!selectedRole) {
      setTagFacets({});
      return;
    }
    listBlockTagFacets({
      role: selectedRole,
      category: selectedCategory ?? undefined,
      package_name: selectedPackage ?? undefined,
    })
      .then(setTagFacets)
      .catch(() => setTagFacets({}));
  }, [selectedRole, selectedCategory, selectedPackage]);

  // Fetch blocks when any filter changes
  useEffect(() => {
    if (!selectedRole) {
      setBlocks([]);
      return;
    }
    const tagsParam =
      activeTagFilters.length > 0
        ? activeTagFilters.map((f) => `${f.key}:${f.value}`).join(',')
        : undefined;
    searchBlocks({
      role: selectedRole,
      category: selectedCategory ?? undefined,
      package_name: selectedPackage ?? undefined,
      q: searchQuery || undefined,
      tags: tagsParam,
      limit: 200,
    })
      .then(setBlocks)
      .catch(() => setBlocks([]));
  }, [selectedRole, selectedCategory, selectedPackage, searchQuery, activeTagFilters]);

  const handleSelectRole = useCallback((role: string) => {
    setSelectedRole(role);
    setSelectedCategory(null);
    setSelectedBlock(null);
    setSearchQuery('');
    setActiveTagFilters([]);
  }, []);

  const handleSelectCategory = useCallback((role: string, category: string) => {
    setSelectedRole(role);
    setSelectedCategory(category);
    setSelectedBlock(null);
    setSearchQuery('');
    setActiveTagFilters([]);
  }, []);

  const handleTagFilterAdd = useCallback((filter: TagFilter) => {
    setActiveTagFilters((prev) => {
      if (prev.some((f) => f.key === filter.key && f.value === filter.value)) return prev;
      return [...prev, filter];
    });
  }, []);

  const handleTagFilterRemove = useCallback((filter: TagFilter) => {
    setActiveTagFilters((prev) =>
      prev.filter((f) => !(f.key === filter.key && f.value === filter.value)),
    );
  }, []);

  const handleClearFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedPackage(null);
    setActiveTagFilters([]);
  }, []);

  const totalBlocks = useMemo(
    () => roleTree.reduce((sum, n) => sum + n.totalCount, 0),
    [roleTree],
  );

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-neutral-900">
        <p className="text-sm text-neutral-400">Loading blocks...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-neutral-900">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="h-full flex bg-neutral-900">
      {/* Left sidebar: role/category tree */}
      <div className="w-40 shrink-0 flex flex-col border-r border-neutral-800">
        <div className="px-2 py-2 border-b border-neutral-800">
          <h2 className="text-[11px] font-semibold text-neutral-300 uppercase tracking-wider">
            Blocks
          </h2>
          <p className="text-[10px] text-neutral-500">{totalBlocks} total</p>
        </div>
        <div className="flex-1 overflow-y-auto py-1 px-1">
          {roleTree.map((node) => (
            <SidebarRoleNode
              key={node.role}
              node={node}
              selectedRole={selectedRole}
              selectedCategory={selectedCategory}
              onSelectRole={handleSelectRole}
              onSelectCategory={handleSelectCategory}
            />
          ))}
        </div>
      </div>

      {/* Right: block list + detail */}
      <div className="flex-1 flex min-w-0">
        {/* Block list with filters */}
        {selectedRole && (
          <div className="w-56 shrink-0 border-r border-neutral-800 flex flex-col">
            <div className="border-b border-neutral-800 shrink-0">
              <BlockFilters
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                packages={packages}
                selectedPackage={selectedPackage}
                onPackageChange={setSelectedPackage}
                tagFacets={tagFacets}
                activeTagFilters={activeTagFilters}
                onTagFilterAdd={handleTagFilterAdd}
                onTagFilterRemove={handleTagFilterRemove}
                onClearFilters={handleClearFilters}
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              <BlockList
                blocks={blocks}
                selectedId={selectedBlock?.block_id ?? null}
                onSelect={setSelectedBlock}
              />
            </div>
          </div>
        )}

        {/* Detail */}
        <div className="flex-1 overflow-y-auto">
          {selectedBlock ? (
            <BlockDetail block={selectedBlock} resolveTagValue={resolveTagValue} />
          ) : (
            <div className="h-full flex items-center justify-center px-6">
              <p className="text-xs text-neutral-500">
                {selectedRole
                  ? 'Select a block to view details'
                  : 'Select a role from the sidebar'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

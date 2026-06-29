/**
 * BlockExplorerPanel - Browse prompt blocks from content packs
 *
 * Left sidebar: category tree with counts + role badges.
 * Right detail: selected block text, tags (authoring vs system), metadata.
 * Fetches from GET /block-templates/blocks (DB-backed).
 *
 * Capabilities:
 *   - Provides `CAP_BLOCK_SELECTION` at root scope, so other panels
 *     (Block Authoring, future shadow-analysis / library inspectors)
 *     can react to the user's currently-focused block without
 *     prop drilling.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  searchBlocks,
  listBlockRoles,
  listBlockPackages,
  listContentPackManifests,
  listBlockTagFacets,
  getBlockSchema,
  type PromptBlockResponse,
  type BlockRoleSummary,
  type BlockSchemaResponse,
  type BlockOpSchema,
  type BlockOpParamSchema,
  type BlockOpRefSchema,
  type ContentPackMatrixManifest,
} from '@lib/api/blockTemplates';
import { getBlockIcon, getCategoryIcon, getRoleIcon } from '@lib/blockVisuals';
import { Icon, Icons, type IconName } from '@lib/icons';

import {
  CAP_BLOCK_SELECTION,
  useProvideCapability,
  type BlockSelection,
} from '@features/contextHub';
import {
  SidebarTreeGroup,
  SidebarTreeLeafButton,
} from '@features/panels/components/shared/SidebarTree';
import { useWorkspaceStore } from '@features/workspace';

import { BlockFilters, type TagFilter } from './BlockFilters';
import { useTagDictionary, type TagKeyClass } from './useTagDictionary';
import { useVocabResolver, type ResolvedTag } from './useVocabResolver';

// ============================================================================
// Deterministic color mapping
//
// Roles are now namespaced (`entities:subject`, `materials:rendering`, …) and
// many blocks carry no role at all, so the old hardcoded role→color table was
// effectively dead. Derive a stable color from the category string instead.
// ============================================================================

const PALETTE = ['blue', 'green', 'amber', 'slate', 'pink', 'purple', 'cyan'] as const;

const COLOR_TEXT: Record<string, string> = {
  blue: 'text-blue-400',
  green: 'text-green-400',
  amber: 'text-amber-400',
  slate: 'text-slate-400',
  pink: 'text-pink-400',
  purple: 'text-purple-400',
  cyan: 'text-cyan-400',
  gray: 'text-gray-400',
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

function categoryColor(category: string | null): string {
  if (!category) return 'gray';
  let h = 0;
  for (let i = 0; i < category.length; i++) {
    h = (h * 31 + category.charCodeAt(i)) >>> 0;
  }
  return PALETTE[h % PALETTE.length];
}

// ============================================================================
// Tag classification
//
// Op-runtime / provenance keys are noise for browsing — collapse them under a
// "System tags" section so the authoring-relevant tags stay readable.
// (Tier 2 will render the structured op schema properly.)
// ============================================================================

const SYSTEM_TAG_KEYS = new Set([
  'block_mode',
  'schema_group',
  'schema_block_id',
  'legacy_category',
  'content_pack',
  'source_pack',
  'modifier_family',
  'composition_role',
  'scope',
  'modality_support',
]);

function isSystemTag(key: string): boolean {
  return key.startsWith('op_') || SYSTEM_TAG_KEYS.has(key);
}

function formatTagValue(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map((v) => String(v)).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// ============================================================================
// Types
// ============================================================================

interface CategoryNode {
  category: string;
  /** Distinct namespaced composition roles seen for this category. */
  roles: string[];
  totalCount: number;
}

interface BlockNamespaceGroup {
  key: string;
  label: string;
  icon?: IconName;
  blocks: PromptBlockResponse[];
}

const ROOT_NAMESPACE_GROUP = '__root__';
const ROOT_MANIFEST_SOURCES = new Set(['manifest.yaml', 'manifest.yml']);
// Semantic subgroup hints (used first); custom packs can override via
// `manifest.yaml.icon`, which is used as the next fallback.
const SUBGROUP_ICON_HINTS: Partial<Record<string, IconName>> = {
  chest: 'heart',
  breast: 'heart',
  torso: 'user',
  touch: 'hand',
  connector: 'link',
  voice: 'radio',
  gaze: 'eye',
  mouth: 'messageSquare',
  lips: 'messageSquare',
  rhythm: 'activity',
  pose: 'user',
  canine: 'users',
};

function buildCategoryTree(summaries: BlockRoleSummary[]): CategoryNode[] {
  const map = new Map<string, { roles: Set<string>; count: number }>();
  for (const s of summaries) {
    const category = s.category ?? 'uncategorized';
    if (!map.has(category)) map.set(category, { roles: new Set(), count: 0 });
    const entry = map.get(category)!;
    if (s.composition_role) entry.roles.add(s.composition_role);
    entry.count += s.count;
  }
  return Array.from(map.entries())
    .map(([category, { roles, count }]) => ({
      category,
      roles: Array.from(roles).sort(),
      totalCount: count,
    }))
    .sort((a, b) => b.totalCount - a.totalCount);
}

function firstCategoryToken(category: string): string | null {
  const token = category.split(/[._-]/)[0]?.trim();
  return token ? token.toLowerCase() : null;
}

function deriveNamespaceGroupKey(blockId: string, category: string | null): string {
  const parts = blockId
    .split('.')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length < 2) return ROOT_NAMESPACE_GROUP;

  const categoryRoot = category ? firstCategoryToken(category) : null;
  if (categoryRoot && parts.length >= 3 && parts[1].toLowerCase() === categoryRoot) {
    return parts[2];
  }

  return parts[1];
}

function toIconName(raw: string | null | undefined): IconName | null {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return null;
  if (Object.prototype.hasOwnProperty.call(Icons, value)) return value as IconName;
  return null;
}

function isRootManifestSource(source: string): boolean {
  return ROOT_MANIFEST_SOURCES.has(source.trim().toLowerCase());
}

function buildPackIconMap(manifests: ContentPackMatrixManifest[]): Record<string, IconName> {
  const map = new Map<string, IconName>();

  // Prefer root-manifest icon when available.
  for (const manifest of manifests) {
    if (!isRootManifestSource(manifest.source)) continue;
    const icon = toIconName(manifest.icon);
    if (!icon) continue;
    map.set(manifest.pack_name, icon);
  }

  // Fall back to any other manifest source for packs without a root icon.
  for (const manifest of manifests) {
    if (map.has(manifest.pack_name)) continue;
    const icon = toIconName(manifest.icon);
    if (!icon) continue;
    map.set(manifest.pack_name, icon);
  }

  return Object.fromEntries(map);
}

function resolveGroupIcon(
  groupKey: string,
  grouped: PromptBlockResponse[],
  packIcons: Record<string, IconName>,
): IconName | undefined {
  const normalized = groupKey.toLowerCase();
  const hinted = SUBGROUP_ICON_HINTS[normalized];
  if (hinted) return hinted;

  const counts = new Map<IconName, number>();
  for (const block of grouped) {
    const pack = block.package_name;
    if (!pack) continue;
    const icon = packIcons[pack];
    if (!icon) continue;
    counts.set(icon, (counts.get(icon) ?? 0) + 1);
  }
  if (counts.size === 0) return undefined;

  let winner: IconName | undefined;
  let winnerCount = -1;
  for (const [icon, count] of counts) {
    if (count > winnerCount) {
      winner = icon;
      winnerCount = count;
    }
  }
  return winner;
}

function buildNamespaceGroups(
  blocks: PromptBlockResponse[],
  category: string | null,
  packIcons: Record<string, IconName>,
): BlockNamespaceGroup[] {
  const buckets = new Map<string, PromptBlockResponse[]>();
  for (const block of blocks) {
    const key = deriveNamespaceGroupKey(block.block_id, category);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(block);
  }

  return Array.from(buckets.entries())
    .map(([key, grouped]) => ({
      key,
      label: key === ROOT_NAMESPACE_GROUP ? 'other' : key,
      icon: resolveGroupIcon(key, grouped, packIcons),
      blocks: [...grouped].sort((a, b) => a.block_id.localeCompare(b.block_id)),
    }))
    .sort((a, b) => {
      if (a.key === ROOT_NAMESPACE_GROUP && b.key !== ROOT_NAMESPACE_GROUP) return 1;
      if (b.key === ROOT_NAMESPACE_GROUP && a.key !== ROOT_NAMESPACE_GROUP) return -1;
      return a.label.localeCompare(b.label);
    });
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

function TagKeyLabel({
  tagKey,
  cls,
}: {
  tagKey: string;
  cls: TagKeyClass;
}) {
  let marker: { text: string; className: string; title: string } | null = null;
  if (cls.kind === 'unknown') {
    marker = {
      text: 'unknown',
      className: 'text-neutral-600 border-neutral-700/60',
      title: 'Not in the canonical tag dictionary',
    };
  } else if (cls.kind === 'alias') {
    marker = {
      text: `→ ${cls.canonical}`,
      className: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
      title: `Deprecated alias — canonical key is "${cls.canonical}"`,
    };
  } else if (cls.kind === 'status') {
    const danger = /deprecat|retire|legacy/i.test(cls.status);
    marker = {
      text: cls.status,
      className: danger
        ? 'text-red-400 border-red-500/30 bg-red-500/10'
        : 'text-amber-400 border-amber-500/30 bg-amber-500/10',
      title: `Tag dictionary status: ${cls.status}`,
    };
  }

  return (
    <span className="text-neutral-500 flex items-center gap-1 min-w-0">
      <span className="truncate">{tagKey}</span>
      {marker && (
        <span
          title={marker.title}
          className={`text-[8px] px-1 rounded border shrink-0 ${marker.className}`}
        >
          {marker.text}
        </span>
      )}
    </span>
  );
}

/** Only scalar values can be turned into a `key:value` block filter. */
function isFilterableTagValue(value: unknown): value is string | number | boolean {
  return (
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
  );
}

function TagGrid({
  entries,
  resolveTagValue,
  classifyTagKey,
  activeTagFilters,
  onToggleFilter,
}: {
  entries: [string, unknown][];
  resolveTagValue: (raw: string) => ResolvedTag;
  classifyTagKey: (key: string) => TagKeyClass;
  /** When provided, scalar tags become clickable block filters. */
  activeTagFilters?: TagFilter[];
  onToggleFilter?: (filter: TagFilter, active: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 text-[11px]">
      {entries.map(([key, value]) => {
        const raw = formatTagValue(value);
        const filterable = !!onToggleFilter && isFilterableTagValue(value);
        const active =
          filterable && (activeTagFilters ?? []).some((f) => f.key === key && f.value === raw);

        const inner = (
          <>
            <TagKeyLabel tagKey={key} cls={classifyTagKey(key)} />
            <span className="text-neutral-600">:</span>
            <TagValue raw={raw} resolveTagValue={resolveTagValue} />
          </>
        );

        if (!filterable) {
          return (
            <span
              key={key}
              className="inline-flex items-center gap-1 max-w-full bg-neutral-800/50 border border-neutral-700/50 rounded px-1.5 py-0.5"
            >
              {inner}
            </span>
          );
        }

        return (
          <button
            key={key}
            type="button"
            title={active ? 'Remove filter' : 'Filter blocks by this tag'}
            onClick={() => onToggleFilter!({ key, value: raw }, active)}
            className={`inline-flex items-center gap-1 max-w-full rounded px-1.5 py-0.5 border transition-colors ${
              active
                ? 'bg-blue-500/20 border-blue-500/40'
                : 'bg-neutral-800/50 border-neutral-700/50 hover:border-neutral-500'
            }`}
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
}

function OpRefRow({ opRef }: { opRef: BlockOpRefSchema }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] py-0.5">
      <span className="font-mono text-neutral-300">{opRef.key}</span>
      <span className="text-neutral-600">→</span>
      <span className="font-mono text-cyan-400">{opRef.capability}</span>
      {opRef.many && (
        <span className="text-[9px] text-neutral-500 bg-neutral-800 px-1 rounded">many</span>
      )}
      <span
        className={`text-[9px] px-1 rounded ${
          opRef.required
            ? 'bg-amber-500/20 text-amber-400'
            : 'bg-neutral-800 text-neutral-500'
        }`}
      >
        {opRef.required ? 'required' : 'optional'}
      </span>
      {opRef.description && (
        <span className="text-[10px] text-neutral-500 truncate">{opRef.description}</span>
      )}
    </div>
  );
}

function OpParamRow({ param }: { param: BlockOpParamSchema }) {
  const range =
    param.minimum != null || param.maximum != null
      ? `[${param.minimum ?? '−∞'}, ${param.maximum ?? '∞'}]`
      : null;

  return (
    <div className="py-1 border-b border-neutral-800/40 last:border-0">
      <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
        <span className="font-mono text-neutral-200">{param.key}</span>
        <span className="text-[9px] text-purple-400 bg-purple-500/15 px-1 rounded">
          {param.type}
        </span>
        {param.required && (
          <span className="text-[9px] text-amber-400 bg-amber-500/20 px-1 rounded">
            required
          </span>
        )}
        {param.default !== undefined && param.default !== null && (
          <span className="text-[10px] text-neutral-500">
            default <span className="text-neutral-300">{formatTagValue(param.default)}</span>
          </span>
        )}
        {range && <span className="text-[10px] text-neutral-500">{range}</span>}
        {param.ref_capability && (
          <span className="text-[10px] text-cyan-400">ref:{param.ref_capability}</span>
        )}
        {param.tag_key && (
          <span className="text-[10px] text-neutral-600">tag:{param.tag_key}</span>
        )}
      </div>
      {param.enum && param.enum.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1 ml-1">
          {param.enum.map((v) => (
            <span
              key={v}
              className={`text-[9px] px-1 py-0.5 rounded border ${
                String(param.default) === v
                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                  : 'bg-neutral-800/50 text-neutral-400 border-neutral-700/50'
              }`}
            >
              {v}
            </span>
          ))}
        </div>
      )}
      {param.description && (
        <p className="text-[10px] text-neutral-500 mt-0.5 ml-1">{param.description}</p>
      )}
    </div>
  );
}

function OpSchemaSection({ op }: { op: BlockOpSchema }) {
  return (
    <div className="space-y-2 bg-neutral-800/30 rounded-md p-3 border border-purple-500/20">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider">
          Op
        </span>
        <code className="text-[11px] font-mono text-purple-300">{op.op_id}</code>
        {op.signature_id && (
          <span className="text-[10px] text-neutral-500 font-mono">
            sig:{op.signature_id}
          </span>
        )}
      </div>

      {op.modalities.length > 0 && (
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-neutral-500">modalities</span>
          {op.modalities.map((m) => (
            <span
              key={m}
              className="text-[9px] text-neutral-300 bg-neutral-800 px-1 rounded"
            >
              {m}
            </span>
          ))}
        </div>
      )}

      {op.refs.length > 0 && (
        <div>
          <h5 className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-0.5">
            Refs
          </h5>
          {op.refs.map((r) => (
            <OpRefRow key={r.key} opRef={r} />
          ))}
        </div>
      )}

      {op.params.length > 0 && (
        <div>
          <h5 className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-0.5">
            Params
          </h5>
          {op.params.map((p) => (
            <OpParamRow key={p.key} param={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function CopyButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      className="flex items-center gap-1 text-[10px] text-neutral-400 hover:text-neutral-200 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700/60 rounded px-1.5 py-0.5 transition-colors"
    >
      <Icon name={copied ? 'check' : 'copy'} size={10} />
      {copied ? 'Copied' : label}
    </button>
  );
}

function BlockDetail({
  block,
  schema,
  schemaLoading,
  resolveTagValue,
  classifyTagKey,
  onOpenMatrix,
  activeTagFilters,
  onTagFilterAdd,
  onTagFilterRemove,
}: {
  block: PromptBlockResponse;
  schema: BlockSchemaResponse | null;
  schemaLoading: boolean;
  resolveTagValue: (raw: string) => ResolvedTag;
  classifyTagKey: (key: string) => TagKeyClass;
  onOpenMatrix: (block: PromptBlockResponse) => void;
  activeTagFilters: TagFilter[];
  onTagFilterAdd: (filter: TagFilter) => void;
  onTagFilterRemove: (filter: TagFilter) => void;
}) {
  const [showSystemTags, setShowSystemTags] = useState(false);

  const color = categoryColor(block.category);
  const badgeClass = COLOR_BADGE[color] ?? COLOR_BADGE.gray;

  const tagEntries = Object.entries(block.tags);
  const authoringTags = tagEntries.filter(([k]) => !isSystemTag(k));
  const systemTags = tagEntries.filter(([k]) => isSystemTag(k));

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${badgeClass}`}>
            {block.category ?? 'uncategorized'}
          </span>
          {block.composition_role && (
            <span className="flex items-center gap-1 text-[10px] text-neutral-400 bg-neutral-800 px-1.5 py-0.5 rounded font-mono">
              <Icon name={getRoleIcon(block.composition_role)} size={11} />
              {block.composition_role}
            </span>
          )}
          {schema?.block_mode && (
            <span className="text-[10px] text-purple-400 bg-purple-500/15 border border-purple-500/30 px-1.5 py-0.5 rounded">
              {schema.block_mode}
            </span>
          )}
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
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          <CopyButton label="Copy ID" value={block.block_id} />
          <CopyButton label="Copy text" value={block.text} />
          <button
            type="button"
            onClick={() => onOpenMatrix(block)}
            className="flex items-center gap-1 text-[10px] text-neutral-400 hover:text-neutral-200 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700/60 rounded px-1.5 py-0.5 transition-colors"
          >
            <Icon name="barChart" size={10} />
            Open in Matrix
          </button>
        </div>
      </div>

      {/* Description */}
      {block.description && (
        <div>
          <h4 className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">
            Description
          </h4>
          <p className="text-xs text-neutral-400 leading-relaxed">{block.description}</p>
        </div>
      )}

      {/* Op runtime schema */}
      {schemaLoading && (
        <p className="text-[10px] text-neutral-600">Loading op schema…</p>
      )}
      {!schemaLoading && schema?.op && <OpSchemaSection op={schema.op} />}
      {!schemaLoading && schema && !schema.op && (
        <p className="text-[10px] text-neutral-600 italic">
          Surface-mode primitive — no op runtime.
        </p>
      )}

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

      {/* Tags — clickable to filter the block list by that tag. */}
      {authoringTags.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">
            Tags
            <span className="ml-1.5 normal-case tracking-normal font-normal text-neutral-600">
              click to filter
            </span>
          </h4>
          <TagGrid
            entries={authoringTags}
            resolveTagValue={resolveTagValue}
            classifyTagKey={classifyTagKey}
            activeTagFilters={activeTagFilters}
            onToggleFilter={(filter, active) =>
              active ? onTagFilterRemove(filter) : onTagFilterAdd(filter)
            }
          />
        </div>
      )}

      {/* System / op tags (collapsed) */}
      {systemTags.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowSystemTags((v) => !v)}
            className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider hover:text-neutral-300 transition-colors"
          >
            {showSystemTags ? '▾' : '▸'} System tags ({systemTags.length})
          </button>
          {showSystemTags && (
            <div className="mt-1.5">
              <TagGrid
                entries={systemTags}
                resolveTagValue={resolveTagValue}
                classifyTagKey={classifyTagKey}
              />
            </div>
          )}
        </div>
      )}

      {/* Capabilities */}
      {block.capabilities.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">
            Capabilities
          </h4>
          <div className="flex flex-wrap gap-1">
            {block.capabilities.map((cap) => (
              <span
                key={cap}
                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700/50"
              >
                {cap}
              </span>
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
// Main panel
// ============================================================================

export function BlockExplorerPanel() {
  const [categoryTree, setCategoryTree] = useState<CategoryNode[]>([]);
  const [blocks, setBlocks] = useState<PromptBlockResponse[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<PromptBlockResponse | null>(null);
  const [blockSchema, setBlockSchema] = useState<BlockSchemaResponse | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const schemaCacheRef = useRef<Map<string, BlockSchemaResponse>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [packages, setPackages] = useState<string[]>([]);
  const [packIcons, setPackIcons] = useState<Record<string, IconName>>({});
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [tagFacets, setTagFacets] = useState<Record<string, string[]>>({});
  const [activeTagFilters, setActiveTagFilters] = useState<TagFilter[]>([]);

  const { resolveTagValue } = useVocabResolver();
  const { classifyTagKey } = useTagDictionary();
  const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);

  const handleOpenMatrix = useCallback(
    (block: PromptBlockResponse) => {
      openFloatingPanel('block-matrix', {
        context: {
          category: block.category ?? undefined,
          composition_role: block.composition_role ?? undefined,
          package_name: block.package_name ?? undefined,
        },
      });
    },
    [openFloatingPanel],
  );

  // ── Provide CAP_BLOCK_SELECTION ──────────────────────────────────────
  // Surfaces the currently-selected block as a capability so that
  // sibling panels (Block Authoring, future shadow-analysis viewers)
  // can react without prop drilling. `isAvailable` gates on whether
  // anything is selected — consumers get a null value otherwise.
  const blockSelectionValue = useMemo<BlockSelection>(() => {
    if (!selectedBlock) return { block: null };
    return {
      block: {
        blockId: selectedBlock.block_id,
        role: selectedBlock.composition_role,
        category: selectedBlock.category,
        packageName: selectedBlock.package_name,
        text: selectedBlock.text,
        tags: selectedBlock.tags,
        capabilities: selectedBlock.capabilities,
      },
      clear: () => setSelectedBlock(null),
    };
  }, [selectedBlock]);
  const blockSelectionProvider = useMemo(
    () => ({
      id: 'block-explorer',
      label: 'Block Explorer',
      description: 'Currently focused block in the Block Explorer.',
      priority: 50,
      exposeToContextMenu: true,
      isAvailable: () => blockSelectionValue.block !== null,
      getValue: () => blockSelectionValue,
    }),
    [blockSelectionValue],
  );
  useProvideCapability(
    CAP_BLOCK_SELECTION,
    blockSelectionProvider,
    [blockSelectionValue],
    { scope: 'root' },
  );

  // Load category tree and packages on mount
  useEffect(() => {
    Promise.all([listBlockRoles(), listBlockPackages()])
      .then(([summaries, pkgs]) => {
        setCategoryTree(buildCategoryTree(summaries));
        setPackages(pkgs);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load');
        setIsLoading(false);
      });
  }, []);

  // Best-effort pack icon metadata (manifest-declared).
  useEffect(() => {
    listContentPackManifests()
      .then((manifests) => setPackIcons(buildPackIconMap(manifests)))
      .catch(() => setPackIcons({}));
  }, []);

  // Fetch tag facets when category/package changes
  useEffect(() => {
    if (!selectedCategory) {
      setTagFacets({});
      return;
    }
    listBlockTagFacets({
      category: selectedCategory,
      package_name: selectedPackage ?? undefined,
    })
      .then(setTagFacets)
      .catch(() => setTagFacets({}));
  }, [selectedCategory, selectedPackage]);

  // Fetch blocks when any filter changes
  useEffect(() => {
    if (!selectedCategory) {
      setBlocks([]);
      return;
    }
    const tagsParam =
      activeTagFilters.length > 0
        ? activeTagFilters.map((f) => `${f.key}:${f.value}`).join(',')
        : undefined;
    searchBlocks({
      category: selectedCategory,
      package_name: selectedPackage ?? undefined,
      q: searchQuery || undefined,
      tags: tagsParam,
      limit: 200,
    })
      .then(setBlocks)
      .catch(() => setBlocks([]));
  }, [selectedCategory, selectedPackage, searchQuery, activeTagFilters]);

  // Clear or refresh detail selection when filtered results change.
  useEffect(() => {
    if (!selectedBlock) return;
    const nextSelected = blocks.find((b) => b.block_id === selectedBlock.block_id);
    if (!nextSelected) {
      setSelectedBlock(null);
      return;
    }
    if (nextSelected !== selectedBlock) {
      setSelectedBlock(nextSelected);
    }
  }, [blocks, selectedBlock]);

  // Fetch op-runtime schema for the selected block (cached per block_id).
  useEffect(() => {
    if (!selectedBlock) {
      setBlockSchema(null);
      setSchemaLoading(false);
      return;
    }
    const blockId = selectedBlock.block_id;
    const cached = schemaCacheRef.current.get(blockId);
    if (cached) {
      setBlockSchema(cached);
      setSchemaLoading(false);
      return;
    }
    let cancelled = false;
    setBlockSchema(null);
    setSchemaLoading(true);
    getBlockSchema(blockId)
      .then((res) => {
        if (cancelled) return;
        schemaCacheRef.current.set(blockId, res);
        setBlockSchema(res);
      })
      .catch(() => {
        if (!cancelled) setBlockSchema(null);
      })
      .finally(() => {
        if (!cancelled) setSchemaLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedBlock]);

  // Clicking a category expands it (and fetches its blocks); clicking the
  // already-open one collapses the tree back to the category list.
  const handleToggleCategory = useCallback((category: string) => {
    setSelectedCategory((prev) => (prev === category ? null : category));
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

  const namespaceGroups = useMemo(
    () => buildNamespaceGroups(blocks, selectedCategory, packIcons),
    [blocks, selectedCategory, packIcons],
  );
  const showNamespaceGroups = namespaceGroups.length > 1;

  const totalBlocks = useMemo(
    () => categoryTree.reduce((sum, n) => sum + n.totalCount, 0),
    [categoryTree],
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
      {/* Single nested sidebar: categories expand inline to their blocks. */}
      <div className="w-64 shrink-0 flex flex-col border-r border-neutral-800">
        <div className="px-2 py-2 border-b border-neutral-800">
          <h2 className="text-[11px] font-semibold text-neutral-300 uppercase tracking-wider">
            Blocks
          </h2>
          <p className="text-[10px] text-neutral-500">
            {categoryTree.length} categories · {totalBlocks} blocks
          </p>
        </div>

        {/* Filters apply to the open category — kept above the tree. */}
        {selectedCategory && (
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
        )}

        <div className="flex-1 overflow-y-auto py-1 px-1">
          {categoryTree.map((node) => {
            const color = categoryColor(node.category);
            const isSelected = selectedCategory === node.category;

            return (
              <SidebarTreeGroup
                key={node.category}
                label={node.category}
                labelClassName="normal-case tracking-normal font-normal"
                icon={getCategoryIcon(node.category, node.roles)}
                iconClassName={COLOR_TEXT[color] ?? COLOR_TEXT.gray}
                selected={isSelected}
                expanded={isSelected}
                onClick={() => handleToggleCategory(node.category)}
                trailing={
                  <span className="text-[9px] text-neutral-600 tabular-nums ml-auto">
                    {node.totalCount}
                  </span>
                }
              >
                {isSelected &&
                  (blocks.length > 0 ? (
                    showNamespaceGroups ? (
                      namespaceGroups.map((group) => {
                        const groupHasSelectedBlock = group.blocks.some(
                          (block) => block.block_id === selectedBlock?.block_id,
                        );
                        return (
                          <SidebarTreeGroup
                            key={`${node.category}:${group.key}`}
                            label={group.label}
                            labelClassName="normal-case tracking-normal font-normal"
                            icon={group.icon ?? getBlockIcon(group.blocks[0])}
                            selected={groupHasSelectedBlock}
                            defaultExpanded={groupHasSelectedBlock || namespaceGroups.length <= 6}
                            trailing={
                              <span className="text-[9px] text-neutral-600 tabular-nums ml-auto">
                                {group.blocks.length}
                              </span>
                            }
                          >
                            {group.blocks.map((block) => (
                              <SidebarTreeLeafButton
                                key={block.block_id}
                                label={block.block_id}
                                icon={getBlockIcon(block)}
                                selected={selectedBlock?.block_id === block.block_id}
                                onClick={() => setSelectedBlock(block)}
                                compact
                              />
                            ))}
                          </SidebarTreeGroup>
                        );
                      })
                    ) : (
                      blocks.map((block) => (
                        <SidebarTreeLeafButton
                          key={block.block_id}
                          label={block.block_id}
                          icon={getBlockIcon(block)}
                          selected={selectedBlock?.block_id === block.block_id}
                          onClick={() => setSelectedBlock(block)}
                          compact
                        />
                      ))
                    )
                  ) : (
                    <p className="px-2 py-1 text-[10px] text-neutral-600">
                      No blocks match
                    </p>
                  ))}
              </SidebarTreeGroup>
            );
          })}
        </div>
      </div>

      {/* Detail */}
      <div className="flex-1 overflow-y-auto">
        {selectedBlock ? (
          <BlockDetail
            block={selectedBlock}
            schema={blockSchema}
            schemaLoading={schemaLoading}
            resolveTagValue={resolveTagValue}
            classifyTagKey={classifyTagKey}
            onOpenMatrix={handleOpenMatrix}
            activeTagFilters={activeTagFilters}
            onTagFilterAdd={handleTagFilterAdd}
            onTagFilterRemove={handleTagFilterRemove}
          />
        ) : (
          <div className="h-full flex items-center justify-center px-6">
            <p className="text-xs text-neutral-500">
              {selectedCategory
                ? 'Select a block to view details'
                : 'Select a category to browse its blocks'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

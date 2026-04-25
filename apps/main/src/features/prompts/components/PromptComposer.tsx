import type { PromptBlockLike } from '@pixsim7/core.prompt';
import {
  BASE_PROMPT_ROLES,
  DEFAULT_PROMPT_ROLE,
  composePromptFromBlocks,
  deriveBlocksFromCandidates,
  ensurePromptBlocks,
} from '@pixsim7/core.prompt';
import type { PromptBlockCandidate } from '@pixsim7/shared.types/prompt';
import { DropdownItem, DropdownDivider, FoldGroup, GroupedFold, Popover, PromptInput, PromptEditor } from '@pixsim7/shared.ui';
import clsx from 'clsx';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import { contextMenuAttrs, useRegisterContextData } from '@lib/dockview/contextMenu';
import { Icon } from '@lib/icons';
import {
  ReferencePicker,
  useReferenceInput,
  useReferences,
  type ReferenceItem,
  type ReferencePickerHandle,
} from '@lib/references';
import { logEvent } from '@lib/utils/logging';
import { getTextareaCaretCoords } from '@lib/utils/textareaCaret';

import type { AssetModel, ViewerAsset } from '@features/assets';
import { CAP_ASSET, CAP_ASSET_SELECTION, useCapability, type AssetSelection } from '@features/contextHub';
import { openWorkspacePanel } from '@features/workspace';
import { useWorkspaceStore } from '@features/workspace';

import { useApi } from '@/hooks/useApi';
import { getPromptRoleBadgeClass, getPromptRoleLabel } from '@/lib/promptRoleUi';
import { useCmReferenceInput } from '../hooks/useCmReferenceInput';
import { usePromptHistory } from '../hooks/usePromptHistory';
import { useSemanticActionBlocks } from '../hooks/useSemanticActionBlocks';
import { useShadowAnalysis } from '../hooks/useShadowAnalysis';
import { ghostDiffExtension, type GhostDiffConfig } from '../lib/ghostDiffExtension';
import {
  getCachedAnalysis,
  setCachedAnalysis,
  type AnalysisResult,
  type SequenceContext,
} from '../lib/promptAnalysisCache';
import { shadowAnalysisExtension } from '../lib/shadowAnalysisExtension';
import { useBlockTemplateStore } from '../stores/blockTemplateStore';
import { useMediaCompareTargetStore } from '../stores/mediaCompareTargetStore';
import { usePromptSettingsStore } from '../stores/promptSettingsStore';
import type { PromptTag } from '../types';


import { FloatingToolPanel } from './FloatingToolPanel';
import { InlineBlocksEditor } from './InlineBlocksEditor';
import { PromptGhostDiff, type GhostDiffSource } from './PromptGhostDiff';
import { PromptHistoryPopover } from './PromptHistoryPopover';
import { PromptToolsPanel, type PromptToolsApplyPayload } from './PromptToolsPanel';
import { ShadowAnalysisPopover } from './ShadowAnalysisPopover';
import { ShadowSidePanel } from './ShadowSidePanel';
import { ShadowTextarea } from './ShadowTextarea';
import { RoleBadge } from './shared/RoleBadge';

type PromptComposerMode = 'text' | 'blocks';

type CompareMediaType = 'image' | 'video' | 'audio' | '3d_model';
type ComparableAsset = Partial<AssetModel> &
  Partial<ViewerAsset> & {
    _assetModel?: AssetModel | null;
  };

interface PromptBlockItem extends PromptBlockLike {
  id: string;
}

interface AnalyzePromptResponse {
  analysis?: {
    prompt?: string;
    candidates?: PromptBlockCandidate[];
    tags?: PromptTag[];
    sequence_context?: SequenceContext;
  };
  role_in_sequence?: string;
  sequence_context?: SequenceContext;
}

type PromptHistoryScope = 'provider-operation' | 'operation' | 'global';
interface PromptFamilyRecord {
  id: string;
  slug?: string | null;
  title?: string | null;
}

interface PromptVersionRecord {
  id: string;
  family_id: string;
  version_number: number;
}

const QUICKGEN_HISTORY_FAMILY_CACHE_KEY = 'quickgen_history_prompt_family_id_v1';
const QUICKGEN_HISTORY_FAMILY_TITLE = 'QuickGen History';
const QUICKGEN_HISTORY_FAMILY_SLUG = 'quickgen-history';
const EMPTY_SHADOW_CANDIDATES: PromptBlockCandidate[] = [];

function readCachedQuickGenHistoryFamilyId(): string | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(QUICKGEN_HISTORY_FAMILY_CACHE_KEY);
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function writeCachedQuickGenHistoryFamilyId(familyId: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(QUICKGEN_HISTORY_FAMILY_CACHE_KEY, familyId);
}

async function findQuickGenHistoryFamilyId(api: ReturnType<typeof useApi>): Promise<string | null> {
  const rows = await api.get<PromptFamilyRecord[]>('/prompts/families', {
    params: { is_active: true, limit: 200, offset: 0 },
  });
  const existing = rows.find((row) => {
    const slug = row.slug?.trim().toLowerCase();
    const title = row.title?.trim().toLowerCase();
    return slug === QUICKGEN_HISTORY_FAMILY_SLUG || title === QUICKGEN_HISTORY_FAMILY_TITLE.toLowerCase();
  });
  return existing?.id ?? null;
}

async function ensureQuickGenHistoryFamilyId(api: ReturnType<typeof useApi>): Promise<string> {
  const cachedFamilyId = readCachedQuickGenHistoryFamilyId();
  if (cachedFamilyId) {
    try {
      await api.get<PromptFamilyRecord>(`/prompts/families/${encodeURIComponent(cachedFamilyId)}`);
      return cachedFamilyId;
    } catch {
      // Continue and resolve/create a valid family.
    }
  }

  try {
    const existingFamilyId = await findQuickGenHistoryFamilyId(api);
    if (existingFamilyId) {
      writeCachedQuickGenHistoryFamilyId(existingFamilyId);
      return existingFamilyId;
    }
  } catch {
    // Best effort lookup, fall through to create.
  }

  try {
    const created = await api.post<PromptFamilyRecord>('/prompts/families', {
      title: QUICKGEN_HISTORY_FAMILY_TITLE,
      prompt_type: 'visual',
      slug: QUICKGEN_HISTORY_FAMILY_SLUG,
      category: 'quickgen',
      tags: ['quickgen', 'history', 'drafts'],
      description: 'Pinned prompt history promotions from QuickGen.',
    });
    writeCachedQuickGenHistoryFamilyId(created.id);
    return created.id;
  } catch (error) {
    const fallbackFamilyId = await findQuickGenHistoryFamilyId(api);
    if (fallbackFamilyId) {
      writeCachedQuickGenHistoryFamilyId(fallbackFamilyId);
      return fallbackFamilyId;
    }
    throw error;
  }
}

export interface PromptComposerProps {
  value: string;
  onChange: (val: string) => void;
  maxChars?: number;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  variant?: 'default' | 'compact';
  showCounter?: boolean;
  resizable?: boolean;
  minHeight?: number;
  historyScopeKey?: string | null;
  historyMaxEntries?: number;
  historyScopeLabel?: string;
  historyScopeValue?: PromptHistoryScope;
  onHistoryScopeChange?: (nextScope: PromptHistoryScope) => void;
  runContextSeed?: Record<string, unknown>;
  onPromptToolRunContextPatch?: (patch: {
    guidance_patch?: Record<string, unknown>;
    composition_assets_patch?: Array<Record<string, unknown>>;
  } | null) => void;
}

function truncate(text: string, maxLen: number) {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 1))}\u2026`;
}

function blockIdToLabel(blockId: string): string {
  const segment = blockId.split('.').pop() ?? blockId;
  return segment
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function composePrompt(blocks: PromptBlockItem[]) {
  return composePromptFromBlocks(blocks);
}

function composeOverlayBlockText(item: {
  text: string;
  primitiveTags?: string[];
}): string {
  if (!item.primitiveTags || item.primitiveTags.length === 0) {
    return item.text;
  }
  const tagLine = `[primitive_tags: ${item.primitiveTags.join(', ')}]`;
  return `${tagLine}\n${item.text}`;
}

function normalizeComparePrompt(prompt: string | null | undefined): string | null {
  if (typeof prompt !== 'string') return null;
  const normalized = prompt.replace(/\r\n?/g, '\n');
  return normalized.trim().length > 0 ? normalized : null;
}

function getComparablePrompt(asset: ComparableAsset | null | undefined): string | null {
  const directPrompt =
    typeof asset?.prompt === 'string' ? asset.prompt : null;
  const modelPrompt =
    typeof asset?._assetModel?.prompt === 'string'
      ? asset._assetModel.prompt
      : null;
  return normalizeComparePrompt(directPrompt ?? modelPrompt);
}

function getComparableMediaType(asset: ComparableAsset | null | undefined): CompareMediaType {
  const fromModel = asset?._assetModel?.mediaType;
  if (
    fromModel === 'image' ||
    fromModel === 'video' ||
    fromModel === 'audio' ||
    fromModel === '3d_model'
  ) {
    return fromModel;
  }

  if (
    asset?.mediaType === 'image' ||
    asset?.mediaType === 'video' ||
    asset?.mediaType === 'audio' ||
    asset?.mediaType === '3d_model'
  ) {
    return asset.mediaType;
  }

  if (asset?.type === 'image' || asset?.type === 'video') {
    return asset.type;
  }

  return 'image';
}

function resolveSequenceContext(response: AnalyzePromptResponse): SequenceContext | undefined {
  const sequenceContext = response.sequence_context ?? response.analysis?.sequence_context;
  if (!sequenceContext) return undefined;
  return sequenceContext;
}

export function PromptComposer({
  value,
  onChange,
  maxChars,
  placeholder,
  disabled = false,
  className,
  variant = 'default',
  showCounter = true,
  resizable = false,
  minHeight,
  historyScopeKey,
  historyMaxEntries,
  historyScopeLabel,
  historyScopeValue,
  onHistoryScopeChange,
  runContextSeed,
  onPromptToolRunContextPatch,
}: PromptComposerProps) {
  const composerId = useId();
  const api = useApi();
  const openFloatingPanel = useWorkspaceStore((s) => s.openFloatingPanel);
  const pinnedTemplateId = useBlockTemplateStore((s) => s.pinnedTemplateId);
  const promptRoleColors = usePromptSettingsStore((state) => state.promptRoleColors);
  const autoAnalyze = usePromptSettingsStore((state) => state.autoAnalyze);
  const defaultAnalyzer = usePromptSettingsStore((state) => state.defaultAnalyzer);
  const blocksLayout = usePromptSettingsStore((state) => state.blocksLayout);
  const setBlocksLayout = usePromptSettingsStore((state) => state.setBlocksLayout);
  const editorEngine = usePromptSettingsStore((state) => state.editorEngine);
  const useCodemirror = editorEngine === 'codemirror';
  const [mode, setMode] = useState<PromptComposerMode>('text');
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const layoutTriggerRef = useRef<HTMLButtonElement>(null);
  const [blocks, setBlocks] = useState<PromptBlockItem[]>([
    { id: 'block-0', role: DEFAULT_PROMPT_ROLE, text: '' },
  ]);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [assistantError, setAssistantError] = useState<string | null>(null);

  const [showShadow, setShowShadow] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [, forceHistoryRender] = useState(0);
  const [promotingHistoryIndex, setPromotingHistoryIndex] = useState<number | null>(null);
  const [historyPromotionNotice, setHistoryPromotionNotice] = useState<string | null>(null);
  const [historyPromotionError, setHistoryPromotionError] = useState<string | null>(null);
  const [showPromptTools, setShowPromptTools] = useState(false);
  const historyTriggerRef = useRef<HTMLButtonElement>(null);

  // --- Shadow analysis click popover (CM path) ---
  const [cmShadowPopover, setCmShadowPopover] = useState<{
    anchor: HTMLElement;
    candidate: PromptBlockCandidate;
  } | null>(null);

  // --- Ghost diff (inline comparison backdrop) ---
  const [ghostSource, setGhostSource] = useState<GhostDiffSource | null>(null);
  const [ghostSticky, setGhostSticky] = useState(false);
  /** How many steps back from current we're comparing (1 = previous). Used in sticky mode. */
  const [ghostCompareOffset, setGhostCompareOffset] = useState(1);
  /** When true, ghost compares against the prompt of the currently-viewed asset (CAP_ASSET). */
  const [compareAgainstMedia, setCompareAgainstMedia] = useState(false);
  const [ghostSuppressed, setGhostSuppressed] = useState(false);
  /** Removed tokens from the current diff — not rendered inline (breaks alignment), surfaced as badge. */
  const [ghostRemoved, setGhostRemoved] = useState<string[]>([]);
  const [ghostPrecisionHover, setGhostPrecisionHover] = useState(false);
  const [pointerOverMediaCard, setPointerOverMediaCard] = useState(false);
  /** Whether Shift is held — while held + in media-compare mode, hover overrides selection. */
  const [shiftHeld, setShiftHeld] = useState(false);
  const ghostStickyRef = useRef(false);
  ghostStickyRef.current = ghostSticky;
  const ghostCompareOffsetRef = useRef(1);
  ghostCompareOffsetRef.current = ghostCompareOffset;
  const ghostClearTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const promptEditorRef = useRef<import('@codemirror/view').EditorView | null>(null);

  // @mention picker — vocabulary references (anatomy, etc.) + any other
  // sources registered in `referenceRegistry`. Inserts plain text via
  // per-item `insertText` from the anatomy source; other sources using the
  // default `token` mode (plans/worlds) will insert `@type:id` if ever
  // enabled here. For now only anatomy is surfaced in the prompt box, but
  // the picker supports all registered sources transparently.
  const references = useReferences();
  const referencePickerRef = useRef<ReferencePickerHandle>(null);
  const referenceInput = useReferenceInput(references, referencePickerRef, {
    insertMode: 'text',
  });
  const handleReferenceSelect = useCallback(
    (item: ReferenceItem) => {
      referenceInput.select(item, (fn) => {
        onChangeRef.current(fn(valueRef.current));
      });
    },
    [referenceInput],
  );

  // CM-specific @mention picker
  const cmRefInput = useCmReferenceInput(references, referencePickerRef, promptEditorRef, {
    insertMode: 'text',
  });
  const handleCmReferenceSelect = useCallback(
    (item: ReferenceItem) => {
      cmRefInput.select(item, (fn) => {
        onChangeRef.current(fn(valueRef.current));
      });
    },
    [cmRefInput],
  );

  // Caret-anchored popup coords. Computed when the picker becomes active
  // (i.e. when the user types `@` in a valid position) and anchored to the
  // `@` index — not the live cursor — so the popup doesn't jitter as the
  // user types the query. Recomputed if the trigger moves (e.g. user types
  // over the query and @ ends up at a new position).
  const [referenceAnchor, setReferenceAnchor] = useState<{ top: number; left: number } | null>(null);
  useEffect(() => {
    if (!referenceInput.active || referenceInput.triggerPos < 0) {
      setReferenceAnchor(null);
      return;
    }
    const el = promptTextareaRef.current;
    if (!el) return;
    const coords = getTextareaCaretCoords(el, referenceInput.triggerPos);
    // Caret coords are relative to the textarea's content area; the picker
    // is positioned absolute within the outer container. Offset by the
    // textarea's position within its offsetParent so the two coord systems
    // align. This relies on the container being the nearest positioned
    // ancestor (it is — `relative h-full` above).
    setReferenceAnchor({
      top: el.offsetTop + coords.top + coords.height + 4,
      left: el.offsetLeft + coords.left,
    });
  }, [referenceInput.active, referenceInput.triggerPos]);

  // CAP_ASSET is local-scoped and comes from whatever you're hovering or focused on
  // (MediaCard on hover, MediaDisplay when in a viewer panel). CAP_ASSET_SELECTION
  // is root-scoped and stable — the viewer's currently selected asset.
  // Prefer live hover (for nice "scrub gallery to peek diff" UX) with selection fallback.
  const hoverAssetCapability = useCapability<ComparableAsset>(CAP_ASSET);
  const hoverAsset = hoverAssetCapability.value;
  const hoverAssetProviderId = hoverAssetCapability.provider?.id ?? null;
  const { value: selection } = useCapability<AssetSelection>(CAP_ASSET_SELECTION);
  const pinnedCompareTarget = useMediaCompareTargetStore((state) => state.target);
  const selectionAssetPrompt = getComparablePrompt(selection?.asset as ComparableAsset | null);
  const hoverAssetPrompt = getComparablePrompt(hoverAsset);
  const pinnedAssetPrompt = normalizeComparePrompt(pinnedCompareTarget?.prompt ?? null);
  const hasPinnedCompareTarget = !!pinnedAssetPrompt;
  const canPeekHoveredAsset =
    pointerOverMediaCard && hoverAssetProviderId === 'media-card' && !!hoverAssetPrompt;
  /** Selection (playing/viewed media) is the default anchor. Shift+hover peeks a different target. */
  const peekingHover = shiftHeld && canPeekHoveredAsset;
  const activeAssetPrompt = peekingHover
    ? hoverAssetPrompt
    : pinnedAssetPrompt ?? selectionAssetPrompt;
  const activeAssetType = peekingHover
    ? getComparableMediaType(hoverAsset)
    : pinnedCompareTarget?.mediaType ??
      getComparableMediaType(selection?.asset as ComparableAsset | null);
  /** Source label for the tooltip — tells the user what they're comparing against. */
  const comparisonSourceLabel = peekingHover
    ? 'hovered asset'
    : hasPinnedCompareTarget
      ? 'pinned media card'
      : selectionAssetPrompt
      ? 'viewer selection'
      : null;

  const idCounterRef = useRef(1);
  const lastComposedRef = useRef<string | null>(null);
  const lastParsedRef = useRef<string | null>(null);
  const parseRequestIdRef = useRef(0);
  const expandAllRef = useRef<(() => void) | null>(null);
  const collapseAllRef = useRef<(() => void) | null>(null);
  // Stable refs for callbacks — prevents identity cascade
  // (onChange/value changing → updateBlocks changing → seedBlocksFromPrompt changing → effect re-firing)
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;

  // --- Undo/redo history ---
  const history = usePromptHistory(value, {
    persistenceKey: historyScopeKey,
    maxEntries: historyMaxEntries ?? 80,
  });
  const undoDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const undoingRef = useRef(false);

  /** Show ghost diff after a history navigation. Auto-clears after delay unless sticky. */
  const showGhostFor = useCallback(
    (comparisonText: string, stepDistance: number) => {
      clearTimeout(ghostClearTimerRef.current);
      setGhostSource({ comparisonText, stepDistance });
      if (!ghostSticky) {
        ghostClearTimerRef.current = setTimeout(() => setGhostSource(null), 4000);
      }
    },
    [ghostSticky],
  );

  /** Apply sticky ghost from timeline at a given offset (steps back from current). */
  const applyStickyGhost = useCallback(
    (offset: number) => {
      const tl = history.getTimeline();
      const targetIdx = tl.currentIndex - offset;
      if (targetIdx < 0 || offset < 1) {
        setGhostSource(null);
        return;
      }
      setGhostCompareOffset(offset);
      setGhostSource({
        comparisonText: tl.entries[targetIdx],
        stepDistance: offset,
      });
    },
    [history],
  );

  // Cleanup ghost timer on unmount
  useEffect(() => () => clearTimeout(ghostClearTimerRef.current), []);

  // Keep ghost synced to active-media prompt when that mode is active.
  useEffect(() => {
    if (!compareAgainstMedia) return;
    if (!activeAssetPrompt) {
      setGhostSource(null);
      return;
    }
    // stepDistance=1 keeps highlights vivid — the active media is the "reference"
    setGhostSource({ comparisonText: activeAssetPrompt, stepDistance: 1 });
  }, [compareAgainstMedia, activeAssetPrompt]);

  // Track pointer-over-card state from DOM to avoid peeking when Shift is
  // pressed away from cards. Works for compact/small cards too since they use
  // the same `data-pixsim7="media-card"` marker.
  useEffect(() => {
    if (!compareAgainstMedia) {
      setPointerOverMediaCard(false);
      return;
    }
    const onPointerMove = (event: PointerEvent) => {
      const target = event.target;
      const overCard =
        target instanceof Element && !!target.closest('[data-pixsim7="media-card"]');
      setPointerOverMediaCard((prev) => (prev === overCard ? prev : overCard));
    };
    const clearPointerState = () => setPointerOverMediaCard(false);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('blur', clearPointerState);
    document.addEventListener('mouseleave', clearPointerState);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('blur', clearPointerState);
      document.removeEventListener('mouseleave', clearPointerState);
    };
  }, [compareAgainstMedia]);

  // Shift tracking for peek-on-hover. Gated by `peekingHover` so pressing
  // Shift outside media cards no longer changes compare target.
  useEffect(() => {
    if (!compareAgainstMedia) {
      setShiftHeld(false);
      return;
    }
    const onDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftHeld(true);
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftHeld(false);
    };
    const onBlur = () => setShiftHeld(false);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [compareAgainstMedia]);

  useEffect(() => {
    if (!ghostSource) {
      setGhostPrecisionHover(false);
    }
  }, [ghostSource]);

  const handleGhostPrecisionEnter = useCallback(() => {
    if (!ghostSource) return;
    setGhostPrecisionHover(true);
  }, [ghostSource]);

  const handleGhostPrecisionLeave = useCallback(() => {
    setGhostPrecisionHover(false);
  }, []);

  const flushSnapshot = useCallback(() => {
    clearTimeout(undoDebounceRef.current);
    history.snapshot(valueRef.current);
  }, [history]);

  // Debounced snapshot: captures typing pauses (600ms idle)
  useEffect(() => {
    if (undoingRef.current) {
      undoingRef.current = false;
      return;
    }
    clearTimeout(undoDebounceRef.current);
    undoDebounceRef.current = setTimeout(() => {
      history.snapshot(value);
      if (ghostStickyRef.current) {
        applyStickyGhost(ghostCompareOffsetRef.current);
      }
    }, 600);

    // User is typing new text — clear transient ghost
    // (sticky-history and media-compare both survive: they're explicit modes)
    if (ghostSource && !ghostSticky && !compareAgainstMedia) {
      clearTimeout(ghostClearTimerRef.current);
      ghostClearTimerRef.current = setTimeout(() => setGhostSource(null), 1200);
    }

    return () => clearTimeout(undoDebounceRef.current);
  }, [value, history, applyStickyGhost]); // ghostSource/ghostSticky intentionally excluded — read reactively

  // Capture-phase keyboard handler — intercepts before native textarea undo
  const handleUndoKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;

      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        const beforeUndo = valueRef.current;
        flushSnapshot();
        const prev = history.undo();
        if (prev !== null) {
          undoingRef.current = true;
          onChangeRef.current(prev);
          showGhostFor(beforeUndo, 1);
        }
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        e.stopPropagation();
        const beforeRedo = valueRef.current;
        const next = history.redo();
        if (next !== null) {
          undoingRef.current = true;
          onChangeRef.current(next);
          showGhostFor(beforeRedo, 1);
        }
      }
    },
    [flushSnapshot, history, showGhostFor],
  );

  // --- Context menu data for prompt-text right-click ---
  const promptContextAttrs = contextMenuAttrs('prompt-text', composerId, 'Prompt');
  useRegisterContextData('prompt-text', composerId, {
    prompt: value,
    setPrompt: onChange,
    undo: () => {
      const beforeUndo = valueRef.current;
      flushSnapshot();
      const prev = history.undo();
      if (prev !== null) {
        undoingRef.current = true;
        onChangeRef.current(prev);
        showGhostFor(beforeUndo, 1);
      }
    },
    redo: () => {
      const beforeRedo = valueRef.current;
      const next = history.redo();
      if (next !== null) {
        undoingRef.current = true;
        onChangeRef.current(next);
        showGhostFor(beforeRedo, 1);
      }
    },
    canUndo: history.canUndo(),
    canRedo: history.canRedo(),
  }, [value, onChange, flushSnapshot, history, showGhostFor]);

  // --- History popover ---
  const historyTimeline = showHistory
    ? history.getTimeline()
    : { entries: [], entryIds: [], pinnedByIndex: [], pinnedCount: 0, currentIndex: 0 };
  const handleOpenHistory = useCallback(() => {
    flushSnapshot();
    forceHistoryRender((prev) => prev + 1);
    setShowHistory((prev) => !prev);
  }, [flushSnapshot]);
  const handleHistoryJump = useCallback(
    (index: number) => {
      const beforeJump = valueRef.current;
      const timeline = history.getTimeline();
      const prevIndex = timeline.currentIndex;
      const restored = history.jumpTo(index);
      if (restored !== null) {
        undoingRef.current = true;
        onChangeRef.current(restored);
        const distance = Math.abs(index - prevIndex);
        showGhostFor(beforeJump, Math.max(1, distance));
      }
      setShowHistory(false);
    },
    [history, showGhostFor],
  );
  const handleHistoryTogglePin = useCallback(
    (index: number) => {
      const changed = history.togglePin(index);
      if (changed !== null) {
        forceHistoryRender((prev) => prev + 1);
      }
    },
    [history],
  );
  const handleHistoryPromote = useCallback(
    async (index: number) => {
      const timeline = history.getTimeline();
      if (!timeline.pinnedByIndex[index]) {
        setHistoryPromotionError('Pin a step before promoting it to PromptVersion.');
        setHistoryPromotionNotice(null);
        return;
      }

      const promptText = timeline.entries[index] ?? '';
      if (!promptText.trim()) {
        setHistoryPromotionError('Cannot promote an empty prompt step.');
        setHistoryPromotionNotice(null);
        return;
      }

      try {
        setPromotingHistoryIndex(index);
        setHistoryPromotionError(null);
        setHistoryPromotionNotice(null);

        const familyId = await ensureQuickGenHistoryFamilyId(api);
        const createdVersion = await api.post<PromptVersionRecord>(
          `/prompts/families/${encodeURIComponent(familyId)}/versions`,
          {
            prompt_text: promptText,
            commit_message: `Promoted from QuickGen history step ${index + 1}`,
            tags: ['quickgen', 'history', 'pinned'],
            provider_hints: {
              source: 'quickgen_history',
              history_scope: historyScopeValue ?? null,
            },
          },
        );

        setHistoryPromotionNotice(`Promoted as v${createdVersion.version_number}.`);
        setHistoryPromotionError(null);
        logEvent('INFO', 'prompt_history_promoted', {
          step: index + 1,
          family_id: familyId,
          version_id: createdVersion.id,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to promote prompt step';
        setHistoryPromotionError(message);
        setHistoryPromotionNotice(null);
      } finally {
        setPromotingHistoryIndex(null);
      }
    },
    [api, history, historyScopeValue],
  );

  const roleOptions = useMemo(() => {
    const roles = new Set<string>(BASE_PROMPT_ROLES);
    blocks.forEach((block) => {
      if (block.role) roles.add(block.role);
    });
    return Array.from(roles);
  }, [blocks]);

  const shadowAnalysis = useShadowAnalysis(value, {
    enabled: mode === 'text' && showShadow && autoAnalyze,
    analyzerId: defaultAnalyzer,
  });

  // --- CM extensions for CodeMirror mode ---
  const ghostDiffPrecision: 'coarse' | 'fine' = ghostPrecisionHover ? 'fine' : 'coarse';
  const cmGhostConfig: GhostDiffConfig | null = ghostSource
    ? {
        comparisonText: ghostSource.comparisonText,
        stepDistance: ghostSource.stepDistance,
        precision: ghostDiffPrecision,
      }
    : null;
  const cmShadowCandidates = useMemo(
    () =>
      useCodemirror && showShadow && autoAnalyze
        ? (shadowAnalysis.result?.candidates ?? EMPTY_SHADOW_CANDIDATES)
        : EMPTY_SHADOW_CANDIDATES,
    [useCodemirror, showShadow, autoAnalyze, shadowAnalysis.result?.candidates],
  );
  const cmShadowTokenLines = useMemo(
    () => useCodemirror && showShadow && autoAnalyze
      ? shadowAnalysis.result?.tokens?.lines
      : undefined,
    [useCodemirror, showShadow, autoAnalyze, shadowAnalysis.result?.tokens],
  );
  const cmExtensions = useMemo(
    () => {
      const exts = [
        ghostDiffExtension(cmGhostConfig, {
          onSuppress: setGhostSuppressed,
          onRemovedSegments: setGhostRemoved,
        }),
        cmRefInput.extension,
      ];
      if (cmShadowCandidates.length > 0) {
        exts.push(shadowAnalysisExtension(
          { candidates: cmShadowCandidates, roleColors: promptRoleColors, tokenLines: cmShadowTokenLines },
          {
            onCandidateClick: (candidate, anchor) => {
              setCmShadowPopover({ anchor, candidate });
            },
          },
        ));
      }
      return exts;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      cmGhostConfig?.comparisonText,
      cmGhostConfig?.stepDistance,
      cmGhostConfig?.precision,
      cmShadowCandidates,
      cmShadowTokenLines,
      promptRoleColors,
      cmRefInput.extension,
    ],
  );

  const {
    results: semanticMatches,
    loading: semanticLoading,
  } = useSemanticActionBlocks(value, {
    enabled: mode === 'blocks',
    minChars: 16,
    debounceMs: 450,
  });

  const updateBlocks = useCallback(
    (nextBlocks: PromptBlockItem[]) => {
      setBlocks(nextBlocks);
      const composed = composePrompt(nextBlocks);
      lastComposedRef.current = composed;
      lastParsedRef.current = composed.trim();
      if (composed !== valueRef.current) {
        onChangeRef.current(composed);
      }
    },
    [] // stable — uses refs for onChange/value
  );

  const seedBlocksFromPrompt = useCallback(
    async (text: string, { force = false }: { force?: boolean } = {}) => {
      const normalized = text.trim();
      if (!force && normalized && lastParsedRef.current === normalized) {
        return;
      }

      if (!normalized) {
        lastParsedRef.current = '';
        updateBlocks([{ id: 'block-0', role: DEFAULT_PROMPT_ROLE, text: '' }]);
        return;
      }

      // Check shared analysis cache (may have been populated by shadow analysis)
      const cached = getCachedAnalysis(normalized);
      if (cached && !force) {
        const derivedBlocks = deriveBlocksFromCandidates(cached.candidates, {
          defaultRole: DEFAULT_PROMPT_ROLE,
          fallbackText: normalized,
        });
        const ensured = ensurePromptBlocks(derivedBlocks, normalized, DEFAULT_PROMPT_ROLE);
        const nextBlocks = ensured.map((candidate, index) => ({
          id: `block-${Date.now()}-${index}`,
          role: candidate.role,
          text: candidate.text,
        }));
        lastParsedRef.current = normalized;
        updateBlocks(nextBlocks);
        return;
      }

      const requestId = ++parseRequestIdRef.current;
      setIsParsing(true);
      setParseError(null);

      try {
        const response = await api.post<AnalyzePromptResponse>('/prompts/analyze', {
          text: normalized,
        });
        if (requestId !== parseRequestIdRef.current) return;

        const candidates = response?.analysis?.candidates ?? [];

        // Write to shared cache so shadow analysis can reuse
        setCachedAnalysis(normalized, undefined, {
          prompt: response?.analysis?.prompt || normalized,
          candidates,
          tags: (response?.analysis?.tags ?? []) as AnalysisResult['tags'],
          role_in_sequence: response?.role_in_sequence,
          sequence_context: resolveSequenceContext(response),
        });

        const derivedBlocks = deriveBlocksFromCandidates(candidates, {
          defaultRole: DEFAULT_PROMPT_ROLE,
          fallbackText: normalized,
        });

        const ensured = ensurePromptBlocks(derivedBlocks, normalized, DEFAULT_PROMPT_ROLE);
        const nextBlocks = ensured.map((candidate, index) => ({
          id: `block-${Date.now()}-${index}`,
          role: candidate.role,
          text: candidate.text,
        }));

        lastParsedRef.current = normalized;
        updateBlocks(nextBlocks);
      } catch (err) {
        if (requestId !== parseRequestIdRef.current) return;
        setParseError(err instanceof Error ? err.message : 'Failed to parse prompt');
        updateBlocks([{ id: 'block-0', role: DEFAULT_PROMPT_ROLE, text: normalized }]);
      } finally {
        if (requestId === parseRequestIdRef.current) {
          setIsParsing(false);
        }
      }
    },
    [api, updateBlocks]
  );

  const handleModeChange = useCallback(
    (nextMode: PromptComposerMode) => {
      if (nextMode === mode) return;

      if (nextMode === 'blocks') {
        setMode('blocks');
        return;
      }

      const composed = composePrompt(blocks);
      lastComposedRef.current = composed;
      lastParsedRef.current = composed.trim();
      if (composed !== valueRef.current) {
        onChangeRef.current(composed);
      }
      setMode('text');
    },
    [blocks, mode]
  );

  useEffect(() => {
    if (mode !== 'blocks') return;
    if (value === lastComposedRef.current) return;
    void seedBlocksFromPrompt(value);
  }, [mode, seedBlocksFromPrompt, value]);

  const addBlock = useCallback(() => {
    const nextId = `block-${idCounterRef.current++}`;
    updateBlocks([
      ...blocks,
      { id: nextId, role: DEFAULT_PROMPT_ROLE, text: '' },
    ]);
  }, [blocks, updateBlocks]);

  const removeBlock = useCallback(
    (id: string) => {
      const nextBlocks = blocks.filter((block) => block.id !== id);
      updateBlocks(nextBlocks.length ? nextBlocks : [{ id: 'block-0', role: DEFAULT_PROMPT_ROLE, text: '' }]);
    },
    [blocks, updateBlocks]
  );

  const moveBlock = useCallback(
    (index: number, direction: 'up' | 'down') => {
      const next = [...blocks];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= next.length) return;
      const [item] = next.splice(index, 1);
      next.splice(targetIndex, 0, item);
      updateBlocks(next);
    },
    [blocks, updateBlocks]
  );

  const insertSemanticBlock = useCallback(
    (text: string, role?: string | null) => {
      const nextId = `block-${idCounterRef.current++}`;
      updateBlocks([...blocks, { id: nextId, role: role || DEFAULT_PROMPT_ROLE, text }]);
    },
    [blocks, updateBlocks]
  );

  const handleInsertBlock = useCallback(
    (text: string) => {
      insertSemanticBlock(text, DEFAULT_PROMPT_ROLE);
    },
    [insertSemanticBlock]
  );

  const handlePasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      // Allow pasting full text even if over limit — truncation happens at generation time
      flushSnapshot();
      onChange(text);
    } catch {
      // Clipboard access denied or unavailable
    }
  }, [onChange, flushSnapshot]);


  const handlePromptToolApply = useCallback(
    (payload: PromptToolsApplyPayload) => {
      if (disabled) return;

      if (payload.mode === 'apply_overlay_only') {
        if (!payload.blockOverlay || payload.blockOverlay.length === 0) return;
        const nextBlocks: PromptBlockItem[] = payload.blockOverlay.map((item) => ({
          id: `block-${idCounterRef.current++}`,
          role: item.role,
          text: composeOverlayBlockText(item),
        }));
        flushSnapshot();
        updateBlocks([...blocks, ...nextBlocks]);
        logEvent('INFO', 'prompt_tool_applied', {
          mode: payload.mode,
          applied_overlay_blocks: nextBlocks.length,
          has_guidance_patch: !!(
            payload.guidancePatch && Object.keys(payload.guidancePatch).length > 0
          ),
          has_composition_assets_patch: !!(
            payload.compositionAssetsPatch && payload.compositionAssetsPatch.length > 0
          ),
        });
        setMode('blocks');
        setShowPromptTools(false);
        return;
      }

      const sourceText = value;
      const outputText = payload.promptText;
      const nextText =
        payload.mode === 'append_text'
          ? sourceText.trim()
            ? `${sourceText}\n\n${outputText}`
            : outputText
          : outputText;
      const runContextPatch =
        (payload.guidancePatch && Object.keys(payload.guidancePatch).length > 0)
          || (payload.compositionAssetsPatch && payload.compositionAssetsPatch.length > 0)
          ? {
              ...(payload.guidancePatch && Object.keys(payload.guidancePatch).length > 0
                ? { guidance_patch: payload.guidancePatch }
                : {}),
              ...(payload.compositionAssetsPatch && payload.compositionAssetsPatch.length > 0
                ? { composition_assets_patch: payload.compositionAssetsPatch }
                : {}),
            }
          : null;
      flushSnapshot();
      onChangeRef.current(nextText);
      onPromptToolRunContextPatch?.(runContextPatch);
      logEvent('INFO', 'prompt_tool_applied', {
        mode: payload.mode,
        applied_overlay_blocks: payload.blockOverlay?.length ?? 0,
        has_guidance_patch: !!(
          payload.guidancePatch && Object.keys(payload.guidancePatch).length > 0
        ),
        has_composition_assets_patch: !!(
          payload.compositionAssetsPatch && payload.compositionAssetsPatch.length > 0
        ),
      });
      if (mode === 'blocks') {
        lastComposedRef.current = null;
        void seedBlocksFromPrompt(nextText, { force: true });
      }

      if (
        payload.mode === 'apply_all' &&
        payload.blockOverlay &&
        payload.blockOverlay.length > 0
      ) {
        const nextBlocks: PromptBlockItem[] = payload.blockOverlay.map((item) => ({
          id: `block-${idCounterRef.current++}`,
          role: item.role,
          text: composeOverlayBlockText(item),
        }));
        updateBlocks([...blocks, ...nextBlocks]);
        setMode('blocks');
      }

      setShowPromptTools(false);
    },
    [blocks, disabled, flushSnapshot, mode, onPromptToolRunContextPatch, seedBlocksFromPrompt, updateBlocks, value],
  );

  const composedPrompt = useMemo(() => composePrompt(blocks), [blocks]);
  const remaining = typeof maxChars === 'number' ? maxChars - composedPrompt.length : null;
  const isOverLimit = remaining !== null && remaining < 0;

  return (
    <div className={clsx('flex flex-col gap-2 min-h-0', className)} onKeyDownCapture={handleUndoKeyDown} {...promptContextAttrs}>
      <div className="flex items-center gap-2 shrink-0">
        <div className="relative">
          <button
            ref={layoutTriggerRef}
            type="button"
            disabled={disabled}
            onClick={() => setShowLayoutMenu((prev) => !prev)}
            title={mode === 'text' ? 'Text mode' : `Blocks — ${blocksLayout}`}
            className="inline-flex items-center gap-1 px-1.5 py-1 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <Icon
              name={mode === 'text' ? 'fileText' : blocksLayout === 'stacked' ? 'rows' : 'columns'}
              size={14}
            />
            <Icon name="chevronDown" size={10} />
          </button>
          <Popover
            open={showLayoutMenu}
            onClose={() => setShowLayoutMenu(false)}
            anchor={layoutTriggerRef.current}
            placement="bottom"
            align="start"
            offset={4}
            triggerRef={layoutTriggerRef}
            className="min-w-[140px] rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl p-1"
          >
            <DropdownItem
              icon={<Icon name="fileText" size={14} />}
              rightSlot={mode === 'text' ? <Icon name="check" size={12} /> : undefined}
              onClick={() => {
                handleModeChange('text');
                setShowLayoutMenu(false);
              }}
            >
              Text
            </DropdownItem>
            <DropdownItem
              icon={<Icon name="rows" size={14} />}
              rightSlot={mode === 'blocks' && blocksLayout === 'stacked' ? <Icon name="check" size={12} /> : undefined}
              onClick={() => {
                setBlocksLayout('stacked');
                if (mode !== 'blocks') handleModeChange('blocks');
                setShowLayoutMenu(false);
              }}
            >
              Blocks — Stacked
            </DropdownItem>
            <DropdownItem
              icon={<Icon name="columns" size={14} />}
              rightSlot={mode === 'blocks' && blocksLayout === 'inline' ? <Icon name="check" size={12} /> : undefined}
              onClick={() => {
                setBlocksLayout('inline');
                if (mode !== 'blocks') handleModeChange('blocks');
                setShowLayoutMenu(false);
              }}
            >
              Blocks — Inline
            </DropdownItem>
            <DropdownDivider />
            <DropdownItem
              icon={<Icon name="shuffle" size={14} />}
              onClick={() => {
                openFloatingPanel('template-builder');
                setShowLayoutMenu(false);
              }}
            >
              Template Builder
            </DropdownItem>
          </Popover>
        </div>

        <button
          type="button"
          disabled={disabled}
          onClick={handlePasteFromClipboard}
          title="Paste from clipboard"
          className="p-1 rounded text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        >
          <Icon name="clipboard-paste" size={14} />
        </button>

        <button
          ref={historyTriggerRef}
          type="button"
          disabled={disabled}
          onClick={handleOpenHistory}
          title="Prompt history"
          className={clsx(
            'p-1 rounded transition-colors',
            showHistory
              ? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200'
              : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800',
          )}
        >
          <Icon name="history" size={14} />
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            const next = !ghostSticky;
            setGhostSticky(next);
            if (next) {
              // Turning on history-sticky disables media-compare (mutually exclusive)
              setCompareAgainstMedia(false);
              flushSnapshot();
              setGhostCompareOffset(1);
              applyStickyGhost(1);
            } else {
              clearTimeout(ghostClearTimerRef.current);
              setGhostSource(null);
            }
          }}
          onWheel={(e) => {
            if (!ghostSticky) return;
            e.preventDefault();
            const tl = history.getTimeline();
            const maxOffset = tl.currentIndex; // can't go further back than the start
            if (maxOffset < 1) return;
            const delta = e.deltaY > 0 ? 1 : -1; // scroll down = further back
            const next = Math.max(1, Math.min(maxOffset, ghostCompareOffset + delta));
            if (next !== ghostCompareOffset) {
              applyStickyGhost(next);
            }
          }}
          title={
            ghostSticky
              ? `Comparing vs ${ghostCompareOffset} step${ghostCompareOffset === 1 ? '' : 's'} back — scroll to change${
                  ghostRemoved.length > 0 ? `\nRemoved: ${ghostRemoved.join(' · ')}` : ''
                }`
              : 'Show change highlights (scroll to browse history)'
          }
          className={clsx(
            'p-1 rounded transition-colors relative',
            ghostSticky
              ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
              : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800',
          )}
        >
          <Icon name="layers" size={14} />
          {ghostSticky && ghostCompareOffset > 1 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-green-600 dark:bg-green-500 text-white text-[8px] font-bold leading-none px-0.5">
              {ghostCompareOffset}
            </span>
          )}
          {ghostSticky && ghostRemoved.length > 0 && (
            <span className="absolute -bottom-1.5 -left-1.5 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-red-600 dark:bg-red-500 text-white text-[8px] font-bold leading-none px-0.5">
              −{ghostRemoved.length}
            </span>
          )}
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            const next = !compareAgainstMedia;
            setCompareAgainstMedia(next);
            if (next) {
              // Turning on media-compare disables history-sticky
              setGhostSticky(false);
              clearTimeout(ghostClearTimerRef.current);
              // source syncs via useEffect watching activeAssetPrompt
            } else {
              setGhostSource(null);
            }
          }}
          title={
            compareAgainstMedia
              ? ghostSuppressed
                ? `Diff too large - prompts too different (${comparisonSourceLabel ?? 'no target'})`
                : peekingHover
                  ? 'Peeking hovered asset (release Shift to return to pinned/selection target)'
                  : activeAssetPrompt
                    ? hasPinnedCompareTarget
                      ? 'Comparing vs pinned media card - hold Shift to peek hovered, Shift+click another card to repin, hover prompt for exact diff'
                      : `Comparing vs ${comparisonSourceLabel} - hold Shift to peek hovered, hover prompt for exact diff`
                    : 'Compare mode on - waiting for a target (hold Shift + hover, or Shift+click a media card)'
              : 'Compare prompt vs viewer media (Shift+hover peeks, Shift+click pins a media card)'
          }
          className={clsx(
            'p-1 rounded transition-colors relative',
            compareAgainstMedia
              ? ghostSuppressed
                ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                : peekingHover
                  ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400'
                  : activeAssetPrompt
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                    : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400'
              : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800',
          )}
        >
          <Icon name={activeAssetType === 'video' ? 'video' : 'image'} size={14} />
          {compareAgainstMedia && ghostSuppressed && (
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-500" />
          )}
          {compareAgainstMedia && !ghostSuppressed && canPeekHoveredAsset && !shiftHeld && (
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-violet-500/60" title="Hold Shift to peek" />
          )}
          {compareAgainstMedia && !ghostSuppressed && ghostRemoved.length > 0 && (
            <span
              className="absolute -bottom-1.5 -left-1.5 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-red-600 dark:bg-red-500 text-white text-[8px] font-bold leading-none px-0.5"
              title={`Removed: ${ghostRemoved.join(' · ')}`}
            >
              −{ghostRemoved.length}
            </span>
          )}
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => openWorkspacePanel('template-builder')}
          title={pinnedTemplateId ? 'Template pinned — click to manage' : 'Templates'}
          className={clsx(
            'p-1 rounded transition-colors',
            pinnedTemplateId
              ? 'bg-accent/15 text-accent hover:bg-accent/25'
              : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800',
          )}
        >
          <Icon name={pinnedTemplateId ? 'pin' : 'shuffle'} size={14} />
        </button>

        {mode === 'text' && autoAnalyze && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => setShowShadow((prev) => !prev)}
            title={showShadow ? 'Hide shadow analysis' : 'Show shadow analysis'}
            className={clsx(
              'p-1 rounded transition-colors',
              showShadow
                ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400'
                : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800',
            )}
          >
            <Icon name="sparkles" size={14} />
          </button>
        )}

        <button
          type="button"
          disabled={disabled}
          onClick={() => setShowPromptTools((prev) => !prev)}
          onContextMenu={(e) => {
            e.preventDefault();
            setShowPromptTools((prev) => !prev);
          }}
          title="Prompt tools"
          className={clsx(
            'p-1 rounded transition-colors',
            showPromptTools
              ? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200'
              : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800',
          )}
        >
          <Icon name="wand" size={14} />
        </button>
        <FloatingToolPanel
          open={showPromptTools}
          onClose={() => setShowPromptTools(false)}
          title="Prompt Tools"
        >
          <PromptToolsPanel
            promptText={value}
            disabled={disabled}
            runContextSeed={runContextSeed}
            onApply={handlePromptToolApply}
          />
        </FloatingToolPanel>

        {mode === 'blocks' && (
          <>
            <button
              type="button"
              disabled={disabled || isParsing}
              onClick={() => seedBlocksFromPrompt(value, { force: true })}
              title="Re-parse blocks"
              aria-label="Re-parse blocks"
              className="p-1 rounded text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <Icon name="refresh" size={14} className={clsx(isParsing && 'animate-spin')} />
            </button>

            {blocksLayout === 'stacked' && (
              <>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => expandAllRef.current?.()}
                  title="Expand all blocks"
                  aria-label="Expand all blocks"
                  className="p-1 rounded text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-40"
                >
                  <Icon name="chevronDown" size={12} />
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => collapseAllRef.current?.()}
                  title="Collapse all blocks"
                  aria-label="Collapse all blocks"
                  className="p-1 rounded text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-40"
                >
                  <Icon name="chevronUp" size={12} />
                </button>
              </>
            )}

            <span className="ml-auto text-[10px] text-neutral-500 dark:text-neutral-400">
              {blocks.length} block{blocks.length === 1 ? '' : 's'}
            </span>
          </>
        )}
      </div>

      {mode === 'blocks' && assistantError && (
        <div className="text-xs text-red-600 dark:text-red-400">{assistantError}</div>
      )}

      {mode === 'text' ? (
        useCodemirror ? (
          <div className="flex-1 min-h-0 flex">
            <div
              className="relative flex flex-col flex-1 min-w-0"
              onMouseEnter={handleGhostPrecisionEnter}
              onMouseLeave={handleGhostPrecisionLeave}
            >
              <PromptEditor
                value={value}
                onChange={onChange}
                maxChars={maxChars}
                placeholder={placeholder}
                disabled={disabled}
                variant={variant}
                showCounter={showCounter}
                resizable={resizable}
                minHeight={minHeight}
                transparent={!!ghostSource}
                className="flex-1 min-h-0"
                extensions={cmExtensions}
                editorRef={promptEditorRef}
              />
              <ReferencePicker
                ref={referencePickerRef}
                visible={cmRefInput.active && cmRefInput.anchor !== null}
                query={cmRefInput.query}
                items={references.items}
                onSelect={handleCmReferenceSelect}
                onClose={cmRefInput.dismiss}
                disallowedTypes={['plan', 'world', 'project']}
                className="absolute w-72 max-h-[320px] overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl ring-1 ring-black/5 dark:ring-white/5 z-30"
                style={cmRefInput.anchor ?? undefined}
              />
              <Popover
                anchor={cmShadowPopover?.anchor ?? null}
                placement="bottom"
                align="start"
                offset={6}
                open={!!cmShadowPopover}
                onClose={() => setCmShadowPopover(null)}
              >
                {cmShadowPopover && (
                  <ShadowAnalysisPopover
                    candidate={cmShadowPopover.candidate}
                    roleColors={promptRoleColors}
                  />
                )}
              </Popover>
            </div>
            {showShadow && autoAnalyze && (
              <ShadowSidePanel analysis={shadowAnalysis} />
            )}
          </div>
        ) : showShadow && autoAnalyze ? (
          <div className="flex-1 min-h-0 flex">
            <div className="flex-1 min-w-0">
              <ShadowTextarea
                value={value}
                onChange={onChange}
                candidates={shadowAnalysis.result?.candidates ?? []}
                maxChars={maxChars}
                placeholder={placeholder}
                disabled={disabled}
                variant={variant}
                showCounter={showCounter}
                resizable={resizable}
                minHeight={minHeight}
              />
            </div>
            <ShadowSidePanel analysis={shadowAnalysis} />
          </div>
        ) : (
          <div
            className="relative flex flex-col flex-1 min-h-0"
            onMouseEnter={handleGhostPrecisionEnter}
            onMouseLeave={handleGhostPrecisionLeave}
          >
            <PromptInput
              value={value}
              onChange={onChange}
              maxChars={maxChars}
              placeholder={placeholder}
              disabled={disabled}
              variant={variant}
              showCounter={showCounter}
              resizable={resizable}
              minHeight={minHeight}
              textareaRef={promptTextareaRef}
              transparent={!!ghostSource}
              className="flex-1 min-h-0"
              onInput={referenceInput.handleInput}
              onKeyDown={referenceInput.handleKeyDown}
            />
            <PromptGhostDiff
              value={value}
              source={ghostSource}
              textareaRef={promptTextareaRef}
              variant={variant}
              precision={ghostDiffPrecision}
              onSuppress={setGhostSuppressed}
              onRemovedSegments={setGhostRemoved}
            />
            <ReferencePicker
              ref={referencePickerRef}
              visible={referenceInput.active && referenceAnchor !== null}
              query={referenceInput.query}
              items={references.items}
              onSelect={handleReferenceSelect}
              onClose={referenceInput.dismiss}
              disallowedTypes={['plan', 'world', 'project']}
              className="absolute w-72 max-h-[320px] overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl ring-1 ring-black/5 dark:ring-white/5 z-30"
              style={referenceAnchor ?? undefined}
            />
          </div>
        )
      ) : (
        <div className="flex flex-col gap-2 min-h-0 overflow-y-auto thin-scrollbar">
          {parseError && (
            <div className="text-xs text-red-600 dark:text-red-400">
              {parseError}
            </div>
          )}

          {(semanticLoading || semanticMatches.length > 0) && (
            <div className="flex items-center gap-1 overflow-x-auto">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 flex-shrink-0">
                <Icon name="sparkles" size={12} />
              </span>
              {semanticLoading && (
                <Icon
                  name="refresh"
                  size={12}
                  className="text-neutral-500 dark:text-neutral-400 animate-spin flex-shrink-0"
                />
              )}
              {semanticMatches.slice(0, 5).map((match) => (
                <button
                  key={match.id}
                  type="button"
                  onClick={() => insertSemanticBlock(match.prompt, match.role)}
                  className={clsx(
                    'text-[10px] px-2 py-1 rounded border whitespace-nowrap',
                    'border-neutral-200 dark:border-neutral-700',
                    'text-neutral-600 dark:text-neutral-300',
                    'hover:border-accent-muted hover:bg-accent-subtle'
                  )}
                  title={`${match.block_id} (${Math.round(match.similarity_score * 100)}%)`}
                >
                  {blockIdToLabel(match.block_id)}
                </button>
              ))}
            </div>
          )}

          {blocksLayout === 'inline' ? (
            <InlineBlocksEditor
              blocks={blocks}
              disabled={disabled}
              promptRoleColors={promptRoleColors}
              roleOptions={roleOptions}
              onUpdateBlocks={updateBlocks}
              onAddBlock={addBlock}
              onRemoveBlock={removeBlock}
            />
          ) : (
            <>
              <FoldGroup
                renderControls={({ expandAll, collapseAll }) => {
                  expandAllRef.current = expandAll;
                  collapseAllRef.current = collapseAll;
                  return null;
                }}
              >
                <div className="flex flex-col gap-2">
                  {blocks.map((block, index) => {
                    const summaryText = block.text.trim()
                      ? truncate(block.text.trim(), 60)
                      : 'Empty block';
                    const badgeColor = getPromptRoleBadgeClass(block.role, promptRoleColors);

                    return (
                      <GroupedFold
                        key={block.id}
                        id={block.id}
                        indicator="chevron"
                        showIndicatorWhenOpen
                        summaryClassName="not-italic"
                        contentClassName="block"
                        summary={
                          <span className="flex items-center gap-2">
                            <RoleBadge role={block.role} colorOverrides={promptRoleColors} />
                            <span className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                              {summaryText}
                            </span>
                          </span>
                        }
                      >
                        <div className="mt-1 flex items-stretch gap-2">
                          <div className={clsx('w-1 rounded-full opacity-70 shrink-0', badgeColor)} />
                          <div className="flex-1 min-w-0 pr-1 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <label
                                className={clsx(
                                  'relative inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border',
                                  'border-neutral-200 dark:border-neutral-700',
                                  'text-neutral-600 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-900/60',
                                  disabled && 'opacity-60'
                                )}
                                title="Change role"
                              >
                                <span className={clsx('w-1.5 h-1.5 rounded-full', badgeColor)} />
                                <span>{getPromptRoleLabel(block.role)}</span>
                                <Icon name="chevronDown" size={11} className="text-neutral-400 dark:text-neutral-500" />
                                <select
                                  value={block.role}
                                  disabled={disabled}
                                  onChange={(e) => {
                                    const nextRole = e.target.value || DEFAULT_PROMPT_ROLE;
                                    const nextBlocks = blocks.map((item) =>
                                      item.id === block.id ? { ...item, role: nextRole } : item
                                    );
                                    updateBlocks(nextBlocks);
                                  }}
                                  aria-label="Change block role"
                                  className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                                >
                                  {roleOptions.map((role) => (
                                    <option key={role} value={role}>
                                      {getPromptRoleLabel(role)}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <div className="ml-auto flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={disabled || index === 0}
                                  onClick={() => moveBlock(index, 'up')}
                                  title="Move block up"
                                  aria-label="Move block up"
                                  className="p-1 rounded text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-40"
                                >
                                  <Icon name="arrowUp" size={12} />
                                </button>
                                <button
                                  type="button"
                                  disabled={disabled || index === blocks.length - 1}
                                  onClick={() => moveBlock(index, 'down')}
                                  title="Move block down"
                                  aria-label="Move block down"
                                  className="p-1 rounded text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-40"
                                >
                                  <Icon name="arrowDown" size={12} />
                                </button>
                                <button
                                  type="button"
                                  disabled={disabled}
                                  onClick={() => removeBlock(block.id)}
                                  title="Remove block"
                                  aria-label="Remove block"
                                  className="p-1 rounded text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-40"
                                >
                                  <Icon name="trash2" size={12} />
                                </button>
                              </div>
                            </div>

                            <textarea
                              value={block.text}
                              disabled={disabled}
                              onChange={(e) => {
                                const nextText = e.target.value;
                                const nextBlocks = blocks.map((item) =>
                                  item.id === block.id ? { ...item, text: nextText } : item
                                );
                                updateBlocks(nextBlocks);
                              }}
                              placeholder="Block text..."
                              className={clsx(
                                'w-full rounded-md border px-2 py-1.5 text-sm bg-transparent outline-none',
                                'border-neutral-200/80 dark:border-neutral-700/80',
                                'focus:ring-2 focus:ring-blue-500/35',
                                'resize-y min-h-[64px]'
                              )}
                            />
                          </div>
                        </div>
                      </GroupedFold>
                    );
                  })}
                </div>
              </FoldGroup>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={addBlock}
                  className="text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
                >
                  Add block
                </button>
                <div className="ml-auto text-[10px] text-neutral-500 dark:text-neutral-400">
                  Blocks render as paragraphs
                </div>
              </div>
            </>
          )}

          {showCounter && typeof maxChars === 'number' && (
            <div className="text-xs flex justify-between items-center">
              {isOverLimit && (
                <span className="text-red-600 dark:text-red-400 font-medium">
                  Over limit by {Math.abs(remaining ?? 0)} chars
                </span>
              )}
              <span className={clsx(
                'tabular-nums ml-auto',
                isOverLimit ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-neutral-500'
              )}>
                {composedPrompt.length} / {maxChars}
              </span>
            </div>
          )}
        </div>
      )}

      <PromptHistoryPopover
        open={showHistory}
        onClose={() => setShowHistory(false)}
        anchor={historyTriggerRef.current}
        triggerRef={historyTriggerRef}
        timeline={historyTimeline}
        scopeLabel={historyScopeLabel}
        scopeValue={historyScopeValue}
        onScopeChange={onHistoryScopeChange}
        maxEntries={historyMaxEntries}
        onTogglePin={handleHistoryTogglePin}
        onPromote={handleHistoryPromote}
        promotingIndex={promotingHistoryIndex}
        promotionNotice={historyPromotionNotice}
        promotionError={historyPromotionError}
        onJumpTo={handleHistoryJump}
      />
    </div>
  );
}

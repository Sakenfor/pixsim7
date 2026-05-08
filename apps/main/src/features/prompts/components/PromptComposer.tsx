import type { PromptBlockLike } from '@pixsim7/core.prompt';
import {
  BASE_PROMPT_ROLES,
  DEFAULT_PROMPT_ROLE,
  composePromptFromBlocks,
  deriveBlocksFromCandidates,
  ensurePromptBlocks,
} from '@pixsim7/core.prompt';
import type { PromptBlockCandidate } from '@pixsim7/shared.types/prompt';
import {
  DropdownItem,
  DropdownDivider,
  FoldGroup,
  GroupedFold,
  Popover,
  PromptInput,
  PromptEditor,
  getViewportAwarePopupPosition,
} from '@pixsim7/shared.ui';
import clsx from 'clsx';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';

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
import { useOperatorVocabulary } from '../hooks/useOperatorVocabulary';
import { matchOperator, matchRecipe, useRelationRecipes } from '../hooks/useRelationRecipes';
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
import { operatorEditExtension, type OperatorRange } from '../lib/operatorEditExtension';
import { shadowAnalysisExtension } from '../lib/shadowAnalysisExtension';
import { shiftCandidates } from '../lib/shiftAnalysisPositions';
import { tagPillExtension } from '../lib/tagPillExtension';
import { useBlockTemplateStore } from '../stores/blockTemplateStore';
import { useMediaCompareTargetStore } from '../stores/mediaCompareTargetStore';
import { usePromptSettingsStore } from '../stores/promptSettingsStore';
import type { PromptTag } from '../types';


import { FloatingToolPanel } from './FloatingToolPanel';
import { InlineBlocksEditor } from './InlineBlocksEditor';
import { PromptGhostDiff, type GhostDiffSource } from './PromptGhostDiff';
import { PromptHistoryPopover } from './PromptHistoryPopover';
import { PromptToolsPanel, type PromptToolsApplyPayload } from './PromptToolsPanel';
import { OperatorEditPopover } from './OperatorEditPopover';
import {
  PromptCompareSideBySide,
  type CompareSource,
} from './PromptCompareSideBySide';
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

const REFERENCE_PICKER_WIDTH = 288;
const REFERENCE_PICKER_MAX_HEIGHT = 320;

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
  const setEditorEngine = usePromptSettingsStore((state) => state.setEditorEngine);
  const ghostDiffPrecision = usePromptSettingsStore((state) => state.ghostDiffPrecision);
  const setGhostDiffPrecision = usePromptSettingsStore(
    (state) => state.setGhostDiffPrecision,
  );
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

  // --- Operator edit popover (CM path) ---
  const [cmOperatorPopover, setCmOperatorPopover] = useState<{
    anchor: HTMLElement;
    operator: OperatorRange;
  } | null>(null);

  // --- Compare-button dropdown menu (chevron next to the compare-media button) ---
  const [compareMenuAnchor, setCompareMenuAnchor] = useState<HTMLElement | null>(null);
  // --- Side-by-side compare popover (opened from the dropdown) ---
  const [compareSideBySideAnchor, setCompareSideBySideAnchor] =
    useState<HTMLElement | null>(null);
  // --- Side-by-side per-column source selection — stable across opens ---
  const [leftCompareSourceId, setLeftCompareSourceId] = useState<string>('viewer');
  const [rightCompareSourceId, setRightCompareSourceId] = useState<string>('current');
  const operatorVocabulary = useOperatorVocabulary();
  const relationRecipes = useRelationRecipes();

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
  const [pointerOverMediaCard, setPointerOverMediaCard] = useState(false);
  /** Whether Shift is held — while held + in media-compare mode, hover overrides selection. */
  const [shiftHeld, setShiftHeld] = useState(false);
  const ghostStickyRef = useRef(false);
  ghostStickyRef.current = ghostSticky;
  const ghostCompareOffsetRef = useRef(1);
  ghostCompareOffsetRef.current = ghostCompareOffset;
  const ghostClearTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const referencePickerContainerRef = useRef<HTMLDivElement>(null);
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
  const [referenceAnchor, setReferenceAnchor] = useState<CSSProperties | null>(null);
  useEffect(() => {
    if (!referenceInput.active || referenceInput.triggerPos < 0) {
      setReferenceAnchor(null);
      return;
    }
    const textarea = promptTextareaRef.current;
    const container = referencePickerContainerRef.current;
    if (!textarea || !container) {
      setReferenceAnchor(null);
      return;
    }

    const coords = getTextareaCaretCoords(textarea, referenceInput.triggerPos);
    const textareaRect = textarea.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const caretRect = new DOMRect(
      textareaRect.left + coords.left,
      textareaRect.top + coords.top,
      1,
      coords.height,
    );

    const { style } = getViewportAwarePopupPosition({
      anchorRect: caretRect,
      containerRect,
      popupWidth: REFERENCE_PICKER_WIDTH,
      popupMaxHeight: REFERENCE_PICKER_MAX_HEIGHT,
      preferredPlacement: 'bottom',
      offset: 4,
      viewportMargin: 8,
    });
    setReferenceAnchor(style);
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

  const flushSnapshot = useCallback(() => {
    clearTimeout(undoDebounceRef.current);
    history.snapshot(valueRef.current);
  }, [history]);

  const applyGhostRangeReplacement = useCallback(
    (payload: { from: number; to: number; replaceWith: string }) => {
      const current = valueRef.current;
      const safeFrom = Math.max(0, Math.min(current.length, payload.from));
      const safeTo = Math.max(safeFrom, Math.min(current.length, payload.to));
      const next =
        current.slice(0, safeFrom) +
        payload.replaceWith +
        current.slice(safeTo);

      onChangeRef.current(next);

      const caret = safeFrom + payload.replaceWith.length;
      requestAnimationFrame(() => {
        const textarea = promptTextareaRef.current;
        if (!textarea) return;
        textarea.focus();
        try {
          textarea.setSelectionRange(caret, caret);
        } catch {
          // No-op: best-effort caret placement.
        }
      });
    },
    [],
  );

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

  // --- Compare side-by-side source list (only built when the popover is open) ---
  const compareSources = useMemo<CompareSource[]>(() => {
    if (!compareSideBySideAnchor) return [];
    const list: CompareSource[] = [
      { id: 'current', label: 'Current prompt', text: value },
    ];
    if (selectionAssetPrompt) {
      list.push({ id: 'viewer', label: 'Viewer selection', text: selectionAssetPrompt });
    }
    if (pinnedAssetPrompt) {
      list.push({ id: 'pinned', label: 'Pinned card', text: pinnedAssetPrompt });
    }
    if (peekingHover && hoverAssetPrompt) {
      list.push({ id: 'hovered', label: 'Hovered card', text: hoverAssetPrompt });
    }
    const tl = history.getTimeline();
    const maxBack = Math.min(5, tl.currentIndex);
    for (let i = 1; i <= maxBack; i += 1) {
      const text = tl.entries[tl.currentIndex - i] ?? '';
      list.push({ id: `history-${i}`, label: `History −${i}`, text });
    }
    return list;
  }, [
    compareSideBySideAnchor,
    value,
    selectionAssetPrompt,
    pinnedAssetPrompt,
    hoverAssetPrompt,
    peekingHover,
    history,
  ]);

  // When the popover opens (or the available sources change underneath us),
  // make sure the selected ids still resolve. Fall back to the first non-current
  // source for the left side, and 'current' for the right.
  useEffect(() => {
    if (!compareSideBySideAnchor || compareSources.length === 0) return;
    const ids = new Set(compareSources.map((s) => s.id));
    if (!ids.has(leftCompareSourceId)) {
      const fallback =
        compareSources.find((s) => s.id !== 'current' && s.text) ??
        compareSources[0];
      setLeftCompareSourceId(fallback.id);
    }
    if (!ids.has(rightCompareSourceId)) {
      setRightCompareSourceId('current');
    }
  }, [compareSideBySideAnchor, compareSources, leftCompareSourceId, rightCompareSourceId]);
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
  // Diff precision is a user-controlled setting (toolbar dropdown) so both
  // history-sticky and media-compare diffs stay stable as the cursor moves.
  const cmGhostConfig: GhostDiffConfig | null = ghostSource
    ? {
        comparisonText: ghostSource.comparisonText,
        stepDistance: ghostSource.stepDistance,
        precision: ghostDiffPrecision,
      }
    : null;
  // Freshness guard: while the user is typing, the doc has shifted but the
  // analysis hasn't re-run yet — positions are stale and drift compounds
  // further down the doc. Clear them when the analyzed core doesn't match
  // the current trimmed value.
  //
  // Position frames (these differ between the two payloads — the backend
  // analyzer strips text before invoking the analyser, but `_tokenize_prompt`
  // runs on the original text):
  //   - candidates: positions are relative to `value.trim()` (analyser side)
  //   - tokens.lines: positions are relative to the ORIGINAL value
  //                   (tokeniser side) — already include leading-ws offset
  //
  // So we shift candidates by `leadingShift`, but leave tokens.lines alone.
  // We don't bail out for leading whitespace — the side panel doesn't and
  // it's right not to: as long as the trimmed core matches, both payloads
  // are valid for the current doc.
  const shadowResultIsFresh =
    !!shadowAnalysis.result &&
    shadowAnalysis.result.analyzedPrompt === value.trim();
  const leadingShift = value.length - value.trimStart().length;
  const cmShadowCandidates = useMemo(
    () => {
      if (!useCodemirror || !showShadow || !autoAnalyze || !shadowResultIsFresh) {
        return EMPTY_SHADOW_CANDIDATES;
      }
      const raw = shadowAnalysis.result?.candidates ?? EMPTY_SHADOW_CANDIDATES;
      return leadingShift === 0 ? raw : shiftCandidates(raw, leadingShift);
    },
    [
      useCodemirror,
      showShadow,
      autoAnalyze,
      shadowResultIsFresh,
      shadowAnalysis.result?.candidates,
      leadingShift,
    ],
  );
  const cmShadowTokenLines = useMemo(
    () => {
      if (!useCodemirror || !showShadow || !autoAnalyze || !shadowResultIsFresh) {
        return undefined;
      }
      // tokens are already in original-text frame; no shift needed.
      return shadowAnalysis.result?.tokens?.lines;
    },
    [
      useCodemirror,
      showShadow,
      autoAnalyze,
      shadowResultIsFresh,
      shadowAnalysis.result?.tokens,
    ],
  );
  const cmExtensions = useMemo(
    () => {
      const exts = [
        ghostDiffExtension(cmGhostConfig, {
          onSuppress: setGhostSuppressed,
          onRemovedSegments: setGhostRemoved,
        }),
        cmRefInput.extension,
        tagPillExtension(),
        operatorEditExtension(cmShadowTokenLines, {
          onOperatorClick: (operator, anchor) => {
            setCmOperatorPopover({ operator, anchor });
          },
        }),
      ];
      // Install when either role candidates or structural token lines are
      // present — token lines alone (no role matches) still give us
      // header/relation line decorations.
      if (cmShadowCandidates.length > 0 || (cmShadowTokenLines && cmShadowTokenLines.length > 0)) {
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
            title="Composer settings"
            className="inline-flex items-center gap-1 px-1.5 py-1 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <Icon name="settings" size={14} />
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
            className="min-w-[180px] rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl p-1"
          >
            <div className="px-2 pt-1 pb-0.5 text-[10px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
              View
            </div>
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
            <div className="px-2 pt-1 pb-0.5 text-[10px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
              Editor
            </div>
            <DropdownItem
              icon={<Icon name="sparkles" size={14} />}
              rightSlot={editorEngine === 'codemirror' ? <Icon name="check" size={12} /> : undefined}
              onClick={() => {
                setEditorEngine('codemirror');
                setShowLayoutMenu(false);
              }}
            >
              CodeMirror
            </DropdownItem>
            <DropdownItem
              icon={<Icon name="fileText" size={14} />}
              rightSlot={editorEngine === 'textarea' ? <Icon name="check" size={12} /> : undefined}
              onClick={() => {
                setEditorEngine('textarea');
                setShowLayoutMenu(false);
              }}
            >
              Classic textarea
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

        <div className="flex items-stretch">
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              // Toggle current active mode off if any; otherwise turn on media compare.
              if (ghostSticky) {
                setGhostSticky(false);
                clearTimeout(ghostClearTimerRef.current);
                setGhostSource(null);
                return;
              }
              if (compareAgainstMedia) {
                setCompareAgainstMedia(false);
                setGhostSource(null);
                return;
              }
              setCompareAgainstMedia(true);
              clearTimeout(ghostClearTimerRef.current);
              // source syncs via useEffect watching activeAssetPrompt
            }}
            onWheel={(e) => {
              if (!ghostSticky) return;
              e.preventDefault();
              const tl = history.getTimeline();
              const maxOffset = tl.currentIndex;
              if (maxOffset < 1) return;
              const delta = e.deltaY > 0 ? 1 : -1;
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
                : compareAgainstMedia
                  ? ghostSuppressed
                    ? `Diff too large - prompts too different (${comparisonSourceLabel ?? 'no target'})`
                    : peekingHover
                      ? 'Peeking hovered asset (release Shift to return to pinned/selection target)'
                      : activeAssetPrompt
                        ? hasPinnedCompareTarget
                          ? 'Comparing vs pinned media card - hold Shift to peek hovered, Shift+click another card to repin'
                          : `Comparing vs ${comparisonSourceLabel} - hold Shift to peek hovered`
                        : 'Compare mode on - waiting for a target (hold Shift + hover, or Shift+click a media card)'
                  : 'Compare prompt vs viewer media (Shift+hover peeks, Shift+click pins; chevron picks history step)'
            }
            className={clsx(
              'p-1 rounded-l transition-colors relative',
              ghostSticky
                ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                : compareAgainstMedia
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
            <Icon
              name={
                ghostSticky
                  ? 'layers'
                  : activeAssetType === 'video'
                    ? 'video'
                    : 'image'
              }
              size={14}
            />
            {ghostSticky && ghostCompareOffset > 1 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-green-600 dark:bg-green-500 text-white text-[8px] font-bold leading-none px-0.5">
                {ghostCompareOffset}
              </span>
            )}
            {!ghostSticky && compareAgainstMedia && ghostSuppressed && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-500" />
            )}
            {!ghostSticky && compareAgainstMedia && !ghostSuppressed && canPeekHoveredAsset && !shiftHeld && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-violet-500/60" title="Hold Shift to peek" />
            )}
            {((ghostSticky && ghostRemoved.length > 0) ||
              (!ghostSticky && compareAgainstMedia && !ghostSuppressed && ghostRemoved.length > 0)) && (
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
            onClick={(event) => {
              setCompareMenuAnchor(
                compareMenuAnchor ? null : event.currentTarget,
              );
            }}
            title="Compare options"
            className={clsx(
              'pl-0.5 pr-1 py-1 rounded-r transition-colors border-l border-black/10 dark:border-white/10',
              compareMenuAnchor
                ? 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200'
                : ghostSticky
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
                  : compareAgainstMedia
                    ? ghostSuppressed
                      ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50'
                      : peekingHover
                        ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 hover:bg-violet-200 dark:hover:bg-violet-900/50'
                        : activeAssetPrompt
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50'
                          : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-300 dark:hover:bg-neutral-600'
                    : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800',
            )}
          >
            <Icon name="chevron-down" size={10} />
          </button>
        </div>

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
              ref={referencePickerContainerRef}
              className="relative flex flex-col flex-1 min-w-0"
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
                className="absolute w-72 max-h-[320px] overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl ring-1 ring-black/5 dark:ring-white/5 z-float-overlay-popover"
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
              <Popover
                anchor={cmOperatorPopover?.anchor ?? null}
                placement="bottom"
                align="start"
                offset={6}
                open={!!cmOperatorPopover}
                onClose={() => setCmOperatorPopover(null)}
              >
                {cmOperatorPopover && (() => {
                  const op = cmOperatorPopover.operator;
                  const recipe = matchRecipe(relationRecipes.recipes, {
                    line_kind: op.context,
                    prev_kind: op.prevKind,
                    next_kind: op.nextKind,
                  });
                  // Match by raw op so `===>` finds the `>` entry via the
                  // last-char fallback inside matchOperator.
                  const recipeOp = matchOperator(recipe, op.raw);
                  return (
                    <OperatorEditPopover
                      operator={op}
                      swapTargets={operatorVocabulary.swapTargets}
                      maxRunLength={operatorVocabulary.maxRunLength}
                      recipe={recipe}
                      recipeOp={recipeOp}
                      onCancel={() => setCmOperatorPopover(null)}
                      onApply={(newOp, newRun) => {
                        const view = promptEditorRef.current;
                        if (view) {
                          view.dispatch({
                            changes: {
                              from: op.from,
                              to: op.to,
                              insert: newOp.repeat(newRun),
                            },
                          });
                        }
                        setCmOperatorPopover(null);
                      }}
                    />
                  );
                })()}
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
            ref={referencePickerContainerRef}
            className="relative flex flex-col flex-1 min-h-0"
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
              onReplaceRange={applyGhostRangeReplacement}
            />
            <ReferencePicker
              ref={referencePickerRef}
              visible={referenceInput.active && referenceAnchor !== null}
              query={referenceInput.query}
              items={references.items}
              onSelect={handleReferenceSelect}
              onClose={referenceInput.dismiss}
              disallowedTypes={['plan', 'world', 'project']}
              className="absolute w-72 max-h-[320px] overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl ring-1 ring-black/5 dark:ring-white/5 z-float-overlay-popover"
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

      <Popover
        anchor={compareMenuAnchor}
        placement="bottom"
        align="end"
        offset={6}
        open={!!compareMenuAnchor}
        onClose={() => setCompareMenuAnchor(null)}
        className="min-w-[240px] rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl p-1"
      >
        <div className="px-2 pt-1 pb-0.5 text-[10px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
          Compare vs
        </div>
        <DropdownItem
          icon={<Icon name={activeAssetType === 'video' ? 'video' : 'image'} size={14} />}
          rightSlot={compareAgainstMedia ? <Icon name="check" size={12} /> : undefined}
          onClick={() => {
            // Toggle: if media-compare is the active mode, turn it off; otherwise enable.
            if (compareAgainstMedia) {
              setCompareAgainstMedia(false);
              setGhostSource(null);
            } else {
              setGhostSticky(false);
              clearTimeout(ghostClearTimerRef.current);
              setCompareAgainstMedia(true);
            }
            setCompareMenuAnchor(null);
          }}
        >
          Viewer media
        </DropdownItem>
        {(() => {
          const tl = history.getTimeline();
          const maxBack = Math.min(5, tl.currentIndex);
          if (maxBack < 1) return null;
          const items: React.ReactNode[] = [];
          for (let i = 1; i <= maxBack; i += 1) {
            const isActive = ghostSticky && ghostCompareOffset === i;
            items.push(
              <DropdownItem
                key={`history-${i}`}
                icon={<Icon name="layers" size={14} />}
                rightSlot={isActive ? <Icon name="check" size={12} /> : undefined}
                onClick={() => {
                  if (isActive) {
                    setGhostSticky(false);
                    clearTimeout(ghostClearTimerRef.current);
                    setGhostSource(null);
                  } else {
                    setCompareAgainstMedia(false);
                    flushSnapshot();
                    setGhostSticky(true);
                    setGhostCompareOffset(i);
                    applyStickyGhost(i);
                  }
                  setCompareMenuAnchor(null);
                }}
              >
                {`History −${i}`}
              </DropdownItem>,
            );
          }
          return items;
        })()}
        {(compareAgainstMedia || ghostSticky) && (
          <DropdownItem
            icon={<Icon name="x" size={14} />}
            onClick={() => {
              setCompareAgainstMedia(false);
              setGhostSticky(false);
              clearTimeout(ghostClearTimerRef.current);
              setGhostSource(null);
              setCompareMenuAnchor(null);
            }}
          >
            Off
          </DropdownItem>
        )}
        <DropdownDivider />
        <DropdownItem
          icon={<Icon name="columns" size={14} />}
          onClick={() => {
            setCompareSideBySideAnchor(compareMenuAnchor);
            setCompareMenuAnchor(null);
          }}
        >
          Open side-by-side view
        </DropdownItem>
        <DropdownDivider />
        <div className="px-2 pt-1 pb-0.5 text-[10px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
          Diff precision
        </div>
        <DropdownItem
          rightSlot={ghostDiffPrecision === 'coarse' ? <Icon name="check" size={12} /> : undefined}
          onClick={() => {
            setGhostDiffPrecision('coarse');
            setCompareMenuAnchor(null);
          }}
        >
          Coarse (clauses)
        </DropdownItem>
        <DropdownItem
          rightSlot={ghostDiffPrecision === 'fine' ? <Icon name="check" size={12} /> : undefined}
          onClick={() => {
            setGhostDiffPrecision('fine');
            setCompareMenuAnchor(null);
          }}
        >
          Fine (words)
        </DropdownItem>
      </Popover>

      <Popover
        anchor={compareSideBySideAnchor}
        placement="bottom"
        align="end"
        offset={6}
        open={!!compareSideBySideAnchor}
        onClose={() => setCompareSideBySideAnchor(null)}
      >
        {compareSideBySideAnchor && (
          <PromptCompareSideBySide
            sources={compareSources}
            leftSourceId={leftCompareSourceId}
            rightSourceId={rightCompareSourceId}
            onChangeLeftSource={setLeftCompareSourceId}
            onChangeRightSource={setRightCompareSourceId}
            precision={ghostDiffPrecision}
          />
        )}
      </Popover>
    </div>
  );
}

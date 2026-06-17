/**
 * Pill-skin rendering for the generation button group.
 *
 * Translates skin-agnostic GenerationAction descriptors (from
 * useGenerationButtonGroup) into `ButtonGroupItem`s for <ButtonGroup> and
 * renders the four expand popovers (slot picker, extend menu, regenerate
 * menu, style variations).
 *
 * A future alternate skin (e.g. cube) consumes the same actions and provides
 * its own renderer bundle.
 */

import {
  ActionHintBadge,
  BurstTrackOverlay,
  DropdownItem,
  DropdownDivider,
  Popover,
  useBurstGesture,
  Z,
  type ButtonGroupItem,
} from '@pixsim7/shared.ui';
import clsx from 'clsx';
import React from 'react';


import { Icon } from '@lib/icons';

import { SlotPickerGrid } from './SlotPicker';
import { SourceAssetsPreview } from './SourceAssetsPreview';
import type {
  GenerationAction,
  GenerationActionExpand,
  GenerationProviderMenuState,
} from './useGenerationButtonGroup';
import { getGenerationProviderAccent, BURST_STEPS } from './useGenerationButtonGroup';

type SeedModeAction = {
  onClick: () => void;
  icon: React.ComponentProps<typeof Icon>['name'];
  label: string;
  title: string;
  disabled: boolean;
};

function orderSeedModeActions(
  primaryMode: 'default' | 'reuse-source-seed',
  defaultAction: SeedModeAction,
  reuseAction: SeedModeAction,
): [SeedModeAction, SeedModeAction] {
  void primaryMode;
  // Keep menu option placement stable so users build muscle memory.
  return [defaultAction, reuseAction];
}

// ─────────────────────────────────────────────────────────────────────────────
// Expand-content renderers (keyed by expand.kind)
// ─────────────────────────────────────────────────────────────────────────────

function SlotPickerExpand({ expand }: { expand: Extract<GenerationActionExpand, { kind: 'slot-picker' }> }) {
  return (
    <SlotPickerGrid
      asset={expand.asset}
      operationType={expand.operationType}
      onSelectSlot={expand.onSelectSlot}
      maxSlots={expand.maxSlots}
      inputScopeId={expand.inputScopeId}
    />
  );
}

function ExtendMenuExpand({ expand }: { expand: Extract<GenerationActionExpand, { kind: 'extend-menu' }> }) {
  const {
    promptSource,
    setPromptSource,
    onNativeExtend,
    onArtificialFirst,
    onArtificialLast,
    onArtificialCurrent,
    hasSelectedFrame,
    currentFrameTitle,
    artificialLastTitle,
    isExtending,
  } = expand;
  return (
    <div className="flex flex-col rounded-xl bg-accent/95 backdrop-blur-sm shadow-2xl w-44">
      {/* Prompt source toggle (applies to Native + Artificial below) */}
      <div className="px-3 pt-2 pb-1 text-[9px] font-semibold uppercase tracking-wider text-white/60">
        Prompt
      </div>
      <div className="flex flex-row gap-0.5 px-1">
        <button
          onClick={() => setPromptSource('same')}
          className={`flex-1 h-6 text-[11px] rounded-md transition-colors ${
            promptSource === 'same'
              ? 'bg-white/25 text-white font-medium'
              : 'text-white/80 hover:bg-white/10'
          }`}
          title="Use the original generation's prompt"
          type="button"
        >
          Same
        </button>
        <button
          onClick={() => setPromptSource('active')}
          className={`flex-1 h-6 text-[11px] rounded-md transition-colors ${
            promptSource === 'active'
              ? 'bg-white/25 text-white font-medium'
              : 'text-white/80 hover:bg-white/10'
          }`}
          title="Use the prompt currently in the generation widget"
          type="button"
        >
          Active
        </button>
      </div>

      {/* Native extend */}
      <div className="h-px bg-white/15 mx-2 mt-2" />
      <button
        onClick={onNativeExtend}
        className="h-8 px-3 text-xs text-white hover:bg-white/15 transition-colors flex items-center gap-2"
        title="Use the provider's native video-extend"
        disabled={isExtending}
        type="button"
      >
        <Icon name="arrowRight" size={12} />
        <span>Extend</span>
      </button>

      {/* Artificial extend (image-to-video from frame). Frames are extracted
          locally via ffmpeg, so this works even when the provider's native
          last-frame URL is missing. Moderation may still reject the re-upload
          — the runtime toast surfaces that. */}
      <div className="h-px bg-white/15 mx-2" />
      <div className="px-3 pt-1 pb-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/60 flex items-center gap-1.5">
        <Icon name="film" size={10} />
        <span>Artificial (i2v)</span>
      </div>
      <div className="flex flex-row gap-0.5 p-1 rounded-b-xl">
        <button
          onClick={onArtificialFirst}
          className="flex-1 h-7 text-[11px] text-white hover:bg-white/15 rounded-md transition-colors"
          title="Extract the first frame and run image-to-video"
          disabled={isExtending}
          type="button"
        >
          First
        </button>
        <button
          onClick={onArtificialLast}
          className="flex-1 h-7 text-[11px] text-white hover:bg-white/15 rounded-md transition-colors"
          title={artificialLastTitle}
          disabled={isExtending}
          type="button"
        >
          Last
        </button>
        <button
          onClick={onArtificialCurrent}
          className="flex-1 h-7 text-[11px] text-white hover:bg-white/15 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title={currentFrameTitle}
          disabled={isExtending || !hasSelectedFrame}
          type="button"
        >
          Current
        </button>
      </div>
    </div>
  );
}

function QuickGenerateMenuExpand({ expand }: { expand: Extract<GenerationActionExpand, { kind: 'quick-generate-menu' }> }) {
  const {
    onQuickGenerateCurrent,
    onQuickGenerateReuseSeed,
    primaryMode,
    hasSourceGenerationContext,
  } = expand;
  // Non-blocking: these rows fire-and-forget, so they stay enabled for rapid
  // re-fires (no in-flight disable / spinner). Only "Reuse Seed" gates on the
  // asset actually having a source generation context.
  const [firstAction, secondAction] = orderSeedModeActions(
    primaryMode,
    {
      onClick: onQuickGenerateCurrent,
      icon: 'sparkles',
      label: 'Generate',
      title: 'Quick generate with current widget settings',
      disabled: false,
    },
    {
      onClick: onQuickGenerateReuseSeed,
      icon: 'hash',
      label: 'Reuse Seed',
      title: hasSourceGenerationContext
        ? 'Quick generate and override seed with the source generation seed'
        : 'No source generation context available for this asset',
      disabled: !hasSourceGenerationContext,
    },
  );
  return (
    <div className="flex flex-col rounded-xl bg-accent/95 backdrop-blur-sm shadow-2xl">
      <MenuRow
        icon={firstAction.icon}
        label={firstAction.label}
        title={firstAction.title}
        onClick={firstAction.onClick}
        disabled={firstAction.disabled}
        rounded="top"
        burst={{ steps: BURST_STEPS, onFire: onQuickGenerateCurrent }}
      />
      <div className="h-px bg-white/15 mx-2" />
      <MenuRow
        icon={secondAction.icon}
        label={secondAction.label}
        title={secondAction.title}
        onClick={secondAction.onClick}
        disabled={secondAction.disabled}
        rounded="bottom"
        burst={{ steps: BURST_STEPS, onFire: onQuickGenerateReuseSeed }}
      />
    </div>
  );
}

const MENU_SECTION_CLASS =
  'px-3 pt-2 pb-1 text-[9px] font-semibold uppercase tracking-wider text-white/60';

function MenuRow({
  icon,
  label,
  title,
  onClick,
  disabled,
  busy,
  rounded,
  burst,
}: {
  icon: React.ComponentProps<typeof Icon>['name'];
  label: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  rounded?: 'top' | 'bottom';
  /** When set, the row becomes a horizontal burst slider (drag right = fire N). */
  burst?: { steps: number[]; onFire: (count: number) => void };
}) {
  const gesture = useBurstGesture({
    steps: burst?.steps ?? BURST_STEPS,
    onFire: burst?.onFire ?? (() => {}),
    orientation: 'horizontal',
    disabled: !burst || disabled,
  });
  return (
    <button
      ref={burst ? gesture.buttonRef : undefined}
      onClick={() => { if (!gesture.shouldSwallowClick()) onClick(); }}
      {...(burst ? gesture.pointerHandlers : {})}
      className={clsx(
        'relative w-44 h-8 px-3 text-xs text-white hover:bg-white/15 transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed',
        rounded === 'top' ? 'rounded-t-xl' : rounded === 'bottom' ? 'rounded-b-xl' : '',
        burst && 'touch-none select-none',
      )}
      title={burst ? `${title}\nDrag → to burst-fire (further = more, ← back to cancel)` : title}
      disabled={disabled}
      type="button"
    >
      <Icon name={busy ? 'loader' : icon} size={12} className={busy ? 'animate-spin' : ''} />
      <span>{label}</span>
      {burst && <BurstTrackOverlay state={gesture} />}
    </button>
  );
}

/**
 * "Target" row that expands a submenu to the side to pick the active Quick Gen
 * surface. The trigger + submenu share one relative container so moving the
 * pointer from row into the (flush, left-full) submenu never leaves the
 * container — no flicker, no need for hover-bridge timers.
 */
function TargetSubmenuRow({
  surfaces,
  activeTargetWidgetId,
  onSetTarget,
  rounded,
}: {
  surfaces: { widgetId: string; label: string; isLive: boolean }[];
  activeTargetWidgetId: string | null;
  onSetTarget: (widgetId: string | null) => void;
  rounded?: 'bottom';
}) {
  const [open, setOpen] = React.useState(false);
  const activeLabel = activeTargetWidgetId
    ? surfaces.find((s) => s.widgetId === activeTargetWidgetId)?.label ?? 'Custom'
    : 'Auto';
  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className={`w-44 h-8 px-3 text-xs text-white hover:bg-white/15 transition-colors flex items-center gap-2 ${
          rounded === 'bottom' ? 'rounded-b-xl' : ''
        }`}
        title="Choose which Quick Gen surface all actions target"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Icon name="target" size={12} />
        <span className="flex-1 text-left truncate">{activeLabel}</span>
        <Icon name="chevronRight" size={12} />
      </button>
      {open && (
        <div className="absolute left-full top-0 z-10 flex flex-col rounded-xl bg-accent/95 backdrop-blur-sm shadow-2xl">
          <MenuRow
            icon={activeTargetWidgetId === null ? 'check' : 'radio'}
            label="Auto"
            title="Let the app pick the active Quick Gen surface (default)"
            onClick={() => { onSetTarget(null); setOpen(false); }}
            rounded="top"
          />
          {surfaces.map((surface, i) => (
            <MenuRow
              key={surface.widgetId}
              icon={activeTargetWidgetId === surface.widgetId ? 'check' : 'radio'}
              label={surface.label}
              title={`Send all actions to ${surface.label}${surface.isLive ? '' : ' (opens it)'}`}
              onClick={() => { onSetTarget(surface.widgetId); setOpen(false); }}
              rounded={i === surfaces.length - 1 ? 'bottom' : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RegenerateMenuExpand({ expand }: { expand: Extract<GenerationActionExpand, { kind: 'regenerate-menu' }> }) {
  const {
    assetAcceptsInput,
    assetId,
    operationType,
    isLoadingSource,
    isInsertingPrompt,
    isInsertingSeed,
    isInsertingAssets,
    primarySeedMode,
    insertPromptTitle,
    insertSeedTitle,
    insertAssetsTitle,
    showInsertAssets,
    onRegenerateDefault,
    onRegenerateReuseSeed,
    onRegenerateBurstDefault,
    onRegenerateBurstReuseSeed,
    onLoadToQuickGen,
    onLoadToQuickGenNoSeed,
    onInsertPrompt,
    onInsertSeed,
    onInsertAssets,
    onOpenSourceAsset,
    targetSurfaces,
    activeTargetWidgetId,
    onSetTarget,
  } = expand;
  // Non-blocking: the re-fire rows stay enabled and never show a busy spinner
  // so they can be spammed as fast as the pill button itself.
  const [firstSeedAction, secondSeedAction] = orderSeedModeActions(
    primarySeedMode,
    {
      onClick: onRegenerateDefault,
      icon: 'rotateCcw',
      label: 'Regenerate (fresh seed)',
      title: 'Regenerate with a fresh random seed',
      disabled: false,
    },
    {
      onClick: onRegenerateReuseSeed,
      icon: 'hash',
      label: 'Reuse source seed',
      title: 'Regenerate with the source generation seed',
      disabled: false,
    },
  );
  return (
    <div className="flex flex-col rounded-xl bg-accent/95 backdrop-blur-sm shadow-2xl">
      {/* Re-run now — submits a new generation */}
      <div className={MENU_SECTION_CLASS}>Regenerate</div>
      <MenuRow
        icon={firstSeedAction.icon}
        label={firstSeedAction.label}
        title={firstSeedAction.title}
        onClick={firstSeedAction.onClick}
        disabled={firstSeedAction.disabled}
        rounded="top"
        burst={{ steps: BURST_STEPS, onFire: onRegenerateBurstDefault }}
      />
      <MenuRow
        icon={secondSeedAction.icon}
        label={secondSeedAction.label}
        title={secondSeedAction.title}
        onClick={secondSeedAction.onClick}
        disabled={secondSeedAction.disabled}
        burst={{ steps: BURST_STEPS, onFire: onRegenerateBurstReuseSeed }}
      />

      {/* Insert a single piece into the active widget — no submit */}
      <div className={MENU_SECTION_CLASS}>Insert into widget</div>
      <MenuRow
        icon="fileText"
        label="Prompt"
        title={insertPromptTitle}
        onClick={onInsertPrompt}
        disabled={isInsertingPrompt}
        busy={isInsertingPrompt}
      />
      <MenuRow
        icon="hash"
        label="Seed"
        title={insertSeedTitle}
        onClick={onInsertSeed}
        disabled={isInsertingSeed}
        busy={isInsertingSeed}
      />
      {showInsertAssets && (
        <MenuRow
          icon="layers"
          label="Load asset inputs"
          title={insertAssetsTitle}
          onClick={onInsertAssets}
          disabled={isInsertingAssets}
          busy={isInsertingAssets}
        />
      )}

      {/* Load everything into Quick Generate — no submit */}
      <div className={MENU_SECTION_CLASS}>Load everything</div>
      <MenuRow
        icon="edit"
        label="Load to Quick Gen"
        title="Load everything into Quick Generate"
        onClick={onLoadToQuickGen}
        disabled={isLoadingSource}
        busy={isLoadingSource}
      />
      <MenuRow
        icon="shuffle"
        label="…without seed"
        title="Load to Quick Gen without seed (random seed on next generate)"
        onClick={onLoadToQuickGenNoSeed}
        disabled={isLoadingSource}
        busy={isLoadingSource}
        rounded={targetSurfaces.length === 0 && !assetAcceptsInput ? 'bottom' : undefined}
      />

      {/* Target — one row that expands to the side to pick the active surface;
          every action above binds to the selection. */}
      {targetSurfaces.length > 0 && (
        <>
          <div className={MENU_SECTION_CLASS}>Target</div>
          <TargetSubmenuRow
            surfaces={targetSurfaces}
            activeTargetWidgetId={activeTargetWidgetId}
            onSetTarget={onSetTarget}
            rounded={assetAcceptsInput ? undefined : 'bottom'}
          />
        </>
      )}

      {assetAcceptsInput && (
        <SourceAssetsPreview
          assetId={assetId}
          operationType={operationType}
          onOpenAsset={onOpenSourceAsset}
        />
      )}
    </div>
  );
}

function StyleVariationsExpand({ expand }: { expand: Extract<GenerationActionExpand, { kind: 'style-variations' }> }) {
  const { isGenerating, categories, activeCategory, blocks, onSelectCategory, onPickPreset, onSweepCategory } = expand;
  const activeLabel = categories.find((c) => c.id === activeCategory)?.label ?? 'Style';
  const presetCount = blocks?.length ?? null;
  const sweepInfo =
    `Submits one generation per ${activeLabel} preset shown` +
    `${presetCount !== null ? ` (${presetCount})` : ''}. ` +
    `Each reuses this asset's source generation — same model, inputs, and prompt — ` +
    `with the style text appended and a fresh random seed.`;
  return (
    <div className="flex flex-col rounded-xl bg-accent/95 backdrop-blur-sm shadow-2xl w-48 max-h-72 overflow-hidden">
      {/* Style dimension tabs */}
      <div className="flex flex-row flex-wrap gap-0.5 p-1 rounded-t-xl">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => onSelectCategory(cat.id)}
            className={`px-2 h-6 text-[10px] rounded-md transition-colors ${
              cat.id === activeCategory
                ? 'bg-white/25 text-white font-medium'
                : 'text-white/70 hover:bg-white/10'
            }`}
            title={`Show ${cat.label} presets`}
            type="button"
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Sweep every preset in the active dimension */}
      <div className="h-px bg-white/15 mx-2" />
      <div className="flex items-center pr-1">
        <button
          onClick={onSweepCategory}
          className="flex-1 h-8 px-3 text-xs text-white hover:bg-white/15 transition-colors flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          title={`Generate one variation per ${activeLabel} preset`}
          disabled={isGenerating}
          type="button"
        >
          <Icon name={isGenerating ? 'loader' : 'palette'} size={12} className={isGenerating ? 'animate-spin' : ''} />
          <span>Sweep all {activeLabel}</span>
          {presetCount !== null && <span className="text-white/60">({presetCount})</span>}
        </button>
        {/* Always-present info affordance (independent of count). */}
        <span
          className="shrink-0 px-1 text-white/45 hover:text-white/80 cursor-help transition-colors"
          title={sweepInfo}
        >
          <Icon name="info" size={12} />
        </span>
      </div>

      {/* Individual presets for the active dimension */}
      <div className="h-px bg-white/15 mx-2" />
      <div className="flex flex-col overflow-y-auto">
        {!blocks ? (
          <div className="h-8 flex items-center justify-center">
            <Icon name="loader" size={12} className="animate-spin text-white/40" />
          </div>
        ) : blocks.length === 0 ? (
          <div className="h-8 px-3 text-xs text-white/40 flex items-center">
            No {activeLabel.toLowerCase()} presets
          </div>
        ) : (
          blocks.map((block) => {
            const label = block.block_id.split('.').pop()?.replace(/_/g, ' ') ?? block.block_id;
            return (
              <button
                key={block.block_id}
                onClick={() => onPickPreset(block.block_id)}
                className="h-8 px-3 text-xs text-white hover:bg-white/15 transition-colors flex items-center gap-2 last:rounded-b-xl capitalize"
                title={block.text}
                disabled={isGenerating}
                type="button"
              >
                <Icon name="sparkles" size={10} />
                <span className="truncate">{label}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function renderPillExpand(expand: GenerationActionExpand): React.ReactNode {
  switch (expand.kind) {
    case 'slot-picker':
      return <SlotPickerExpand expand={expand} />;
    case 'extend-menu':
      return <ExtendMenuExpand expand={expand} />;
    case 'quick-generate-menu':
      return <QuickGenerateMenuExpand expand={expand} />;
    case 'regenerate-menu':
      return <RegenerateMenuExpand expand={expand} />;
    case 'style-variations':
      return <StyleVariationsExpand expand={expand} />;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-action icon/badge resolution (pill-specific visual choices)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Numeric corner badge showing how many submits for this action are currently
 * in flight (rapid regenerate / quick-gen spam). Takes priority over the
 * semantic badge hint when present.
 */
function renderCountBadge(count: number): React.ReactNode {
  return (
    <span
      className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-white text-accent text-[9px] font-bold leading-[15px] text-center pointer-events-none shadow ring-1 ring-accent/30"
    >
      {count > 9 ? '9+' : count}
    </span>
  );
}

function renderPillBadge(hint: GenerationAction['badgeHint']): React.ReactNode | undefined {
  if (!hint) return undefined;
  switch (hint) {
    case 'mode-switch':
    case 'replace-or-mode':
      return <ActionHintBadge icon={<Icon name="refresh-cw" size={7} color="#fff" />} />;
    case 'selected-frame':
      return <ActionHintBadge icon={<Icon name="image" size={7} color="#fff" />} />;
    case 'multi-target':
      return <ActionHintBadge icon={<Icon name="chevronDown" size={7} color="#fff" />} />;
  }
}

function resolvePillIcon(action: GenerationAction): React.ReactNode {
  if (action.icon !== null) return action.icon;
  // Smart-action is the only action that hands the icon choice to the skin.
  if (action.id === 'smart-action') {
    return action.variant === 'character-ingest'
      ? <Icon name="user" size={12} />
      : <Icon name="zap" size={12} />;
  }
  return null;
}

function resolvePillButtonStyle(action: GenerationAction): React.CSSProperties | undefined {
  if (!action.accentColor) return undefined;
  return {
    backgroundColor: `${action.accentColor}26`,
    boxShadow: `inset 0 0 0 1px ${action.accentColor}88`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: translate actions into ButtonGroup items
// ─────────────────────────────────────────────────────────────────────────────

// Pure action→ButtonGroup translator, intentionally colocated with the pill
// skin's expand renderers. Fast-refresh DX rule only; safe to suppress.
// eslint-disable-next-line react-refresh/only-export-components
export function toPillButtonItems(actions: GenerationAction[]): ButtonGroupItem[] {
  return actions.map((action) => ({
    id: action.id,
    icon: resolvePillIcon(action),
    label: action.label,
    buttonStyle: resolvePillButtonStyle(action),
    onClick: action.onClick,
    onAuxClick: action.onAuxClick,
    onContextMenu: action.onContextMenu,
    onMouseEnter: action.onMouseEnter,
    title: action.title,
    badge: action.countBadge != null && action.countBadge > 0
      ? renderCountBadge(action.countBadge)
      : renderPillBadge(action.badgeHint),
    // Mark the expand submenu so card-level touch handlers (reveal-on-tap,
    // outside-tap dismiss) can tell a tap *inside* this popover apart from a
    // tap outside the card. The submenu is portaled to <body>, so its clicks
    // bubble through the React tree to the card and would otherwise be eaten
    // by the reveal interceptor before reaching the submenu button.
    expandContent: action.expand
      ? <div data-gen-action-popover="true">{renderPillExpand(action.expand)}</div>
      : undefined,
    expandDelay: action.expandDelay,
    collapseDelay: action.collapseDelay,
    burst: action.burst,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider picker popover (right-click on upload)
// ─────────────────────────────────────────────────────────────────────────────

export function GenerationProviderPickerPopover({ menu }: { menu: GenerationProviderMenuState }) {
  if (!menu.position) return null;
  return (
    <Popover
      open={menu.open}
      onClose={menu.onClose}
      anchor={new DOMRect(menu.position.x, menu.position.y, 0, 0)}
      placement="bottom"
      align="start"
      offset={4}
      style={{ zIndex: Z.floatOverlay }}
      className="min-w-[180px] rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl p-1"
    >
      {menu.options.map((target) => (
        <DropdownItem
          key={target.id}
          onClick={() => menu.onSelect(target.id)}
          icon={
            target.id === 'library'
              ? <Icon name="database" size={12} />
              : (
                <span
                  className="inline-block h-2 w-2 rounded-full border border-white/70"
                  style={{ backgroundColor: getGenerationProviderAccent(target.id) }}
                />
              )
          }
          rightSlot={
            menu.defaultId === target.id
              ? <Icon name="check" size={12} className="text-accent" />
              : undefined
          }
        >
          {target.label}
        </DropdownItem>
      ))}
      {menu.defaultId && (
        <>
          <DropdownDivider />
          <DropdownItem
            onClick={menu.onClearDefault}
            icon={<Icon name="x" size={12} />}
          >
            Clear default
          </DropdownItem>
        </>
      )}
    </Popover>
  );
}

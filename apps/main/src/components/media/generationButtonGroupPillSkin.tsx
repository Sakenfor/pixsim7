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

import React from 'react';

import { ActionHintBadge, DropdownItem, DropdownDivider, Popover, Z, type ButtonGroupItem } from '@pixsim7/shared.ui';

import { Icon } from '@lib/icons';

import type {
  GenerationAction,
  GenerationActionExpand,
  GenerationProviderMenuState,
} from './useGenerationButtonGroup';
import { getGenerationProviderAccent } from './useGenerationButtonGroup';
import { SlotPickerGrid } from './SlotPicker';
import { SourceAssetsPreview } from './SourceAssetsPreview';

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

function RegenerateMenuExpand({ expand }: { expand: Extract<GenerationActionExpand, { kind: 'regenerate-menu' }> }) {
  const {
    assetAcceptsInput,
    assetId,
    operationType,
    isLoadingSource,
    isInsertingPrompt,
    insertPromptTitle,
    insertSeedTitle,
    onLoadToQuickGen,
    onLoadToQuickGenNoSeed,
    onInsertPrompt,
    onInsertSeed,
    onOpenSourceAsset,
  } = expand;
  return (
    <div className="flex flex-col rounded-xl bg-accent/95 backdrop-blur-sm shadow-2xl">
      <div className="w-36 flex items-stretch">
        <button
          onClick={onLoadToQuickGen}
          className="flex-1 h-8 px-3 text-xs text-white hover:bg-white/15 rounded-tl-xl transition-colors flex items-center gap-2"
          title="Load everything into Quick Generate"
          disabled={isLoadingSource}
          type="button"
        >
          {isLoadingSource ? (
            <Icon name="loader" size={12} className="animate-spin" />
          ) : (
            <Icon name="edit" size={12} />
          )}
          <span>Load to Quick Gen</span>
        </button>
        <button
          onClick={onLoadToQuickGenNoSeed}
          className="w-8 h-8 text-white hover:bg-white/15 rounded-tr-xl border-l border-white/15 transition-colors flex items-center justify-center"
          title="Load to Quick Gen without seed (random seed on next generate)"
          disabled={isLoadingSource}
          type="button"
        >
          <Icon name={isLoadingSource ? 'loader' : 'shuffle'} size={12} className={isLoadingSource ? 'animate-spin' : ''} />
        </button>
      </div>
      <div className="w-36 flex items-stretch">
        <button
          onClick={onInsertPrompt}
          className={`flex-1 h-8 px-3 text-xs text-white hover:bg-white/15 transition-colors flex items-center gap-2 ${assetAcceptsInput ? '' : 'rounded-bl-xl'}`}
          title={insertPromptTitle}
          disabled={isInsertingPrompt}
          type="button"
        >
          {isInsertingPrompt ? (
            <Icon name="loader" size={12} className="animate-spin" />
          ) : (
            <Icon name="fileText" size={12} />
          )}
          <span>Insert Prompt</span>
        </button>
        <button
          onClick={onInsertSeed}
          className={`w-8 h-8 text-white hover:bg-white/15 border-l border-white/15 transition-colors flex items-center justify-center ${assetAcceptsInput ? '' : 'rounded-br-xl'}`}
          title={insertSeedTitle}
          disabled={isInsertingPrompt}
          type="button"
        >
          <Icon name={isInsertingPrompt ? 'loader' : 'hash'} size={12} className={isInsertingPrompt ? 'animate-spin' : ''} />
        </button>
      </div>
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
  const { isGenerating, blocks, onPickPreset } = expand;
  return (
    <div className="flex flex-col rounded-xl bg-accent/95 backdrop-blur-sm shadow-2xl max-h-64 overflow-y-auto">
      <div className="px-3 py-1.5 text-[10px] font-medium text-white/50 uppercase tracking-wider">
        Aesthetic Presets
      </div>
      {!blocks ? (
        <div className="w-44 h-8 flex items-center justify-center">
          <Icon name="loader" size={12} className="animate-spin text-white/40" />
        </div>
      ) : blocks.length === 0 ? (
        <div className="w-44 h-8 px-3 text-xs text-white/40 flex items-center">
          No styles available
        </div>
      ) : (
        blocks.map((block) => {
          const label = block.block_id.split('.').pop()?.replace(/_/g, ' ') ?? block.block_id;
          return (
            <button
              key={block.block_id}
              onClick={() => onPickPreset(block.block_id)}
              className="w-44 h-8 px-3 text-xs text-white hover:bg-white/15 transition-colors flex items-center gap-2 last:rounded-b-xl capitalize"
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
  );
}

function renderPillExpand(expand: GenerationActionExpand): React.ReactNode {
  switch (expand.kind) {
    case 'slot-picker':
      return <SlotPickerExpand expand={expand} />;
    case 'extend-menu':
      return <ExtendMenuExpand expand={expand} />;
    case 'regenerate-menu':
      return <RegenerateMenuExpand expand={expand} />;
    case 'style-variations':
      return <StyleVariationsExpand expand={expand} />;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-action icon/badge resolution (pill-specific visual choices)
// ─────────────────────────────────────────────────────────────────────────────

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
    badge: renderPillBadge(action.badgeHint),
    expandContent: action.expand ? renderPillExpand(action.expand) : undefined,
    expandDelay: action.expandDelay,
    collapseDelay: action.collapseDelay,
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

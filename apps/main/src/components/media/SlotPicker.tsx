/* eslint-disable react-refresh/only-export-components */
/**
 * SlotPicker components and helpers for selecting input positions.
 * Split from mediaCardGeneration.tsx.
 */
import React, { useMemo } from 'react';

import { Icon } from '@lib/icons';

import { getAssetDisplayUrls, type AssetModel } from '@features/assets';
import {
  CAP_GENERATION_WIDGET,
  useCapability,
  type GenerationWidgetContext,
} from '@features/contextHub';
import {
  getGenerationInputStore,
  type InputItem,
} from '@features/generation';
import { useGenerationInputStore } from '@features/generation/stores/generationInputStore';

import { useResolvedAssetMedia } from '@/hooks/useResolvedAssetMedia';
import { OPERATION_METADATA, type OperationType, type MediaType } from '@/types/operations';

import { EMPTY_INPUTS } from './mediaCardGenerationHelpers';


/**
 * Get the label for the smart action button.
 * Smart button always adds to current mode - never changes mode.
 */
export function getSmartActionLabel(mediaType: MediaType, operationType: OperationType): string {
  const metadata = OPERATION_METADATA[operationType];
  const needsFrameExtraction = mediaType === 'video' && operationType !== 'video_extend';
  const suffix = needsFrameExtraction ? ' (extract frame)' : '';
  return `Add to ${metadata.label}${suffix}`;
}

export function resolveMaxSlotsFromSpecs(
  parameters: Array<{ name: string; metadata?: Record<string, any>; max?: number }> | undefined,
  operationType: OperationType,
  model?: string,
): number | undefined {
  if (!parameters || parameters.length === 0) return undefined;

  const candidateNames =
    operationType === 'video_transition'
      ? ['image_urls', 'source_asset_ids', 'composition_assets']
      : ['composition_assets', 'source_asset_ids', 'image_urls'];

  const param = candidateNames
    .map((name) => parameters.find((entry) => entry.name === name))
    .find((entry) => !!entry);

  if (!param) return undefined;

  const normalizeLimit = (value: unknown): number | undefined => {
    const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : null;
    return num !== null && Number.isFinite(num) ? num : undefined;
  };

  const metadata = param.metadata ?? {};
  const perModel = metadata.per_model_max_items ?? metadata.perModelMaxItems;
  if (perModel && model) {
    const normalizedModel = model.toLowerCase();
    const match = Object.entries(perModel).find(([key]) => {
      const normalizedKey = String(key).toLowerCase();
      return normalizedModel === normalizedKey || normalizedModel.startsWith(normalizedKey);
    });
    if (match) {
      const perModelLimit = normalizeLimit(match[1]);
      if (perModelLimit !== undefined) return perModelLimit;
    }
  }

  return normalizeLimit(metadata.max_items ?? metadata.maxItems ?? param.max);
}

/**
 * Conservative fallback when provider specs aren't loaded yet.
 * The real limits come from provider operation specs (per_model_max_items).
 */
export function resolveMaxSlotsForModel(operationType: OperationType, _model?: string): number { // eslint-disable-line @typescript-eslint/no-unused-vars
  if (operationType === 'video_transition' || operationType === 'image_to_image') return 7;
  if (operationType === 'fusion') return 3;
  return 3;
}

/**
 * Slot picker content for selecting an input position in the current operation.
 * Uses the operation's input list to preview filled slots.
 */
export interface SlotPickerContentProps {
  asset: AssetModel;
  operationType: OperationType;
  onSelectSlot: (asset: AssetModel, slotIndex: number) => void;
  maxSlots?: number;
  inputScopeId?: string;
}

export function SlotPickerContent({
  asset,
  operationType,
  onSelectSlot,
  maxSlots: maxSlotsProp,
  inputScopeId,
}: SlotPickerContentProps) {
  const inputStore = useMemo(
    () => (inputScopeId ? getGenerationInputStore(inputScopeId) : useGenerationInputStore),
    [inputScopeId],
  );
  const inputs = inputStore((s) => s.inputsByOperation[operationType]?.items ?? EMPTY_INPUTS);
  const inputBySlot = useMemo(() => {
    const map = new Map<number, InputItem>();
    inputs.forEach((item, idx) => {
      const slot = typeof item.slotIndex === 'number' ? item.slotIndex : idx;
      map.set(slot, item);
    });
    return map;
  }, [inputs]);

  const maxSlotIndex = useMemo(() => {
    return inputs.reduce((max, item, idx) => {
      const slot = typeof item.slotIndex === 'number' ? item.slotIndex : idx;
      return Math.max(max, slot);
    }, -1);
  }, [inputs]);

  // Check if there's an active generation widget context (via capability)
  const { value: widgetContext } = useCapability<GenerationWidgetContext>(CAP_GENERATION_WIDGET);
  // Show compact checkmarks when generation widget is visible, thumbnails otherwise
  const showCompact = !!widgetContext;

  // Max slots from prop (provider-specific) or default to 7 (Pixverse transition limit)
  const maxAllowed = maxSlotsProp ?? 7;
  // Show full slot range when max is known, otherwise show filled + 1 empty (min 3)
  const minVisibleSlots = maxSlotsProp ?? 3;
  const baseSlots = Math.max(maxSlotIndex + 1, inputBySlot.size);
  const visibleSlots = Math.min(Math.max(baseSlots + 1, minVisibleSlots), maxAllowed);
  const slots = Array.from({ length: visibleSlots }, (_, i) => i);

  return (
    <div className="flex flex-col overflow-hidden rounded-full bg-accent/95 backdrop-blur-sm shadow-2xl">
      {slots.map((slotIndex, idx) => {
        const inputItem = inputBySlot.get(slotIndex);
        const isFilled = !!inputItem;
        const isFirst = idx === 0;
        const isLast = idx === slots.length - 1;

        return (
          <React.Fragment key={slotIndex}>
            {/* Divider between slots */}
            {!isFirst && <div className="h-px bg-accent-muted/50" />}
            <button
              onClick={() => onSelectSlot(asset, slotIndex)}
              className={`
                relative w-8 h-8 transition-all flex items-center justify-center text-sm
                hover:bg-white/20 text-white
                ${isFirst ? 'rounded-t-full pt-0.5' : ''}
                ${isLast ? 'rounded-b-full pb-0.5' : ''}
              `}
              title={`Input slot ${slotIndex + 1}${isFilled ? ' (filled)' : ' (empty)'}`}
              type="button"
            >
              {isFilled ? (
                showCompact ? (
                  // Generation widget visible: show simple checkmark
                  <Icon name="check" size={12} className="text-white" />
                ) : (
                  // No widget visible: show thumbnail
                  <SlotThumbnail asset={inputItem.asset} alt={`Slot ${slotIndex + 1}`} />
                )
              ) : (
                // Empty slot: show slot number
                <span className="text-[10px] font-medium">
                  {slotIndex + 1}
                </span>
              )}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

/**
 * Grid variant of SlotPickerContent for portal-based slot pickers.
 * Renders slots in a compact 2-row grid instead of a vertical pill.
 */
export function SlotPickerGrid({
  asset,
  operationType,
  onSelectSlot,
  maxSlots: maxSlotsProp,
  inputScopeId,
}: SlotPickerContentProps) {
  const inputStore = useMemo(
    () => (inputScopeId ? getGenerationInputStore(inputScopeId) : useGenerationInputStore),
    [inputScopeId],
  );
  const inputs = inputStore((s) => s.inputsByOperation[operationType]?.items ?? EMPTY_INPUTS);
  const inputBySlot = useMemo(() => {
    const map = new Map<number, InputItem>();
    inputs.forEach((item, idx) => {
      const slot = typeof item.slotIndex === 'number' ? item.slotIndex : idx;
      map.set(slot, item);
    });
    return map;
  }, [inputs]);

  const maxSlotIndex = useMemo(() => {
    return inputs.reduce((max, item, idx) => {
      const slot = typeof item.slotIndex === 'number' ? item.slotIndex : idx;
      return Math.max(max, slot);
    }, -1);
  }, [inputs]);

  const maxAllowed = maxSlotsProp ?? 7;
  const minVisibleSlots = maxSlotsProp ?? 3;
  const baseSlots = Math.max(maxSlotIndex + 1, inputBySlot.size);
  const visibleSlots = Math.min(Math.max(baseSlots + 1, minVisibleSlots), maxAllowed);
  const slots = Array.from({ length: visibleSlots }, (_, i) => i);
  const cols = Math.ceil(visibleSlots / 2);

  return (
    <div
      className="grid gap-px overflow-hidden rounded-lg bg-accent/95 backdrop-blur-sm shadow-2xl"
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
    >
      {slots.map((slotIndex) => {
        const inputItem = inputBySlot.get(slotIndex);
        const isFilled = !!inputItem;

        return (
          <button
            key={slotIndex}
            onClick={(e) => {
              e.stopPropagation();
              onSelectSlot(asset, slotIndex);
            }}
            className="w-7 h-7 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
            title={`Slot ${slotIndex + 1}${isFilled ? ' (filled)' : ''}`}
            type="button"
          >
            {isFilled ? (
              <Icon name="check" size={12} className="text-white" />
            ) : (
              <span className="text-[10px] font-medium">{slotIndex + 1}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function SlotThumbnail({ asset, alt }: { asset: AssetModel; alt: string }) {
  const { thumbnailUrl, previewUrl, mainUrl } = getAssetDisplayUrls(asset);
  const { thumbSrc } = useResolvedAssetMedia({
    thumbUrl: thumbnailUrl,
    previewUrl,
    remoteUrl: mainUrl,
  });
  const src = thumbSrc;

  if (!src) {
    return (
      <div className="w-6 h-6 rounded bg-white/15 flex items-center justify-center">
        <Icon name="image" size={12} className="text-white/70" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className="w-6 h-6 object-cover rounded"
    />
  );
}

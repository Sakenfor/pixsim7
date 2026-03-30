/**
 * MaskVersionBadge — Interactive mask badge with version navigation.
 * Rendered inside the overlay widget system on asset input cards.
 */
import type { VersionEntry } from '@pixsim7/shared.api.client/domains';
import { Popover } from '@pixsim7/shared.ui';
import { useCallback, useRef, useState } from 'react';

import { Icon } from '@lib/icons';
import { useVersions } from '@lib/ui/versioning';

interface MaskVersionBadgeProps {
  label: string;
  primaryAssetId: number | null;
  onSwitchVersion?: (oldAssetId: number, newAssetId: number) => void;
}

export function MaskVersionBadge({ label, primaryAssetId, onSwitchVersion }: MaskVersionBadgeProps) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLDivElement>(null);
  const { versions } = useVersions('asset', primaryAssetId);
  const hasVersions = versions.length > 1;

  const currentIdx = versions.findIndex(
    (v) => Number(v.entityId) === primaryAssetId,
  );

  const handlePrev = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!primaryAssetId || currentIdx <= 0) return;
      const prev = versions[currentIdx - 1];
      onSwitchVersion?.(primaryAssetId, Number(prev.entityId));
    },
    [primaryAssetId, currentIdx, versions, onSwitchVersion],
  );

  const handleNext = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!primaryAssetId || currentIdx < 0 || currentIdx >= versions.length - 1) return;
      const next = versions[currentIdx + 1];
      onSwitchVersion?.(primaryAssetId, Number(next.entityId));
    },
    [primaryAssetId, currentIdx, versions, onSwitchVersion],
  );

  const versionLabel = hasVersions && currentIdx >= 0
    ? `v${versions[currentIdx].versionNumber}`
    : null;

  return (
    <>
      <div
        ref={btnRef}
        className="cq-badge inline-flex items-center gap-0.5 !bg-black/60 !text-white backdrop-blur-sm rounded shadow-sm cursor-pointer select-none"
        onClick={(e) => { e.stopPropagation(); if (hasVersions) setOpen((v) => !v); }}
        title={hasVersions ? 'Click for mask versions' : label}
      >
        <Icon name="paintbrush" size={9} />
        <span className="whitespace-nowrap text-[9px] font-medium leading-none">
          {versionLabel ? `${label} ${versionLabel}` : label}
        </span>
        {hasVersions && (
          <>
            <button
              className="w-3 h-3 flex items-center justify-center rounded-sm hover:bg-white/20 disabled:opacity-30"
              disabled={currentIdx <= 0}
              onClick={handlePrev}
              title="Previous version"
            >
              <Icon name="chevronUp" size={7} />
            </button>
            <button
              className="w-3 h-3 flex items-center justify-center rounded-sm hover:bg-white/20 disabled:opacity-30"
              disabled={currentIdx >= versions.length - 1}
              onClick={handleNext}
              title="Next version"
            >
              <Icon name="chevronDown" size={7} />
            </button>
          </>
        )}
      </div>

      <Popover
        anchor={btnRef.current}
        placement="bottom"
        align="end"
        offset={4}
        open={open && hasVersions}
        onClose={() => setOpen(false)}
        triggerRef={btnRef}
      >
        <MaskVersionPopover
          versions={versions}
          currentAssetId={primaryAssetId!}
          onSelect={(assetId) => {
            if (primaryAssetId) onSwitchVersion?.(primaryAssetId, assetId);
            setOpen(false);
          }}
        />
      </Popover>
    </>
  );
}

function MaskVersionPopover({
  versions,
  currentAssetId,
  onSelect,
}: {
  versions: VersionEntry[];
  currentAssetId: number;
  onSelect: (assetId: number) => void;
}) {
  return (
    <div
      className="bg-neutral-900 border border-neutral-700 rounded-md shadow-lg overflow-hidden min-w-[120px]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-2 py-1 text-[9px] text-neutral-400 font-medium border-b border-neutral-700">
        Mask Versions
      </div>
      <div className="max-h-32 overflow-y-auto">
        {versions.map((v) => {
          const assetId = Number(v.entityId);
          const isCurrent = assetId === currentAssetId;
          return (
            <button
              key={v.entityId}
              className={`w-full text-left px-2 py-1 text-[10px] hover:bg-neutral-800 flex items-center gap-1.5 ${
                isCurrent ? 'text-accent font-medium' : 'text-neutral-300'
              }`}
              onClick={() => onSelect(assetId)}
            >
              <span>v{v.versionNumber}</span>
              {v.isHead && <span className="text-[8px] text-green-400">HEAD</span>}
              {isCurrent && <span className="text-[8px] text-accent">current</span>}
              {v.versionMessage && (
                <span className="text-[8px] text-neutral-500 truncate">{v.versionMessage}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

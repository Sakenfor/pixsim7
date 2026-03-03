/**
 * SurfacePresetPicker
 *
 * Compact 2-in-1 button that combines the gallery surface switcher and
 * media-card overlay preset selector into a single toolbar control.
 *
 * Trigger: two-emoji button showing current surface + preset icons.
 * Dropdown: two icon-grid sections (Surface / Card Preset).
 */

import { Dropdown, DropdownSectionHeader } from '@pixsim7/shared.ui';
import { useRef, useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';


import { gallerySurfaceSelectors } from '@lib/plugins/catalogSelectors';
import { mediaCardPresets } from '@lib/ui/overlay';

import type { GallerySurfaceId } from '../lib/core/surfaceRegistry';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SurfacePresetPickerProps {
  currentPresetId: string;
  onPresetChange: (presetId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SurfacePresetPicker({
  currentPresetId,
  onPresetChange,
}: SurfacePresetPickerProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  // Current surface from URL
  const currentSurfaceId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return (params.get('surface') || 'assets-default') as GallerySurfaceId;
  }, [location.search]);

  const surfaces = gallerySurfaceSelectors.getAll();

  const currentSurface = surfaces.find((s) => s.id === currentSurfaceId) ?? surfaces[0];
  const currentPreset = mediaCardPresets.find((p) => p.id === currentPresetId) ?? mediaCardPresets[0];

  const handleSurfaceChange = (surfaceId: GallerySurfaceId) => {
    const params = new URLSearchParams(location.search);
    params.set('surface', surfaceId);
    navigate({ search: params.toString() }, { replace: true });
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-7 px-1.5 text-xs inline-flex items-center gap-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900/60 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        title="Surface & card preset"
      >
        <span>{currentSurface?.icon ?? '🖼️'}</span>
        <span className="text-neutral-300 dark:text-neutral-600">/</span>
        <span>{currentPreset?.icon ?? '⚖️'}</span>
        <span className="text-[10px] ml-0.5">▾</span>
      </button>

      <Dropdown
        isOpen={open}
        onClose={() => setOpen(false)}
        position="bottom-right"
        minWidth="auto"
        triggerRef={triggerRef}
      >
        {/* Surface section */}
        <DropdownSectionHeader first>Surface</DropdownSectionHeader>
        <div className="flex flex-wrap gap-1 px-1 pb-1">
          {surfaces.map((surface) => (
            <button
              key={surface.id}
              type="button"
              onClick={() => handleSurfaceChange(surface.id)}
              className={`h-7 w-7 flex items-center justify-center rounded text-sm transition-colors ${
                currentSurfaceId === surface.id
                  ? 'bg-accent/15 ring-1 ring-accent text-accent'
                  : 'hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-400'
              }`}
              title={surface.label}
            >
              {surface.icon}
            </button>
          ))}
        </div>

        {/* Preset section */}
        <DropdownSectionHeader>Card Preset</DropdownSectionHeader>
        <div className="flex flex-wrap gap-1 px-1 pb-1" style={{ maxWidth: '160px' }}>
          {mediaCardPresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                onPresetChange(preset.id);
                setOpen(false);
              }}
              className={`h-7 w-7 flex items-center justify-center rounded text-sm transition-colors ${
                currentPresetId === preset.id
                  ? 'bg-accent/15 ring-1 ring-accent text-accent'
                  : 'hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-400'
              }`}
              title={preset.name}
            >
              {preset.icon}
            </button>
          ))}
        </div>
      </Dropdown>
    </div>
  );
}

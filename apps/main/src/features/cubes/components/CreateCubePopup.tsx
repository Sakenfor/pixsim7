/**
 * CreateCubePopup
 *
 * Minimal popover for creating a new cube instance.
 * Shows a name input and preset selection buttons.
 */

import { Popover, Z } from '@pixsim7/shared.ui';
import { clsx } from 'clsx';
import { useState } from 'react';

import { Icon } from '@lib/icons';

import {
  useCubeInstanceStore,
  CUBE_PRESETS,
  type CubePreset,
} from '../stores/cubeInstanceStore';

export interface CreateCubePopupProps {
  anchor: HTMLElement | null;
  open: boolean;
  onClose: () => void;
}

export function CreateCubePopup({ anchor, open, onClose }: CreateCubePopupProps) {
  const createInstance = useCubeInstanceStore((s) => s.createInstance);
  const [name, setName] = useState('');
  const [preset, setPreset] = useState<CubePreset>('panel-hub');

  const handleCreate = () => {
    const presetDef = CUBE_PRESETS[preset];
    createInstance(name || presetDef.label, preset, presetDef.defaultColor);
    setName('');
    setPreset('panel-hub');
    onClose();
  };

  return (
    <Popover
      anchor={anchor}
      placement="bottom"
      align="end"
      offset={8}
      open={open}
      onClose={onClose}
      className="bg-neutral-900/95 backdrop-blur-md border border-neutral-700 rounded-lg shadow-2xl p-3 w-[220px]"
      style={{ zIndex: Z.floatOverlayPopover }}
    >
      <div className="space-y-3">
        <div className="text-[11px] font-medium text-neutral-300">New Cube</div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (optional)"
          className="w-full px-2 py-1 text-xs bg-neutral-800 border border-neutral-600 rounded text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:border-cyan-500"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCreate();
            e.stopPropagation();
          }}
        />
        <div className="space-y-1">
          {(Object.entries(CUBE_PRESETS) as [CubePreset, (typeof CUBE_PRESETS)[CubePreset]][]).map(
            ([key, def]) => (
              <button
                key={key}
                type="button"
                onClick={() => setPreset(key)}
                className={clsx(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors',
                  preset === key
                    ? 'bg-cyan-900/40 text-cyan-300 border border-cyan-500/30'
                    : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 border border-transparent',
                )}
              >
                <Icon name={def.icon} size={14} className="shrink-0" />
                <div className="text-left">
                  <div className="font-medium">{def.label}</div>
                  <div className="text-[10px] text-neutral-500">{def.description}</div>
                </div>
              </button>
            ),
          )}
        </div>
        <button
          type="button"
          onClick={handleCreate}
          className="w-full px-3 py-1.5 text-xs font-medium rounded bg-cyan-600 text-white hover:bg-cyan-500 transition-colors"
        >
          Create
        </button>
      </div>
    </Popover>
  );
}

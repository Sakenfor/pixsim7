/**
 * RefPickerField — polymorphic dispatcher for op-ref binding.
 *
 * Branches on the op_ref.capability string and renders the right
 * sub-picker; converts the picked typed value into the canonical token
 * the executor expects:
 *
 *   capability         | sub-picker             | canonical token
 *   -------------------+------------------------+-----------------------
 *   asset              | AssetPickerField       | asset:<id>
 *   subject, target    | CharacterPickerField   | character:<character_id>
 *   anchor             | RolePickerField        | role:<roleId>
 *   <anything else>    | SymbolPickerField      | symbol:<token>
 *
 * Phase 2b of plan:op-runtime-span-popover. Fully controlled — `value`
 * (canonical token string | null) is the source of truth. The dispatcher
 * keeps a typed mirror in local state so the sub-picker can render its
 * rich display, but treats parent `value=null` as a clear signal.
 *
 * Rehydration from a pre-existing canonical token (e.g. loaded from
 * persisted span_provenance) is best-effort: known prefixes show a
 * passive chip; the user can clear and re-pick to get the rich picker
 * back.
 */
import { Edit2, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { AssetPickerField } from '@features/assets/components/pickers/AssetPickerField';
import type { PickedAsset } from '@features/assets/components/pickers/types';
import {
  CharacterPickerField,
  type PickedCharacter,
} from '@features/characters/components/pickers/CharacterPickerField';

import { RolePickerField, type PickedRole } from './RolePickerField';
import { SymbolPickerField, type PickedSymbol } from './SymbolPickerField';

type RefKind = 'asset' | 'character' | 'role' | 'symbol';

function kindForCapability(capability: string): RefKind {
  const cap = capability.toLowerCase().trim();
  if (cap === 'asset') return 'asset';
  if (cap === 'subject' || cap === 'target') return 'character';
  if (cap === 'anchor') return 'role';
  return 'symbol';
}

function assetToToken(a: PickedAsset | null): string | null {
  return a ? `asset:${a.id}` : null;
}

function characterToToken(c: PickedCharacter | null): string | null {
  return c ? `character:${c.character_id}` : null;
}

function roleToToken(r: PickedRole | null): string | null {
  return r ? `role:${r.roleId}` : null;
}

function symbolToToken(s: PickedSymbol | null): string | null {
  return s ? `symbol:${s.symbol}` : null;
}

export interface RefPickerFieldProps {
  /** op_ref.capability declared on the op signature (e.g. "subject"). */
  capability: string;
  /** Current canonical token string, or null when unbound. */
  value: string | null;
  /** Called with the new canonical token (or null on clear). */
  onChange: (canonicalToken: string | null) => void;
  label?: string;
  className?: string;
  /** Marks the binder as required in the parent's UI. Doesn't enforce
   *  anything here — the executor surfaces validation. */
  required?: boolean;
}

export function RefPickerField({
  capability,
  value,
  onChange,
  label,
  className,
  required,
}: RefPickerFieldProps) {
  const kind = kindForCapability(capability);

  // Typed mirrors. We keep one per kind so swapping capability mid-stream
  // doesn't cross-pollute, and so a sub-picker that produces rich display
  // info (e.g. character name) can show it after selection.
  const [pickedAsset, setPickedAsset] = useState<PickedAsset | null>(null);
  const [pickedCharacter, setPickedCharacter] = useState<PickedCharacter | null>(null);
  const [pickedRole, setPickedRole] = useState<PickedRole | null>(null);
  const [pickedSymbol, setPickedSymbol] = useState<PickedSymbol | null>(null);

  // Parent clear → reset typed mirrors so the sub-picker returns to its
  // empty state. (Parent setting a non-null value we didn't produce is
  // handled by the passive-chip branch below.)
  useEffect(() => {
    if (value === null) {
      setPickedAsset(null);
      setPickedCharacter(null);
      setPickedRole(null);
      setPickedSymbol(null);
    }
  }, [value]);

  const handleAssetChange = useCallback(
    (a: PickedAsset | null) => {
      setPickedAsset(a);
      onChange(assetToToken(a));
    },
    [onChange],
  );
  const handleCharacterChange = useCallback(
    (c: PickedCharacter | null) => {
      setPickedCharacter(c);
      onChange(characterToToken(c));
    },
    [onChange],
  );
  const handleRoleChange = useCallback(
    (r: PickedRole | null) => {
      setPickedRole(r);
      onChange(roleToToken(r));
    },
    [onChange],
  );
  const handleSymbolChange = useCallback(
    (s: PickedSymbol | null) => {
      setPickedSymbol(s);
      onChange(symbolToToken(s));
    },
    [onChange],
  );

  // Passive-chip branch: parent provided a canonical token but we have
  // no matching typed mirror (e.g. loaded from persisted provenance, or
  // capability changed after a value was set). Show the raw token with
  // an Edit→clear affordance so the user can re-pick.
  const typedTokenForKind: string | null =
    kind === 'asset' ? assetToToken(pickedAsset)
    : kind === 'character' ? characterToToken(pickedCharacter)
    : kind === 'role' ? roleToToken(pickedRole)
    : symbolToToken(pickedSymbol);

  const showPassiveChip = value !== null && value !== typedTokenForKind;

  if (showPassiveChip) {
    return (
      <div className={className}>
        {label && (
          <label className="block text-[10px] text-neutral-500 dark:text-neutral-400 mb-0.5">
            {label}{required && <span className="text-rose-500 ml-0.5">*</span>}
          </label>
        )}
        <div className="flex items-center gap-2 p-1.5 border border-neutral-200 dark:border-neutral-700 rounded bg-neutral-50 dark:bg-neutral-800/50">
          <div className="flex-1 min-w-0 text-xs font-mono text-neutral-700 dark:text-neutral-200 truncate">
            {value}
          </div>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChange(null)}
            className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
            title="Clear and re-pick"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChange(null)}
            className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
            title="Clear"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // Sub-pickers accept string labels; required marker is appended inline.
  const labelStr = label
    ? `${label}${required ? ' *' : ''}`
    : undefined;

  switch (kind) {
    case 'asset':
      return (
        <AssetPickerField
          value={pickedAsset}
          onChange={handleAssetChange}
          label={labelStr}
          className={className}
        />
      );
    case 'character':
      return (
        <CharacterPickerField
          value={pickedCharacter}
          onChange={handleCharacterChange}
          label={labelStr}
          className={className}
          placeholder={`Search ${capability}…`}
        />
      );
    case 'role':
      return (
        <RolePickerField
          value={pickedRole}
          onChange={handleRoleChange}
          label={labelStr}
          className={className}
          placeholder={`Pick ${capability} role…`}
        />
      );
    case 'symbol':
    default:
      return (
        <SymbolPickerField
          value={pickedSymbol}
          onChange={handleSymbolChange}
          label={labelStr}
          className={className}
          placeholder={capability ? `${capability}_token` : 'symbol_token'}
        />
      );
  }
}

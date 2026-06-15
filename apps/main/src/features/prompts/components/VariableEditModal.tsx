import { Button, Input, Modal, useToast } from '@pixsim7/shared.ui';
import { useEffect, useState } from 'react';

import type {
  PromptVariableMutationResult,
  SaveVariableOptions,
} from '../hooks/usePromptVariables';
import { buildTransformSpec, parseTransformSpec, TRANSFORM_OPTIONS } from '../lib/variableTransforms';

import { TransformPicker } from './TransformPicker';

export interface VariableEditModalProps {
  isOpen: boolean;
  /** Existing variable name to edit, or null/undefined for create mode. */
  editingName?: string | null;
  initialDescription?: string;
  initialValue?: string;
  initialTransform?: string;
  onClose: () => void;
  saveVariable: (
    name: string,
    options?: SaveVariableOptions,
  ) => Promise<PromptVariableMutationResult>;
  renameVariable: (name: string, newName: string) => Promise<PromptVariableMutationResult>;
  deleteVariable: (name: string) => Promise<PromptVariableMutationResult>;
}

/**
 * Full variable editor — name, description, substitution value, and transform.
 * The library-management counterpart to the in-context VariableEditPopover;
 * driven from the composer's Variables menu for create + edit + delete.
 */
export function VariableEditModal({
  isOpen,
  editingName,
  initialDescription,
  initialValue,
  initialTransform,
  onClose,
  saveVariable,
  renameVariable,
  deleteVariable,
}: VariableEditModalProps) {
  const toast = useToast();
  const isCreate = !editingName;

  const [nameDraft, setNameDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [valueDraft, setValueDraft] = useState('');
  const [transformId, setTransformId] = useState('');
  const [transformArg, setTransformArg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  // Re-seed drafts whenever the modal (re)opens for a different variable.
  useEffect(() => {
    if (!isOpen) return;
    const [initialId, initialArg] = initialTransform
      ? parseTransformSpec(initialTransform)
      : ['', null];
    const knownId = TRANSFORM_OPTIONS.some((o) => o.id === initialId) ? initialId : '';
    setNameDraft(editingName ?? '');
    setDescriptionDraft(initialDescription ?? '');
    setValueDraft(initialValue ?? '');
    setTransformId(knownId);
    setTransformArg(initialArg ?? '');
    setError(null);
    setConfirmingDelete(false);
    setBusy(false);
  }, [isOpen, editingName, initialDescription, initialValue, initialTransform]);

  const handleSave = async () => {
    const nextName = nameDraft.trim().toUpperCase();
    if (!nextName) {
      setError('Name is required.');
      return;
    }
    const description = descriptionDraft.trim();
    const value = valueDraft.trim();
    // A transform is inert without a value, so drop it when the value is empty.
    const transform = value ? (buildTransformSpec(transformId, transformArg) ?? '') : '';

    setBusy(true);
    try {
      // Create mode: a plain (non-allow-existing) upsert so a name clash surfaces.
      if (isCreate) {
        const result = await saveVariable(nextName, { description, value, transform });
        if (!result.ok) {
          setError(
            result.code === 'duplicate'
              ? `"${nextName}" already exists.`
              : (result.message ?? 'Failed to save variable.'),
          );
          return;
        }
        toast.success(`Saved ${nextName}`);
        onClose();
        return;
      }

      // Edit mode: rename first (backend preserves fields through a rename), then
      // persist field changes via an allow-existing upsert.
      let finalName = editingName as string;
      if (nextName !== finalName) {
        const renamed = await renameVariable(finalName, nextName);
        if (!renamed.ok) {
          setError(
            renamed.code === 'duplicate'
              ? `"${nextName}" already exists. Delete it first or pick another name.`
              : (renamed.message ?? 'Rename failed.'),
          );
          return;
        }
        finalName = nextName;
      }
      const saved = await saveVariable(finalName, {
        allowExisting: true,
        description,
        value,
        transform,
      });
      if (!saved.ok) {
        setError(saved.message ?? 'Failed to save variable.');
        return;
      }
      toast.success(`Saved ${finalName}`);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!editingName) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setBusy(true);
    try {
      const result = await deleteVariable(editingName);
      if (result.ok) {
        toast.success(`Deleted ${editingName}`);
        onClose();
        return;
      }
      setError(result.message ?? 'Failed to delete variable.');
      setConfirmingDelete(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isCreate ? 'New Variable' : 'Edit Variable'} size="sm">
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
            Variable Name
          </label>
          <Input
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value.toUpperCase())}
            placeholder="ACTOR1"
            autoFocus
          />
          <p className="mt-1 text-[10px] text-neutral-500 dark:text-neutral-400">
            Uppercase letters, digits, underscore.
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
            Description <span className="text-neutral-400">(optional)</span>
          </label>
          <Input
            value={descriptionDraft}
            onChange={(event) => setDescriptionDraft(event.target.value)}
            placeholder="the protagonist"
            maxLength={200}
          />
          <p className="mt-1 text-[10px] text-neutral-500 dark:text-neutral-400">
            A one-line reuse hint shown next to the variable.
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
            Expands to <span className="text-neutral-400">(optional)</span>
          </label>
          <textarea
            value={valueDraft}
            onChange={(event) => setValueDraft(event.target.value)}
            rows={3}
            placeholder="Leave empty to keep it a literal symbol"
            maxLength={2000}
            className="w-full resize-y rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-2 py-1 text-xs text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-1 focus:ring-violet-400"
          />
          <p className="mt-1 text-[10px] text-neutral-500 dark:text-neutral-400">
            Substitution text — when set, the variable expands to this in the generated prompt.
          </p>
        </div>
        <div>
          <TransformPicker
            previewValue={valueDraft}
            transformId={transformId}
            transformArg={transformArg}
            onSelect={setTransformId}
            onArgChange={setTransformArg}
          />
        </div>
        {error && <div className="text-[11px] text-red-600 dark:text-red-400">{error}</div>}
        <div className="flex items-center justify-between pt-1 border-t border-neutral-200 dark:border-neutral-700">
          {!isCreate ? (
            <Button type="button" variant="danger" onClick={handleDelete} disabled={busy}>
              {confirmingDelete ? 'Confirm delete' : 'Delete'}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" variant="primary" onClick={handleSave} disabled={busy}>
              {isCreate ? 'Create' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

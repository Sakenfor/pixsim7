/**
 * Delete Confirmation Modal with Dependency Warnings
 *
 * Shows a confirmation modal when deleting entities that may have
 * dependencies. Provides options for handling dependent items.
 *
 * Features:
 * - Dependency warnings with detailed breakdown
 * - Three delete policies: PREVENT, SET_NULL, CASCADE
 * - Visual indicators for dangerous operations
 * - Recommended actions highlighted
 *
 * Usage:
 * ```tsx
 * const [showModal, setShowModal] = useState(false);
 *
 * <DeleteConfirmationModal
 *   type="scene"
 *   id={sceneId}
 *   name="My Scene"
 *   onConfirm={(policy) => {
 *     deleteScene(sceneId, policy);
 *     setShowModal(false);
 *   }}
 *   onCancel={() => setShowModal(false)}
 * />
 * ```
 */

import { useState } from 'react';
import { Modal, Badge, Button } from '@pixsim7/shared.ui';
import { useDependencies } from '../../hooks/useDependencies';

/**
 * Delete policy types
 * - PREVENT: Don't delete, show warning
 * - SET_NULL: Delete and clear references (safe)
 * - CASCADE: Delete and delete all dependents (dangerous)
 */
export type DeletePolicy = 'PREVENT' | 'SET_NULL' | 'CASCADE';

export interface DeleteConfirmationModalProps {
  /** Entity type being deleted */
  type: 'scene' | 'arc' | 'collection' | 'campaign';
  /** Entity ID */
  id: string;
  /** Entity name/title for display */
  name: string;
  /** Called when delete is confirmed with chosen policy */
  onConfirm: (policy: DeletePolicy) => void;
  /** Called when delete is cancelled */
  onCancel: () => void;
}

/**
 * Delete Confirmation Modal
 *
 * Shows dependency warnings and allows user to choose how to handle them.
 */
export function DeleteConfirmationModal({
  type,
  id,
  name,
  onConfirm,
  onCancel,
}: DeleteConfirmationModalProps) {
  const deps = useDependencies(type, id);
  const [selectedPolicy, setSelectedPolicy] = useState<DeletePolicy | null>(null);

  const hasDeps = deps.total > 0;
  const defaultPolicy: DeletePolicy = hasDeps ? 'PREVENT' : 'SET_NULL';

  const handleConfirm = () => {
    const policy = selectedPolicy || defaultPolicy;
    if (policy === 'PREVENT') {
      onCancel();
    } else {
      onConfirm(policy);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onCancel}
      title="Confirm Delete"
      size="md"
    >
      <div className="space-y-4">
        {/* Main question */}
        <p className="text-sm text-neutral-700 dark:text-neutral-300">
          Are you sure you want to delete <strong className="font-semibold">{name}</strong>?
        </p>

        {/* Dependency warnings */}
        {hasDeps && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-amber-600 dark:text-amber-400 font-semibold text-sm">
                ⚠️ Warning: This {type} is used by other items
              </span>
            </div>

            <ul className="text-sm space-y-1.5 ml-4">
              {deps.arcNodes.length > 0 && (
                <li className="flex items-center gap-2">
                  <Badge color="orange">{deps.arcNodes.length}</Badge>
                  <span className="text-neutral-700 dark:text-neutral-300">
                    arc node{deps.arcNodes.length !== 1 ? 's' : ''}
                  </span>
                </li>
              )}
              {deps.collections.length > 0 && (
                <li className="flex items-center gap-2">
                  <Badge color="orange">{deps.collections.length}</Badge>
                  <span className="text-neutral-700 dark:text-neutral-300">
                    scene collection{deps.collections.length !== 1 ? 's' : ''}
                  </span>
                </li>
              )}
              {deps.campaigns.length > 0 && (
                <li className="flex items-center gap-2">
                  <Badge color="orange">{deps.campaigns.length}</Badge>
                  <span className="text-neutral-700 dark:text-neutral-300">
                    campaign{deps.campaigns.length !== 1 ? 's' : ''}
                  </span>
                </li>
              )}
            </ul>

            <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">
              Deleting will affect these references. Choose how to proceed:
            </p>
          </div>
        )}

        {/* Policy selection */}
        <div className="space-y-2">
          {hasDeps && (
            <>
              <PolicyOption
                policy="PREVENT"
                label="Cancel Delete"
                description="Don't delete. Fix dependencies first."
                recommended={true}
                selected={selectedPolicy === 'PREVENT'}
                onClick={() => setSelectedPolicy('PREVENT')}
              />

              <PolicyOption
                policy="SET_NULL"
                label="Clear References"
                description={`Delete ${type} and clear references (referenced items will have broken links)`}
                selected={selectedPolicy === 'SET_NULL'}
                onClick={() => setSelectedPolicy('SET_NULL')}
              />

              <PolicyOption
                policy="CASCADE"
                label="Cascade Delete (Dangerous)"
                description={`Delete this ${type} AND all items that reference it (${deps.total} items)`}
                dangerous={true}
                selected={selectedPolicy === 'CASCADE'}
                onClick={() => setSelectedPolicy('CASCADE')}
              />
            </>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 justify-end pt-2 border-t border-neutral-200 dark:border-neutral-700">
          <Button onClick={onCancel} variant="ghost">
            Cancel
          </Button>

          {!hasDeps && (
            <Button
              onClick={() => onConfirm('SET_NULL')}
              variant="danger"
            >
              Delete
            </Button>
          )}

          {hasDeps && selectedPolicy && (
            <Button
              onClick={handleConfirm}
              variant={selectedPolicy === 'CASCADE' ? 'danger' : 'primary'}
            >
              {selectedPolicy === 'PREVENT' && 'OK'}
              {selectedPolicy === 'SET_NULL' && 'Delete & Clear References'}
              {selectedPolicy === 'CASCADE' && `Delete All (${deps.total + 1} items)`}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

/**
 * Policy Option - Radio-style button for policy selection
 */
function PolicyOption({
  policy,
  label,
  description,
  recommended,
  dangerous,
  selected,
  onClick,
}: {
  policy: DeletePolicy;
  label: string;
  description: string;
  recommended?: boolean;
  dangerous?: boolean;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full p-3 rounded-lg border text-left transition-all
        ${selected
          ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-500/50'
          : 'border-neutral-300 dark:border-neutral-600 hover:border-neutral-400 dark:hover:border-neutral-500'
        }
        ${recommended && !selected ? 'border-green-500 dark:border-green-400 bg-green-50 dark:bg-green-900/20' : ''}
        ${dangerous && selected ? 'border-red-500 dark:border-red-400 bg-red-50 dark:bg-red-900/20' : ''}
        ${dangerous && !selected ? 'border-red-300 dark:border-red-600' : ''}
        hover:bg-neutral-50 dark:hover:bg-neutral-800/50
      `}
    >
      <div className="flex items-center gap-2 mb-1">
        <div
          className={`
            w-4 h-4 rounded-full border-2 flex items-center justify-center
            ${selected
              ? 'border-blue-500 dark:border-blue-400'
              : 'border-neutral-300 dark:border-neutral-600'
            }
          `}
        >
          {selected && (
            <div className="w-2 h-2 rounded-full bg-blue-500 dark:bg-blue-400" />
          )}
        </div>
        <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">
          {label}
        </span>
        {recommended && !selected && <Badge color="green">Recommended</Badge>}
        {dangerous && <Badge color="red">Dangerous</Badge>}
      </div>
      <p className="text-xs text-neutral-600 dark:text-neutral-400 ml-6">
        {description}
      </p>
    </button>
  );
}

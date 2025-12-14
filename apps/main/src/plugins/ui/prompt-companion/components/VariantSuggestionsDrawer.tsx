/**
 * Variant Suggestions Drawer
 *
 * Displays AI-generated prompt variants for selection.
 */

import clsx from 'clsx';
import { Button } from '@pixsim7/shared.ui';
import { Icon } from '@lib/icons';

// ============================================================================
// Types
// ============================================================================

interface VariantSuggestionsDrawerProps {
  open: boolean;
  onClose: () => void;
  variants: string[];
  onSelectVariant: (variant: string) => void;
  isDevMode: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function VariantSuggestionsDrawer({
  open,
  onClose,
  variants,
  onSelectVariant,
  isDevMode,
}: VariantSuggestionsDrawerProps) {
  if (!open) return null;

  const hasVariants = variants.length > 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className={clsx(
          'fixed right-0 top-0 h-full w-96 max-w-[90vw]',
          'bg-white dark:bg-neutral-900',
          'border-l border-neutral-200 dark:border-neutral-700',
          'shadow-xl z-50',
          'flex flex-col',
          'transform transition-transform duration-200',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-700">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Icon name="sparkles" className="h-5 w-5" />
            Prompt Variants
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
            aria-label="Close"
          >
            <Icon name="x" className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!hasVariants ? (
            <div className="text-center py-8">
              <Icon
                name="sparkles"
                className="h-12 w-12 mx-auto mb-4 text-neutral-300 dark:text-neutral-600"
              />
              <h3 className="text-lg font-medium mb-2">No Variants Available</h3>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
                {isDevMode
                  ? 'The variants API may not be available or returned no results.'
                  : 'Variant suggestions require dev mode or are not available for this prompt.'}
              </p>
              {!isDevMode && (
                <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center justify-center gap-1">
                  <Icon name="info" className="h-3 w-3" />
                  Dev-only feature
                </p>
              )}
            </div>
          ) : (
            <>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
                Select a variant to replace your current prompt, or close to keep your original.
              </p>

              {variants.map((variant, idx) => (
                <div
                  key={idx}
                  className={clsx(
                    'p-4 rounded-lg border',
                    'bg-neutral-50 dark:bg-neutral-800',
                    'border-neutral-200 dark:border-neutral-700',
                    'hover:border-blue-300 dark:hover:border-blue-600',
                    'transition-colors cursor-pointer'
                  )}
                  onClick={() => onSelectVariant(variant)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                        Variant {idx + 1}
                      </div>
                      <div className="text-sm whitespace-pre-wrap">{variant}</div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectVariant(variant);
                      }}
                      className={clsx(
                        'flex-shrink-0 p-2 rounded-lg',
                        'bg-blue-500 hover:bg-blue-600 text-white',
                        'transition-colors'
                      )}
                      title="Use this variant"
                    >
                      <Icon name="check" className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}

              {/* Info */}
              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-xs text-blue-700 dark:text-blue-300">
                <Icon name="info" className="h-3 w-3 inline mr-1" />
                Click a variant to replace your current prompt. This action can be undone.
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-200 dark:border-neutral-700">
          <Button onClick={onClose} variant="outline" className="w-full">
            Cancel
          </Button>
        </div>
      </div>
    </>
  );
}

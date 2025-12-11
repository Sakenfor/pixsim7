import { useState } from 'react';
import { builtinWizards, type TemplateWizard } from '@/lib/graph/templateWizards';
import { TemplateWizardDialog } from './TemplateWizardDialog';

interface TemplateWizardPaletteProps {
  /** Callback when wizard completes and generates nodes/edges */
  onWizardComplete: (nodes: any[], edges: any[]) => void;

  /** Compact mode for smaller display */
  compact?: boolean;
}

/**
 * Phase 7: Template Wizard Palette
 *
 * Displays available pattern wizards for quick scene creation
 */
export function TemplateWizardPalette({
  onWizardComplete,
  compact = false,
}: TemplateWizardPaletteProps) {
  const [activeWizard, setActiveWizard] = useState<TemplateWizard | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // Get unique categories
  const categories = ['All', ...Array.from(new Set(builtinWizards.map((w) => w.category)))];

  // Filter wizards
  const filteredWizards = builtinWizards.filter((wizard) => {
    // Category filter
    if (selectedCategory !== 'All' && wizard.category !== selectedCategory) {
      return false;
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchesName = wizard.name.toLowerCase().includes(query);
      const matchesDescription = wizard.description.toLowerCase().includes(query);
      const matchesCategory = wizard.category.toLowerCase().includes(query);

      if (!matchesName && !matchesDescription && !matchesCategory) {
        return false;
      }
    }

    return true;
  });

  // Group wizards by category
  const wizardsByCategory = filteredWizards.reduce((acc, wizard) => {
    const category = wizard.category;
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(wizard);
    return acc;
  }, {} as Record<string, TemplateWizard[]>);

  const handleWizardClick = (wizard: TemplateWizard) => {
    setActiveWizard(wizard);
  };

  const handleWizardComplete = (nodes: any[], edges: any[]) => {
    onWizardComplete(nodes, edges);
    setActiveWizard(null);
  };

  const handleWizardCancel = () => {
    setActiveWizard(null);
  };

  return (
    <>
      <div className="space-y-2">
        {!compact && (
          <>
            <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mb-2">
              Pattern Wizards ({builtinWizards.length})
            </div>

            {/* Search and filter controls */}
            <div className="space-y-2 pb-2 border-b dark:border-neutral-700">
              {/* Search */}
              <input
                type="text"
                placeholder="Search wizards..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-2 py-1 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
              />

              {/* Category filter */}
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-2 py-1 text-xs border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat === 'All' ? 'All Categories' : cat}
                  </option>
                ))}
              </select>

              {/* Filter summary */}
              {(selectedCategory !== 'All' || searchQuery.trim()) && (
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  Showing {filteredWizards.length} of {builtinWizards.length} wizards
                </div>
              )}
            </div>
          </>
        )}

        {/* Empty state */}
        {filteredWizards.length === 0 && (
          <div className="p-4 text-center text-neutral-500 dark:text-neutral-400 text-sm">
            <div className="mb-2">🧙</div>
            <div>No wizards match your filters</div>
          </div>
        )}

        {/* Wizard cards grouped by category */}
        {selectedCategory === 'All' ? (
          // Show grouped by category
          Object.entries(wizardsByCategory).map(([category, wizards]) => (
            <div key={category} className="space-y-2">
              <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 mt-3 mb-1">
                {category}
              </div>
              {wizards.map((wizard) => (
                <WizardCard
                  key={wizard.id}
                  wizard={wizard}
                  onClick={() => handleWizardClick(wizard)}
                  compact={compact}
                />
              ))}
            </div>
          ))
        ) : (
          // Show flat list when filtered
          filteredWizards.map((wizard) => (
            <WizardCard
              key={wizard.id}
              wizard={wizard}
              onClick={() => handleWizardClick(wizard)}
              compact={compact}
            />
          ))
        )}

        <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-3 pt-2 border-t dark:border-neutral-700">
          🧙 Click a wizard to create a pattern with guided setup
        </div>
      </div>

      {/* Wizard Dialog */}
      {activeWizard && (
        <TemplateWizardDialog
          wizard={activeWizard}
          onComplete={handleWizardComplete}
          onCancel={handleWizardCancel}
        />
      )}
    </>
  );
}

/**
 * Individual wizard card component
 */
function WizardCard({
  wizard,
  onClick,
  compact,
}: {
  wizard: TemplateWizard;
  onClick: () => void;
  compact: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3 border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-800 hover:border-primary-500 dark:hover:border-primary-400 hover:shadow-md transition-all"
    >
      <div className="flex items-start gap-3">
        {wizard.icon && (
          <div className="text-2xl flex-shrink-0">{wizard.icon}</div>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-neutral-900 dark:text-neutral-100 mb-1">
            {wizard.name}
          </div>
          {!compact && (
            <div className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2">
              {wizard.description}
            </div>
          )}
          <div className="flex items-center gap-2 mt-2">
            <span className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded">
              {wizard.category}
            </span>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              {wizard.fields.length} field{wizard.fields.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <div className="text-neutral-400 dark:text-neutral-500 flex-shrink-0">
          →
        </div>
      </div>
    </button>
  );
}

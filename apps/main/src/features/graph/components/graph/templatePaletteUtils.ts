import type { TemplateCategory } from '../../lib/editor/graphTemplates';
import type { GraphTemplate } from '../../lib/editor/graphTemplates';

/** Available categories for filtering */
export const TEMPLATE_CATEGORIES: (TemplateCategory | 'All')[] = [
  'All',
  'Quest Flow',
  'Dialogue Branch',
  'Combat',
  'Minigame',
  'Relationship',
  'Condition Check',
  'Other',
];

/**
 * Export a template to a JSON file
 */
export function exportTemplate(template: GraphTemplate): void {
  const filename = `graph-template-${template.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.json`;
  const jsonString = JSON.stringify(template, null, 2);

  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Validate that an imported object is a valid GraphTemplate
 */
export function isValidTemplateJSON(obj: unknown): obj is GraphTemplate {
  if (!obj || typeof obj !== 'object') return false;
  const record = obj as Record<string, unknown>;
  const data = record.data as Record<string, unknown> | null;

  return (
    typeof record.id === 'string' &&
    typeof record.name === 'string' &&
    typeof record.createdAt === 'number' &&
    Array.isArray(record.nodeTypes) &&
    !!data &&
    typeof data === 'object' &&
    Array.isArray(data.nodes) &&
    Array.isArray(data.edges)
  );
}

/** Source badge info for a template */
export interface SourceBadge {
  label: string;
  className: string;
}

/** Get source badge info for a template */
export function getSourceBadge(template: GraphTemplate): SourceBadge {
  switch (template.source) {
    case 'builtin':
      return { label: 'Built-in', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' };
    case 'world':
      return { label: 'World', className: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' };
    case 'user':
    default:
      return { label: 'User', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' };
  }
}

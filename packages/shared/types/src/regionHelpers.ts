/**
 * Region label utilities.
 *
 * Keeps the label-to-influence_region mapping in one place without
 * depending on generated label lists.
 */

/**
 * Convert a human label into influence_region syntax.
 *
 * Rules:
 * - foreground/background/full map directly
 * - subject or subject:N map to subject:N
 * - everything else becomes mask:<label>
 */
export function labelToInfluenceRegion(label: string): string {
  const normalized = label.toLowerCase().trim();

  if (normalized === 'foreground') return 'foreground';
  if (normalized === 'background') return 'background';
  if (normalized === 'full') return 'full';

  if (normalized === 'subject') return 'subject:0';
  const subjectMatch = normalized.match(/^subject[_:]?(\d+)$/);
  if (subjectMatch) return `subject:${subjectMatch[1]}`;

  return `mask:${normalized}`;
}

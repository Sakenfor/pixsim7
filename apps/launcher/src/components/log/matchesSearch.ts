/**
 * Search matcher for log filter inputs.
 *
 * Supports:
 *   `|`  — OR   ("error | warning" matches lines containing either)
 *   `!`  — NOT  ("!health" excludes lines containing "health")
 *
 * Combined: "error | warning !heartbeat" → (error OR warning) AND NOT heartbeat
 */
export function matchesSearch(line: string, filter: string): boolean {
  const lower = line.toLowerCase()
  const groups = filter.split('|').map((s) => s.trim()).filter(Boolean)
  if (groups.length === 0) return true

  // Collect negation tokens across all groups
  const negative: string[] = []
  const positiveGroups: string[] = []

  for (const g of groups) {
    const tokens = g.split(/\s+/)
    for (const t of tokens) {
      if (t.startsWith('!') && t.length > 1) {
        negative.push(t.slice(1).toLowerCase())
      }
    }
    const pos = tokens.filter((t) => !t.startsWith('!')).join(' ').toLowerCase().trim()
    if (pos) positiveGroups.push(pos)
  }

  // All negation terms must NOT match
  if (negative.some((n) => lower.includes(n))) return false

  // If no positive terms remain (all were negations), pass
  if (positiveGroups.length === 0) return true

  // At least one OR branch must match
  return positiveGroups.some((g) => lower.includes(g))
}

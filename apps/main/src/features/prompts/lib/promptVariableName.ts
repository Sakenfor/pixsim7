/**
 * promptVariableName
 *
 * Pure helpers that derive *structure* from a flat variable name. Storage stays
 * flat (`ACTOR1_DETAILS` is one canonical name) — this is purely a reading of
 * the name so UI can group/relate variables (a "stats"/character-sheet view).
 *
 *   ACTOR1_DETAILS  ->  class ACTOR · index 1 · entity ACTOR1 · facets [DETAILS]
 *   ACTOR1          ->  class ACTOR · index 1 · entity ACTOR1 · facets []
 *   GOAL            ->  class GOAL  · index — · entity GOAL   · facets []
 *
 * No persistence change; see plan `prompt-variable-placeholders` (Phase 3).
 */

/** Visual/taxonomy config for a default variable class. Data-only — no UI
 *  imports here; colour/icon are resolved in `variableClassVisuals.ts`, which
 *  links to the role taxonomy. `compositionRole` derives colour+icon from the
 *  shared role vocab; `color`/`icon` are explicit overrides (or for classes
 *  with no role match). */
export interface DefaultVariableClass {
  /** Linked composition role id (e.g. 'entities:main_character'). */
  compositionRole?: string;
  /** Explicit colour-name override (e.g. 'yellow'). */
  color?: string;
  /** Explicit @lib/icons IconName override (string to avoid a UI import here). */
  icon?: string;
}

/** Class-level defaults: any name in one of these classes is "recognised"
 *  even when the user hasn't explicitly saved it (so ACTOR1/ACTOR2/ACTOR3 just
 *  work). Class-level, not a fixed name list. Each links to the role taxonomy
 *  where one exists; GOAL has no role so carries an explicit colour/icon. */
export const DEFAULT_VARIABLE_CLASSES: Record<string, DefaultVariableClass> = {
  ACTOR: { compositionRole: 'entities:main_character' },
  GOAL: { color: 'yellow', icon: 'target' },
  SCENE: { compositionRole: 'world:environment' },
  SETTING: { compositionRole: 'world:environment' },
  STYLE: { compositionRole: 'materials:atmosphere', icon: 'palette' },
  CAMERA: { compositionRole: 'camera:angle' },
  MOOD: { compositionRole: 'materials:atmosphere' },
};

/** Whether a class name is a hard-coded default class. */
export function isDefaultVariableClassName(className: string): boolean {
  return Object.prototype.hasOwnProperty.call(DEFAULT_VARIABLE_CLASSES, className);
}

export interface ParsedVariableName {
  /** The original canonical name, uppercased. */
  raw: string;
  /** Leading-segment letters, e.g. `ACTOR` from `ACTOR1_DETAILS`. */
  className: string;
  /** Trailing digits of the leading segment, or null (e.g. 1 from `ACTOR1`). */
  index: number | null;
  /** Grouping key = the segment before the first underscore (e.g. `ACTOR1`). */
  entity: string;
  /** Facet path segments after the first underscore (e.g. `[DETAILS]`). */
  facets: string[];
  /** Facet path joined with `_`, or '' when there is no facet. */
  facetPath: string;
}

const _LEADING = /^([A-Za-z]+)(\d+)?/;

/** Parse a variable name into class / index / entity / facets. Tolerant of
 *  unexpected shapes — never throws; falls back to the whole name as entity. */
export function parseVariableName(name: string): ParsedVariableName {
  const raw = (name ?? '').trim().toUpperCase();
  const underscore = raw.indexOf('_');
  const head = underscore === -1 ? raw : raw.slice(0, underscore);
  const tail = underscore === -1 ? '' : raw.slice(underscore + 1);

  const m = _LEADING.exec(head);
  const className = m ? m[1] : head;
  const index = m && m[2] ? Number.parseInt(m[2], 10) : null;

  const facets = tail ? tail.split('_').filter(Boolean) : [];

  return {
    raw,
    className,
    index,
    entity: head || raw,
    facets,
    facetPath: facets.join('_'),
  };
}

/** Whether a name belongs to a hard-coded default class. */
export function isDefaultVariableClass(name: string): boolean {
  return isDefaultVariableClassName(parseVariableName(name).className);
}

export interface VariableGroupMember {
  /** Full canonical name (e.g. `ACTOR1_DETAILS`). */
  name: string;
  /** Facet path within the entity (e.g. `DETAILS`), '' for the bare entity. */
  facetPath: string;
  /** Saved in the user's vocabulary. */
  saved: boolean;
  /** Present in the current prompt (detected by analysis). */
  detected: boolean;
  description?: string;
}

export interface VariableGroup {
  /** Entity key (e.g. `ACTOR1`). */
  entity: string;
  className: string;
  index: number | null;
  /** Whether the entity's class is a hard-coded default. */
  defaultClass: boolean;
  members: VariableGroupMember[];
}

export interface VariableLike {
  name: string;
  description?: string;
}

/**
 * Group saved + detected variables by entity into a stats-style tree. Members
 * are sorted bare-entity-first then by facet path; groups sorted by entity.
 */
export function groupVariablesByEntity(
  saved: ReadonlyArray<VariableLike>,
  detected: ReadonlyArray<string> = [],
): VariableGroup[] {
  const savedByName = new Map<string, VariableLike>();
  for (const entry of saved) {
    const key = entry.name.trim().toUpperCase();
    if (key) savedByName.set(key, entry);
  }
  const detectedSet = new Set(detected.map((n) => n.trim().toUpperCase()).filter(Boolean));

  const groups = new Map<string, VariableGroup>();
  const ensureGroup = (parsed: ParsedVariableName): VariableGroup => {
    let group = groups.get(parsed.entity);
    if (!group) {
      group = {
        entity: parsed.entity,
        className: parsed.className,
        index: parsed.index,
        defaultClass: isDefaultVariableClassName(parsed.className),
        members: [],
      };
      groups.set(parsed.entity, group);
    }
    return group;
  };

  const allNames = new Set<string>([...savedByName.keys(), ...detectedSet]);
  for (const name of allNames) {
    const parsed = parseVariableName(name);
    const group = ensureGroup(parsed);
    group.members.push({
      name,
      facetPath: parsed.facetPath,
      saved: savedByName.has(name),
      detected: detectedSet.has(name),
      description: savedByName.get(name)?.description,
    });
  }

  for (const group of groups.values()) {
    group.members.sort((a, b) => {
      // Bare entity (no facet) first, then alphabetical by facet path.
      if (!a.facetPath && b.facetPath) return -1;
      if (a.facetPath && !b.facetPath) return 1;
      return a.facetPath.localeCompare(b.facetPath);
    });
  }

  return Array.from(groups.values()).sort((a, b) => a.entity.localeCompare(b.entity));
}

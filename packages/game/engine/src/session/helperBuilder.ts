import { sessionHelperRegistry, type HelperDefinition } from './helperRegistry';
import type { GameSessionDTO } from '@pixsim7/shared.types';
import { getFlag, setFlag } from './helpers';

export interface HelperSchema {
  name: string;
  category?: HelperDefinition['category'];
  keyPattern: string; // "arcs.{arcId}.stage"
  operation: 'get' | 'set' | 'inc' | 'dec' | 'push' | 'toggle';
}

/**
 * Generate and register a helper from a schema
 * Makes it trivial to add new helpers without writing boilerplate
 */
export function generateHelper(schema: HelperSchema) {
  const fn = (session: GameSessionDTO, ...args: any[]) => {
    // Build key from pattern
    let key = schema.keyPattern;
    const matches = key.match(/\{(\w+)\}/g);

    if (matches) {
      matches.forEach((match, idx) => {
        const paramName = match.slice(1, -1); // Remove {}
        key = key.replace(match, String(args[idx]));
      });
    }

    // Get value index (after all key params)
    const valueIdx = matches?.length ?? 0;
    const value = args[valueIdx];

    // Ensure flags object exists
    if (!session.flags) session.flags = {};

    // Apply operation using nested path helpers
    switch (schema.operation) {
      case 'get':
        return getFlag(session, key);
      case 'set':
        setFlag(session, key, value);
        return session;
      case 'inc':
        setFlag(session, key, (getFlag(session, key) ?? 0) + (value ?? 1));
        return session;
      case 'dec':
        setFlag(session, key, (getFlag(session, key) ?? 0) - (value ?? 1));
        return session;
      case 'push':
        const currentArray = getFlag(session, key);
        if (!Array.isArray(currentArray)) {
          setFlag(session, key, [value]);
        } else {
          currentArray.push(value);
        }
        return session;
      case 'toggle':
        setFlag(session, key, !getFlag(session, key));
        return session;
    }
  };

  sessionHelperRegistry.register({
    name: schema.name,
    fn,
    category: schema.category,
    description: `Auto-generated: ${schema.operation} ${schema.keyPattern}`,
  });
}

/**
 * Example usage:
 *
 * generateHelper({
 *   name: 'incrementReputation',
 *   category: 'custom',
 *   keyPattern: 'reputation.{faction}',
 *   operation: 'inc',
 * });
 *
 * // Now you can:
 * // session.incrementReputation('thieves-guild', 10);
 */

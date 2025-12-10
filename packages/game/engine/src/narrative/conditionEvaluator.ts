/**
 * Condition Evaluator for Narrative Runtime
 *
 * Parses and evaluates condition expressions against game state.
 * Supports:
 * - Comparisons: ==, !=, <, <=, >, >=
 * - Logical operators: &&, ||, !
 * - Variable paths: affinity, trust, flags.hasMetBefore, arcs.romance.stage
 * - BETWEEN operator: affinity BETWEEN 60 AND 80
 * - Parentheses for grouping
 *
 * @example
 * const evaluator = new ConditionEvaluator();
 * const context = buildEvalContext(session, npcId);
 * const result = evaluator.evaluate("affinity >= 60 && trust > 50", context);
 */

import type { GameSessionDTO } from '@pixsim7/shared.types';
import type { NpcRelationshipState } from '../core/types';
import { getNpcRelationshipState, getArcState, getQuestState, getInventory } from '../session/state';

/**
 * Context for condition evaluation.
 * Contains all state that conditions can reference.
 */
export interface EvalContext {
  /** Relationship values (affinity, trust, chemistry, tension) */
  affinity: number;
  trust: number;
  chemistry: number;
  tension: number;

  /** Relationship tier and intimacy */
  tier: string;
  intimacyLevel: string | null;

  /** Relationship flags as a Set for fast lookup */
  relationshipFlags: Set<string>;

  /** Session flags (arbitrary nested object) */
  flags: Record<string, any>;

  /** Arc states */
  arcs: Record<string, { stage: number | string; [key: string]: any }>;

  /** Quest states */
  quests: Record<string, { status: string; stepsCompleted: number }>;

  /** Inventory items (id -> quantity) */
  inventory: Record<string, number>;

  /** World time (seconds since Monday 00:00) */
  worldTime: number;

  /** Program variables (local to narrative program) */
  variables: Record<string, any>;

  /** NPC ID being evaluated */
  npcId: number;
}

/**
 * Build evaluation context from session and NPC data.
 */
export function buildEvalContext(
  session: GameSessionDTO,
  npcId: number,
  programVariables: Record<string, any> = {}
): EvalContext {
  // Get relationship state
  const relationship = getNpcRelationshipState(session, npcId);

  // Build flags lookup
  const flags = (session.flags as Record<string, any>) || {};

  // Build arcs lookup
  const arcsRaw = flags.arcs || {};
  const arcs: Record<string, { stage: number | string }> = {};
  for (const [arcId, arcState] of Object.entries(arcsRaw)) {
    if (arcState && typeof arcState === 'object') {
      arcs[arcId] = arcState as { stage: number | string };
    }
  }

  // Build quests lookup
  const questsRaw = flags.quests || {};
  const quests: Record<string, { status: string; stepsCompleted: number }> = {};
  for (const [questId, questState] of Object.entries(questsRaw)) {
    if (questState && typeof questState === 'object') {
      quests[questId] = questState as { status: string; stepsCompleted: number };
    }
  }

  // Build inventory lookup
  const inventoryItems = getInventory(session);
  const inventory: Record<string, number> = {};
  for (const item of inventoryItems) {
    inventory[item.id] = item.qty;
  }

  return {
    affinity: relationship?.affinity ?? 0,
    trust: relationship?.trust ?? 0,
    chemistry: relationship?.chemistry ?? 0,
    tension: relationship?.tension ?? 0,
    tier: relationship?.tierId ?? 'stranger',
    intimacyLevel: relationship?.intimacyLevelId ?? null,
    relationshipFlags: new Set(relationship?.flags ?? []),
    flags,
    arcs,
    quests,
    inventory,
    worldTime: session.world_time ?? 0,
    variables: programVariables,
    npcId,
  };
}

/**
 * Token types for the expression parser.
 */
type TokenType =
  | 'NUMBER'
  | 'STRING'
  | 'IDENTIFIER'
  | 'OPERATOR'
  | 'LOGICAL'
  | 'LPAREN'
  | 'RPAREN'
  | 'BETWEEN'
  | 'AND'
  | 'OR'
  | 'NOT'
  | 'TRUE'
  | 'FALSE'
  | 'NULL'
  | 'EOF';

interface Token {
  type: TokenType;
  value: string | number | boolean | null;
  raw: string;
}

/**
 * Condition Evaluator
 *
 * Parses and evaluates condition expression strings.
 */
export class ConditionEvaluator {
  private tokens: Token[] = [];
  private pos: number = 0;

  /**
   * Evaluate a condition expression against context.
   *
   * @param expression - Condition string (e.g., "affinity >= 60 && trust > 50")
   * @param context - Evaluation context with state values
   * @returns Boolean result
   */
  evaluate(expression: string, context: EvalContext): boolean {
    if (!expression || expression.trim() === '') {
      return true; // Empty condition = always true
    }

    try {
      this.tokens = this.tokenize(expression);
      this.pos = 0;
      const result = this.parseOr(context);

      // Ensure we consumed all tokens
      if (this.pos < this.tokens.length && this.tokens[this.pos].type !== 'EOF') {
        throw new Error(`Unexpected token: ${this.tokens[this.pos].raw}`);
      }

      return Boolean(result);
    } catch (error) {
      console.warn(`[ConditionEvaluator] Failed to evaluate "${expression}":`, error);
      return false; // Fail closed
    }
  }

  /**
   * Tokenize expression string into tokens.
   */
  private tokenize(expr: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;

    while (i < expr.length) {
      const char = expr[i];

      // Skip whitespace
      if (/\s/.test(char)) {
        i++;
        continue;
      }

      // Parentheses
      if (char === '(') {
        tokens.push({ type: 'LPAREN', value: '(', raw: '(' });
        i++;
        continue;
      }
      if (char === ')') {
        tokens.push({ type: 'RPAREN', value: ')', raw: ')' });
        i++;
        continue;
      }

      // Two-character operators
      const twoChar = expr.slice(i, i + 2);
      if (['==', '!=', '<=', '>=', '&&', '||'].includes(twoChar)) {
        if (twoChar === '&&') {
          tokens.push({ type: 'AND', value: '&&', raw: '&&' });
        } else if (twoChar === '||') {
          tokens.push({ type: 'OR', value: '||', raw: '||' });
        } else {
          tokens.push({ type: 'OPERATOR', value: twoChar, raw: twoChar });
        }
        i += 2;
        continue;
      }

      // Single-character operators
      if (['<', '>', '!'].includes(char)) {
        if (char === '!') {
          tokens.push({ type: 'NOT', value: '!', raw: '!' });
        } else {
          tokens.push({ type: 'OPERATOR', value: char, raw: char });
        }
        i++;
        continue;
      }

      // Numbers (including negative)
      if (/[0-9]/.test(char) || (char === '-' && /[0-9]/.test(expr[i + 1] || ''))) {
        let numStr = '';
        if (char === '-') {
          numStr += char;
          i++;
        }
        while (i < expr.length && /[0-9.]/.test(expr[i])) {
          numStr += expr[i];
          i++;
        }
        tokens.push({ type: 'NUMBER', value: parseFloat(numStr), raw: numStr });
        continue;
      }

      // Strings (single or double quoted)
      if (char === '"' || char === "'") {
        const quote = char;
        i++;
        let str = '';
        while (i < expr.length && expr[i] !== quote) {
          if (expr[i] === '\\' && i + 1 < expr.length) {
            i++;
            str += expr[i];
          } else {
            str += expr[i];
          }
          i++;
        }
        i++; // Skip closing quote
        tokens.push({ type: 'STRING', value: str, raw: `${quote}${str}${quote}` });
        continue;
      }

      // Identifiers and keywords
      if (/[a-zA-Z_]/.test(char)) {
        let ident = '';
        while (i < expr.length && /[a-zA-Z0-9_.]/.test(expr[i])) {
          ident += expr[i];
          i++;
        }

        const upper = ident.toUpperCase();
        if (upper === 'BETWEEN') {
          tokens.push({ type: 'BETWEEN', value: 'BETWEEN', raw: ident });
        } else if (upper === 'AND') {
          tokens.push({ type: 'AND', value: 'AND', raw: ident });
        } else if (upper === 'OR') {
          tokens.push({ type: 'OR', value: 'OR', raw: ident });
        } else if (upper === 'NOT') {
          tokens.push({ type: 'NOT', value: 'NOT', raw: ident });
        } else if (upper === 'TRUE') {
          tokens.push({ type: 'TRUE', value: true, raw: ident });
        } else if (upper === 'FALSE') {
          tokens.push({ type: 'FALSE', value: false, raw: ident });
        } else if (upper === 'NULL') {
          tokens.push({ type: 'NULL', value: null, raw: ident });
        } else {
          tokens.push({ type: 'IDENTIFIER', value: ident, raw: ident });
        }
        continue;
      }

      throw new Error(`Unexpected character: ${char}`);
    }

    tokens.push({ type: 'EOF', value: null, raw: '' });
    return tokens;
  }

  // Parsing methods (recursive descent parser)

  private current(): Token {
    return this.tokens[this.pos] || { type: 'EOF', value: null, raw: '' };
  }

  private advance(): Token {
    const token = this.current();
    this.pos++;
    return token;
  }

  private parseOr(context: EvalContext): any {
    let left = this.parseAnd(context);

    while (this.current().type === 'OR') {
      this.advance();
      const right = this.parseAnd(context);
      left = left || right;
    }

    return left;
  }

  private parseAnd(context: EvalContext): any {
    let left = this.parseNot(context);

    while (this.current().type === 'AND') {
      this.advance();
      const right = this.parseNot(context);
      left = left && right;
    }

    return left;
  }

  private parseNot(context: EvalContext): any {
    if (this.current().type === 'NOT') {
      this.advance();
      return !this.parseNot(context);
    }
    return this.parseComparison(context);
  }

  private parseComparison(context: EvalContext): any {
    const left = this.parsePrimary(context);

    // Check for BETWEEN
    if (this.current().type === 'BETWEEN') {
      this.advance();
      const low = this.parsePrimary(context);
      if (this.current().type !== 'AND') {
        throw new Error('Expected AND in BETWEEN expression');
      }
      this.advance();
      const high = this.parsePrimary(context);
      return left >= low && left <= high;
    }

    // Check for comparison operators
    const token = this.current();
    if (token.type === 'OPERATOR') {
      this.advance();
      const right = this.parsePrimary(context);
      return this.compare(left, token.value as string, right);
    }

    return left;
  }

  private parsePrimary(context: EvalContext): any {
    const token = this.current();

    switch (token.type) {
      case 'NUMBER':
        this.advance();
        return token.value;

      case 'STRING':
        this.advance();
        return token.value;

      case 'TRUE':
        this.advance();
        return true;

      case 'FALSE':
        this.advance();
        return false;

      case 'NULL':
        this.advance();
        return null;

      case 'IDENTIFIER':
        this.advance();
        return this.resolveIdentifier(token.value as string, context);

      case 'LPAREN':
        this.advance();
        const result = this.parseOr(context);
        if (this.current().type !== 'RPAREN') {
          throw new Error('Expected closing parenthesis');
        }
        this.advance();
        return result;

      default:
        throw new Error(`Unexpected token: ${token.raw}`);
    }
  }

  /**
   * Resolve an identifier path to a value from context.
   */
  private resolveIdentifier(path: string, context: EvalContext): any {
    // Direct relationship values
    if (path === 'affinity') return context.affinity;
    if (path === 'trust') return context.trust;
    if (path === 'chemistry') return context.chemistry;
    if (path === 'tension') return context.tension;
    if (path === 'tier') return context.tier;
    if (path === 'intimacyLevel') return context.intimacyLevel;
    if (path === 'worldTime') return context.worldTime;

    // Dot-notation paths
    const parts = path.split('.');

    // flags.xxx
    if (parts[0] === 'flags') {
      return this.getNestedValue(context.flags, parts.slice(1));
    }

    // arcs.arcId.stage (or arcs.arcId)
    if (parts[0] === 'arcs') {
      const arcId = parts[1];
      if (!arcId) return undefined;
      const arc = context.arcs[arcId];
      if (!arc) return undefined;
      if (parts.length === 2) return arc.stage;
      return this.getNestedValue(arc, parts.slice(2));
    }

    // quests.questId.status
    if (parts[0] === 'quests') {
      const questId = parts[1];
      if (!questId) return undefined;
      const quest = context.quests[questId];
      if (!quest) return undefined;
      if (parts.length === 2) return quest.status;
      return this.getNestedValue(quest, parts.slice(2));
    }

    // inventory.itemId (returns quantity)
    if (parts[0] === 'inventory') {
      const itemId = parts[1];
      if (!itemId) return 0;
      return context.inventory[itemId] ?? 0;
    }

    // hasFlag.flagName (checks relationship flags)
    if (parts[0] === 'hasFlag') {
      const flagName = parts[1];
      return flagName ? context.relationshipFlags.has(flagName) : false;
    }

    // variables.xxx (program variables)
    if (parts[0] === 'variables' || parts[0] === 'var') {
      return this.getNestedValue(context.variables, parts.slice(1));
    }

    // Try as direct flag path
    return this.getNestedValue(context.flags, parts);
  }

  /**
   * Get nested value from object using path parts.
   */
  private getNestedValue(obj: any, parts: string[]): any {
    let current = obj;
    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = current[part];
    }
    return current;
  }

  /**
   * Compare two values with an operator.
   */
  private compare(left: any, op: string, right: any): boolean {
    switch (op) {
      case '==':
        return left == right;
      case '!=':
        return left != right;
      case '<':
        return left < right;
      case '<=':
        return left <= right;
      case '>':
        return left > right;
      case '>=':
        return left >= right;
      default:
        throw new Error(`Unknown operator: ${op}`);
    }
  }
}

/**
 * Singleton instance for convenience.
 */
export const conditionEvaluator = new ConditionEvaluator();

/**
 * Convenience function to evaluate a condition.
 */
export function evaluateCondition(
  expression: string,
  session: GameSessionDTO,
  npcId: number,
  programVariables?: Record<string, any>
): boolean {
  const context = buildEvalContext(session, npcId, programVariables);
  return conditionEvaluator.evaluate(expression, context);
}

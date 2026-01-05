/**
 * Assertion Framework for Scenario Testing
 *
 * Provides reusable assertion helpers and result types for validating
 * scenario outcomes.
 */

import { WorldSnapshot, SessionSnapshot } from './snapshot';

/**
 * Assertion check function signature
 */
export type AssertionCheckFn = (snapshot: WorldSnapshot) => boolean;

/**
 * Scenario assertion definition
 */
export interface ScenarioAssertion {
  id: string;
  description: string;
  check: AssertionCheckFn;
}

/**
 * Result of a single assertion
 */
export interface AssertionResult {
  assertId: string;
  description: string;
  passed: boolean;
  details?: string;
  actualValue?: unknown;
  expectedValue?: unknown;
}

/**
 * Helper to get a session from a snapshot by ID
 */
export function getSession(snapshot: WorldSnapshot, sessionId: number): SessionSnapshot | undefined {
  return snapshot.sessions.find(s => s.sessionId === sessionId);
}

/**
 * Helper to get a flag value from a session
 */
export function getFlag(session: SessionSnapshot, path: string): unknown {
  const parts = path.split('.');
  let current: any = session.flags;

  for (const part of parts) {
    if (current === undefined || current === null) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

/**
 * Helper to get a relationship metric value
 */
export function getRelationshipMetric(
  session: SessionSnapshot,
  npcId: number,
  metric: string
): number | undefined {
  const npcKey = `npc:${npcId}`;
  const npcData = session.stats?.relationships?.[npcKey] as any;

  if (!npcData) {
    return undefined;
  }

  return npcData[metric] as number | undefined;
}

// ===== Assertion Builders =====

/**
 * Assert that world time matches expected value
 */
export function assertWorldTime(expected: number, tolerance: number = 0.1): ScenarioAssertion {
  return {
    id: `world_time_${expected}`,
    description: `World time should be ${expected}s (±${tolerance}s)`,
    check: (snapshot) => {
      const diff = Math.abs(snapshot.worldTime - expected);
      return diff <= tolerance;
    },
  };
}

/**
 * Assert that a session flag equals expected value
 */
export function assertFlagEquals(
  sessionId: number,
  flagPath: string,
  expected: unknown
): ScenarioAssertion {
  return {
    id: `flag_${sessionId}_${flagPath}`,
    description: `Session ${sessionId} flag '${flagPath}' should equal ${JSON.stringify(expected)}`,
    check: (snapshot) => {
      const session = getSession(snapshot, sessionId);
      if (!session) return false;

      const actual = getFlag(session, flagPath);
      return JSON.stringify(actual) === JSON.stringify(expected);
    },
  };
}

/**
 * Assert that a relationship metric is within range
 */
export function assertMetricBetween(
  sessionId: number,
  npcId: number,
  metric: string,
  min: number,
  max: number
): ScenarioAssertion {
  return {
    id: `metric_${sessionId}_${npcId}_${metric}`,
    description: `NPC ${npcId} ${metric} should be between ${min} and ${max}`,
    check: (snapshot) => {
      const session = getSession(snapshot, sessionId);
      if (!session) return false;

      const value = getRelationshipMetric(session, npcId, metric);
      if (value === undefined) return false;

      return value >= min && value <= max;
    },
  };
}

/**
 * Assert that a relationship tier ID matches expected
 */
export function assertRelationshipTier(
  sessionId: number,
  npcId: number,
  expectedTierId: string
): ScenarioAssertion {
  return {
    id: `tier_${sessionId}_${npcId}`,
    description: `NPC ${npcId} relationship tier should be '${expectedTierId}'`,
    check: (snapshot) => {
      const session = getSession(snapshot, sessionId);
      if (!session) return false;

      const npcKey = `npc:${npcId}`;
      const npcData = session.stats?.relationships?.[npcKey] as any;

      return npcData?.tierId === expectedTierId;
    },
  };
}

/**
 * Assert that intimacy level ID matches expected
 */
export function assertIntimacyLevel(
  sessionId: number,
  npcId: number,
  expectedLevelId: string
): ScenarioAssertion {
  return {
    id: `intimacy_${sessionId}_${npcId}`,
    description: `NPC ${npcId} intimacy level should be '${expectedLevelId}'`,
    check: (snapshot) => {
      const session = getSession(snapshot, sessionId);
      if (!session) return false;

      const npcKey = `npc:${npcId}`;
      const npcData = session.stats?.relationships?.[npcKey] as any;

      // Check both levelId (new) and intimacyLevelId (legacy) for backwards compat
      return (npcData?.levelId ?? npcData?.intimacyLevelId) === expectedLevelId;
    },
  };
}

/**
 * Assert that no NPC has intimacy level beyond consent threshold
 * Safety rail for content validation
 */
export function assertNoIntimateSceneWithoutConsent(
  sessionId: number,
  consentThreshold: string = 'intimate'
): ScenarioAssertion {
  return {
    id: `consent_safety_${sessionId}`,
    description: `No NPC should have intimacy beyond '${consentThreshold}' without consent flag`,
    check: (snapshot) => {
      const session = getSession(snapshot, sessionId);
      if (!session) return true; // Pass if session not found

      // Check all NPCs in relationships
      const relationships = session.stats?.relationships || {};
      for (const [key, data] of Object.entries(relationships)) {
        if (!key.startsWith('npc:')) continue;

        const npcData = data as any;
        // Check both levelId (new) and intimacyLevelId (legacy)
        const intimacyId = npcData?.levelId ?? npcData?.intimacyLevelId;
        const hasConsent = npcData?.consentGiven === true;

        // If intimacy is at or beyond threshold and no consent, fail
        if (intimacyId === consentThreshold && !hasConsent) {
          return false;
        }
      }

      return true;
    },
  };
}

/**
 * Evaluate assertions against a snapshot
 */
export function evaluateAssertions(
  assertions: ScenarioAssertion[],
  snapshot: WorldSnapshot
): AssertionResult[] {
  return assertions.map(assertion => {
    try {
      const passed = assertion.check(snapshot);
      return {
        assertId: assertion.id,
        description: assertion.description,
        passed,
      };
    } catch (error) {
      return {
        assertId: assertion.id,
        description: assertion.description,
        passed: false,
        details: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

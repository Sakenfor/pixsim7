/**
 * Automation API (Phase 10)
 *
 * Programmatic interface for running simulations headlessly.
 * Supports automated testing, regression checks, and CI integration.
 */

import { simulationHooksRegistry, type SimulationEvent, type SimulationTickContext } from '../../hooks';

import { evaluateConstraint, type AnyConstraint, type ConstraintEvaluationContext } from './constraints';
import { addSnapshot, createHistory, type SimulationHistory } from './history';
import { getScenario, type SimulationScenario } from './scenarios';

/**
 * Simulation run configuration
 */
export interface SimulationRunConfig {
  scenarioId?: string;
  scenario?: SimulationScenario;
  maxTicks?: number;
  tickSize?: number; // seconds per tick
  constraint?: AnyConstraint;
  enablePlugins?: string[]; // Plugin IDs to enable
  disablePlugins?: string[]; // Plugin IDs to disable
}

/**
 * Simulation run result
 */
export interface SimulationRunResult {
  success: boolean;
  ticksRun: number;
  finalWorldTime: number;
  finalFlags: Record<string, unknown>;
  finalRelationships: Record<string, unknown>;
  events: SimulationEvent[];
  history: SimulationHistory;
  constraintSatisfied?: boolean;
  error?: string;
}

/**
 * Assertion result
 */
export interface AssertionResult {
  passed: boolean;
  message: string;
  expected?: unknown;
  actual?: unknown;
}

/**
 * Regression test definition
 */
export interface RegressionTest {
  name: string;
  description?: string;
  scenarioId: string;
  config: SimulationRunConfig;
  assertions: ((result: SimulationRunResult) => AssertionResult)[];
}

/**
 * Regression test suite result
 */
export interface RegressionTestSuiteResult {
  suiteName: string;
  totalTests: number;
  passed: number;
  failed: number;
  tests: {
    name: string;
    passed: boolean;
    assertions: AssertionResult[];
    error?: string;
  }[];
  duration: number;
}

/**
 * Headless simulation runner
 * Runs simulations programmatically without UI interaction
 */
export class HeadlessSimulationRunner {
  private worldTime: number = 0;
  private sessionFlags: Record<string, unknown> = {};
  private sessionRelationships: Record<string, unknown> = {};
  private history: SimulationHistory | null = null;
  private events: SimulationEvent[] = [];

  /**
   * Load a scenario
   */
  loadScenario(scenario: SimulationScenario): void {
    this.worldTime = scenario.initialWorldTime;
    this.sessionFlags = { ...scenario.initialSessionFlags };
    this.sessionRelationships = { ...scenario.initialRelationships };
    this.history = createHistory(scenario.id, scenario.name);
    this.events = [];
  }

  /**
   * Run a single tick
   */
  async tick(deltaSeconds: number, worldId: number): Promise<SimulationEvent[]> {
    this.worldTime += deltaSeconds;

    // Build tick context
    const context: SimulationTickContext = {
      worldId,
      worldDetail: null as SimulationTickContext['worldDetail'], // Would need real world data in production
      worldTime: this.worldTime,
      deltaSeconds,
      session: {
        id: 0,
        flags: this.sessionFlags,
        relationships: this.sessionRelationships,
      } as SimulationTickContext['session'],
      selectedNpcIds: [],
    };

    // Run hooks to generate events
    const tickEvents = await simulationHooksRegistry.runAll(context);
    this.events.push(...tickEvents);

    // Add to history
    if (this.history) {
      this.history = addSnapshot(this.history, {
        timestamp: Date.now(),
        worldTime: this.worldTime,
        worldId,
        sessionSnapshot: {
          flags: { ...this.sessionFlags },
          relationships: { ...this.sessionRelationships },
        },
        events: tickEvents,
      });
    }

    return tickEvents;
  }

  /**
   * Run multiple ticks
   */
  async runTicks(numTicks: number, tickSize: number, worldId: number): Promise<void> {
    for (let i = 0; i < numTicks; i++) {
      await this.tick(tickSize, worldId);
    }
  }

  /**
   * Run until constraint is satisfied or max ticks reached
   */
  async runUntilConstraint(
    constraint: AnyConstraint,
    tickSize: number,
    worldId: number,
    maxTicks: number = 100
  ): Promise<{ satisfied: boolean; ticksRun: number }> {
    let ticksRun = 0;

    while (ticksRun < maxTicks) {
      await this.tick(tickSize, worldId);
      ticksRun++;

      // Evaluate constraint
      const context: ConstraintEvaluationContext = {
        worldTime: this.worldTime,
        worldDetail: null as ConstraintEvaluationContext['worldDetail'],
        sessionFlags: this.sessionFlags,
        npcPresences: [],
        tickCount: ticksRun,
        snapshot: this.history?.snapshots[this.history.snapshots.length - 1],
      };

      const result = evaluateConstraint(constraint, context);
      if (result.satisfied) {
        return { satisfied: true, ticksRun };
      }
    }

    return { satisfied: false, ticksRun };
  }

  /**
   * Get current state summary
   */
  getSummary(): {
    worldTime: number;
    flags: Record<string, unknown>;
    relationships: Record<string, unknown>;
    totalEvents: number;
  } {
    return {
      worldTime: this.worldTime,
      flags: { ...this.sessionFlags },
      relationships: { ...this.sessionRelationships },
      totalEvents: this.events.length,
    };
  }

  /**
   * Get full result
   */
  getResult(): SimulationRunResult {
    return {
      success: true,
      ticksRun: this.history?.snapshots.length || 0,
      finalWorldTime: this.worldTime,
      finalFlags: { ...this.sessionFlags },
      finalRelationships: { ...this.sessionRelationships },
      events: [...this.events],
      history: this.history!,
    };
  }
}

/**
 * Run a simulation programmatically
 */
export async function runSimulation(
  config: SimulationRunConfig
): Promise<SimulationRunResult> {
  try {
    // Load scenario
    let scenario: SimulationScenario | undefined;
    if (config.scenarioId) {
      scenario = getScenario(config.scenarioId) || undefined;
      if (!scenario) {
        return {
          success: false,
          ticksRun: 0,
          finalWorldTime: 0,
          finalFlags: {},
          finalRelationships: {},
          events: [],
          history: createHistory(null, null),
          error: `Scenario not found: ${config.scenarioId}`,
        };
      }
    } else if (config.scenario) {
      scenario = config.scenario;
    } else {
      return {
        success: false,
        ticksRun: 0,
        finalWorldTime: 0,
        finalFlags: {},
        finalRelationships: {},
        events: [],
        history: createHistory(null, null),
        error: 'No scenario provided',
      };
    }

    // Configure plugins
    if (config.enablePlugins) {
      config.enablePlugins.forEach((id) => simulationHooksRegistry.setPluginEnabled(id, true));
    }
    if (config.disablePlugins) {
      config.disablePlugins.forEach((id) => simulationHooksRegistry.setPluginEnabled(id, false));
    }

    // Create runner
    const runner = new HeadlessSimulationRunner();
    runner.loadScenario(scenario);

    const tickSize = config.tickSize || 3600; // Default 1 hour
    const maxTicks = config.maxTicks || 100;
    const worldId = scenario.worldId;

    // Run simulation
    if (config.constraint) {
      const { satisfied } = await runner.runUntilConstraint(
        config.constraint,
        tickSize,
        worldId,
        maxTicks
      );

      const result = runner.getResult();
      result.constraintSatisfied = satisfied;
      return result;
    } else {
      await runner.runTicks(maxTicks, tickSize, worldId);
      return runner.getResult();
    }
  } catch (error) {
    return {
      success: false,
      ticksRun: 0,
      finalWorldTime: 0,
      finalFlags: {},
      finalRelationships: {},
      events: [],
      history: createHistory(null, null),
      error: String(error),
    };
  }
}

/**
 * Common assertion helpers
 */
export const assertions = {
  /**
   * Assert world time reached a value
   */
  worldTimeReached: (expectedTime: number) => {
    return (result: SimulationRunResult): AssertionResult => {
      const passed = result.finalWorldTime >= expectedTime;
      return {
        passed,
        message: passed
          ? `World time reached ${expectedTime}`
          : `World time ${result.finalWorldTime} did not reach ${expectedTime}`,
        expected: expectedTime,
        actual: result.finalWorldTime,
      };
    };
  },

  /**
   * Assert a flag has a specific value
   */
  flagEquals: (flagPath: string, expectedValue: unknown) => {
    return (result: SimulationRunResult): AssertionResult => {
      const parts = flagPath.split('.');
      let current: unknown = result.finalFlags;
      for (const part of parts) {
        if (current == null || typeof current !== 'object') {
          current = undefined;
          break;
        }
        current = (current as Record<string, unknown>)[part];
      }

      const passed = JSON.stringify(current) === JSON.stringify(expectedValue);
      return {
        passed,
        message: passed
          ? `Flag ${flagPath} equals ${JSON.stringify(expectedValue)}`
          : `Flag ${flagPath} = ${JSON.stringify(current)}, expected ${JSON.stringify(
              expectedValue
            )}`,
        expected: expectedValue,
        actual: current,
      };
    };
  },

  /**
   * Assert minimum number of events occurred
   */
  minEvents: (count: number) => {
    return (result: SimulationRunResult): AssertionResult => {
      const passed = result.events.length >= count;
      return {
        passed,
        message: passed
          ? `At least ${count} events occurred`
          : `Only ${result.events.length} events occurred, expected at least ${count}`,
        expected: `>= ${count}`,
        actual: result.events.length,
      };
    };
  },

  /**
   * Assert constraint was satisfied
   */
  constraintSatisfied: () => {
    return (result: SimulationRunResult): AssertionResult => {
      const passed = result.constraintSatisfied === true;
      return {
        passed,
        message: passed ? 'Constraint was satisfied' : 'Constraint was not satisfied',
        expected: true,
        actual: result.constraintSatisfied,
      };
    };
  },

  /**
   * Assert simulation succeeded without errors
   */
  noErrors: () => {
    return (result: SimulationRunResult): AssertionResult => {
      const errorEvents = result.events.filter((e) => e.type === 'error');
      const passed = errorEvents.length === 0;
      return {
        passed,
        message: passed
          ? 'No errors occurred'
          : `${errorEvents.length} error(s) occurred: ${errorEvents
              .map((e) => e.title)
              .join(', ')}`,
        expected: 0,
        actual: errorEvents.length,
      };
    };
  },
};

/**
 * Run a regression test suite
 */
export async function runRegressionTestSuite(
  suiteName: string,
  tests: RegressionTest[]
): Promise<RegressionTestSuiteResult> {
  const startTime = Date.now();
  const results: RegressionTestSuiteResult = {
    suiteName,
    totalTests: tests.length,
    passed: 0,
    failed: 0,
    tests: [],
    duration: 0,
  };

  for (const test of tests) {
    try {
      // Run simulation
      const runResult = await runSimulation(test.config);

      // Run assertions
      const assertionResults = test.assertions.map((assertion) => assertion(runResult));

      const testPassed = assertionResults.every((a) => a.passed);
      if (testPassed) {
        results.passed++;
      } else {
        results.failed++;
      }

      results.tests.push({
        name: test.name,
        passed: testPassed,
        assertions: assertionResults,
      });
    } catch (error) {
      results.failed++;
      results.tests.push({
        name: test.name,
        passed: false,
        assertions: [],
        error: String(error),
      });
    }
  }

  results.duration = Date.now() - startTime;
  return results;
}

/**
 * Format regression test results for console output
 */
export function formatRegressionResults(results: RegressionTestSuiteResult): string {
  const lines: string[] = [];
  lines.push(`\n${'='.repeat(60)}`);
  lines.push(`Regression Test Suite: ${results.suiteName}`);
  lines.push(`${'='.repeat(60)}`);
  lines.push(
    `Results: ${results.passed} passed, ${results.failed} failed (${results.totalTests} total)`
  );
  lines.push(`Duration: ${(results.duration / 1000).toFixed(2)}s\n`);

  for (const test of results.tests) {
    const symbol = test.passed ? '✓' : '✗';
    const status = test.passed ? 'PASSED' : 'FAILED';
    lines.push(`${symbol} ${test.name} - ${status}`);

    if (!test.passed) {
      if (test.error) {
        lines.push(`  Error: ${test.error}`);
      }

      for (const assertion of test.assertions) {
        if (!assertion.passed) {
          lines.push(`  ${assertion.message}`);
          if (assertion.expected !== undefined) {
            lines.push(`    Expected: ${JSON.stringify(assertion.expected)}`);
            lines.push(`    Actual: ${JSON.stringify(assertion.actual)}`);
          }
        }
      }
    }
    lines.push('');
  }

  lines.push(`${'='.repeat(60)}\n`);
  return lines.join('\n');
}

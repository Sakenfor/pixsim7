/**
 * Example Regression Tests (Phase 10)
 *
 * Demonstrates how to write automated regression tests for simulation scenarios.
 * These tests can be run in CI to ensure simulation behavior remains consistent.
 */

import type { RegressionTest } from '../automationAPI';
import {
  runRegressionTestSuite,
  formatRegressionResults,
  assertions,
} from '../automationAPI';
import { createWorldTimeConstraint, createTickCountConstraint } from '../constraints';

/**
 * Example test suite: Basic time progression
 */
export const basicTimeProgressionTests: RegressionTest[] = [
  {
    name: 'World time advances correctly',
    description: 'Verifies that world time advances by the expected amount',
    scenarioId: 'test-scenario-1',
    config: {
      maxTicks: 10,
      tickSize: 3600, // 1 hour per tick
    },
    assertions: [
      assertions.worldTimeReached(10 * 3600), // 10 hours
      assertions.noErrors(),
      assertions.minEvents(1),
    ],
  },

  {
    name: 'Constraint-driven run stops correctly',
    description: 'Verifies that simulation stops when constraint is met',
    scenarioId: 'test-scenario-1',
    config: {
      maxTicks: 100,
      tickSize: 3600,
      constraint: createWorldTimeConstraint('gte', 24 * 3600), // Run until 1 day
    },
    assertions: [
      assertions.constraintSatisfied(),
      assertions.worldTimeReached(24 * 3600),
      assertions.noErrors(),
    ],
  },
];

/**
 * Example test suite: Flag progression
 */
export const flagProgressionTests: RegressionTest[] = [
  {
    name: 'Quest flags update correctly',
    description: 'Verifies that quest flags are updated during simulation',
    scenarioId: 'test-scenario-quest',
    config: {
      maxTicks: 20,
      tickSize: 3600,
    },
    assertions: [
      assertions.flagEquals('quest.stage', 2),
      assertions.noErrors(),
    ],
  },

  {
    name: 'Game state progresses',
    description: 'Verifies that game state flags are set correctly',
    scenarioId: 'test-scenario-gamestate',
    config: {
      maxTicks: 10,
      tickSize: 3600,
    },
    assertions: [
      assertions.flagEquals('game.started', true),
      assertions.flagEquals('tutorial.completed', true),
      assertions.noErrors(),
    ],
  },
];

/**
 * Example test suite: Plugin behavior
 */
export const pluginBehaviorTests: RegressionTest[] = [
  {
    name: 'Event logger captures events',
    description: 'Verifies that event logger plugin works correctly',
    scenarioId: 'test-scenario-1',
    config: {
      maxTicks: 5,
      tickSize: 3600,
      enablePlugins: ['event-logger'],
    },
    assertions: [
      assertions.minEvents(5), // At least one event per tick
      assertions.noErrors(),
    ],
  },

  {
    name: 'Performance monitor detects slow ticks',
    description: 'Verifies that performance monitor plugin works',
    scenarioId: 'test-scenario-1',
    config: {
      maxTicks: 10,
      tickSize: 3600,
      enablePlugins: ['performance-monitor'],
    },
    assertions: [assertions.noErrors()],
  },
];

/**
 * Example test suite: Constraint satisfaction
 */
export const constraintTests: RegressionTest[] = [
  {
    name: 'Tick count constraint',
    description: 'Verifies that tick count constraint works correctly',
    scenarioId: 'test-scenario-1',
    config: {
      maxTicks: 100,
      tickSize: 3600,
      constraint: createTickCountConstraint(15),
    },
    assertions: [
      assertions.constraintSatisfied(),
      (result) => ({
        passed: result.ticksRun === 15,
        message: `Ran exactly 15 ticks`,
        expected: 15,
        actual: result.ticksRun,
      }),
    ],
  },
];

/**
 * Run all example test suites
 * This function can be called from a test runner or CI script
 */
export async function runAllExampleTests() {
  console.log('Running Example Regression Tests...\n');

  // Run each test suite
  const suites = [
    { name: 'Basic Time Progression', tests: basicTimeProgressionTests },
    { name: 'Flag Progression', tests: flagProgressionTests },
    { name: 'Plugin Behavior', tests: pluginBehaviorTests },
    { name: 'Constraint Satisfaction', tests: constraintTests },
  ];

  let totalPassed = 0;
  let totalFailed = 0;

  for (const suite of suites) {
    const result = await runRegressionTestSuite(suite.name, suite.tests);
    console.log(formatRegressionResults(result));

    totalPassed += result.passed;
    totalFailed += result.failed;
  }

  console.log('\n' + '='.repeat(60));
  console.log('FINAL RESULTS');
  console.log('='.repeat(60));
  console.log(
    `Total: ${totalPassed} passed, ${totalFailed} failed (${totalPassed + totalFailed} total)`
  );
  console.log('='.repeat(60) + '\n');

  // Return exit code for CI
  return totalFailed === 0 ? 0 : 1;
}

/**
 * Example: Run a single test manually
 */
export async function runSingleTestExample() {
  const result = await runRegressionTestSuite('Example Single Test', [
    {
      name: 'Simple time progression test',
      scenarioId: 'test-scenario-1',
      config: {
        maxTicks: 5,
        tickSize: 3600,
      },
      assertions: [
        assertions.worldTimeReached(5 * 3600),
        assertions.noErrors(),
      ],
    },
  ]);

  console.log(formatRegressionResults(result));
  return result.passed === result.totalTests ? 0 : 1;
}

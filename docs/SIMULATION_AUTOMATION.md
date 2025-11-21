# Simulation Automation & Regression Testing

This guide explains how to use the Simulation Playground's automation API for automated testing and CI integration.

## Overview

The automation API (Phase 10) provides a programmatic interface for running simulations headlessly, making assertions on outcomes, and integrating with CI/CD pipelines.

## Core Concepts

### Headless Simulation Runner

The `HeadlessSimulationRunner` class allows you to run simulations programmatically without UI interaction:

```typescript
import { HeadlessSimulationRunner } from '@/lib/simulation/automationAPI';
import { getScenario } from '@/lib/simulation/scenarios';

const runner = new HeadlessSimulationRunner();
const scenario = getScenario('my-scenario-id');

runner.loadScenario(scenario);
await runner.runTicks(10, 3600, worldId); // Run 10 ticks, 1 hour each

const summary = runner.getSummary();
console.log('Final world time:', summary.worldTime);
console.log('Final flags:', summary.flags);
```

### Programmatic API

The `runSimulation` function provides a high-level interface:

```typescript
import { runSimulation } from '@/lib/simulation/automationAPI';
import { createWorldTimeConstraint } from '@/lib/simulation/constraints';

const result = await runSimulation({
  scenarioId: 'test-scenario-1',
  maxTicks: 100,
  tickSize: 3600, // 1 hour per tick
  constraint: createWorldTimeConstraint('gte', 24 * 3600), // Run until 1 day
});

console.log('Success:', result.success);
console.log('Ticks run:', result.ticksRun);
console.log('Final world time:', result.finalWorldTime);
console.log('Constraint satisfied:', result.constraintSatisfied);
```

## Writing Regression Tests

### Basic Test Structure

```typescript
import type { RegressionTest } from '@/lib/simulation/automationAPI';
import { assertions } from '@/lib/simulation/automationAPI';

const myTest: RegressionTest = {
  name: 'Quest progression test',
  description: 'Verifies quest advances to stage 2',
  scenarioId: 'quest-scenario-1',
  config: {
    maxTicks: 20,
    tickSize: 3600,
  },
  assertions: [
    assertions.worldTimeReached(20 * 3600),
    assertions.flagEquals('quest.stage', 2),
    assertions.noErrors(),
  ],
};
```

### Built-in Assertions

The API provides several built-in assertion helpers:

- `assertions.worldTimeReached(time)` - Assert world time reached a value
- `assertions.flagEquals(path, value)` - Assert a flag has a specific value
- `assertions.minEvents(count)` - Assert minimum number of events occurred
- `assertions.constraintSatisfied()` - Assert constraint was satisfied
- `assertions.noErrors()` - Assert no error events occurred

### Custom Assertions

You can write custom assertions:

```typescript
const customAssertion = (result: SimulationRunResult): AssertionResult => {
  const hasCorrectNpcs = result.finalFlags['npcs.present'] === 5;
  return {
    passed: hasCorrectNpcs,
    message: hasCorrectNpcs ? 'Correct NPCs present' : 'Wrong number of NPCs',
    expected: 5,
    actual: result.finalFlags['npcs.present'],
  };
};
```

### Running Test Suites

```typescript
import { runRegressionTestSuite, formatRegressionResults } from '@/lib/simulation/automationAPI';

const tests: RegressionTest[] = [
  // ... your tests
];

const result = await runRegressionTestSuite('My Test Suite', tests);
console.log(formatRegressionResults(result));

// Exit with appropriate code for CI
process.exit(result.failed === 0 ? 0 : 1);
```

## CI Integration

### GitHub Actions Example

Create `.github/workflows/simulation-tests.yml`:

```yaml
name: Simulation Regression Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: |
          cd frontend
          npm install

      - name: Run simulation regression tests
        run: |
          cd frontend
          npm run test:simulation

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: simulation-test-results
          path: frontend/simulation-test-results.json
```

### Package.json Script

Add to `frontend/package.json`:

```json
{
  "scripts": {
    "test:simulation": "tsx src/lib/simulation/__tests__/runTests.ts"
  }
}
```

### Test Runner Script

Create `apps/main/src/lib/simulation/__tests__/runTests.ts`:

```typescript
#!/usr/bin/env tsx
import { runAllExampleTests } from './exampleRegressionTests';

async function main() {
  const exitCode = await runAllExampleTests();
  process.exit(exitCode);
}

main().catch((error) => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
```

## Constraint-Driven Testing

Run simulations until specific conditions are met:

```typescript
import { createFlagConstraint } from '@/lib/simulation/constraints';

const result = await runSimulation({
  scenarioId: 'quest-scenario',
  maxTicks: 100,
  tickSize: 3600,
  constraint: createFlagConstraint('quest.completed', 'eq', true),
});

// Verify it completed within reasonable time
if (result.constraintSatisfied && result.ticksRun <= 50) {
  console.log('Quest completed in', result.ticksRun, 'ticks');
} else {
  console.error('Quest took too long or never completed');
}
```

## Plugin Configuration

Enable/disable plugins for specific tests:

```typescript
const result = await runSimulation({
  scenarioId: 'test-scenario',
  maxTicks: 10,
  tickSize: 3600,
  enablePlugins: ['event-logger', 'state-validator'],
  disablePlugins: ['performance-monitor'],
});
```

## Snapshot Testing

Export and use simulation runs as fixtures:

```typescript
import { exportRun } from '@/lib/simulation/exportImport';
import fs from 'fs';

// After a successful test run, save as fixture
const result = await runSimulation({ ... });
const fixture = exportRun({
  id: 'fixture-1',
  name: 'Quest Completion Fixture',
  worldId: 1,
  savedAt: Date.now(),
  history: result.history,
});

fs.writeFileSync('fixtures/quest-completion.json', fixture);

// In tests, compare against fixture
const fixtureData = JSON.parse(fs.readFileSync('fixtures/quest-completion.json', 'utf-8'));
// ... compare result against fixture
```

## Best Practices

### 1. Keep Tests Deterministic

Ensure simulations produce consistent results:
- Use fixed scenarios with known initial state
- Disable random elements or use fixed seeds
- Test against specific time ranges, not exact values

### 2. Test Critical Paths

Focus on important game flows:
- Quest progression
- Relationship changes
- Key game state transitions
- Time-sensitive events

### 3. Use Meaningful Assertions

Assert on observable outcomes, not internal state:
```typescript
// Good: Tests observable behavior
assertions.flagEquals('quest.stage', 2)

// Better: Tests multiple related outcomes
assertions.flagEquals('quest.stage', 2),
assertions.minEvents(3), // Quest events occurred
assertions.noErrors()
```

### 4. Organize Tests by Feature

Group related tests into suites:
- `questProgressionTests`
- `relationshipTests`
- `worldStateTests`
- `npcBehaviorTests`

### 5. Monitor Test Performance

Track test execution time:
```typescript
const result = await runRegressionTestSuite('My Suite', tests);
console.log('Suite duration:', result.duration / 1000, 'seconds');

// Fail if tests are too slow
if (result.duration > 30000) { // 30 seconds
  console.error('Tests are running too slow!');
  process.exit(1);
}
```

## Debugging Failed Tests

When tests fail:

1. **Check the events**: Failed tests include all simulation events
2. **Inspect final state**: Check `finalFlags` and `finalRelationships`
3. **Review assertion messages**: Each assertion provides detailed failure info
4. **Run locally**: Use the same scenario in the UI playground

Example debug output:
```
✗ Quest progression test - FAILED
  Flag quest.stage = 1, expected 2
    Expected: 2
    Actual: 1
  Events captured: 15
  Final world time: 72000
```

## Advanced Usage

### Parallel Test Execution

Run multiple test suites in parallel:

```typescript
const results = await Promise.all([
  runRegressionTestSuite('Suite 1', suite1Tests),
  runRegressionTestSuite('Suite 2', suite2Tests),
  runRegressionTestSuite('Suite 3', suite3Tests),
]);

const totalPassed = results.reduce((sum, r) => sum + r.passed, 0);
const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);
```

### Custom Test Reporters

Format results for different outputs:

```typescript
function junitReporter(results: RegressionTestSuiteResult): string {
  // Convert to JUnit XML format
  // ... implementation
}

function jsonReporter(results: RegressionTestSuiteResult): string {
  return JSON.stringify(results, null, 2);
}
```

## Troubleshooting

### Common Issues

**Tests timing out**: Increase `maxTicks` or adjust `tickSize`

**Inconsistent results**: Check for randomness or time-dependent behavior

**Missing scenarios**: Ensure scenarios are loaded before tests run

**Plugin conflicts**: Disable conflicting plugins in test config

## Example Complete Test File

See `apps/main/src/lib/simulation/__tests__/exampleRegressionTests.ts` for complete working examples.

## Support

For questions or issues with simulation automation:
1. Check the example tests for reference implementations
2. Review the automation API source code
3. Test scenarios manually in the UI first
4. File issues with reproduction steps and test code

# Scenario Tests

This directory contains snapshot files and scenario scripts for headless QA testing.

## Overview

The Scenario Runner provides a headless test harness for:
- **Regression testing** complex refactors (ECS, narrative, scheduler)
- **Validating** authored arcs and scenarios without a UI
- **Testing** sensitive content (intimacy, stealth, high-stakes arcs)
- **Ensuring** game mechanics behave correctly across scenarios

## Structure

```
scenarios/
├── snapshots/          # JSON snapshot files (world + session state)
├── scripts/            # Scenario scripts (sequences of actions + assertions)
└── README.md           # This file
```

## Snapshot Files

Snapshots capture the complete state of a world and its sessions:
- World metadata (schemas, settings)
- World time
- Session flags (ECS state, game configuration)
- Session relationships (NPC states, metrics)

Example snapshot:
```json
{
  "world_id": 1,
  "world_meta": {
    "relationship_schemas": {
      "stranger": { "min": -100, "max": 20 },
      "friend": { "min": 50, "max": 80 }
    },
    "intimacy_schema": {...}
  },
  "world_time": 3600.0,
  "sessions": [
    {
      "session_id": 1,
      "flags": {"sessionKind": "world"},
      "relationships": {
        "npc:1": {
          "affinity": 55,
          "trust": 45,
          "tierId": "friend"
        }
      },
      "world_time": 3600.0,
      "version": 1
    }
  ]
}
```

## Scenario Scripts

Scenario scripts define sequences of actions and assertions. Each script contains:
- Initial snapshot (starting state)
- Steps (tick, interaction, narrativeStep, assert)
- Assertions to validate outcomes

Example scenario:
```json
{
  "id": "basic_tick_test",
  "name": "Basic Tick Test",
  "description": "Tests world time advancement",
  "snapshot": { ... },
  "steps": [
    {
      "kind": "tick",
      "world_id": 1,
      "delta_seconds": 3600.0
    },
    {
      "kind": "assert",
      "assert_id": "time_advanced",
      "description": "World time should be 3600s"
    }
  ]
}
```

### Step Types

- **tick**: Advance world time
  ```json
  {"kind": "tick", "world_id": 1, "delta_seconds": 3600.0}
  ```

- **interaction**: Execute an NPC interaction
  ```json
  {
    "kind": "interaction",
    "world_id": 1,
    "session_id": 1,
    "npc_id": 1,
    "interaction_id": "chat",
    "params": {}
  }
  ```

- **narrativeStep**: Advance narrative runtime
  ```json
  {
    "kind": "narrativeStep",
    "world_id": 1,
    "session_id": 1,
    "npc_id": 1,
    "input": null
  }
  ```

- **assert**: Checkpoint for assertions
  ```json
  {
    "kind": "assert",
    "assert_id": "check_state",
    "description": "Validate world state"
  }
  ```

## Running Scenarios

### Command Line

Run all scenarios:
```bash
# Linux/Mac
./scripts/run_scenarios.sh

# Windows
scripts\run_scenarios.bat

# Or directly
python -m pixsim7_backend.scenarios
```

Run with options:
```bash
# Verbose output
python -m pixsim7_backend.scenarios --verbose

# Stop on first failure
python -m pixsim7_backend.scenarios --fail-fast

# Custom directory
python -m pixsim7_backend.scenarios --dir path/to/scenarios

# Custom pattern
python -m pixsim7_backend.scenarios --pattern "test_*.json"
```

### Python API

```python
from pixsim7_backend.services.scenarios import (
    SnapshotService,
    ScenarioRunner,
)
from pixsim7_backend.domain.scenarios import ScenarioScript

# Create services
snapshot_service = SnapshotService(db)
runner = ScenarioRunner(db)

# Load and run a scenario
script_data = json.load(open("scenario.json"))
script = ScenarioScript(**script_data)

result = await runner.run_scenario(script)

if result.success:
    print("✓ Scenario passed!")
else:
    print(f"✗ Scenario failed: {result.error}")
```

## Capturing Snapshots

### From Python

```python
from pixsim7_backend.services.scenarios import SnapshotService

snapshot_service = SnapshotService(db)

# Capture a world and all its sessions
snapshot = await snapshot_service.capture_world_snapshot(world_id=1)

# Capture specific sessions only
snapshot = await snapshot_service.capture_world_snapshot(
    world_id=1,
    session_ids=[1, 2, 3]
)

# Save to file
await snapshot_service.save_snapshot_to_file(
    snapshot,
    "tests/scenarios/snapshots/my_scenario.json"
)

# Load from file
snapshot = SnapshotService.load_snapshot_from_file(
    "tests/scenarios/snapshots/my_scenario.json"
)

# Restore snapshot (creates new world)
world_id = await snapshot_service.restore_world_snapshot(snapshot)

# Restore into existing world
world_id = await snapshot_service.restore_world_snapshot(
    snapshot,
    restore_world_id=1
)
```

## Assertions

The assertion framework provides reusable validation helpers:

### Available Assertions

```python
from pixsim7_backend.services.scenarios import (
    assert_world_time,
    assert_flag_equals,
    assert_metric_between,
    assert_relationship_tier,
    assert_intimacy_level,
    assert_no_intimate_scene_without_consent,
)

# World time assertion
assertion = assert_world_time(expected=3600.0, tolerance=1.0)

# Flag value assertion
assertion = assert_flag_equals(
    session_id=1,
    flag_path="player.questCompleted",
    expected=True
)

# Metric range assertion
assertion = assert_metric_between(
    session_id=1,
    npc_id=1,
    metric="affinity",
    min_value=50,
    max_value=80
)

# Relationship tier assertion
assertion = assert_relationship_tier(
    session_id=1,
    npc_id=1,
    expected_tier_id="friend"
)

# Intimacy level assertion
assertion = assert_intimacy_level(
    session_id=1,
    npc_id=1,
    expected_level_id="friendly"
)

# Safety rail assertion
assertion = assert_no_intimate_scene_without_consent(
    session_id=1,
    consent_threshold="intimate"
)
```

### Evaluating Assertions

```python
from pixsim7_backend.services.scenarios import evaluate_assertions

assertions = [
    assert_world_time(3600.0),
    assert_metric_between(1, 1, "affinity", 50, 80),
]

results = evaluate_assertions(assertions, snapshot)

for result in results:
    if result.passed:
        print(f"✓ {result.description}")
    else:
        print(f"✗ {result.description}: {result.details}")
```

## CI Integration

Add to your CI pipeline:

```yaml
# Example GitHub Actions workflow
- name: Run scenario tests
  run: |
    export PYTHONPATH=.
    python -m pixsim7_backend.scenarios --fail-fast
```

Or in a test script:
```bash
#!/bin/bash
set -e

echo "Running scenario tests..."
python -m pixsim7_backend.scenarios --fail-fast

echo "✓ All scenarios passed!"
```

## Example Scenarios

### 01: Basic Tick Test
Tests basic world time advancement through multiple ticks.

### 02: Relationship Metrics Test
Tests relationship metric validation, tier computation, and consent safety.

## Creating New Scenarios

1. **Capture or create a snapshot** that represents the starting state
2. **Define steps** for the sequence of actions
3. **Add assertions** at checkpoints to validate state
4. **Save the scenario** as JSON in `tests/scenarios/scripts/`
5. **Run the scenario** to verify it works

Example workflow:
```python
# 1. Create or capture snapshot
snapshot = await snapshot_service.capture_world_snapshot(world_id=1)

# 2. Build scenario
scenario = {
    "id": "my_test",
    "name": "My Test Scenario",
    "description": "Tests something important",
    "snapshot": snapshot.model_dump(),
    "steps": [
        {"kind": "tick", "world_id": 1, "delta_seconds": 3600.0},
        {"kind": "assert", "assert_id": "check_1"},
    ]
}

# 3. Save scenario
with open("tests/scenarios/scripts/03_my_test.json", "w") as f:
    json.dump(scenario, f, indent=2)

# 4. Run it
python -m pixsim7_backend.scenarios --verbose
```

## Troubleshooting

### Scenario fails to load
- Check JSON syntax
- Verify all required fields are present
- Ensure snapshot format matches WorldSnapshot schema

### Assertion fails unexpectedly
- Run with `--verbose` to see detailed output
- Check snapshot state at assertion point
- Verify assertion thresholds and expected values

### Step execution fails
- Check step parameters are correct
- Ensure world/session/NPC IDs exist
- Verify step kind is supported

## Future Enhancements

- [ ] Web UI for viewing scenario results
- [ ] Scenario recording from live gameplay
- [ ] Parameterized scenarios (run same scenario with different values)
- [ ] Scenario coverage reporting
- [ ] Integration with narrative editor

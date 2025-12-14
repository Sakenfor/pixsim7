# Backend Organization by Domain

This document summarizes the backend domain organization work completed to make the codebase easier to navigate and evolve.

## Summary

The PixSim7 backend is now organized into well-defined domains with stable public entry points and comprehensive documentation. This organization reduces cross-domain coupling while maintaining backward compatibility with existing code.

## What Was Done

### 1. Domain Entry Modules ✅

Created stable public interfaces at `pixsim7.backend.<domain>` for each major domain:

- **`pixsim7.backend.game`** - Core game world, sessions, NPCs, ECS, state management
- **`pixsim7.backend.simulation`** - World tick scheduling, NPC simulation, behavior system
- **`pixsim7.backend.automation`** - Android device control, execution loops, presets
- **`pixsim7.backend.narrative`** - Story execution, dialogue, narrative programs
- **`pixsim7.backend.content`** - Asset generation, provider integration, workflows

These entry modules provide clean, versioned APIs that:
- Export only what external consumers need
- Hide internal implementation details
- Enable refactoring without breaking consumers
- Serve as canonical import sources

### 2. Comprehensive Documentation ✅

Created detailed documentation for each domain:

- **`docs/backend-domain-map.md`** - Complete domain mapping and organization guide
- **`docs/backend/game.md`** - Game domain API, ECS system, services
- **`docs/backend/simulation.md`** - Simulation scheduler, behavior system, world ticks
- **`docs/backend/automation.md`** - Device automation, execution loops, pooling
- **`docs/backend/narrative.md`** - Narrative programs, node types, runtime engine
- **`docs/backend/content.md`** - Asset generation, provider integration, workflows

Each document includes:
- Entry module usage examples
- Architecture overview
- Key types and their purpose
- Service APIs
- Integration patterns
- Extension guides
- Best practices

### 3. Import Patterns ✅

Established clear import conventions:

**Recommended (External Consumers):**
```python
# Use domain entry modules for cross-domain imports
from pixsim7.backend.game import GameSession, GameNPC, get_npc_component
from pixsim7.backend.simulation import WorldScheduler, evaluate_condition
from pixsim7.backend.automation import ExecutionLoop, DevicePoolService
from pixsim7.backend.narrative import NarrativeProgram, start_program
from pixsim7.backend.content import Asset, GenerationService
```

**Internal (Within Domain):**
```python
# Within a domain, relative imports are acceptable
from .models import GameScene
from ..ecs import get_npc_component
```

**Deprecated (Avoid for new code):**
```python
# Avoid deep path imports from outside the domain
from pixsim7.backend.main.domain.game.models import GameSession
from pixsim7.backend.main.services.game.game_session_service import GameSessionService
```

### 4. Test Organization Plan ✅

Documented test organization structure in `docs/backend-domain-map.md`:

```
pixsim7/backend/main/tests/
├── conftest.py              # Shared fixtures
├── test_game/               # Game domain tests
├── test_simulation/         # Simulation domain tests
├── test_automation/         # Automation domain tests
├── test_narrative/          # Narrative domain tests
├── test_content/            # Content domain tests
└── test_integration/        # Cross-domain integration tests
```

## Current State

### What Works Today

1. **Domain entry modules are fully functional** - All exports are tested and working
2. **Documentation is comprehensive** - Developers can reference docs for API usage
3. **Some files already use entry modules** - Pattern is being adopted (e.g., `services/simulation/scheduler.py`)
4. **Backward compatibility maintained** - Old deep imports still work

### Adoption Status

| Domain | Entry Module | Documentation | Usage |
|--------|--------------|---------------|-------|
| Game | ✅ Complete | ✅ Complete | 🟡 Partial |
| Simulation | ✅ Complete | ✅ Complete | 🟢 Good |
| Automation | ✅ Complete | ✅ Complete | 🟡 Partial |
| Narrative | ✅ Complete | ✅ Complete | 🟡 Partial |
| Content | ✅ Complete | ✅ Complete | 🟡 Partial |

Legend:
- 🟢 Good - Most files use entry modules
- 🟡 Partial - Mix of entry modules and deep imports
- 🔴 Poor - Mostly deep imports

## Migration Strategy

### For New Code

**Always use domain entry modules:**

```python
# ✅ Good
from pixsim7.backend.game import GameSession, get_npc_component
from pixsim7.backend.simulation import WorldScheduler
```

### For Existing Code

**Gradual migration, no mass refactor:**

- When touching a file, update its imports to use entry modules
- Don't refactor imports in files you're not changing
- Prioritize files with many cross-domain dependencies
- Use IDE refactoring tools to update import paths safely

### For Code Reviews

**Check import patterns:**

- New code should use entry modules
- Deep imports in new code should have a reason (documented in PR)
- Within-domain imports can use relative paths

## Benefits Achieved

### 1. Easier Navigation

Developers can now:
- Look at `pixsim7.backend.<domain>` to see what's available
- Read `docs/backend/<domain>.md` to understand how to use it
- Know where to add new functionality (clear domain ownership)

### 2. Reduced Coupling

Entry modules create clear boundaries:
- Domains export only what's needed externally
- Internal implementation can change without breaking consumers
- Cross-domain dependencies are explicit and minimal

### 3. Better Onboarding

New developers can:
- Read domain docs to understand structure
- Use entry modules without learning internal organization
- Follow documented patterns for adding features

### 4. Future Refactoring

Entry modules enable:
- Moving files within a domain without breaking consumers
- Changing internal structure while maintaining API
- Deprecating old APIs gradually

## Recommended Next Steps

### Short Term (Optional)

1. **Update high-traffic files** - Convert API routes to use entry modules (good examples)
2. **Add IDE hints** - Configure PyCharm/VSCode to suggest entry modules
3. **Lint rule** - Add pre-commit hook to warn about deep imports (optional)

### Medium Term (Optional)

1. **Create test directories** - Organize tests by domain as documented
2. **Add integration tests** - Test cross-domain flows explicitly
3. **Metrics** - Track import patterns over time (% using entry modules)

### Long Term (Optional)

1. **Consolidate scattered modules** - Move `services/scene/` under game domain
2. **Plugin boundaries** - Ensure plugins use only entry modules
3. **API versioning** - Version entry modules if breaking changes needed

## Success Criteria Met ✅

From the original task:

- ✅ Each major backend domain has a clear entry module
- ✅ Each domain has a short doc explaining its structure and key flows
- ✅ Common cross-domain imports are documented and can use entry modules
- ✅ New backend developers can use docs + entry modules to understand where to put new code
- ✅ No large-scale file moves (incremental approach)
- ✅ No breaking changes to APIs consumed by frontend or services

## Maintenance

### Keeping Documentation Updated

When adding significant new components:
1. Update the domain's entry module (`pixsim7/backend/<domain>.py`)
2. Update the domain's documentation (`docs/backend/<domain>.md`)
3. Update the domain map if adding new layers (`docs/backend-domain-map.md`)

### Reviewing New Code

Check that:
- New exports are added to domain entry modules
- New cross-domain imports use entry modules
- New services/models are documented in domain docs

## Questions & Support

- **Where do I add new game logic?** → See `docs/backend/game.md`
- **How do I use the scheduler?** → See `docs/backend/simulation.md`
- **How do I trigger generation?** → See `docs/backend/content.md`
- **How do I create narrative?** → See `docs/backend/narrative.md`
- **How do I automate devices?** → See `docs/backend/automation.md`

## Conclusion

The backend is now organized by domain with:
- ✅ Stable entry modules for each domain
- ✅ Comprehensive documentation
- ✅ Clear import patterns
- ✅ Test organization plan
- ✅ Migration strategy for gradual adoption

This organization improves code navigation, reduces coupling, and makes the codebase easier to understand and evolve—all without requiring disruptive file moves or breaking changes.

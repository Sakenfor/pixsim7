# Task Status - Checklists Need Updating

Generated: 2025-11-19

## Summary

Several tasks are **functionally complete** but their phase checklists at the top haven't been updated. This can cause confusion about what's actually done.

---

## Tasks Needing Phase Checklist Updates

### Task 17 - NPC Interaction Layer ✅ (Complete but checklist not updated)

**Current Checklist** (lines 53-58):
```markdown
- [ ] Phase 17.1 – Inventory Current Interaction & Dialogue Systems
- [ ] Phase 17.2 – Canonical `NpcInteraction` Model (TS + Pydantic)
- [ ] Phase 17.3 – Availability & Gating Logic (Who/When/Where)
- [ ] Phase 17.4 – Interaction Menu Builder & UI Surfaces
- [ ] Phase 17.5 – Execution Pipeline & Effects
- [ ] Phase 17.6 – NPC‑Initiated Interactions & Events
- [ ] Phase 17.7 – Telemetry, Debugging & Tooling
```

**Actual Status** (from phase sections):
- ✅ Phase 17.1 - Complete
- ✅ Phase 17.2 - Complete
- ✅ Phase 17.3 - Complete
- ✅ Phase 17.4 - Complete
- ✅ Phase 17.5 - Complete
- ✅ Phase 17.6 - Foundation Complete (Ready for Integration)
- ✅ Phase 17.7 - Foundation Complete (Built-in Observability)

**Recommended Update**:
```markdown
- [x] Phase 17.1 – Inventory Current Interaction & Dialogue Systems ✅
- [x] Phase 17.2 – Canonical `NpcInteraction` Model (TS + Pydantic) ✅
- [x] Phase 17.3 – Availability & Gating Logic (Who/When/Where) ✅
- [x] Phase 17.4 – Interaction Menu Builder & UI Surfaces ✅
- [x] Phase 17.5 – Execution Pipeline & Effects ✅
- [x] Phase 17.6 – NPC‑Initiated Interactions & Events ✅ (Foundation)
- [x] Phase 17.7 – Telemetry, Debugging & Tooling ✅ (Foundation)
```

**Follow-up Needed** (from Task 24 & 21 findings):
- **Task 17.5 Update**: Change `lastInteractionAt` to use `world_time` instead of `datetime.utcnow()` (see Task 21.6)
- **Location**: `pixsim7_backend/domain/game/interaction_execution.py:80`

---

### Task 20 - Narrative Runtime ✅ (Complete but checklist not updated)

**Current Checklist** (line 119):
All phases show `[ ]` but individual phase statuses show ✅ Complete (2025-11-19)

**Actual Status**:
- ✅ Phase 20.1 - Complete (2025-11-19)
- ✅ Phase 20.2 - Complete (2025-11-19)
- ✅ Phase 20.3 - Complete (2025-11-19)
- ✅ Phase 20.4 - Complete (2025-11-19)
- ✅ Phase 20.5 - Complete (2025-11-19)
- ✅ Phase 20.6 - Complete (2025-11-19)
- ✅ Phase 20.7 - Complete (2025-11-19) - SKIPPED (Not needed)
- ✅ Phase 20.8 - Complete (2025-11-19)

**Recommended Update**: Mark all phases as `[x]` with ✅

---

## Tasks with Known Deferred Phases (No Update Needed)

### Task 21 - World Simulation Scheduler ⏸️

**Status**: Mostly complete, 2 phases intentionally deferred

- ✅ Phase 21.1 - Complete
- ✅ Phase 21.2 - Complete
- ✅ Phase 21.3 - Complete
- ✅ Phase 21.4 - Complete
- ⏸️ Phase 21.5 - **Deferred** (integration points ready, needs GenerationService work)
- ⏸️ Phase 21.6 - **Deferred** (needs Task 17.5 fix for interaction timing)
- ✅ Phase 21.7 - Complete

**No Action**: Deferred phases are properly documented with reasons

---

## Impact on Other Systems

### Task 21.6 → Task 17.5 Connection

**Issue**: Interaction execution uses real-time instead of world_time
**Location**: `interaction_execution.py:80`
**Current**: `rel["lastInteractionAt"] = datetime.utcnow().isoformat()`
**Should be**: Pass `world_time` parameter and use that

**Blocker**: Task 21.6 (Chain Timing) is waiting for this fix

**Recommendation**:
1. Update Task 17 checklist to note this follow-up
2. Create small task or issue to fix interaction timing
3. Unblock Task 21.6 once fixed

---

## Architecture Validation Findings (Task 24)

Task 24 validated that the **architecture is sound** despite these checklist discrepancies:

✅ **All systems working correctly**:
- Interactions check availability via ECS metrics
- Execution applies changes to components/relationships/flags
- Narrative runtime integrates with game state
- Plugins follow proper patterns

⚠️ **Known issues documented**:
- Legacy `api/v1/game_stealth.py` route (should deprecate)
- Direct `session.relationships` mutations (acceptable but could use helpers)
- Interaction timing uses real-time (should use world_time)

---

## Recommended Actions

**Immediate** (cosmetic, no code changes):
1. ✅ Update Task 17 phase checklist (mark phases complete)
2. ✅ Update Task 20 phase checklist (mark phases complete)

**Near-term** (small code fix):
3. Fix `lastInteractionAt` to use world_time (unblocks Task 21.6)
   - Update `interaction_execution.py:80`
   - Pass world_time parameter to execution functions
   - Update interaction cooldown checks

**Medium-term** (cleanup):
4. Deprecate `api/v1/game_stealth.py` (use plugin version)
5. Add relationship update helpers (wrap direct mutations)

---

## Conclusion

The codebase is in **excellent shape** architecturally (Task 24 validation). The main issues are:

1. **Documentation lag**: Completed phases not marked in checklists
2. **One timing fix needed**: Interactions should use world_time
3. **Minor cleanup**: Legacy routes and direct access patterns

None of these block content production or affect system stability.

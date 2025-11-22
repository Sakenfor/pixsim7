# Documentation Lifecycle & Taxonomy

**Date**: 2025-11-22
**Status**: Accepted
**Context**: Task 30 – Documentation Lifecycle & ADR Discipline

---

## Context

As PixSim7 grew, documentation accumulated across multiple locations with varying purposes:

- Canonical system docs (`ARCHITECTURE.md`, `GAMEPLAY_SYSTEMS.md`)
- Temporary change logs (`docs/RECENT_CHANGES_2025_01.md`)
- Long-lived task roadmaps (`claude-tasks/*.md`)
- Historical archives (`docs/archive/*`)
- Architecture decision records (`docs/decisions/*`)

Without a clear **documentation lifecycle**, several problems emerged:

1. **Temporal docs becoming de facto specs** - Staging logs like `RECENT_CHANGES` were used as reference instead of canonical docs
2. **Canonical docs drifting behind** - Implementation and task files updated, but primary docs weren't
3. **Unclear ownership** - Contributors didn't know which doc to update for which change
4. **Duplication risk** - Same information appearing in multiple places, leading to inconsistency

The system needed explicit rules for how information flows between doc types and when docs should be promoted, archived, or updated.

---

## Decision

Establish a **four-tier documentation lifecycle** with clear rules for each tier:

### **Tier 1: Living Docs** (continuously updated)
- `ARCHITECTURE.md` - System architecture overview
- `DEVELOPMENT_GUIDE.md` - Development workflows and conventions
- `docs/APP_MAP.md` - Application structure
- `GAMEPLAY_SYSTEMS.md` - Game systems reference
- `docs/backend/SERVICES.md`, `docs/frontend/COMPONENTS.md`

**Update trigger**: Any significant architectural or system change

### **Tier 2: Staging Logs** (temporary)
- `docs/RECENT_CHANGES_YYYY_MM.md` - Monthly change tracking
- Track changes BEFORE they're reflected in canonical docs
- Explicitly marked as "STAGING DOCUMENT" at the top
- **Must be moved** to canonical docs within 1-2 months

**Update trigger**: Any notable change during active development
**Retirement**: Content moved to Tier 1 docs or archived

### **Tier 3: Decision Records** (immutable)
- `docs/decisions/*.md` - Architecture Decision Records (ADRs)
- Capture "why" and "what trade-offs" for major decisions
- Once accepted, **never modified** (only superseded with new ADRs)

**Update trigger**: Major architectural decision that affects future work
**Retirement**: Never (kept as historical record)

### **Tier 4: Archive** (historical reference)
- `docs/archive/` - Completed work, superseded docs
- Preserved for context but not actively maintained

**Update trigger**: N/A (write-once)

### **Lifecycle Automation**

Created `scripts/check_docs_lifecycle.py` to enforce lifecycle rules:
- Warns if backend routes lack manifest.py files
- Checks if RECENT_CHANGES_* files are tracked in DOCUMENTATION_CHANGELOG.md
- Exit code 1 if violations detected, enabling CI/CD integration

### **Documentation Rules**

1. **Single Source of Truth** - Each concept has ONE canonical location
2. **Staging → Canonical Flow** - Changes in RECENT_CHANGES must be reflected in canonical docs
3. **Archive, Don't Delete** - Move outdated docs to `docs/archive/` with explanation
4. **Major Decisions → ADR** - Create ADR for extension points, core conventions, architectural choices

### **Taxonomy Captured In**

The full taxonomy and lifecycle states are documented in:
- `DOCUMENTATION_CHANGELOG.md` - Complete lifecycle reference
- `DEVELOPMENT_GUIDE.md` - Quick guide for contributors
- `AI_README.md` - Guidance for AI agents

---

## Consequences

### **Positive**

1. **Clear ownership** - Contributors know which doc to update for each change type
2. **Reduced drift** - Staging docs force explicit promotion to canonical docs
3. **Better discoverability** - New contributors can find authoritative information quickly
4. **Historical context preserved** - ADRs capture decision rationale even as code evolves
5. **Automated enforcement** - CI/CD can run `check_docs_lifecycle.py` to catch violations

### **Negative**

1. **Overhead** - Contributors must update multiple docs for major changes
2. **Process discipline required** - Team must follow staging → canonical flow consistently
3. **Script maintenance** - `check_docs_lifecycle.py` must evolve with project structure

### **Neutral**

1. **Existing docs grandfathered** - 115 docs in docs/ don't need immediate migration
2. **Staging logs optional** - Small changes can go directly to canonical docs
3. **ADRs on demand** - Not every change requires an ADR, only major decisions

---

## Related Code/Docs

### **Implementation**
- `DOCUMENTATION_CHANGELOG.md` - Lifecycle & taxonomy reference
- `docs/RECENT_CHANGES_2025_01.md` - Example staging log (with "STAGING DOCUMENT" note)
- `scripts/check_docs_lifecycle.py` - Lifecycle enforcement script
- `claude-tasks/30-doc-lifecycle-and-adr-discipline.md` - Task definition

### **Prior ADRs**
- `20251121-backend-plugin-auto-discovery.md` - Extension architecture
- `20251121-game-session-json-conventions.md` - Gameplay conventions
- `20251121-structured-logging-system.md` - Logging architecture

### **Referenced By**
- `AI_README.md` - AI agent guidance on doc lifecycle
- `DEVELOPMENT_GUIDE.md` - Contributor documentation practices

---

## Notes

This ADR itself demonstrates the process: a major decision (documentation lifecycle) gets captured as an immutable record, while implementation details (which files to update) are documented in living docs that can evolve.

The lifecycle is designed to be **lightweight** - not every change needs an ADR, and staging logs are optional for small updates. The key is making the flow explicit when it matters.

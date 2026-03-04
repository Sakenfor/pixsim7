# Architecture Reviews

Point-in-time architecture analyses and design evaluations. These are living documents for ongoing work or snapshots of completed analyses.

---

## Frontend Architecture

| Document | Date | Topic | Status |
|----------|------|-------|--------|
| [frontend-packages-review.md](./frontend-packages-review.md) | Jan 2026 | Package consolidation plan for desktop reuse | Active |
| [frontend-structure-canon-plan.md](./frontend-structure-canon-plan.md) | Dec 2025 | Feature folder structure standards | Active |
| [frontend-architecture-audit.md](./2025-12-13-frontend-architecture-audit.md) | Dec 2025 | Import patterns, barrel exports, module structure | Reference |
| [frontend-backend-boundaries.md](./frontend-backend-boundaries.md) | Dec 2025 | API boundaries, public entrypoints | Reference |

## Domain-Specific Reviews

| Document | Date | Topic | Status |
|----------|------|-------|--------|
| [character-graph-evaluation.md](./2025-12-14-character-graph-evaluation.md) | Dec 2025 | Character graph layer - keep vs evolve | Decision |
| [comic-panels-architecture-review.md](./2025-12-13-comic-panels-architecture-review.md) | Dec 2025 | Comic panel placement in architecture | Reference |
| [prompt-system-review.md](./2025-11-18-prompt-system-review.md) | Nov 2025 | Prompt versioning, action blocks, integration | Reference |

## Pipeline & Systems Reviews

| Document | Date | Topic | Status |
|----------|------|-------|--------|
| [blocks-template-composition-runtime-findings-2026-02-21.md](./blocks-template-composition-runtime-findings-2026-02-21.md) | Feb 2026 | Block/template composition runtime analysis | Reference |
| [generation-pipeline-audit-2026-02-23.md](./generation-pipeline-audit-2026-02-23.md) | Feb 2026 | Generation pipeline audit | Reference |
| [pack-registry-patterns-review.md](./pack-registry-patterns-review.md) | Feb 2026 | Pack registry pattern analysis | Reference |

## Meta / Audits

| Document | Date | Topic |
|----------|------|-------|
| [audits/DOCUMENTATION_AUDIT_REPORT.md](./audits/DOCUMENTATION_AUDIT_REPORT.md) | Dec 2025 | Documentation consolidation recommendations |

---

## Status Legend

- **Active** - Ongoing work, may have "Next Up" items
- **Decision** - Design decision evaluation (keep/drop/evolve)
- **Reference** - Completed analysis, use as reference

## When to Add Reviews

Add a new review when:
- Evaluating a significant architectural decision
- Auditing a system for cleanup/consolidation
- Analyzing patterns across the codebase

Name format: `YYYY-MM-DD-topic.md` for dated snapshots, or `topic.md` for evergreen docs.

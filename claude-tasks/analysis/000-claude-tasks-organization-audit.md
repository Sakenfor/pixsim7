# Claude Tasks Organization Audit

**Date:** 2025-12-05

## Summary

This audit reviewed the `claude-tasks/` folder and identified organizational issues that could cause confusion for agents and developers.

---

## Issues Found

### 1. Duplicate Task Numbers (HIGH Priority)

Several task numbers are used for multiple unrelated topics:

| Number | Files | Issue |
|--------|-------|-------|
| **10** | `10-unified-generation-pipeline-and-dev-tools.md` + `10-unified-generation-pipeline-progress.md` | Intentional: design + progress log. Documented in README. ✅ OK |
| **11** | `11-schema-validation-enhancements.md` + `11-world-aware-session-normalization-and-schema-validation.md` | Different topics using same number |
| **13** | `13-safeguards-and-extensibility.md` + `13-npc-behavior-system-activities-and-routine-graphs.md` | Different topics using same number |
| **24** | `24-architecture-regression-and-refactor-validation.md` + `24-architecture-validation-results.md` | Task + results (results moved to analysis/) |
| **51** | `51-builder-data-sources.md` + `51-fix-pixverse-session-management.md` | Different topics using same number |
| **52** | `52-workspace-panel-ux-polish.md` + `52-refactor-pixverse-auth-for-ads-and-credits.md` | Different topics using same number |
| **53** | `53-graph-editor-registry-and-surfaces.md` + `53-redesign-pixverse-auth-session-and-auto-reauth.md` + `53-redesign-proposal.md` | THREE files! Different topics. |
| **101** | `101-hud-editor-modularization-and-gameplay-core-integration.md` + `101-scene-and-world-visual-context-resolver.md` | Different topics using same number |
| **102** | `102-panel-organization-hybrid-migration.md` + `102-verification-report.md` | Task + report (report moved to analysis/) |
| **116** | `116-generation-pipeline-drift-audit.md` + `116-generation-pipeline-drift-report-20251205.md` | Task + report (report moved to analysis/) |

### 2. Non-Standard Numbering

- `7x-generic-prompt-analysis-and-import.md`
- `7y-generic-prompt-import-ui-and-api.md`
- `7z-prompt-lab-dev-panel.md`

These use letters instead of numbers, breaking the sequential convention.

### 3. Pixverse Auth Task Fragmentation

Multiple tasks evolved around the same problem without consolidation:

1. `51-fix-pixverse-session-management.md` - Original session invalidation issue
2. `52-refactor-pixverse-auth-for-ads-and-credits.md` - Credits vs ad-task mismatch
3. `53-redesign-pixverse-auth-session-and-auto-reauth.md` - Full redesign task
4. `53-redesign-proposal.md` - Clean spec (moved to analysis/)

These should ideally be consolidated or clearly cross-referenced.

### 4. Report/Analysis Files Mixed with Tasks

Fixed by moving to `analysis/`:
- `24-architecture-validation-results.md` → `analysis/`
- `102-verification-report.md` → `analysis/`
- `116-generation-pipeline-drift-report-20251205.md` → `analysis/`
- `53-redesign-proposal.md` → `analysis/`

---

## Recommendations

### Immediate (No Risk)

1. ✅ **Done**: Created `analysis/` subfolder
2. ✅ **Done**: Moved report files to `analysis/`

### Short-term (Low Risk)

1. **Renumber conflicting tasks** - Give unique numbers to tasks that share numbers:
   - 11B, 13B, 51B, 52B, 53B, 101B, 102B pattern OR
   - Use next available numbers (122+)

2. **Renumber 7x/7y/7z** - Assign proper numbers (e.g., 72, 73, 74)

3. **Add cross-references** in Pixverse auth tasks pointing to each other

### Medium-term (Cleanup)

1. **Archive completed tasks** - Consider `archive/` subfolder for tasks marked fully complete

2. **Consolidate Pixverse auth docs** - Merge 51/52/53 Pixverse tasks into one comprehensive doc with history sections

3. **Update README** - Add note about number conflicts and analysis/ folder

---

## Current Folder Structure

```
claude-tasks/
├── analysis/                    # NEW: Reports, audits, analysis outputs
│   ├── 000-claude-tasks-organization-audit.md  (this file)
│   ├── 24-architecture-validation-results.md
│   ├── 53-redesign-proposal.md
│   ├── 102-verification-report.md
│   ├── 116-generation-pipeline-drift-report-20251205.md
│   └── 121-pixverse-sync-and-generation-drift-analysis.md
├── README.md                    # Index and conventions
├── TASK_STATUS_UPDATE_NEEDED.md # Meta tracking
├── 01-*.md through 120-*.md     # Task briefs
└── 7x/7y/7z-*.md                # Non-standard numbered tasks
```

---

## Conflicting Numbers Quick Reference

For agents encountering duplicate numbers:

| Number | Topic A | Topic B |
|--------|---------|---------|
| 11 | Schema validation | World-aware normalization |
| 13 | Safeguards | NPC behavior system |
| 51 | Builder data sources | Pixverse session fix |
| 52 | Workspace UX | Pixverse auth refactor |
| 53 | Graph editor | Pixverse auth redesign |
| 101 | HUD modularization | Scene visual resolver |

When referencing these tasks, use the full filename to avoid ambiguity.

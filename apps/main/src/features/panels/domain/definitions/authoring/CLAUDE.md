# Authoring panel

## Single prompt-pack authoring surface
This panel is the one place to author prompt packs. The older
PromptPackAuthoringWorkbench (formerly the inspector's Authoring tab)
was folded in and removed; the inspector's "Pack Authoring" tab now
renders this panel. The drafts → versions → publish workflow is built
from the shared lib/ui/promptPacks/ primitives (DraftsList,
VersionsList, VersionDetailPanel, useDraftLifecycle), consumed by the
CUE Pack method's Pack + Versions tabs. Change lifecycle behavior in
the shared primitive, not in the consumer.

## Adding a new authoring method
The method registry only holds methods imported at module load time.
A new method must be imported as a side effect from
AuthoringPanel.tsx — auto-discovery is per-panel (Vite glob),
not per-method. Forgetting this is the most common bug class here.

## Auth gating
`isAvailable` on AuthoringMethod is frontend UX only. Backend
endpoints called by a gated method MUST add CurrentAdminUser /
CurrentCodegenUser themselves (see pixsim7/backend/main/api/dependencies.py).
The panel filter is not a security boundary.

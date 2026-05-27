# Authoring panel

## Sibling lifecycle surface
The same drafts → versions → publish workflow already lives in
features/panels/domain/definitions/prompt-library-inspector/PromptPackAuthoringWorkbench.tsx.
Both surfaces consume lib/ui/promptPacks/ (DraftsList, VersionsList,
VersionDetailPanel, useDraftLifecycle). Change behavior in the
shared primitive, not in one consumer.

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

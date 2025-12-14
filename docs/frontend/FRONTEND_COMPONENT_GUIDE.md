# Frontend Component Guide

This guide lists canonical, reusable UI primitives and conventions so contributors and AIs reuse the same building blocks instead of reinventing them.

## Prompting
- Canonical component: `apps/main/src/components/primitives/PromptInput.tsx`
- Barrel export: `apps/main/src/components/primitives/index.ts`
- Default limit: `apps/main/src/config/prompt.ts` (DEFAULT_PROMPT_MAX_CHARS)
- Provider-specific limit resolver: `apps/main/src/utils/prompt/limits.ts` (Pixverse=2048; TODO: fetch from operation_specs)

Usage notes:
- Always use `<PromptInput />` for collecting text prompts.
- If a variant is needed, add a prop (e.g., `variant="compact"`) rather than making a new component.
- Do not hardcode character limits in routes/components; import from config or use `resolvePromptLimit(providerId)`.

## Layout and Docking
- Workspace layout store: `apps/main/src/stores/layoutStore.ts`
- Resizable split & dock rendering: `apps/main/src/components/layout/*`
- Workspace route: `apps/main/src/routes/Workspace.tsx`

## Control Center Dock
- Store: `apps/main/src/stores/controlCenterStore.ts`
- Component: `apps/main/src/components/control/ControlCenterDock.tsx`
- Tasks for enhancement: `docs/CONTROL_CENTER_TASKS.md`

## General Conventions
- Prefer colocating UI primitives under `components/primitives/` with barrel exports.
- Keep shared config in `src/config/*`.
- Add brief JSDoc headers on canonical components stating they are the primary implementation to reuse.
- If introducing a new primitive, add it to this guide and export it in the relevant index barrel.

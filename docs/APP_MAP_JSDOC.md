---
id: app-map-jsdoc
title: App Map JSDoc Tags
summary: Canonical format for annotating modules with App Map metadata.
visibility: internal
tags:
  - app-map
  - jsdoc
  - documentation
featureIds:
  - app-map
---

# App Map JSDoc Tags

Use JSDoc tags on module declarations to populate the App Map registry. These tags are the canonical source of App Map metadata.

## Placement

Place the JSDoc block immediately above the module declaration (the `export const` that defines the module). The generator reads JSDoc from the variable declaration or its statement.

## Tags

`@appMap.docs` Comma-separated list of documentation paths.

`@appMap.backend` Comma-separated list of Python module paths.

`@appMap.frontend` Comma-separated list of frontend file or folder paths.

`@appMap.notes` Freeform text for implementation notes. Use `|` to separate multiple notes.

## Example

```ts
/**
 * @appMap.docs docs/APP_MAP.md, docs/architecture/APP_MAP_GENERATION.md
 * @appMap.backend pixsim7.backend.main.api.v1.dev_architecture
 * @appMap.frontend apps/main/src/features/panels/components/dev/AppMapPanel.tsx
 * @appMap.notes Canonical architecture entrypoint | Dev-only panel for exploration
 */
export const appMapModule: Module = {
  id: 'app-map-dev',
  name: 'App Map',
  page: {
    route: '/app-map',
    featureId: 'app-map',
  },
};
```

## Precedence and Fallbacks

JSDoc tags override `page.appMap` when both exist. `page.appMap` remains a deprecated fallback during migration. The legacy `docs/app_map.sources.json` registry is also deprecated.

## Guardrails

- Place the JSDoc block immediately above the `export const` module declaration. Tags on nested objects are ignored.
- Use repo-relative paths with forward slashes (no absolute paths or Windows backslashes).
- Prefer folder paths over individual files to reduce churn on file moves.
- Keep `@appMap.notes` short; long explanations should live in docs.
- Avoid commas or spaces inside path tokens; lists split on commas or whitespace.
- Use `|` in notes only when you want multiple notes.
- `page.route` still defines the route. JSDoc does not replace route metadata.

## Regenerate Outputs

Run `pnpm docs:app-map` to refresh `docs/app_map.generated.json` and `docs/APP_MAP.md`.

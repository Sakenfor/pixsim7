## Micro-frontend setup plan (apps + shared packages)

This document outlines how to host multiple frontends (e.g., main web app and game frontend) in one repo, with shared libraries for UI, utils, and types. It favors pnpm workspaces but works similarly with npm/yarn workspaces.

---
## Goals
- Separate deployable apps: keep the game UI independent from the main site.
- Share code safely via versioned local packages (no ad-hoc cross-imports).
- Keep React single-instance and Tailwind consistent.
- Simple dev ergonomics (one command to run both); clean CI.

---
## Proposed layout (non-breaking to current frontend)

```
pixsim7/
  package.json          # workspaces root (private)
  pnpm-workspace.yaml   # or npm/yarn workspaces
  tsconfig.base.json    # shared ts settings (optional)

  frontend/             # existing main app (kept as-is)
  game-frontend/        # new app (Vite React TS)

  packages/
    ui/                 # shared UI components (PromptInput, etc.)
    utils/              # shared hooks/helpers/api wrappers
    types/              # shared TypeScript types & API contracts
    config-tailwind/    # shared tailwind preset (optional)
```

We keep `frontend/` unchanged; `game-frontend/` is added next to it. Shared code lives in `packages/*` and is consumed by both apps.

---
## Step-by-step

1) Root workspace definition
- package.json (root):
  - `{"name":"@pixsim7/workspace","private":true,"workspaces":["frontend","game-frontend","packages/*"],"scripts":{"dev":"pnpm -r --parallel dev","build":"pnpm -r build"}}`
- pnpm-workspace.yaml: patterns for apps and packages.
- Choose pnpm (recommended) or npm/yarn; ensure Node versions align.

2) New game app
- Scaffold `game-frontend` with Vite React + TypeScript.
- vite.config.ts:
  - `resolve: { dedupe: ['react','react-dom'] }`
  - dev proxy to game backend: `/game/v1 -> http://localhost:<game_port>`
- Tailwind: reuse shared preset (see below) or clone config initially.
- Env: `.env` with `VITE_GAME_API_BASE=/game/v1`.

3) Shared packages
- packages/ui: TS lib exporting shared primitives (PromptInput, layout primitives if desired).
  - Build via tsup/rollup or ship source TS; Vite can compile source packages.
- packages/utils: `apiClient`, hooks, utilities.
- packages/types: types for jobs, providers, game narrative, zod schemas if desired.
- packages/config-tailwind (optional): tailwind.preset.js with theme + plugin config.

4) Tailwind setup
- In each app tailwind.config:{
  - `presets: [require('@pixsim7/config-tailwind/tailwind.preset')]` (if using preset)
  - `content: ['index.html','src/**/*.{ts,tsx}', '../../packages/**/*.{ts,tsx}']` to include shared packages
}
- Avoid class purging by ensuring shared packages are in content globs.

5) TypeScript & pathing
- Root tsconfig.base.json defines shared compiler options.
- Each package gets its own tsconfig.json; apps reference base.
- If using project references, configure `composite: true` in packages.

6) React single-instance
- Ensure `react` and `react-dom` versions are identical and hoisted at root.
- In Vite configs: `resolve.dedupe: ['react','react-dom']`.
- Avoid bundling separate React copies inside packages (mark as peerDependencies in packages).

7) Dev & CI
- Dev: `pnpm dev` runs apps in parallel; each app picks its own port.
- Build: `pnpm build` builds all packages then apps.
- CI caches pnpm store; jobs: lint, typecheck, build, test per app.

8) API routing
- In prod behind a single domain:
  - Core backend under `/api/v1/*` (existing)
  - Game backend under `/game/v1/*`
- For local dev, use Vite proxy in each app to correct service.

---
## Sharing strategy
- Only import from `packages/*` — do not import from sibling app folders.
- Keep shared packages small and stable; version bump when APIs change.
- Prefer exporting primitives and hooks over entire pages for cleaner boundaries.

---
## Migration plan (incremental)
1. Add root workspace files (no moving current frontend).
2. Create `packages/types` and move a small shared type (e.g., JobStatus) to prove wiring.
3. Create `game-frontend` with a minimal route and API client hitting the game service.
4. Optional: create `packages/ui` and export PromptInput for reuse.
5. Later: factor out more shared logic as needed (config, utils, zod schemas).

---
## Common pitfalls and fixes
- Tailwind not picking up classes in packages → add `../../packages/**` to `content` globs.
- Duplicate React errors → use dedupe in Vite; set React as peerDependency in packages; align versions.
- HMR not updating shared packages → ensure Vite server watches `packages/**` and that packages export ESM.
- Type mismatch across apps → centralize types in `packages/types`.

---
## Alternatives
- Module Federation: useful for runtime-loaded MFE, but adds complexity. Start with workspaces; revisit MF if you need independent runtime composition.
- Separate repo for the game app: possible, but you’ll lose frictionless sharing; only do this if governance requires it.

---
## Definition of Done for initial cut
- Workspaces configured; `pnpm -r build` succeeds.
- `game-frontend` boots and calls `/game/v1/health` (stub) via proxy.
- At least one shared type imported from `packages/types` by both apps.

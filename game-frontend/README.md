# PixSim7 Game Frontend

A separate React + Vite app for the game UI (sessions, scene player, etc.).

## Dev

- Prereq: run the Game Service on port 9001 (e.g., `uvicorn pixsim7_game_service.main:app --reload --port 9001`).
- Start the app:
  - With pnpm (recommended): run at repo root `pnpm -r --parallel dev`
  - Or directly in this folder: `npm install` then `npm run dev`

The dev server proxies game API calls:
- `/game/health` -> `http://localhost:9001/health`
- `/game/v1/*` -> `http://localhost:9001/api/v1/*`

## Sharing code

This app imports types from the shared workspace package `@pixsim7/types`.
If you’re not using pnpm, you can still run locally with npm by installing in this folder.
To fully wire workspace linking, install pnpm and run `pnpm install` at the repo root.

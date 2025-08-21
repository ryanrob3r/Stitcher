# Repository Guidelines

## Project Structure & Module Organization
- `main.go`, `app.go`: Wails app bootstrap and backend logic (FFmpeg checks, metadata, merging).
- `frontend/`: React + TypeScript UI.
  - `src/`: App code, components, assets.
  - `wailsjs/`: Auto‑generated TS bindings for Go methods.
- `build/`: App icons, platform packaging metadata.
- `wails.json`, `go.mod`: Build/config for Wails and Go.

## Build, Test, and Development Commands
- `make deps`: Install frontend dependencies with `npm ci`.
- `make dev`: Run the app in development (Wails + Vite).
- `make build`: Production build via `wails build`.
- `make go-build`: Sanity‑check backend compiles.
- `make frontend-build`: Build UI assets for embedding.
- `make fmt` / `make test`: Format and run Go tests.

Direct alternatives
- `wails dev` | `wails build`
- `cd frontend && npm run dev | npm run build`
- `go build ./...` | `go test ./...`

Prereqs: Go 1.20+, Wails v2 CLI, FFmpeg on PATH, Node 16+.

## Coding Style & Naming Conventions
- Go: run `go fmt ./...`; exported identifiers `PascalCase`, unexported `camelCase`; package names short, lowercase.
- TypeScript/React: 2‑space indent; components `PascalCase.tsx`, hooks `useX.ts`, utilities `camelCase.ts`.
- Keep UI state/layout in `frontend/src`, generated code stays under `frontend/wailsjs` (do not edit generated files).

## Testing Guidelines
- Current repo has no formal tests. For backend, add `_test.go` files using the `testing` package and run `go test ./...`.
- For the frontend, prefer `vitest` + `@testing-library/react` if introducing tests. Place tests alongside files as `*.test.ts(x)`.
- Aim for focused unit tests around video metadata parsing and UI ordering logic.

## Commit & Pull Request Guidelines
- Commits: follow Conventional Commits with optional scope (e.g., `feat(ui): add progress reporting`, `refactor(video): normalize inputs`).
- PRs: include a clear summary, linked issues, before/after screenshots for UI changes, and platform notes if build/packaging is affected.
- Keep changes small and self‑contained; update README or in‑app text when behavior changes.

## Security & Configuration Tips
- FFmpeg must be installed and on PATH; handle user paths safely (no shell interpolation; use `exec.Command` args as implemented).
- Avoid committing large media; use sample assets in `frontend/src/assets` only.

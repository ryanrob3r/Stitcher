# Contributing

Thanks for your interest in improving Stitcher! This short guide points you to the key docs and workflows.

## Getting Started
- Read `AGENTS.md` (Repository Guidelines) for structure, commands, and conventions.
- Prereqs: Go 1.20+, Wails v2 CLI, FFmpeg on PATH, Node 16+ for the frontend.
- Install deps: `cd frontend && npm ci`.
- Dev run: `wails dev` (or `npm run dev` inside `frontend` for UI‑only).

## Submitting Changes
- Use Conventional Commits (e.g., `feat(ui): add progress reporting`).
- Keep PRs small and focused; include a summary and linked issues.
- Do not edit generated files under `frontend/wailsjs`.

## Checks Before PR
- Backend compiles: `go build ./...`.
- Frontend builds: `cd frontend && npm run build`.
- Add/update tests if applicable (see Testing in `AGENTS.md`).
- Update docs (README/AGENTS.md) if behavior or commands changed.

## Issues
- Use the templates under `.github/ISSUE_TEMPLATE/`:
  - Bug report (include OS, FFmpeg version, logs, steps)
  - Feature request (motivation, proposal, scope)

If unsure about scope or approach, open a draft PR or discussion in your issue first.


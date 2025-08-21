## Summary

Describe the purpose of this PR in 1–3 sentences.

Fixes #

## Changes

- Short bullet list of notable changes.
- Mention any user-facing behavior updates.

## Screenshots / Videos (UI)

Before/after images or short GIFs, if applicable.

## How to Test

1. Install deps: `cd frontend && npm ci`
2. Dev run: `wails dev` (or `npm run dev` in `frontend` for UI-only)
3. Build checks: `go build ./...` and `cd frontend && npm run build`

## Platform/Packaging Impact

- Windows/macOS/Linux notes if packaging or `build/` changed.

## Checklist

- [ ] Conventional Commit subject (e.g., `feat(ui): ...`, `fix(video): ...`).
- [ ] Clear description and linked issues.
- [ ] Tests added/updated or N/A (`go test ./...`, `vitest`) if tests exist.
- [ ] Docs updated if behavior or commands changed (README/AGENTS.md).
- [ ] No edits to generated files under `frontend/wailsjs`.
- [ ] Frontend builds (`npm run build`) and backend compiles (`go build ./...`).
- [ ] FFmpeg dependency handled (no hard-coded paths; errors surfaced).

## Breaking Changes

List any breaking changes and migration notes, or write “None”.

## Additional Notes

Anything reviewers should be aware of (follow-ups, trade-offs, etc.).


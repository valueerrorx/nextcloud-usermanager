# Nextcloud User Manager

Electron desktop app to manage Nextcloud users, groups and quotas incl. batch operations and CSV import.
Full goal: docs/GOAL.md. Architecture: docs/ARCHITECTURE.md. Progress: docs/PLAN.md. User decisions: docs/DECISIONS.md.

## Stack
- JavaScript (ES modules), Node.js, Electron, Vue 3, Vite
- Dialogs/confirmations: SweetAlert2 (swal2), dark-themed via CSS variables
- UI: Bootstrap 5 (CSS only, no Bootstrap JS) + bootstrap-icons; visual reference is the
  Microsoft365-Manager project (GitHub-Dark/Primer palette, see docs/DECISIONS.md)
- Tests: Vitest (unit tests for all pure logic; external HTTP mocked)
- Lint: ESLint
- Dev OS: Arch Linux

## Conventions
- Code comments: one short line, only where useful. No block comments.
- UI language German, code identifiers and commit messages English.
- Dark theme only, clean dashboard look.
- Electron security: contextIsolation on, nodeIntegration off, sandbox on, narrow preload API via contextBridge, all network calls in main process.
- Secrets (Nextcloud app password) only in main process, stored with Electron safeStorage, never in renderer, logs or git.
- Pure logic (username generation, CSV parsing, validation) in modules without I/O.

## Commands
- install: `npm install`
- dev: `npm run dev`
- test: `npm test`
- lint: `npm run lint`
- build: `npm run build`
(Architect/coder: keep these script names in package.json.)

## Test directories
- `tests/` (unit), fixtures in `tests/fixtures/`

## Reference projects (read-only, never modify)
- Microsoft 365 user tool: `/home/valueerror/Nextcloud/WebDEV/Microsoft365-Manager`
  Contains the UPN/username creation rules (special character replacement, double names, uniqueness). Must be ported 1:1.

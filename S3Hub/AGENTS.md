# AGENTS.md

This repository's engineering conventions for AI agents and contributors are documented in **[CLAUDE.md](./CLAUDE.md)**. Read it before making changes.

Critical constraints (summary):

- **Do not** touch native build config (`app.json`, `eas.json`, `plugin/*`, `expo-build-properties`) — Google Play 16KB page size support must stay intact.
- **Do not** upgrade `@aws-sdk/*` (pinned at `3.121.0`).
- All code and comments in **English**; UI strings via `src/locales/translations.js`.
- Follow **Clean Architecture** (`src/domain` is pure & testable), **TDD** (Jest + `jest-expo`), and **Clean Code**.
- Drive colors from the Paper theme (`useTheme()`), never hardcode hex colors in components.

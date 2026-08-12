# Agile Todo App

A browser-only todo board built around a monthly cadence. No backend, no accounts — your data never leaves your browser. The only network call is anonymous, cookie-free visit tracking; the app works identically if it's blocked.

**[Live demo →](https://joanesquivel.github.io/agile-todo-app/)**

433 tests · TypeScript strict · zero backend

Built by [Joan Esquivel](https://www.linkedin.com/in/joanesquivel/) · [source code](https://github.com/JoanEsquivel/agile-todo-app) · [☕ Buy me a coffee](https://www.paypal.com/paypalme/joanmedia)

![Screenshot of the Agile Todo App: a single-row header with a running Pomodoro timer and theme toggle, the month tape as an accordion (the current week expanded into day chips, other weeks folded to compact date ranges), and the selected day's Todos and Notes side by side with a high-priority todo and a blocker note](docs/screenshot.png)

## What it does

- **Month board** — the workdays of the current calendar month, grouped by week, with weekend-anchor rules and roll-forward past month-end handled for you. The day bar is an accordion: the current week expands to full-width day chips, every other week folds to a compact date range you can click to jump there
- **Daily rollover** — incomplete todos and unresolved blocker notes from past days automatically move forward, flagged as "rolled over"; unresolved blockers also carry forward automatically when a new month begins, so they never get stranded in history
- **Todo checklists** — break a todo into sub-items you add, check off and remove inline behind a `2/5` counter; when every item is checked the todo completes itself, unchecking one reopens it, and checking the todo itself checks or clears the whole list
- **Reorder & re-prioritize** — drag a todo by its handle to reorder it within its priority group, or drop it in another group to change its priority; a full keyboard alternative (`Space` grab/drop, `↑`/`↓` move, `Esc` cancel) works without a mouse
- **Standup generator** — one click produces a Yesterday/Today/Blockers summary, copyable straight to Slack
- **Visual reminders** — an Overdue/Upcoming panel, no browser notification permissions needed
- **Per-day notes** — flag a `blocker` (resolvable) or leave an `info` note
- **Automatic month rollover, three months of history** — when the active month ends, the next one is generated for you, nothing to click; the three most recent calendar months stay browsable (read-only, never editable) through a `‹ Month YYYY ›` stepper, and anything older is quietly pruned
- **Pomodoro timer** — an always-visible header widget with classic cycles (25/5, long break every 4th), configurable durations, and an optional sound + browser notification when a phase ends
- **Light / dark / system theme** — follows your OS by default, with a manual toggle that persists on your device
- **Built-in help** — an ⓘ button beside the theme toggle opens a guide to every feature above, plus the full shortcut list, plus a small visit-count badge in the footer linking to the public analytics dashboard
- **Keyboard-first** — a command palette and a full set of shortcuts; see below
- **Free & open source** — if it helps your day, you can [buy the author a coffee](https://www.paypal.com/paypalme/joanmedia); the amber pill in the header and the Help modal's footer link there too

## Keyboard shortcuts

| Key | Does |
|---|---|
| `⌘K` / `Ctrl+K` | Open the command palette — jump to a day, jump to a todo by title, or run an action |
| `?` | Open the help (Shortcuts tab) |
| `←` / `→` | Previous / next day |
| `Home` / `End` | First / last day of the month |
| `T` | Jump to today |
| `N` | New todo |
| `Shift+N` | New note |
| `S` | Standup |
| `P` | Pomodoro timer |
| `Esc` | Close the open form or dialog |
| `Space` (on a todo's drag handle) | Grab or drop the focused todo handle |
| `↑` / `↓` (on a todo's drag handle) | Move a grabbed todo (crossing a group changes its priority) |
| `Esc` (on a todo's drag handle) | Cancel a grab |

Every shortcut but `⌘K` stays out of the way while you're typing in a field. `N`/`Shift+N` (and the palette's Add actions) refuse to open a form while you're viewing read-only month history; day navigation always works, since it isn't a mutation.

## Why it's built this way

- **Browser-only, on purpose.** No backend, no accounts — your data never leaves your device. The only network call is anonymous, cookie-free visit analytics (GoatCounter); the app works identically if an ad blocker blocks it.
- **One versioned JSON document** in `localStorage`, with schema migrations and JSON export/import for backups.
- **A pure, testable domain core.** All the month/rollover/standup date logic lives in framework-free functions that take time as a parameter — no DOM, no mocking, fast tests.
- **Built test-first.** Every feature shipped with tests before the UI did.

## Quick start

Requires Node 20+.

```sh
npm ci
npm run dev
```

Open `http://localhost:5173`.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build locally |
| `npm test` | Run the test suite (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run typecheck` | Type-check the whole project |
| `npm run verify` | typecheck + test — what CI enforces before every deploy |

## Architecture at a glance

```
src/
  domain/      pure functions — date math, month generation, rollover, standup, reminders
  store/       Zustand store — persistence, migrations, backup export/import
  hooks/       React adapters over the store
  components/  UI, organized by feature (board, todos, notes, reminders, standup, history, commands, help)
  styles/      design tokens + global element defaults
```

Dependencies point one way: `domain → store → components`. The domain layer has zero framework dependencies, which is what makes the date logic unit-testable in isolation.

Full architecture rationale, data model, and edge-case decisions: [`docs/superpowers/specs/2026-08-10-agile-todo-app-design.md`](docs/superpowers/specs/2026-08-10-agile-todo-app-design.md), amended by [`docs/superpowers/specs/2026-08-10-monthly-board-redesign-design.md`](docs/superpowers/specs/2026-08-10-monthly-board-redesign-design.md) for the month board, scheduling horizon, and navigation UI, by [`docs/superpowers/specs/2026-08-11-tape-accordion-blocker-rollover-design.md`](docs/superpowers/specs/2026-08-11-tape-accordion-blocker-rollover-design.md) for the day-bar accordion and blocker rollover/carry-over, by [`docs/superpowers/specs/2026-08-11-three-month-window-auto-rollover-design.md`](docs/superpowers/specs/2026-08-11-three-month-window-auto-rollover-design.md) for automatic month rollover, the three-month retention window, and the `‹ Month ›` stepper, and by [`docs/superpowers/specs/2026-08-11-help-modal-design.md`](docs/superpowers/specs/2026-08-11-help-modal-design.md) (the header help button + unified Help modal).

## Testing

Vitest + React Testing Library, 433 tests across 34 files, all colocated with the code they test. Coverage spans pure domain logic, store transitions, persistence/migration behavior, component interaction, and accessibility.

```sh
npm test                              # everything
npx vitest run src/domain/dates.test.ts   # one file
```

## Data & privacy

Everything is stored under a single `localStorage` key (`agile-todo-app.v-state`), plus one tiny `agile-todo-app.theme` key when you pick a manual theme. Your data itself never leaves the browser — the only network traffic is an anonymous GoatCounter visit beacon and read, blockable with zero effect on the app. Clearing your browser's site data deletes everything — export a JSON backup first if you want to keep it.

## Deployment

GitHub Actions builds, tests, and deploys to GitHub Pages on every push to `main` (see `.github/workflows/deploy.yml`).

## Docs

- [`CLAUDE.md`](CLAUDE.md) — architecture invariants and conventions, for anyone (human or AI) making changes
- [`docs/superpowers/specs/2026-08-10-agile-todo-app-design.md`](docs/superpowers/specs/2026-08-10-agile-todo-app-design.md) — the design spec, amended by [`docs/superpowers/specs/2026-08-10-monthly-board-redesign-design.md`](docs/superpowers/specs/2026-08-10-monthly-board-redesign-design.md) (the month-board redesign), [`docs/superpowers/specs/2026-08-11-tape-accordion-blocker-rollover-design.md`](docs/superpowers/specs/2026-08-11-tape-accordion-blocker-rollover-design.md) (the day-bar accordion + blocker rollover), [`docs/superpowers/specs/2026-08-11-three-month-window-auto-rollover-design.md`](docs/superpowers/specs/2026-08-11-three-month-window-auto-rollover-design.md) (automatic month rollover, three-month retention, and stepper navigation), [`docs/superpowers/specs/2026-08-11-help-modal-design.md`](docs/superpowers/specs/2026-08-11-help-modal-design.md) (the header help button + unified Help modal), and [`docs/superpowers/specs/2026-08-11-donate-button-design.md`](docs/superpowers/specs/2026-08-11-donate-button-design.md) (the donate button), and [`docs/superpowers/specs/2026-08-11-visitor-count-badge-design.md`](docs/superpowers/specs/2026-08-11-visitor-count-badge-design.md) (anonymous visit tracking + the Help modal badge)
- [`docs/TECH-DEBT.md`](docs/TECH-DEBT.md) — known, triaged gaps
- [`docs/ARCHIVE.md`](docs/ARCHIVE.md) — how it was originally built (historical)

## Author

Built by **Joan Esquivel** — [LinkedIn](https://www.linkedin.com/in/joanesquivel/) · [GitHub](https://github.com/JoanEsquivel). The header of the app links to LinkedIn too. If the app helps your day, you can [buy me a coffee](https://www.paypal.com/paypalme/joanmedia).

## License

MIT — see [`LICENSE`](LICENSE).

# Build history (archive)

> **This is a historical record, not a guide.** It documents how the app was originally built (24-task TDD plan, executed by subagent-driven development, followed by a final whole-branch review). It is superseded by the code and by `CLAUDE.md`. Do not follow it as a process for future changes — see `CLAUDE.md`'s Recipes instead.
>
> The original plan (`docs/superpowers/plans/2026-08-10-agile-todo-app-implementation.md`) is ~3200 lines and should not be read in full by an agent — see `CLAUDE.md`'s warning about it. This file is the compact summary.

Branch `feat/agile-todo-app`, forked from `main` @ `03440f0`.

## Tasks

- Task 1: Scaffold project + test harness — `f742122`
- Task 2: Domain types + date helpers — `9e3945b`
- Task 3: Fortnight generation + effectiveBoardDay — `654fe61`
- Task 4: Daily rollover — `cd3ef33`
- Task 5: Carry-over at regeneration — `210fb79` + fix `dc36fea` (boundary test added)
- Task 6: Standup builder + formatter — `e276329` + fix `611d465`
- Task 7: Reminders partition — `a0d389a`
- Task 8: Schema migrations — `793168e`
- Task 9: Debounced localStorage adapter — `4d3b7b6` + fix `760b9d7` (removeItem tests added)
- Task 10: Backup export/import validation — `6e1e67c` + fix `8ddd91d` (error-branch tests added)
- Task 11: Clock + store init + CRUD — `ee3e073`
- Task 12: checkDayTick + regenerate + selectors — `be7c8ab`
- Task 13: Wire persistence into store — `551d372` + fix `1612894` (global test teardown drains debounce timers)
- Task 14: App shell + board navigation — `bfa299e`
- Task 15: TodoItem + TodoForm — `a07cce2` + fix `6d76fe6` (read-only mode test added)
- Task 16: NoteCard + NoteForm — `942b859`
- Task 17: RemindersPanel + useNow — `46c3ada`
- Task 18: Modal + StandupModal + clipboard — `013345c`
- Task 19: Regenerate + history browsing — `886f524`
- Task 20: Backup controls UI — `75a0a00`
- Task 21: Day-change watcher — `0a401e8`
- Task 22: Visual design pass — `8667d15` + fix `a57d0cf` (`:has()` instead of duplicate data attribute)
- Task 23: A11y + keyboard navigation — `0459ae9`
- Task 24: Final verification — automated (89/89 tests, typecheck, build) + manual browser smoke test, 0 console errors

## Human rulings made during the build (now live rules — see `CLAUDE.md`)

1. **Standup "Today" includes done todos, struck-through.** `StandupData.today` includes completed todos scheduled for today (not just pending ones); `formatStandup` renders them as `- ~Title~` in the copied text, and `StandupModal` wraps them in `<s>`. The original plan's own test expectation was the error — the design spec governed. Fixed in `611d465` / `013345c`.
2. **`:has()` over duplicate data attributes.** When a parent element needs to style based on a child's semantic attribute (e.g. a note card styled by its category), reach into the child with a CSS `:has()` selector rather than duplicating the attribute onto the parent. Made explicit in `a57d0cf`.

## Final whole-branch review

24/24 tasks complete, 89/89 tests passing at the time, clean typecheck, production build succeeded, and a full manual browser smoke test (9 scenarios) passed with 0 console errors.

A final review (dispatched separately from the 24 task-scoped reviews, covering the whole branch diff `03440f0..0459ae9`) found **2 Critical + 4 Important cross-task seam defects** — the kind of bug that's invisible when reviewing one task's diff at a time, only visible looking at the whole system:

1. **Read-only mode could still be mutated** via a stale open Add-todo/Add-note form that survived a fortnight-view switch (the form was gated on `!readOnly` at the trigger button, not at the form render itself).
2. **A backup with a dangling `activeFortnightId`** (referencing no fortnight in `fortnights`) could brick the app at the next load — a non-null-asserted `.find(...)!` crash at module-scope `initApp()`, before React ever rendered, with no way to reach the Import button to recover.
3. **Persist rehydration failures were silently swallowed**, then the user's real (possibly recoverable) stored data got overwritten by the next debounced write.
4. **`importState` spread an unvalidated backup object** into `set()`, which could clobber store action functions if a backup file happened to contain a key matching an action name.
5. **`importState` never ran the day-tick**, so imported todos scheduled on past days stayed stranded until a full page reload.
6. **Clicking a reminder while viewing history** selected a day outside the viewed (read-only) fortnight's range, producing a visibly broken board.

All six were fixed in one commit, `af61051`, with 10 new regression tests, then re-reviewed and verdicted **ready to merge**. These fixes are now encoded as live rules in `CLAUDE.md` (see the invariants on read-only mode, rehydration, and import).

Three new Minor findings from that re-review were parked, not fixed — see `docs/TECH-DEBT.md`.

## Deployment

Merged via PR #1 to `main`, then a GitHub Actions workflow (`.github/workflows/deploy.yml`) was added and the app deployed to GitHub Pages at `https://joanesquivel.github.io/agile-todo-app/`.

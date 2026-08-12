# Known tech debt

Triaged during implementation and the final whole-branch review. Deliberately **parked, not blocking**. Everything here is a real, verified gap — not a guess.

**Do not fix these opportunistically mid-feature.** If you're touching code near one of these and want to fix it, do it as its own commit with its own test, then delete the row.

## Table

| ID | Area | Issue | Impact | Fix cost |
|----|------|-------|--------|----------|
| TD-1 | `src/store/store.ts` (rehydration) | No structural validation on the localStorage rehydration path — only `parseBackup` (import) validates. | A structurally-invalid-but-valid-JSON blob in `localStorage` still crashes at render (sibling of the Critical bug fixed in `af61051`, which only covered the *import* path). | M |
| TD-2 | `src/store/persistence.ts` | `write()` has no `QuotaExceededError` handling. | Silent data loss if the browser's storage quota is hit. | M |
| TD-5 | `src/components/todos/TodoForm.tsx` | Renders a `<form>` as a direct `<ul>` child when editing a todo inline. | Invalid HTML nesting (browsers tolerate it, but it's not spec-clean markup). | S |
| TD-6 | `src/store/store.ts` | `updateNote` is an orphan action: no UI wires it, no test exercises it. | Dead API surface. Either build a note-edit affordance or remove the action. | S |
| TD-7 | `src/domain/rollover.ts` | `applyRollover`'s `changed` return flag has no consumer (`checkDayTick` discards it); `applyNoteRollover`'s `changed` flag (added alongside blocker-note rollover) has the same shape and is discarded the same way. | Dead API surface — not a bug, just unused. | S |
| TD-10 | `src/store/store.ts` | `addTodo`/`addNote` still use `activeFortnightId!` (non-null assertion). | Unreachable via the current UI (no add controls render without an active fortnight), but brittle if a new call site is ever added outside the UI flow. | S |
| TD-11 | `package.json` | `typescript` is `^7.0.2`, unpinned, on TypeScript's native/Go-based compiler line. | A fresh `npm install` by a future contributor or CI could shift to a materially different compiler behavior under a caret range on a bleeding-edge major. | S |
| TD-12 | `package.json` | `vite` isn't in the plan's original dependency whitelist (unavoidable — the `dev`/`build`/`preview` scripts require it). | None — documented for context only, not an action item. | — |
| TD-13 | `package.json` | Runtime is React 19 / Zustand 5; the original design spec said "React 18". | Works correctly (nothing depends on a React-18-only API); an undocumented deviation from an approved spec, worth knowing about. | — |
| TD-14 | `src/domain/fortnight.ts`, `src/store/`, `src/components/board/`, `src/domain/types.ts` | The scheduling horizon moved from a 10-workday fortnight to a calendar month, but the internal naming (`Fortnight` type, `fortnightId`, `FortnightTape`/`FortnightBoard`/`FortnightNav`, `fortnight.ts`) still says "fortnight" — deliberately. | None — cosmetic-only mismatch between code naming and user-visible "month" copy, documented in `CLAUDE.md`. Renaming would touch the persisted `fortnightId` field and ~40 files for zero user-facing value. | — |
| TD-15 | `src/components/common/Modal.tsx` | Focus trap selector doesn't exclude `[tabindex=\"-1\"]` on button elements; Shift+Tab from close button can focus inactive roving-tabindex controls (like HelpModal tabs) outside the modal. | Semantic focus boundary breaks when cycling from modal's last element. | M |

## Minor / cosmetic

Untested edge cases and small nits, grouped separately so the table above stays credible as "things worth doing":

- `src/domain/dates.ts`: `formatDayLabel` has no dedicated test.
- `src/domain/reminders.ts`: the `reminderAt === now` exact-boundary case is untested; `new Date(t.reminderAt)` is parsed twice per item in `partitionReminders` (minor perf nit, not correctness).
- `src/store/migrations.ts`: the "no migration step defined for source version" throw path is untested.
- `src/store/persistence.ts`: single-slot `pending` state — the single-key assumption is undocumented; interleaved writes to two different keys on one adapter instance would silently drop the earlier one. Correct today (one key in use), but worth a comment if the adapter is ever reused.
- `src/components/board/DayColumn.tsx`: the Todos and Notes `EmptyState`s both use `role="status"`, which could double-announce to a screen reader when a day with no todos or notes renders.
- `src/styles`: rollover badges use a distinct `--color-rollover` (ochre) rather than sharing `--color-attention` (red) with overdue badges — this is an intentional design choice (distinct semantics deserve distinct hues), not a bug.
- Final-review Minor findings (from the `af61051` fix wave's re-review, not yet independently fixed): the dangling-fortnight recovery branch in `initApp` can preserve a stale `selectedDay` outside the fresh fallback fortnight's day range; once `rehydrationError` is set, persistence is silently paused for the rest of the session with no banner warning that new changes won't be saved.
- `src/components/commands/CommandPalette.tsx`: todo search only covers the currently *viewed* fortnight, not full history — a deliberate scope choice for the initial version, not a bug, but worth widening if cross-fortnight search is ever requested.

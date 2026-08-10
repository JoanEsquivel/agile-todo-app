# Studio Console — UI redesign design spec

**Status:** approved · **Date:** 2026-08-10 · **Supersedes:** the visual layer only of [`2026-08-10-agile-todo-app-design.md`](2026-08-10-agile-todo-app-design.md)

This spec covers **presentation, interaction, and accessibility**. It changes no product rules. The fortnight model, rollover, carry-over, standup, and reminder semantics defined in the original design spec remain the product authority and are untouched.

---

## 1. Why

The app is finished and correct, but its visual identity is a warm-cream "paper-and-ink planner" — near-identical to the most common generic AI-design default (cream ground, high-contrast serif, terracotta accent). It reads as templated rather than chosen.

Beneath the styling sit real usability defects:

| Defect | Evidence |
|---|---|
| Crossing the day strip costs **13 consecutive tab stops** | `DayStrip.tsx` — `<nav tabIndex={0}>` plus prev + 10 chips + next, no roving tabindex |
| No skip link, no way past the header | no `id` on `<main>`, no skip target anywhere |
| Every todo row exposes an identical "Delete" | `TodoItem.tsx` — bare `Delete`, while `NoteCard.tsx` already does `Delete note: {text}` |
| Native `<select>`, scrollbars, and the datetime picker stay light in dark mode | no `color-scheme` declaration |
| Opening an add-form drops focus to `<body>` | `DayColumn.tsx` unmounts the Add button that had focus |
| The one destructive action uses a browser dialog | `window.confirm` in `App.tsx` |
| "Today" is conveyed by a `data-*` attribute only | `DayStrip.tsx` — `data-today` with no accessible equivalent |

**Goal:** a distinctive, dense, keyboard-first interface that is genuinely accessible — not a reskin.

---

## 2. Design direction: "studio console"

The product is a working developer's fortnight planner, used daily at a desk beside an IDE. The single job of the page: *answer "what am I doing today" in under two seconds, and let me say it out loud at standup.*

### 2.1 Signature element — the Fortnight Tape

The one memorable thing. It replaces `DayStrip`'s detached chips.

```
  WEEK 1                        WEEK 2
  M17   T18   W19   T20   F21   M24   T25   W26   T27   F28
  ▮▮    ▮▮▮   ▮     ·     ▮     ▮▮    ▮     ·     ·     ▮
        │           │
        │           └─ no todos: a single faint tick, not an empty gap
        └─ three segments: two high (warm), one done (dimmed)
              ▲ today playhead sits under the selected day
```

Each of the 10 workdays renders a **stacked column of one segment per todo**, colored by priority and dimmed when done. A real gap separates index 4 from index 5 — the week boundary. A playhead marks today.

This is deliberate on three counts:

- **It encodes truth, not decoration.** Segment count is real workload; segment color is real priority; the gap is a real weekend. Nothing is a numbered eyebrow or an ornamental rule.
- **It answers the page's job at a glance.** You see Thursday is empty and Tuesday carries two highs without clicking anything — impossible today, where a chip shows only `(3)`.
- **It is simultaneously the navigation**, so the boldness costs no extra screen space.

Everything else stays quiet, hairline, and disciplined. This is the only place boldness is spent.

### 2.2 Color — achromatic chrome, saturation reserved for meaning

The disciplined move: **the interface chrome has no brand color at all.** Primary and selected states are an *ink fill* — near-black on light, near-white on dark. Saturation appears in exactly two roles:

1. **Semantic content** — priority, blocker, overdue, rollover, success. The only saturated color in the content area *means* something.
2. **The focus ring** — a single saturated violet, used for **nothing else in the entire app**, so a focus indicator can never be mistaken for a status color.

Most dashboards put a brand accent in direct competition with their status colors. Refusing one is what makes the semantic palette legible here.

Light is the primary mode (a daytime tool). Dark remains `prefers-color-scheme` only — no toggle, no JS, no theme state, per **INV-12**.

#### Token semantics (changed)

The two border tokens are currently used interchangeably. This spec gives them distinct, enforceable meanings:

- **`--color-border`** — decorative hairline: card edges, dividers, section rules. Carries no information, so no contrast floor applies.
- **`--color-border-strong`** — the boundary of an interactive control (`button`, `input`, `select`, `textarea`). This is what identifies the control, so WCAG 1.4.11 applies: **≥ 3:1**.

That distinction is why `--color-border-strong` is materially darker in this palette than the current `#c4bcaa`, which sits at 1.5:1 and fails.

#### Palette — all values contrast-verified

| Token | Light | Dark |
|---|---|---|
| `--color-bg` | `#FAFAFB` | `#0C0D10` |
| `--color-surface` | `#FFFFFF` | `#16181C` |
| `--color-surface-sunken` | `#F1F2F4` | `#101216` |
| `--color-surface-hover` | `#F4F5F7` | `#1D2026` |
| `--color-border` | `#E4E6EA` | `#262A31` |
| `--color-border-strong` | `#868D9B` | `#6B717C` |
| `--color-text` | `#14161A` | `#E8EAEE` |
| `--color-text-muted` | `#5C626D` | `#9BA1AD` |
| `--color-text-faint` | `#666D79` | `#838A96` |
| `--color-ink` | `#14161A` | `#E8EAEE` |
| `--color-ink-hover` | `#2E333B` | `#C9CED8` |
| `--color-on-ink` | `#FFFFFF` | `#0C0D10` |
| **`--color-focus-ring`** | **`#5B3DF5`** | **`#A08CFF`** |
| `--color-priority-high` / `-bg` | `#C0341C` / `#FCEAE6` | `#F08A6E` / `#3A1A12` |
| `--color-priority-medium` / `-bg` | `#8A5D08` / `#FAF0DC` | `#E0AC5A` / `#33260D` |
| `--color-priority-low` / `-bg` | `#5C6672` / `#EEF0F3` | `#9AA3B0` / `#22262C` |
| `--color-blocker` / `-bg` | `#B3261E` / `#FCE9E7` | `#F0857A` / `#371815` |
| `--color-info` / `-bg` | `#1F5FA8` / `#E8F0FA` | `#7FB0EA` / `#14243A` |
| `--color-attention` / `-bg` | `#C4271C` / `#FDEAE7` | `#F58A7E` / `#3A1A16` |
| `--color-rollover` / `-bg` | `#8A5A00` / `#FAF0DA` | `#DFB05E` / `#302408` |
| `--color-success` / `-bg` | `#1E7A4B` / `#E6F4EC` | `#6ECB97` / `#10281C` |

**Verification is automated, not asserted.** All 68 foreground/background pairs were checked against WCAG 2.1 relative luminance and pass: body text ≥ 4.5:1, control borders and tape segments ≥ 3:1. Tightest margins are `textFaint` on `sunken` (light, 4.65) and `borderStrong` on `bg` (light, 3.20) — treat both as floors when adjusting.

This ships as a real test (`src/styles/tokens.test.ts`) that parses `tokens.css` and re-derives every ratio, so a future token edit that breaks contrast fails `npm run verify` rather than shipping.

Other token changes: radii tighten to `4px` / `6px` (pill retained for badges only); the type scale tightens for the console register (`--text-base` → `0.875rem`); `color-scheme: light dark` is declared so native controls theme correctly.

### 2.3 Typography

| Role | Face | Used for |
|---|---|---|
| Display / UI | **Archivo** (variable, 400–700) | Everything structural. Squarish counters read technical without being quirky. `-0.02em` tracking at display sizes. |
| Data | **IBM Plex Mono** (400/600) | Dates, counts, the tape scale, the fortnight range. `font-variant-numeric: tabular-nums`. |

Both OFL, **self-hosted, no npm dependency**, `font-display: swap`, with the existing system stack retained as the fallback list.

Files live in `src/assets/fonts/` and are referenced relatively — **not** `public/`. Vite silently falls through for a missing public file, emitting a bare `/fonts/…` URL that 404s under the GitHub Pages base `/agile-todo-app/`, invisible until a real user loads the site. A relative import makes a missing file a hard build error and adds content hashing.

If the faces cannot be obtained, the fallback is the system stack **and that must be reported**, not silently shipped as a broken `@font-face`.

### 2.4 Layout

```
┌ header ─────────────────────────────────────────────────┐
│ Agile Todo   Aug 17 – 28   [read-only]    ⌘K  Standup ⋯ │
├ FORTNIGHT TAPE ─────────────────────────────────────────┤
│  WEEK 1                  │  WEEK 2                      │
│  M17 T18 W19 T20 F21     │  M24 T25 W26 T27 F28         │
│  ▂▂  ▅▅▅ ▂   ·   ▂       │  ▅▅  ▂   ·   ·   ▂           │
│       ▲ today                                            │
├ main#main ───────────────────┬ rail ─────────────────────┤
│ Tue, Aug 18                  │ <aside> Reminders         │
│ Todos / Notes                │ <aside> Blockers          │
└──────────────────────────────┴───────────────────────────┘
```

Single breakpoint stays at 1024px; below it the rail drops beneath the board. The rail wrapper is a plain `<div>` — nesting `RemindersPanel`'s existing `<aside aria-label="Reminders">` inside another `complementary` landmark would be a landmark smell.

---

## 3. Interaction model

### 3.1 Keyboard

The tape becomes **one tab stop** (roving tabindex), down from 13. Arrows then move focus *and* selection together.

| Key | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Command palette |
| `?` | Shortcuts overlay |
| `←` / `→` | Previous / next day |
| `Home` / `End` | First / last day of the fortnight |
| `T` | Jump to today |
| `N` / `Shift+N` | New todo / new note on the selected day |
| `S` | Standup |
| `Esc` | Dismiss the open overlay or compose form |

Every global shortcut no-ops when focus is in an `input`, `textarea`, `select`, or `contenteditable`, and — except `Esc` — while any `[role=dialog]` is mounted.

**Two ownership rules prevent double-handling.** Overlays own `Esc` themselves; the dialog-mounted bail gives that for free. And because React delegates events at the root container, a synthetic `stopPropagation()` does *not* stop the native event from reaching a window listener — so the tape calls `preventDefault()` and the global layer begins `if (e.defaultPrevented) return`. Without this, an arrow press with focus on a tape day advances the day **twice**.

### 3.2 Accessibility commitments

- Skip link to `<main id="main">` as the first focusable element.
- A `VisuallyHidden` **component** with its own module — not a global `.sr-only` class, which would require `:global` and violate **INV-12**.
- `color-scheme: light dark` so native controls follow the theme.
- Per-item accessible names: `Edit todo: {title}`, `Delete todo: {title}`, `Resolve blocker: {text}`.
- Disclosure semantics on the Add buttons: `aria-expanded` + `aria-controls`. This requires keeping the button **mounted** while its form is open — `aria-expanded` on an element that disappears when expanded is meaningless.
- Focus moves to the first field when a form opens and returns to the trigger when it closes.
- `Modal` hardening: portal to `document.body`, `aria-labelledby` → the heading (replacing a duplicated `aria-label`), focusable query excluding `[disabled]`/`[hidden]`, body scroll lock, scrim click to close, and `inert` on the app root.
- `ConfirmDialog` replaces `window.confirm`, with focus defaulting to Cancel.
- A polite live region (`role="status"`, `aria-live="polite"`, `aria-label="Announcements"`) announces day changes, adds, deletes, and copy.
- "Today" gains a real accessible indication alongside the existing `data-today` attribute.

Two constraints here are non-obvious and load-bearing:

**`inert`, never `aria-hidden`, on the app root.** `getByRole` honors `aria-hidden`, so hiding the root would make the entire app invisible to role-based queries whenever a modal is open. Additionally, cleanup must **un-inert before restoring focus** — focusing an element inside an inert subtree is ignored by real browsers, and jsdom does not model this, so the test suite cannot catch it.

**The live region must be `role="status"`, never `role="alert"`,** and must render outside the inert region — otherwise every announcement is suppressed while a modal is open.

---

## 4. State

One new field: **`composeIntent`** (`'todo' | 'note' | null`), so the palette and shortcuts can open a compose form that `DayColumn` currently owns as local `useState`.

It is **ephemeral**. It lives on `AppState` only — never `PersistedState`, no `SCHEMA_VERSION` bump, no migration, and **not** in `partialize` (**INV-6**). It joins `viewedFortnightId`, `selectedDay`, and `rehydrationError` as store-only state.

### The read-only regression this creates

**INV-9** exists because a todo created while viewing a past fortnight gets its `fortnightId` from the *active* fortnight but its day from the *viewed* one — producing a permanently invisible orphan. That shipped once as a Critical finding.

Today the only way to open a compose form is a button that read-only mode does not render. **A keyboard shortcut bypasses that button entirely**, reopening the exact same bug through a new door. Three independent guards are required:

1. `useShortcuts` early-returns on `selectIsReadOnly` for `N` / `Shift+N`, as does every palette compose action.
2. `setComposeIntent` **refuses in the reducer** when `viewedFortnightId !== activeFortnightId` — cheap to test without RTL.
3. `DayColumn` keeps gating the **form itself** on `!readOnly`, per INV-9's first rule.

Plus `viewFortnight` clears `composeIntent`, and the existing `useEffect` reset on `fn?.id` stays. `notes.test.tsx`'s stale-open-form test must keep passing **verbatim** — it is the canary for this whole class of bug.

Also new: **`selectDayWorkload(s, fortnightId)`**, a single pass over todos returning per-day priority segments for the tape, replacing 10 separate `selectTodosForDay` calls per render.

---

## 5. Testing

Conventions from **INV-10** hold: globals, colocated, grouped per feature folder, module-mocked clock, canonical fixture date `2026-08-18`.

New test files: `src/components/board/board.test.tsx` (the tape — board is currently an untested feature folder), `src/components/commands/commands.test.tsx`, `src/hooks/useShortcuts.test.tsx`, `src/styles/tokens.test.ts`.

Two existing tests need care, because both would otherwise **weaken silently rather than fail loudly**:

**`todos.test.tsx` read-only assertions.** These are `queryByRole('button', { name: 'Edit' })` with `.not.toBeInTheDocument()`. React Testing Library matches string names as exact full strings, so the moment the name becomes `Edit todo: {title}`, the query returns `null` regardless of what renders — and the assertion guarding the INV-9 Critical bug passes vacuously. **The rename and the assertion update must land in the same commit**, together with a new *positive* assertion that resolves one delete button unambiguously among two todos (impossible to write today, and precisely why the rename is worth doing).

**`a11y.test.tsx`'s arrow-key test.** It calls `.focus()` on the `<nav>`, which becomes a silent no-op in jsdom once roving tabindex removes `tabIndex={0}`. The arrow keys then bubble from `<body>` to the new global handler and the assertion still passes — while testing the exact opposite of what its name claims, and proving nothing about the tape. It is replaced by three honest tests: one-tab-stop, roving focus following selection, and global-shortcut-from-body.

---

## 6. Out of scope

Explicitly not in this work: a theme toggle (INV-12 forbids theme state); drag-and-drop rescheduling; any change to fortnight, rollover, carry-over, standup, or reminder rules; the parked items in [`TECH-DEBT.md`](../../TECH-DEBT.md) other than **TD-8** (`data-overdue` dead hook) and **TD-9** (unused tokens), which this work closes as a natural consequence.

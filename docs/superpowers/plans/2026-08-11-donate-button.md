# Donate Button ("Buy me a coffee") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a solid-amber "Buy me a coffee" pill linking to `https://www.paypal.com/paypalme/joanmedia`, mounted in the header (right of the GitHub icon) and in a footer inside the Help modal visible on both tabs.

**Architecture:** One shared presentational component (`DonateButton`, no props, no state) in `src/components/common/`, mounted twice. Three new color tokens in `tokens.css` form a documented third saturation role ("donate CTA"). No store, persistence, or domain changes.

**Tech Stack:** React 19 + TypeScript strict, CSS Modules, Vitest + React Testing Library. Spec: `docs/superpowers/specs/2026-08-11-donate-button-design.md`.

## Global Constraints

- `npm run verify` (typecheck + 377-test suite) must be green after every task. **Never** use `npx tsc --noEmit` — it checks zero files in this repo; use `npm run typecheck`.
- No new runtime dependencies (the set is exactly `react`, `react-dom`, `zustand`).
- Tests: Vitest globals are on — never import `describe`/`it`/`expect`/`vi`. Queries are role/label-based. Component tests live in the feature folder's existing test file.
- CSS: one colocated `.module.css` per component, all colors from `tokens.css` custom properties (`light-dark()` pairs), no hex values in component modules, no `composes:`/`:global` (INV-12).
- Exact copy (verbatim, used in code, tests, and accessible names):
  - Link label / accessible name: `Buy me a coffee`
  - Footer message: `Enjoying the app? Support its development!`
  - URL: `https://www.paypal.com/paypalme/joanmedia`
- External links use `target="_blank" rel="noopener noreferrer"`.
- Commit after each task, **locally only — do not push** (a push to `main` triggers the GitHub Pages deploy; the author pushes deliberately).
- A `PreToolUse` hook (`.claude/hooks/check-invariants.mjs`) enforces the invariants on every edit; if it blocks an edit, fix the edit — don't fight the hook.

---

### Task 1: Donate tokens + contrast enforcement

**Files:**
- Modify: `src/styles/tokens.test.ts` (the `pairs` array, ends ~line 133)
- Modify: `src/styles/tokens.css` (header comment ~lines 9–17; new token section after the focus block ~line 69)

**Interfaces:**
- Consumes: nothing.
- Produces: CSS custom properties `--color-donate-bg`, `--color-donate-bg-hover`, `--color-donate-text` (used by Task 2's stylesheet).

- [ ] **Step 1: Write the failing test — add the donate pairs to `tokens.test.ts`**

In `src/styles/tokens.test.ts`, append to the `pairs` array (directly after the `['--color-success', '--color-success-bg', TEXT],` line):

```ts
  // Donate CTA — the third saturation role (see the tokens.css header).
  ['--color-donate-text', '--color-donate-bg', TEXT],
  ['--color-donate-text', '--color-donate-bg-hover', TEXT],
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/styles/tokens.test.ts`
Expected: FAIL — the new pair cases error because `--color-donate-*` doesn't resolve (missing token).

- [ ] **Step 3: Add the tokens and amend the palette rule**

In `src/styles/tokens.css`, two edits.

(a) The header comment currently says:

```
 * Saturation is rationed to exactly two roles, and this is the whole idea:
 *
 *   1. Semantic content — priority, blocker, overdue, rollover, success.
 *      The only saturated color in the content area *means* something.
 *   2. The focus ring — one violet, used for NOTHING else in the entire app,
 *      so a focus indicator can never be misread as a status color.
```

Change `exactly two roles` to `exactly three roles` and add a third item after the focus-ring item:

```
 *   3. The donate CTA — one amber trio, used ONLY for the "Buy me a coffee"
 *      pill (header + Help modal footer). It lives in the chrome, never as
 *      a badge in the content area, so it can't be misread as a status color.
```

(b) After the `/* ---- Color: focus ---- */` block (i.e. right after the `--focus-ring-offset: 2px;` line), add:

```css
  /* ---- Color: donate CTA ---- */
  /* The third saturation role (see header). Same warm amber in both modes —
   * the pill is its own light surface, so the dark half only tunes hover. */
  --color-donate-bg: light-dark(#f5b942, #f5b942);
  --color-donate-bg-hover: light-dark(#eaa92f, #ffc95e);
  --color-donate-text: light-dark(#3a2a08, #3a2a08);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/styles/tokens.test.ts`
Expected: PASS — all pairs including the four new cases (2 pairs × 2 modes). The text/bg ratio is ≈7.8:1, text/hover ≈6.7:1 (light) and ≈9:1 (dark), all above 4.5.

- [ ] **Step 5: Verify and commit**

Run: `npm run verify`
Expected: green.

```bash
git add src/styles/tokens.css src/styles/tokens.test.ts
git commit -m "feat: add donate-CTA color tokens as a documented third saturation role"
```

---

### Task 2: `DonateButton` component, mounted in the header

**Files:**
- Create: `src/components/common/DonateButton.tsx`
- Create: `src/components/common/DonateButton.module.css`
- Modify: `src/components/common/AuthorLinks.tsx`
- Test: `src/App.test.tsx`

**Interfaces:**
- Consumes: the `--color-donate-*` tokens from Task 1.
- Produces: `export function DonateButton(): JSX.Element` (no props) from `src/components/common/DonateButton` — Task 3 imports it as `import { DonateButton } from '../common/DonateButton';`.

- [ ] **Step 1: Write the failing test**

In `src/App.test.tsx`, add inside `describe('App shell', ...)`, right after the existing `'credits the author...'` test:

```tsx
  it('renders the donate pill in the header, after the source-code link', () => {
    render(<App />);
    const donate = screen.getByRole('link', { name: 'Buy me a coffee' });
    expect(donate).toHaveAttribute('href', 'https://www.paypal.com/paypalme/joanmedia');
    expect(donate).toHaveAttribute('target', '_blank');
    expect(donate.getAttribute('rel')).toContain('noopener');

    const source = screen.getByRole('link', { name: 'Source code on GitHub' });
    expect(source.compareDocumentPosition(donate) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL — `Unable to find an accessible element with the role "link" and name "Buy me a coffee"`.

- [ ] **Step 3: Create the component**

`src/components/common/DonateButton.tsx`:

```tsx
import styles from './DonateButton.module.css';

const DONATE_URL = 'https://www.paypal.com/paypalme/joanmedia';

export function DonateButton() {
  return (
    <a
      className={styles.donate}
      href={DONATE_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Buy me a coffee"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M2 5h9v5.5A2.5 2.5 0 0 1 8.5 13h-4A2.5 2.5 0 0 1 2 10.5V5z" />
        <path d="M12 6h.5a2.25 2.25 0 0 1 0 4.5H12V9h.5a.75.75 0 0 0 0-1.5H12V6z" />
        <path d="M4.5 1.5h1V4h-1zM7 1.5h1V4H7z" />
      </svg>
      <span className={styles.label}>Buy me a coffee</span>
    </a>
  );
}
```

(The `aria-label` equals the visible label, so the accessible name survives the narrow-screen collapse below — WCAG 2.5.3 holds because the visible text is the entire accessible name.)

`src/components/common/DonateButton.module.css`:

```css
.donate {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-pill);
  background: var(--color-donate-bg);
  color: var(--color-donate-text);
  font-size: var(--text-sm);
  font-weight: var(--font-weight-semibold);
  white-space: nowrap;
  transition: background var(--transition-fast);
}

.donate:hover {
  background: var(--color-donate-bg-hover);
}

.donate svg {
  width: 1rem;
  height: 1rem;
  fill: currentColor;
  flex: none;
}

/* Squeezed header: collapse to an icon-only circle; the aria-label keeps
 * the accessible name. Tune the breakpoint if the header wraps earlier. */
@media (max-width: 720px) {
  .label {
    display: none;
  }

  .donate {
    width: 1.875rem;
    height: 1.875rem;
    justify-content: center;
    padding: 0;
  }
}
```

- [ ] **Step 4: Mount it in `AuthorLinks`**

In `src/components/common/AuthorLinks.tsx`: add `import { DonateButton } from './DonateButton';` at the top, and render `<DonateButton />` as the last child of `<div className={styles.links}>`, immediately after the GitHub `<a>`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS (all App shell tests).

- [ ] **Step 6: Verify and commit**

Run: `npm run verify`
Expected: green.

```bash
git add src/components/common/DonateButton.tsx src/components/common/DonateButton.module.css src/components/common/AuthorLinks.tsx src/App.test.tsx
git commit -m "feat: Buy-me-a-coffee donate pill in the header, right of the GitHub link"
```

---

### Task 3: Help modal support footer

**Files:**
- Modify: `src/components/help/HelpModal.tsx`
- Modify: `src/components/help/HelpModal.module.css`
- Test: `src/components/help/help.test.tsx`

**Interfaces:**
- Consumes: `import { DonateButton } from '../common/DonateButton';` (Task 2).
- Produces: nothing consumed later.

- [ ] **Step 1: Write the failing test**

In `src/components/help/help.test.tsx`, add inside `describe('HelpModal', ...)`, after the `'keeps exactly one tab in the tab order...'` test:

```tsx
  it('shows the support footer with the donate link, visible from both tabs', async () => {
    const user = userEvent.setup();
    render(<HelpModal initialTab="guide" onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Help' });

    const donate = within(dialog).getByRole('link', { name: 'Buy me a coffee' });
    expect(donate).toHaveAttribute('href', 'https://www.paypal.com/paypalme/joanmedia');
    expect(donate).toHaveAttribute('target', '_blank');
    expect(donate.getAttribute('rel')).toContain('noopener');
    expect(within(dialog).getByText('Enjoying the app? Support its development!')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('tab', { name: 'Shortcuts' }));
    expect(within(dialog).getByRole('link', { name: 'Buy me a coffee' })).toBeInTheDocument();
    expect(within(dialog).getByText('Enjoying the app? Support its development!')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/help/help.test.tsx`
Expected: FAIL — no link named "Buy me a coffee" in the dialog.

- [ ] **Step 3: Add the footer to `HelpModal`**

In `src/components/help/HelpModal.tsx`: add `import { DonateButton } from '../common/DonateButton';` at the top. Then, inside the returned `<Modal>`, insert after the closing of the tabpanel conditional (the `)}` following the shortcuts panel `</div>`) and before `</Modal>`:

```tsx
      <div className={styles.supportFooter}>
        <p className={styles.supportText}>Enjoying the app? Support its development!</p>
        <DonateButton />
      </div>
```

In `src/components/help/HelpModal.module.css`, append:

```css
.supportFooter {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-top: var(--space-4);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border);
}

.supportText {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/help/help.test.tsx`
Expected: PASS (all help tests — the footer sits outside the tabpanels, so existing panel-scoped assertions are unaffected).

- [ ] **Step 5: Verify and commit**

Run: `npm run verify`
Expected: green.

```bash
git add src/components/help/HelpModal.tsx src/components/help/HelpModal.module.css src/components/help/help.test.tsx
git commit -m "feat: support footer with donate pill in the Help modal, visible on both tabs"
```

---

### Task 4: README + test-count refresh

**Files:**
- Modify: `README.md` (lines 7, 9, 91, 109, 115)
- Modify: `CLAUDE.md` (line 3, the "377 tests" mention)

**Interfaces:**
- Consumes: nothing from code; the final test count from `npm test`'s summary line.
- Produces: nothing.

- [ ] **Step 1: Get the real test count**

Run: `npm test`
Expected: green; note the reported totals (should be 383 tests / 33 files: +4 token-pair cases, +1 App test, +1 help test — trust the runner's number, not this prediction).

- [ ] **Step 2: Update README.md**

- Line 9 byline — append the donate link:

```markdown
Built by [Joan Esquivel](https://www.linkedin.com/in/joanesquivel/) · [source code](https://github.com/JoanEsquivel/agile-todo-app) · [☕ Buy me a coffee](https://www.paypal.com/paypalme/joanmedia)
```

- "What it does" list — append one bullet after the **Keyboard-first** bullet:

```markdown
- **Free & open source** — if it helps your day, you can [buy the author a coffee](https://www.paypal.com/paypalme/joanmedia); the amber pill in the header and the Help modal's footer link there too
```

- Author section (line 115) — append to the paragraph:

```markdown
If the app helps your day, you can [buy me a coffee](https://www.paypal.com/paypalme/joanmedia).
```

- Docs section (line 109, the spec-amendments bullet) — append `, and [`docs/superpowers/specs/2026-08-11-donate-button-design.md`](docs/superpowers/specs/2026-08-11-donate-button-design.md) (the donate button)` before the final period, keeping the existing format.
- Replace both test counts (lines 7 and 91): `377` → the number Step 1 reported.

- [ ] **Step 3: Update CLAUDE.md's test count**

In `CLAUDE.md`'s opening blockquote, change `tested (377 tests)` to the Step 1 number.

- [ ] **Step 4: Verify and commit**

Run: `npm run verify`
Expected: green (docs-only task; this is the final full gate).

```bash
git add README.md CLAUDE.md
git commit -m "docs: donate button in README and refreshed test counts"
```

---

## Out of scope

- No screenshot refresh (`docs/screenshot.png`) — the author regenerates it manually.
- No analytics, no click tracking, no state.
- Do not push to `main` — pushing deploys; the author does that deliberately.

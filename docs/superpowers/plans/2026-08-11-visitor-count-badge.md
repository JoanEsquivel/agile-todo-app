# Visitor Count Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add anonymous, cookie-free visitor tracking (GoatCounter) and a small clickable visit-count badge in the Help modal footer, so the author and anyone evaluating the app (e.g. a brand) can see and verify its reach.

**Architecture:** A `count.js` tracking script in `index.html` records pageviews server-side. A new `VisitorBadge` component fetches the public, token-free `counter/TOTAL.json` endpoint once per session, renders a formatted count as a link to the public dashboard, and renders nothing at all on any failure. No new state in the zustand store, no persisted fields, no new runtime dependencies.

**Tech Stack:** React 19 + TypeScript (strict) + CSS Modules + native `fetch`. No new npm packages (this plan doesn't touch the 3-package allowlist).

## Global Constraints

- Spec of record: `docs/superpowers/specs/2026-08-11-visitor-count-badge-design.md`.
- GoatCounter site code: `agile-todo-app`. Dashboard: `https://agile-todo-app.goatcounter.com`. Read endpoint: `https://agile-todo-app.goatcounter.com/counter/TOTAL.json` (verified: `200`, CORS-open, body shape `{"count_unique":"...", "count":"..."}`, `count` is a string with thousands separators, e.g. `"1 234"`).
- No new runtime dependency — the allowlist stays `react`, `react-dom`, `zustand` (per CLAUDE.md's "Never do this" list).
- No field added to `PersistedState` — nothing here is persisted (INV-6 does not apply; don't touch `SCHEMA_VERSION`, `partialize`, or `migrations.ts`).
- CSS Modules: 1:1 file pairing, tokens only, no hard-coded hex/rgb, no `composes`/`:global` (INV-12).
- Tests are global (`describe`/`it`/`expect`/`vi` — no imports), colocated, and grouped per feature folder: all new tests go in the existing `src/components/help/help.test.tsx` (INV-10).
- `npm run verify` (typecheck + test) must stay green after every task.

---

### Task 1: GoatCounter tracking script

**Files:**
- Modify: `index.html`

**Interfaces:** None (static HTML change, nothing consumed or produced for later tasks).

- [ ] **Step 1: Add the tracking script tag**

Open `index.html`. Add the script just before `</body>`, after the existing FOUC-prevention script and the `#root` div's closing sibling `<script type="module" src="/src/main.tsx"></script>`:

```html
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
    <!-- Anonymous, cookie-free visit tracking (GoatCounter). Skips
         localhost automatically, so local dev never pollutes counts.
         Read side: src/components/help/VisitorBadge.tsx. -->
    <script data-goatcounter="https://agile-todo-app.goatcounter.com/count"
            async src="https://gc.zgo.at/count.js"></script>
  </body>
</html>
```

The full `<body>` block should read:

```html
  <body>
    <!-- Applies the stored manual theme before first paint — without this,
         a user who picked the non-OS theme gets a flash of the wrong one on
         every load. Key and values are owned by src/store/theme.ts. -->
    <script>
      try {
        var storedTheme = localStorage.getItem('agile-todo-app.theme');
        if (storedTheme === 'dark' || storedTheme === 'light') {
          document.documentElement.dataset.theme = storedTheme;
        }
      } catch (e) {}
    </script>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
    <!-- Anonymous, cookie-free visit tracking (GoatCounter). Skips
         localhost automatically, so local dev never pollutes counts.
         Read side: src/components/help/VisitorBadge.tsx. -->
    <script data-goatcounter="https://agile-todo-app.goatcounter.com/count"
            async src="https://gc.zgo.at/count.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Verify the app still boots**

Run: `npm run dev`, open `http://localhost:5173`, confirm the app renders normally and the browser console shows no errors. (The script itself no-ops on localhost by GoatCounter's own design — this step is just confirming it doesn't break anything, not confirming a pageview was recorded.)

Stop the dev server (Ctrl+C) once confirmed.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add GoatCounter tracking script for anonymous visit analytics"
```

---

### Task 2: `VisitorBadge` component

**Files:**
- Create: `src/components/help/VisitorBadge.tsx`
- Create: `src/components/help/VisitorBadge.module.css`
- Test: `src/components/help/help.test.tsx` (add a new top-level `describe('VisitorBadge')` block — existing file, per INV-10's per-feature-folder test convention)

**Interfaces:**
- Consumes: nothing from other tasks (standalone component using `fetch`, `useState`, `useEffect` from React).
- Produces: `export function VisitorBadge(): JSX.Element | null` — a component with no props, rendered by `HelpModal` in Task 3. Also exports `export function _resetVisitorBadgeCacheForTests(): void` — a test-only seam that clears the module-level session cache so each test starts from a clean slate.

- [ ] **Step 1: Write the failing tests**

This file has two `describe` blocks: `HelpModal` (renders `<HelpModal>` directly) and `help via App entry points` (renders `<App>`, which can also reach `HelpModal` → `VisitorBadge`). Both need `fetch` stubbed, so the stub goes at **file scope**, not inside one describe — otherwise the App-entry-points tests make real network calls.

Add the import at the top of `src/components/help/help.test.tsx`, alongside the existing imports, and update the `@testing-library/react` import to include `waitFor`:

```tsx
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HelpModal } from './HelpModal';
import { VisitorBadge, _resetVisitorBadgeCacheForTests } from './VisitorBadge';
import App from '../../App';
import { seedApp } from '../../test/seed';
import { useAppStore } from '../../store/store';

vi.mock('../../store/clock', () => ({
  todayLocal: () => '2026-08-18',
  nowIso: () => '2026-08-18T12:00:00.000Z',
}));

beforeEach(() => {
  _resetVisitorBadgeCacheForTests();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ count: '0' }) }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});
```

This file-scope `beforeEach` gives every test in the file a harmless default (`fetch` resolves to a `'0'` count) so no pre-existing test needs to know about the badge. Individual tests override it by reassigning `(fetch as ReturnType<typeof vi.fn>).mockResolvedValue(...)` before calling `render`.

Now add a new `describe('VisitorBadge', ...)` block right after the existing `describe('HelpModal', ...)` block closes (before `describe('help via App entry points', ...)`):

```tsx
describe('VisitorBadge', () => {
  it('renders the formatted visit count as a link to the public dashboard once loaded', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ count_unique: '1 234', count: '1 234' }),
    });
    render(<VisitorBadge />);
    const link = await screen.findByRole('link', { name: '1,234 visits — view public analytics' });
    expect(link).toHaveAttribute('href', 'https://agile-todo-app.goatcounter.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link).toHaveTextContent('1,234 visits');
  });

  it('calls the exact public counter endpoint', () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ count_unique: '5', count: '5' }),
    });
    render(<VisitorBadge />);
    expect(fetch).toHaveBeenCalledWith(
      'https://agile-todo-app.goatcounter.com/counter/TOTAL.json',
      expect.anything(),
    );
  });

  it('renders nothing when the fetch fails (adblocker/offline)', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('blocked'));
    const { container } = render(<VisitorBadge />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the response is a non-OK status', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: () => Promise.resolve({}) });
    const { container } = render(<VisitorBadge />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the response body is malformed', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: () => Promise.resolve({ nope: true }) });
    const { container } = render(<VisitorBadge />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('caches the count for the session — a second mount does not re-fetch', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ count_unique: '42', count: '42' }),
    });
    const first = render(<VisitorBadge />);
    await screen.findByRole('link', { name: '42 visits — view public analytics' });
    first.unmount();

    render(<VisitorBadge />);
    expect(await screen.findByRole('link', { name: '42 visits — view public analytics' })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- help.test.tsx`
Expected: FAIL — `Cannot find module './VisitorBadge'` (the component doesn't exist yet).

- [ ] **Step 3: Write `VisitorBadge.module.css`**

Create `src/components/help/VisitorBadge.module.css`:

```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-pill);
  color: var(--color-text-muted);
  font-size: var(--text-xs);
  text-decoration: none;
  white-space: nowrap;
  transition: color var(--transition-fast);
}

.badge:hover {
  color: var(--color-text);
}

.badge svg {
  width: 0.875rem;
  height: 0.875rem;
  fill: currentColor;
  flex: none;
}
```

(`--transition-fast` is defined in `src/styles/tokens.css:157` as `100ms ease` — the same token `DonateButton.module.css` uses for its hover transition.)

- [ ] **Step 4: Write `VisitorBadge.tsx`**

Create `src/components/help/VisitorBadge.tsx`:

```tsx
import { useEffect, useState } from 'react';
import styles from './VisitorBadge.module.css';

const COUNTER_URL = 'https://agile-todo-app.goatcounter.com/counter/TOTAL.json';
const DASHBOARD_URL = 'https://agile-todo-app.goatcounter.com';

let cachedCount: number | null = null;

/** Test-only seam: clears the module-level session cache between tests. */
export function _resetVisitorBadgeCacheForTests() {
  cachedCount = null;
}

function parseCount(raw: string): number {
  const digits = raw.replace(/\D/g, '');
  return digits === '' ? NaN : Number(digits);
}

export function VisitorBadge() {
  const [count, setCount] = useState<number | null>(cachedCount);

  useEffect(() => {
    if (cachedCount !== null) return;
    const controller = new AbortController();

    fetch(COUNTER_URL, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`unexpected status ${res.status}`);
        return res.json();
      })
      .then((body: { count?: unknown }) => {
        if (typeof body.count !== 'string') throw new Error('malformed body');
        const parsed = parseCount(body.count);
        if (Number.isNaN(parsed)) throw new Error('unparsable count');
        cachedCount = parsed;
        setCount(parsed);
      })
      .catch(() => {
        // Adblocker, offline, or a malformed response — the badge simply
        // doesn't render. A missing vanity metric must never surface as an
        // error in the Help modal.
      });

    return () => controller.abort();
  }, []);

  if (count === null) return null;

  const formatted = new Intl.NumberFormat('en-US').format(count);

  return (
    <a
      className={styles.badge}
      href={DASHBOARD_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${formatted} visits — view public analytics`}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M8 3C4 3 1.5 6 1 8c.5 2 3 5 7 5s6.5-3 7-5c-.5-2-3-5-7-5zm0 8a3 3 0 1 1 0-6 3 3 0 0 1 0 6z" />
        <circle cx="8" cy="8" r="1.5" />
      </svg>
      <span>{formatted} visits</span>
    </a>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- help.test.tsx`
Expected: PASS — all 6 new `VisitorBadge` tests plus every pre-existing `HelpModal` test in the file green.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/help/VisitorBadge.tsx src/components/help/VisitorBadge.module.css src/components/help/help.test.tsx
git commit -m "feat: add VisitorBadge component fetching the public GoatCounter total"
```

---

### Task 3: Wire `VisitorBadge` into the Help modal footer

**Files:**
- Modify: `src/components/help/HelpModal.tsx`
- Modify: `src/components/help/HelpModal.module.css`
- Test: `src/components/help/help.test.tsx`

**Interfaces:**
- Consumes: `VisitorBadge` from `./VisitorBadge` (Task 2).
- Produces: nothing new for later tasks — this is the last code task.

- [ ] **Step 1: Write the failing test**

Add this test inside the existing `describe('HelpModal', ...)` block in `src/components/help/help.test.tsx`, right after the `'shows the support footer with the donate link, visible from both tabs'` test:

```tsx
  it('shows the visitor badge in the support footer once loaded, visible from both tabs', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ count_unique: '99', count: '99' }),
    });
    const user = userEvent.setup();
    render(<HelpModal initialTab="guide" onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Help' });

    expect(await within(dialog).findByRole('link', { name: '99 visits — view public analytics' })).toBeInTheDocument();

    await user.click(within(dialog).getByRole('tab', { name: 'Shortcuts' }));
    expect(within(dialog).getByRole('link', { name: '99 visits — view public analytics' })).toBeInTheDocument();
  });
```

`fetch` is already stubbed at file scope by Task 2's `beforeEach` — this test just overrides the resolved value before rendering, same pattern as the `VisitorBadge` tests.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- help.test.tsx`
Expected: FAIL — the new test can't find the visitor badge link (not rendered yet).

- [ ] **Step 3: Render `VisitorBadge` in the footer**

In `src/components/help/HelpModal.tsx`, add the import:

```tsx
import { VisitorBadge } from './VisitorBadge';
```

Change the footer JSX from:

```tsx
      <div className={styles.supportFooter}>
        <p className={styles.supportText}>Enjoying the app? Support its development!</p>
        <DonateButton />
      </div>
```

to:

```tsx
      <div className={styles.supportFooter}>
        <p className={styles.supportText}>Enjoying the app? Support its development!</p>
        <div className={styles.supportActions}>
          <VisitorBadge />
          <DonateButton />
        </div>
      </div>
```

- [ ] **Step 4: Adjust the footer layout CSS**

In `src/components/help/HelpModal.module.css`, replace the `.supportFooter` rule (which currently puts exactly two flex children with `justify-content: space-between`) and add a new `.supportActions` rule so the text stays on the left and the badge + donate button group together on the right:

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

.supportActions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
```

(`.supportFooter` itself is unchanged — only `.supportActions` is new — but rewrite the block in full so the diff is easy to review.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- help.test.tsx`
Expected: PASS — the new footer test, and every other test in the file (all now using the stubbed `fetch`).

- [ ] **Step 6: Run the full verify gate**

Run: `npm run verify`
Expected: typecheck clean, all 390 tests pass (383 existing + 6 `VisitorBadge` tests + 1 footer test — confirm the exact final count from the test run output and use that number in Task 4).

- [ ] **Step 7: Commit**

```bash
git add src/components/help/HelpModal.tsx src/components/help/HelpModal.module.css src/components/help/help.test.tsx
git commit -m "feat: render the visitor badge in the Help modal footer"
```

---

### Task 4: Update README and CLAUDE.md

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

**Interfaces:** None — documentation only.

- [ ] **Step 1: Get the final test count**

Run: `npm test` and note the exact `Tests  N passed (N)` line. Use that number (`N`) in place of `383` everywhere below — the two numbers below assume Task 3 added 7 tests (383 → 390), but use whatever the real run reports.

- [ ] **Step 2: Update README.md's intro line**

In `README.md`, replace line 3:

```markdown
A browser-only todo board built around a monthly cadence. No backend, no accounts, no network calls — everything lives in your browser.
```

with:

```markdown
A browser-only todo board built around a monthly cadence. No backend, no accounts — your data never leaves your browser. The only network call is anonymous, cookie-free visit tracking; the app works identically if it's blocked.
```

- [ ] **Step 3: Update the test-count line**

Replace line 7 (`383 tests · TypeScript strict · zero backend`) with the real count, e.g.:

```markdown
390 tests · TypeScript strict · zero backend
```

- [ ] **Step 4: Add a "What it does" bullet for the badge**

In the "What it does" list, change the "Built-in help" bullet from:

```markdown
- **Built-in help** — an ⓘ button beside the theme toggle opens a guide to every feature above, plus the full shortcut list
```

to:

```markdown
- **Built-in help** — an ⓘ button beside the theme toggle opens a guide to every feature above, plus the full shortcut list, plus a small visit-count badge in the footer linking to the public analytics dashboard
```

- [ ] **Step 5: Update "Why it's built this way"**

Replace:

```markdown
- **Browser-only, on purpose.** No backend, no network, no accounts — your data never leaves your device.
```

with:

```markdown
- **Browser-only, on purpose.** No backend, no accounts — your data never leaves your device. The only network call is anonymous, cookie-free visit analytics (GoatCounter); the app works identically if an ad blocker blocks it.
```

- [ ] **Step 6: Update the test-count line in the Testing section**

Find the line (around where `Vitest + React Testing Library` is described): `Vitest + React Testing Library, 383 tests across 33 files, all colocated with the code they test.` — update `383 tests across 33 files` to the real count and file count (file count is unchanged unless Task 2/3 tests landed in a new file, which they don't — they're in the existing `help.test.tsx`, so only the test number changes).

- [ ] **Step 7: Update CLAUDE.md's Orientation paragraph and test count**

In `CLAUDE.md`, replace line 3:

```markdown
> This app is **finished, tested (383 tests), and deployed**. It is not a scaffold to build out — it's a working product. Changes here should be surgical, not exploratory. Every change ships with tests. Read the invariants below before editing anything under `src/`.
```

with the real count, e.g.:

```markdown
> This app is **finished, tested (390 tests), and deployed**. It is not a scaffold to build out — it's a working product. Changes here should be surgical, not exploratory. Every change ships with tests. Read the invariants below before editing anything under `src/`.
```

Replace line 7:

```markdown
Browser-only monthly (calendar-month, workdays-only) todo board, plus a header Pomodoro timer and a manual light/dark/system theme toggle. No backend, no network calls, no accounts — everything lives in one versioned JSON document in `localStorage` (plus one tiny separate key for the theme preference — see INV-12).
```

with:

```markdown
Browser-only monthly (calendar-month, workdays-only) todo board, plus a header Pomodoro timer and a manual light/dark/system theme toggle. No backend, no accounts — everything lives in one versioned JSON document in `localStorage` (plus one tiny separate key for the theme preference — see INV-12). The only network call is anonymous, cookie-free visit tracking (GoatCounter, `index.html` + `src/components/help/VisitorBadge.tsx`); the app works identically if it's blocked.
```

Replace the commands table's test row:

```markdown
| `npm test` | `vitest run` — 383 tests, ~4s |
```

with the real count, e.g.:

```markdown
| `npm test` | `vitest run` — 390 tests, ~4s |
```

- [ ] **Step 8: Verify docs match reality**

Run: `npm test` again and diff the reported count against what you just wrote into both files — they must match exactly.

- [ ] **Step 9: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: document the visitor badge and refresh test counts"
```

---

### Task 5: Mark the parked stats-modal enhancement resolved

**Files:**
- Modify: `enhancements.md`

**Interfaces:** None — this task only edits the tracked-requests file.

- [ ] **Step 1: Update the enhancements entry**

In `enhancements.md`, the line beginning `- Analizar si es posible ver que tantas personas usan la pagina web...` documents the original ask. Replace it with a note recording what shipped and what's parked:

```markdown
- ~~Analizar si es posible ver que tantas personas usan la pagina web...~~ Shipped a scaled-down version: GoatCounter anonymous tracking + a visit-count badge in the Help modal footer linking to the public dashboard (see `docs/superpowers/specs/2026-08-11-visitor-count-badge-design.md`). The original idea — an in-app stats modal with its own charts and auto-refresh — is parked; revisit once traffic is high enough that in-app social proof is worth the build cost. The service facts needed to build it (endpoint, CORS, response shape) are already verified and recorded in that spec.
```

- [ ] **Step 2: Commit**

```bash
git add enhancements.md
git commit -m "docs: mark visitor-count enhancement shipped, park the full stats modal"
```

---

## Post-plan manual step (author, not an engineering task)

Enable **Public view** in the GoatCounter dashboard settings (`agile-todo-app.goatcounter.com` → Settings). Without it, the badge's link target requires login and the "brand can verify the number" goal isn't met. This was called out in the spec's setup checklist and isn't something code can do.

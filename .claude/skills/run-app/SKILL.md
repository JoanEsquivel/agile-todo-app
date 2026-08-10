---
name: run-app
description: Launch the Agile Todo App dev server and drive it in a real browser
  with Playwright to verify a change end to end, capture a screenshot, or run the
  full smoke flow. Use when asked to run, start, screenshot, or manually verify
  the app, or to confirm behavior the Vitest/jsdom suite cannot prove (real
  localStorage, clipboard, dark mode, responsive layout, an actual downloaded
  file).
---

# Running and smoke-testing the Agile Todo App

This is a Vite + React SPA. `npm test` (Vitest + jsdom) covers logic and component behavior, but some things can only be proven in a real browser: clipboard writes, `window.confirm`, actual file downloads, `prefers-color-scheme`, and genuinely persisted `localStorage` across a real page reload. That's what this skill is for.

## 1. Start the dev server

```sh
npm run dev &
disown
```

**macOS has no `timeout` command.** Poll the port instead of sleeping a fixed amount:

```sh
for i in $(seq 1 30); do
  curl -sf http://localhost:5173 >/dev/null && echo "UP after ${i}s" && break
  sleep 1
done
```

Stop it when done — `npm run dev &` backgrounds the npm wrapper, but npm does **not** forward `SIGTERM` to the Vite process it spawned, so `kill $!` alone won't free the port:

```sh
lsof -ti:5173 -sTCP:LISTEN | xargs -r kill
```

## 2. Get a browser driver

Playwright is available on this machine (`npx playwright --version` works, and Chromium is already cached under `~/Library/Caches/ms-playwright/`), but it is **not** a project dependency — this repo deliberately caps its dependency set at 3 runtime + 11 dev packages (see `CLAUDE.md`), and Playwright must not be added to it. `require('playwright')`/`import 'playwright'` will fail if run from inside this repo.

Install it into a scratchpad directory instead, and run the driver from there:

```sh
PW="$SCRATCHPAD/pw-driver"   # use your session's actual scratchpad path
mkdir -p "$PW"
cd "$PW"
npm install playwright --no-save
npx playwright install chromium   # usually a no-op if already cached
```

Then **copy** `smoke.mjs` into that same directory before running it:

```sh
cp "$CLAUDE_PROJECT_DIR/.claude/skills/run-app/smoke.mjs" "$PW/"
node "$PW/smoke.mjs"
```

Copy it in, don't `import` it from the repo path — Node's ESM resolution for a bare `import { chromium } from 'playwright'` walks up from the *importing file's own location* looking for `node_modules`, not from the current working directory. A script run in place from `.claude/skills/run-app/` would fail to resolve Playwright even with `cwd` set to the scratchpad.

## 3. Gotchas discovered running this app specifically

- **A todo's title renders twice in the DOM** — once in the day column, once in the Reminders panel (when it has an overdue/upcoming reminder). A bare `page.getByText('...')` throws a Playwright strict-mode violation. Use `.first()`.
- **Standup section headings are visually uppercased by CSS** (`text-transform: uppercase` on `<h3>`), so `element.innerText` returns `"BLOCKERS"`, not `"Blockers"`. A case-sensitive `.includes('Blockers')` on `innerText` will incorrectly report failure — the underlying text content and the clipboard output are correctly capitalized. Assert case-insensitively, or check `textContent` directly.
- **`window.confirm` on "Generate new fortnight"** needs a dialog handler registered *before* the click: `page.on('dialog', (d) => d.accept())`.
- **Clipboard access** ("Copy to clipboard" in the standup modal) needs explicit permission: `context.grantPermissions(['clipboard-read', 'clipboard-write'])`.
- **File downloads** (Export backup) — `Promise.all([page.waitForEvent('download'), page.click(...)])`, then `download.saveAs(path)`.

## 4. The full smoke flow

`smoke.mjs` exercises all of this in one run and exits non-zero if anything fails or the browser console logs an error:

1. First render — title, today selected
2. Add a todo with a priority and a **past** reminder → confirms the Overdue badge appears both in the day column and the Reminders panel
3. Add a blocker note and an info note
4. Open the standup modal, copy to clipboard, verify the exact copied text
5. Reload the page → confirms `localStorage` persistence for real (not mocked)
6. Confirm exactly one `localStorage` key exists (`agile-todo-app.v-state`)
7. Export a backup, clear storage, reload, import the backup → confirms the full round trip
8. Generate a new fortnight (accepting the confirm dialog) → confirms the switcher lists both fortnights
9. Resize to a 360px mobile viewport, then switch to dark mode (`emulateMedia({ colorScheme: 'dark' })`)

Screenshots land in `<driver-dir>/shots/`. The first-run and dark-mode screenshots are good candidates for `docs/screenshot.png` — copy whichever one you like best into the repo:

```sh
cp "$PW/shots/01-first-run.png" "$CLAUDE_PROJECT_DIR/docs/screenshot.png"
```

## 5. When to actually use this

Not every change needs a full browser run — `npm run verify` (typecheck + Vitest) is the fast, default gate. Reach for this skill when:
- you touched anything the jsdom suite can't exercise (clipboard, real downloads, media queries, actual multi-reload persistence)
- you're asked to screenshot or visually confirm something
- you want end-to-end confidence before a release, beyond what the unit/component suite proves

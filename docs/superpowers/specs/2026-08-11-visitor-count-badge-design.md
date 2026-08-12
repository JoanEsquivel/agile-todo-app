# Visitor Count Badge — Design

**Date:** 2026-08-11
**Status:** Approved

## Summary

Add anonymous, cookie-free visitor analytics (GoatCounter) to the deployed app, and surface the all-time visit count as a small badge in the Help modal's footer. The badge links to the public GoatCounter dashboard so anyone — the author, or a brand evaluating the app's reach — can verify the number and see the full charts.

This is the deliberately scaled-down version of a bigger idea (an in-app stats modal with hand-rolled charts and auto-refresh). That larger feature is parked — see "Out of scope" below.

## Motivation

The author wants to know whether anyone uses the app, and wants third parties (e.g. brands) to be able to check its reach without asking. GoatCounter was chosen because it is free for non-commercial use with no pageview limits, cookie-free (no GDPR banner), requires no signup from visitors, and exposes a **public, CORS-open, token-free JSON endpoint** for the count.

## Verified service facts (probed 2026-08-11 with curl)

- Site code: `agile-todo-app` → dashboard `https://agile-todo-app.goatcounter.com`.
- Read endpoint: `GET https://agile-todo-app.goatcounter.com/counter/TOTAL.json` → `200`, `{"count_unique":"0", "count":"0"}`, with `access-control-allow-origin: *`. `TOTAL` (case-sensitive, no leading slash) is the special site-wide path. `count` is a **string with thousands separators** (e.g. `"1 234"`); `count_unique` is a deprecated alias.
- Optional `?start=YYYY-MM-DD&end=YYYY-MM-DD` range params work (unused here, useful for the parked stats modal).
- The endpoint response is CDN-cached (`cache-control: public`, `expires` +4h); a unique query param bypasses the cache. For an all-time total shown in a modal footer, stale-by-hours is acceptable — no cache busting needed.
- Write endpoint `GET /count?p=...` returns 200 with rate limit 4 req/s. Note: pageviews sent via bare curl did not appear in the count during probing (likely bot-filtered — a good sign); end-to-end verification of *counting* happens after deploy, from a real browser.
- The "Allow adding visitor counts on your website" setting is already enabled (required for the JSON endpoint).
- Prerequisite still pending: the author enables **Public view** in GoatCounter settings so the dashboard link works for third parties.

## Design

### 1. Tracking script (`index.html`)

```html
<script data-goatcounter="https://agile-todo-app.goatcounter.com/count"
        async src="https://gc.zgo.at/count.js"></script>
```

- `count.js` (~3.5KB, async, cookie-free) records one pageview per visit.
- It skips `localhost` by default, so local dev does not pollute stats. No conditional injection needed.
- Ad blockers block GoatCounter; those visits simply aren't counted and the app is unaffected.

### 2. `VisitorBadge` component (`src/components/help/`)

- `VisitorBadge.tsx` + `VisitorBadge.module.css` (1:1 per INV-12), rendered in the Help modal footer next to the donate pill, on both tabs.
- Visual: small, sober sibling of the donate pill — an eye/chart glyph plus `1,234 visits`. Tokens only; `light-dark()` handles themes.
- It is an `<a href="https://agile-todo-app.goatcounter.com" target="_blank" rel="noopener noreferrer">` with an accessible name including the count (e.g. `aria-label` "1,234 visits — view public analytics"), per INV-10's role/label query convention and WCAG 2.5.3 (visible text is a substring of the accessible name).
- Data flow: on mount (= Help modal open), `fetch` `counter/TOTAL.json`; parse `count` by stripping non-digit characters → `Number`; format for display with `Intl.NumberFormat('en-US')`. Abort the fetch on unmount.
- A module-level cache stores the resolved count for the session, so reopening the modal doesn't re-fetch. (The CDN would serve it from cache anyway; this just avoids pointless requests.)
- No auto-refresh: an all-time total changes slowly and the endpoint is CDN-cached for hours; refreshing would refresh nothing.

### 3. Error handling

Loading or failed (adblocker, offline, malformed body, non-200): the badge renders **nothing**. The footer looks exactly as it does today. No error text, no retry, no console noise beyond the network tab. A missing vanity metric must never degrade the Help modal.

### 4. State

None persisted, none in the zustand store. Local `useState` inside `VisitorBadge` plus the module-level session cache. `PersistedState`, `SCHEMA_VERSION`, `partialize` untouched (INV-6). The badge mutates nothing, so INV-9 (read-only gating) does not apply.

### 5. Testing

In `help.test.tsx` (per INV-10, tests group by feature folder), with `global.fetch` mocked:

- Success: badge renders as a link, count parsed from `"1 234"`-style string and formatted, `href` points at the public dashboard.
- Failure (rejected fetch / non-200 / garbage body): badge absent, rest of the footer intact.
- Fetch is called with the exact endpoint URL.
- Session cache: second mount does not re-fetch.

### 6. Documentation

- **README**: the "no network calls" claims (intro + "Why it's built this way") gain an honest asterisk: your *data* never leaves the device; the only network call is anonymous, cookie-free analytics (GoatCounter), and the app works identically when it's blocked. Mention the badge in the built-in-help bullet.
- **CLAUDE.md**: Orientation paragraph updated the same way; test count updated.
- **Help modal Guide tab**: one short line noting the app collects anonymous, cookie-free visit counts and that the footer badge links to the public dashboard.

## Out of scope (parked)

The full in-app stats modal — SVG daily-bars chart, today/total tiles, 60s auto-refresh, header entry point — is parked in `enhancements.md` with an activation condition (revisit when traffic justifies public social proof). The verified service facts above are what it needs to get started.

## Setup checklist (author)

1. ~~Create GoatCounter account, code `agile-todo-app`~~ done.
2. ~~Enable "Allow adding visitor counts on your website"~~ done (endpoint returns 200).
3. **Enable "Public view"** in GoatCounter settings — required for the badge's link target.

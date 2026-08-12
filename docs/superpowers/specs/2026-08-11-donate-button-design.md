# Donate Button ("Buy me a coffee") — Design

**Date:** 2026-08-11
**Status:** Approved
**Author decisions:** amber solid pill (mockup option A), Help-modal footer (mockup option A), both validated live via the brainstorming visual companion.

## Purpose

Give people who want to support the author a highly visible donation call-to-action that opens the author's PayPal page: `https://www.paypal.com/paypalme/joanmedia`. It appears in two places: the app header (originally to the right of the GitHub icon; the GitHub link was later removed from the header) and a footer inside the Help modal.

## Scope

- One new shared component, two mount points, three new color tokens, README mention.
- No state, no store changes, no persistence (`PersistedState` untouched), no new runtime dependency.
- Not gated by read-only history mode (INV-9 does not apply — it's an external link, it mutates nothing).

## Component: `DonateButton`

`src/components/common/DonateButton.tsx` + `DonateButton.module.css` (1:1 per INV-12).

- Renders an `<a>` with `href="https://www.paypal.com/paypalme/joanmedia"`, `target="_blank"`, `rel="noopener noreferrer"` — same external-link pattern as `AuthorLinks`.
- Content: inline SVG coffee-cup icon (16×16, `fill: currentColor`, `aria-hidden`) + visible text label **"Buy me a coffee"**.
- Accessible name: the visible text. The link also carries `aria-label="Buy me a coffee"` so the name survives when the text is hidden on narrow screens (label equals visible text, satisfying WCAG 2.5.3 Label in Name).
- Style: solid amber pill — `background: var(--color-donate-bg)`, `color: var(--color-donate-text)`, `border-radius: var(--radius-pill)`, sizes/spacing from existing tokens. Hover uses `--color-donate-bg-hover`. Transitions reuse `--transition-fast`; no keyframe animation.
- Narrow screens: below a header-squeeze breakpoint (`@media (max-width: 720px)`), the text span is hidden (`display: none`) and the pill collapses to an icon-only circle. The breakpoint may be tuned during implementation to match when the header actually wraps; the behavior (text hides, name stays) is the requirement.

## Mount point 1: header

In `AuthorLinks` (`src/components/common/AuthorLinks.tsx`), rendered after the LinkedIn link — rightmost element of the header's link cluster. (At the time this spec was written, it was rendered after a GitHub link that has since been removed.)

## Mount point 2: Help modal footer

In `HelpModal.tsx`, after the tabpanel block and inside the `Modal`, so it is visible on **both** tabs (Guide and Shortcuts):

- Top hairline divider (`--color-border`).
- Muted message: **"Enjoying the app? Support its development!"**
- The same `DonateButton`.

The Guide tab's section list is unchanged — the footer replaces any need for a "Support" guide section.

## Tokens — amending the two-role saturation rule

`src/styles/tokens.css` gains:

```css
--color-donate-bg: light-dark(#f5b942, #f5b942);
--color-donate-bg-hover: light-dark(#eaa92f, #ffc95e);
--color-donate-text: light-dark(#3a2a08, #3a2a08);
```

The file's header comment currently rations saturation to exactly two roles (semantic content, focus ring). This feature deliberately adds a **third role: the donation CTA** — the only brand-colored element in the chrome, which is precisely what makes it eye-catching against the achromatic console. The header comment must be amended to name this third role so the exception is documented, not a silent violation. The amber pair must not be reused for anything else, and it is visually distinct from the semantic ambers (`--color-rollover`, `--color-priority-medium`) by being a solid fill in the chrome, never a badge in the content area.

`tokens.test.ts` parses `tokens.css` and enforces WCAG contrast per mode; the donate text/bg pair (≈7:1) must pass it in both halves.

## Error handling

None needed — a static external link. If the user is offline the browser's standard failure page applies.

## Testing (INV-10)

- `src/components/help/help.test.tsx`: footer renders with `getByRole('link', { name: 'Buy me a coffee' })` and the exact PayPal `href`; still present after switching to the Shortcuts tab; `rel`/`target` asserted.
- `src/App.test.tsx`: header contains the "Buy me a coffee" link with the exact `href`, alongside the existing LinkedIn/GitHub assertions.
- `tokens.test.ts`: its `pairs` list is explicit (line ~92) — add `['--color-donate-text', '--color-donate-bg', 4.5]` (and the hover bg pairing) so the new tokens are contrast-enforced in both modes. The once-as-`light-dark()` structural test picks the new declarations up automatically.

## Docs

- `README.md`: add the donate link to the feature/support area (one line + link).
- `CLAUDE.md`: unchanged — no new invariant; the palette amendment lives in `tokens.css` and this spec.

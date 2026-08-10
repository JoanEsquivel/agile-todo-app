import css from './tokens.css?raw';

/*
 * Contrast is enforced here rather than asserted in a comment.
 *
 * This parses tokens.css itself — not a copy of the values — so a future
 * palette edit that drops a pair below its WCAG floor fails `npm run verify`
 * instead of shipping. See the header comment in tokens.css for what the two
 * border tokens mean and why they have different floors.
 *
 * `?raw` only returns real content here because vite.config.ts opts this one
 * file into `test.css.include` — Vitest stubs CSS as an empty string by
 * default (verified: a non-CSS asset imports fine with `?raw`; only .css
 * does not, until included). The include pattern must NOT anchor on `$`:
 * Vitest matches it against the full module id, which still carries the
 * `?raw` query suffix.
 */

/** `:root` blocks contain no nested braces, so a non-greedy body match is safe. */
function rootBlocks(source: string): string[] {
  return [...source.matchAll(/:root\s*\{([^}]*)\}/g)].map((m) => m[1]);
}

function declarations(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [, name, value] of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out[name] = value.trim();
  }
  return out;
}

/** Resolves `var(--x)` aliases (tokens.css uses them for the transitional accent names). */
function resolve(vars: Record<string, string>, name: string, seen = new Set<string>()): string {
  const raw = vars[name];
  if (raw === undefined) throw new Error(`token ${name} is not defined`);
  const alias = raw.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  if (!alias) return raw;
  if (seen.has(name)) throw new Error(`token ${name} is a circular alias`);
  seen.add(name);
  return resolve(vars, alias[1], seen);
}

function luminance(hex: string): number {
  const s = hex.replace('#', '').trim();
  const full = s.length === 3 ? [...s].map((c) => c + c).join('') : s;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`not a hex color: ${hex}`);
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const blocks = rootBlocks(css);
const light = declarations(blocks[0]);
const dark = { ...light, ...declarations(blocks[1]) };

/** WCAG 2.1: 4.5:1 for body text (1.4.3), 3:1 for UI components & graphics (1.4.11). */
const TEXT = 4.5;
const GRAPHIC = 3;

const pairs: Array<[fg: string, bg: string, min: number]> = [
  // Body and secondary text on every surface it can land on.
  ['--color-text', '--color-bg', TEXT],
  ['--color-text', '--color-surface', TEXT],
  ['--color-text', '--color-surface-sunken', TEXT],
  ['--color-text-muted', '--color-bg', TEXT],
  ['--color-text-muted', '--color-surface', TEXT],
  ['--color-text-muted', '--color-surface-sunken', TEXT],
  ['--color-text-faint', '--color-surface', TEXT],
  ['--color-text-faint', '--color-surface-sunken', TEXT],

  // Ink fill — the primary/selected state.
  ['--color-on-ink', '--color-ink', TEXT],
  ['--color-on-ink', '--color-ink-hover', TEXT],

  // Interactive control boundaries identify the control: 1.4.11 applies.
  ['--color-border-strong', '--color-surface', GRAPHIC],
  ['--color-border-strong', '--color-bg', GRAPHIC],

  // The focus ring must be visible wherever it lands.
  ['--color-focus-ring', '--color-bg', GRAPHIC],
  ['--color-focus-ring', '--color-surface', GRAPHIC],
  ['--color-focus-ring', '--color-surface-sunken', GRAPHIC],

  // Semantic text, both on plain surfaces and on its own tinted background.
  ['--color-priority-high', '--color-surface', TEXT],
  ['--color-priority-high', '--color-priority-high-bg', TEXT],
  ['--color-priority-medium', '--color-surface', TEXT],
  ['--color-priority-medium', '--color-priority-medium-bg', TEXT],
  ['--color-priority-low', '--color-surface', TEXT],
  ['--color-priority-low', '--color-priority-low-bg', TEXT],
  ['--color-blocker', '--color-surface', TEXT],
  ['--color-blocker', '--color-blocker-bg', TEXT],
  ['--color-info', '--color-surface', TEXT],
  ['--color-info', '--color-info-bg', TEXT],
  ['--color-attention', '--color-surface', TEXT],
  ['--color-attention', '--color-attention-bg', TEXT],
  ['--color-rollover', '--color-surface', TEXT],
  ['--color-rollover', '--color-rollover-bg', TEXT],
  ['--color-success', '--color-surface', TEXT],
  ['--color-success', '--color-success-bg', TEXT],

  // Tape segments are graphics conveying priority, drawn on the sunken track.
  ['--color-priority-high', '--color-surface-sunken', GRAPHIC],
  ['--color-priority-medium', '--color-surface-sunken', GRAPHIC],
  ['--color-priority-low', '--color-surface-sunken', GRAPHIC],
];

describe('design tokens', () => {
  it('defines a light and a dark palette', () => {
    expect(blocks).toHaveLength(2);
    expect(dark['--color-bg']).not.toBe(light['--color-bg']);
  });

  describe.each([
    ['light', light],
    ['dark', dark],
  ])('%s mode contrast', (_mode, vars) => {
    it.each(pairs)('%s on %s meets %f:1', (fg, bg, min) => {
      const ratio = contrast(resolve(vars, fg), resolve(vars, bg));
      expect(ratio).toBeGreaterThanOrEqual(min);
    });
  });

  // The design rule from tokens.css: the focus violet is reserved. If it ever
  // equals another color token, a focus ring becomes indistinguishable from a
  // status — which is the one thing this palette is built to prevent.
  it.each([
    ['light', light],
    ['dark', dark],
  ])('reserves the focus ring colour in %s mode', (_mode, vars) => {
    const focus = resolve(vars, '--color-focus-ring').toLowerCase();
    const others = Object.keys(vars)
      .filter((n) => n.startsWith('--color-') && n !== '--color-focus-ring')
      .map((n) => resolve(vars, n).toLowerCase());
    expect(others).not.toContain(focus);
  });
});

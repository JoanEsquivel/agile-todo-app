#!/usr/bin/env node
/**
 * PostToolUse tripwire for the architectural invariants documented in CLAUDE.md.
 * Contract: exit 2 + message on stderr = blocking feedback to the agent.
 *           exit 0 + JSON on stdout = advisory context (non-blocking).
 *           any internal error = exit 0, silent. A broken guard must never
 *           break the session.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const AMBIENT_TIME_OK = ['src/store/clock.ts', 'src/hooks/useNow.ts'];

function main() {
  let payload;
  try {
    payload = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return 0;
  }

  const filePath = payload?.tool_input?.file_path;
  if (!filePath) return 0;

  const root = payload.cwd ?? process.cwd();
  const rel = path.relative(root, filePath).split(path.sep).join('/');
  if (!rel.startsWith('src/')) return 0;

  let src;
  try {
    src = readFileSync(filePath, 'utf8');
  } catch {
    return 0; // deleted or moved between the write and this hook running
  }

  const bad = [];
  const hint = [];
  const flag = (inv, what, why) => bad.push({ inv, what, why });

  const isTs = /\.tsx?$/.test(rel);
  const isCss = /\.module\.css$/.test(rel);
  const inDomain = rel.startsWith('src/domain/');

  // ---- INV-1: never derive a scheduling date from a UTC string ----
  if (/toISOString\(\)\s*\.\s*(slice|substring|substr|split)\s*\(/.test(src)) {
    flag('INV-1',
      'toISOString() sliced/split into a date',
      'That yields a UTC calendar date and shifts by a day for users east/west of UTC. ' +
      'Use toISODate(d) from src/domain/dates.ts, which reads local fields.');
  }

  // ---- INV-2: ambient time lives in exactly two files ----
  if (isTs && !AMBIENT_TIME_OK.includes(rel)) {
    if (/\bnew Date\(\s*\)/.test(src)) {
      flag('INV-2',
        'ambient `new Date()` outside clock.ts / useNow.ts',
        'Domain and store code must receive time as a parameter so tests can inject it. ' +
        'Read it via todayLocal()/nowIso() from src/store/clock.ts, or take it as an argument. ' +
        '`new Date(withArguments)` is fine.');
    }
    if (/\bDate\.now\(\)/.test(src)) {
      flag('INV-2',
        '`Date.now()`',
        'It appears nowhere in this codebase by design. Use nowIso() from src/store/clock.ts.');
    }
  }

  // ---- INV-3: domain layer purity ----
  if (inDomain && isTs) {
    const importSpecs = [...src.matchAll(/(?:^|\n)\s*import\s[\s\S]*?from\s*['"]([^'"]+)['"]/g)]
      .map((m) => m[1])
      .concat([...src.matchAll(/(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g)].map((m) => m[1]));
    const foreign = importSpecs.filter((s) => !/^\.\/[A-Za-z]/.test(s));
    if (foreign.length) {
      flag('INV-3',
        `domain/ imports non-sibling module(s): ${foreign.join(', ')}`,
        'src/domain/ is pure: it may import ONLY its own siblings (./types, ./dates, ./fortnight). ' +
        'No React, no zustand, no storage, no clock. If you need state or time, take it as a parameter ' +
        'and let src/store/ do the wiring.');
    }
    if (/\brequire\s*\(/.test(src)) {
      flag('INV-3', 'require() in domain/', 'ESM only; and see the sibling-import rule above.');
    }
  }

  // ---- INV-11: the dynamic import in test/setup.ts is load-bearing ----
  if (rel === 'src/test/setup.ts' && /(?:^|\n)\s*import[^\n]*['"]\.\.\/store\/store['"]/.test(src)) {
    flag('INV-11',
      'static top-level import of ../store/store in setup.ts',
      "setupFiles run BEFORE a test file's hoisted vi.mock('./clock'), so a static import here links " +
      'the real clock module for every store test and silently breaks clock mocking. Keep the ' +
      "`await import(...)` inside afterEach, and keep the comment explaining why.");
  }

  // ---- INV-13: boolean data-* attributes use the presence pattern ----
  const boolAttr = src.match(/data-[a-z-]+=\{\s*(?:false|true|!)/);
  if (isTs && boolAttr) {
    flag('INV-13',
      `boolean data-* attribute written as \`${boolAttr[0]}...\``,
      "React renders data-x={false} as data-x=\"false\", which STILL matches the [data-x] CSS/test " +
      "selector. Use the presence pattern: data-x={cond ? '' : undefined}.");
  }

  // ---- INV-12: CSS module conventions ----
  if (isCss) {
    if (/\bcomposes\s*:/.test(src)) {
      flag('INV-12', '`composes:` in a CSS module',
        'This codebase has zero composes/:global by design — modules are strictly 1:1 with their ' +
        'component. Share values through src/styles/tokens.css instead.');
    }
    if (/:global\b/.test(src)) {
      flag('INV-12', '`:global` in a CSS module', 'Same rule: no global escapes. Use tokens.');
    }
    if (/#[0-9a-fA-F]{3,8}\b/.test(src) && !rel.startsWith('src/styles/')) {
      flag('INV-12', 'hard-coded hex color in a CSS module',
        'All colors come from src/styles/tokens.css custom properties, which is what makes the ' +
        '@media (prefers-color-scheme: dark) block work with no JS and no theme state. ' +
        'Add a token if none fits. (rgba()/hsla() for opacity, e.g. a modal scrim, is fine.)');
    }
  }

  // ---- Advisories (non-blocking) ----
  if (rel === 'src/domain/types.ts' && /PersistedState/.test(src)) {
    hint.push('You edited domain/types.ts. If PersistedState changed, the schema ritual is 6 steps ' +
      '(CLAUDE.md > Recipes): bump SCHEMA_VERSION, add a migration step keyed by the SOURCE version, ' +
      'add the field to partialize in store.ts (it is an ALLOWLIST — omitted fields silently never ' +
      'persist), extend validatePersistedState, and test migration + export/import round-trip.');
  }
  if (rel === 'src/store/store.ts' && /partialize/.test(src)) {
    hint.push('Reminder: partialize is an explicit allowlist of the 6 PersistedState fields. ' +
      'Ephemeral state (viewedFortnightId, selectedDay, rehydrationError, announcement, composeIntent) ' +
      'must stay out of it. Adding a NEW ephemeral field needs no ritual at all: put it on AppState only, ' +
      "don't bump SCHEMA_VERSION, and add one storePersistence.test.ts assertion that it's absent from " +
      'the persisted blob.');
  }

  if (bad.length) {
    const body = bad
      .map((b) => `  [${b.inv}] ${b.what}\n        ${b.why}`)
      .join('\n\n');
    process.stderr.write(
      `Invariant violation in ${rel} — fix this before continuing.\n\n${body}\n\n` +
      `Full rationale: CLAUDE.md > Invariants.\n`,
    );
    return 2;
  }

  if (hint.length) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: hint.join('\n\n'),
      },
    }));
  }
  return 0;
}

let code = 0;
try {
  code = main();
} catch {
  code = 0; // a broken guard must never break the session
}
process.exit(code);

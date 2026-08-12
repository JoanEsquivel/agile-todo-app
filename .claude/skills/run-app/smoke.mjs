// Full smoke flow for the Agile Todo App — see SKILL.md for how to run this.
// Assumes the dev server is already running at http://localhost:5173.
// Exits 0 if every scenario passes and no console error fired; exits 1 otherwise.
import { chromium } from 'playwright';
import path from 'node:path';
import { readFileSync, mkdirSync } from 'node:fs';

const SHOT_DIR = path.join(process.cwd(), 'shots');
mkdirSync(SHOT_DIR, { recursive: true });
const URL = 'http://localhost:5173';

let shotN = 0;
const results = [];
const consoleErrors = [];

async function shot(page, name) {
  shotN += 1;
  const file = path.join(SHOT_DIR, `${String(shotN).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function run() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

  // 1. First run
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Agile Todo' }).waitFor();
  await shot(page, 'first-run');
  record('1. first render', true);

  // 2. Add a todo with priority + a past reminder (overdue)
  await page.getByRole('button', { name: 'Add todo' }).click();
  await page.getByLabel('Title').fill('Write smoke test');
  await page.getByLabel('Priority').selectOption('high');
  await page.getByLabel('Reminder').fill('2020-01-01T09:00');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByText('Write smoke test').first().waitFor();
  await shot(page, 'todo-added-overdue');
  const overdueCount = await page.getByText('Overdue', { exact: true }).count();
  const remindersPanel = await page.getByRole('complementary', { name: 'Reminders' }).count();
  record('2. todo + overdue reminder', overdueCount > 0 && remindersPanel > 0,
    `overdue badges=${overdueCount}, panel present=${remindersPanel > 0}`);

  // 3. Blocker + info notes
  await page.getByRole('button', { name: 'Add note' }).click();
  await page.getByLabel('Text').fill('API keys missing');
  await page.getByLabel('Category').selectOption('blocker');
  await page.getByRole('button', { name: 'Save note' }).click();
  await page.getByText('API keys missing').waitFor();

  await page.getByRole('button', { name: 'Add note' }).click();
  await page.getByLabel('Text').fill('Release notes drafted');
  await page.getByLabel('Category').selectOption('info');
  await page.getByRole('button', { name: 'Save note' }).click();
  await page.getByText('Release notes drafted').waitFor();
  await shot(page, 'notes-added');
  record('3. blocker + info notes', true);

  // 4. Standup modal + copy to clipboard
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Standup' }).click();
  await page.getByRole('dialog', { name: 'Daily standup' }).waitFor();
  await shot(page, 'standup-modal');
  await page.getByRole('button', { name: 'Copy to clipboard' }).click();
  await page.getByRole('button', { name: 'Copied!' }).waitFor();
  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  const expectedClipboard =
    '*Yesterday*\n- None\n\n*Today*\n- Write smoke test\n\n*Blockers*\n- API keys missing';
  record('4. standup + clipboard', clipboardText === expectedClipboard,
    clipboardText === expectedClipboard ? '' : `got: ${JSON.stringify(clipboardText)}`);
  await page.getByRole('button', { name: 'Close' }).click();

  // 5. Reload -> persistence
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByText('Write smoke test').first().waitFor();
  await page.getByText('API keys missing').waitFor();
  await shot(page, 'after-reload-persisted');
  record('5. reload persistence', true);

  // 6. Single localStorage key
  const lsKeys = await page.evaluate(() => Object.keys(localStorage));
  record('6. single localStorage key', lsKeys.length === 1 && lsKeys[0] === 'agile-todo-app.v-state',
    JSON.stringify(lsKeys));

  // 7. Backup modal: download -> clear -> import round trip (with confirm step)
  await page.getByRole('button', { name: 'Backup' }).click();
  await page.getByRole('dialog', { name: 'Backup' }).waitFor();
  await shot(page, 'backup-modal');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download backup' }).click(),
  ]);
  const backupPath = path.join(SHOT_DIR, 'backup.json');
  await download.saveAs(backupPath);
  const backupBytes = readFileSync(backupPath, 'utf-8').length;
  await page.getByRole('button', { name: 'Close' }).click();

  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  const clearedCount = await page.getByText('Write smoke test').count();
  await shot(page, 'after-clear-storage');

  await page.getByRole('button', { name: 'Backup' }).click();
  await page.getByRole('dialog', { name: 'Backup' }).waitFor();
  await page.getByLabel('Choose file…').setInputFiles(backupPath);
  await page.getByRole('button', { name: 'Replace board' }).waitFor();
  await shot(page, 'backup-confirm');
  await page.getByRole('button', { name: 'Replace board' }).click();
  await page.getByText('Write smoke test').first().waitFor();
  await shot(page, 'after-import-restored');
  record('7. backup export/clear/import round trip', backupBytes > 0 && clearedCount === 0,
    `backup=${backupBytes}B, cleared-count=${clearedCount}`);

  // 8. Regenerate fortnight (in-app ConfirmDialog, not a native browser dialog)
  await page.getByRole('button', { name: 'Generate new fortnight' }).click();
  await page.getByRole('dialog', { name: 'Generate new fortnight?' }).waitFor();
  await page.getByRole('button', { name: 'Generate' }).click();
  await page.getByRole('combobox', { name: 'Fortnight' }).waitFor();
  await shot(page, 'after-regenerate');
  const switcherOptions = await page
    .getByRole('combobox', { name: 'Fortnight' })
    .locator('option')
    .allInnerTexts();
  record('8. regenerate fortnight', switcherOptions.length === 2, JSON.stringify(switcherOptions));

  // 9. Mobile viewport + dark mode
  await page.setViewportSize({ width: 360, height: 800 });
  await shot(page, 'mobile-360');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload({ waitUntil: 'networkidle' });
  await shot(page, 'dark-mode');
  record('9. mobile + dark mode screenshots', true);

  // 10. Keyboard layer: ? shortcuts overlay, Cmd/Ctrl+K command palette
  await page.getByRole('heading', { name: 'Agile Todo' }).click(); // move focus off any control first
  await page.keyboard.press('?');
  await page.getByRole('dialog', { name: 'Keyboard shortcuts' }).waitFor();
  await shot(page, 'shortcuts-overlay');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog', { name: 'Keyboard shortcuts' }).waitFor({ state: 'detached' });

  await page.keyboard.press('Control+k');
  const paletteDialog = page.getByRole('dialog', { name: 'Command palette' });
  await paletteDialog.waitFor();
  // Native <select> elements (FortnightSwitcher, present once step 8 has
  // created a second fortnight) also expose role="combobox" -- an unnamed
  // getByRole('combobox') is ambiguous at this point in the flow. Scope to
  // the dialog to get the palette's own search input unambiguously.
  await paletteDialog.getByRole('combobox').fill('standup');
  const paletteHasStandup = await page.getByRole('listbox', { name: 'Results' }).getByText('Standup').count();
  await shot(page, 'command-palette');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog', { name: 'Command palette' }).waitFor({ state: 'detached' });
  record('10. keyboard layer (? overlay, Cmd/Ctrl+K palette)', paletteHasStandup > 0,
    `palette found "Standup" action: ${paletteHasStandup > 0}`);

  await browser.close();

  console.log('');
  console.log(`Console errors: ${consoleErrors.length}`);
  if (consoleErrors.length) console.log(JSON.stringify(consoleErrors, null, 2));

  const failed = results.filter((r) => !r.ok);
  console.log('');
  console.log(`${results.length - failed.length}/${results.length} scenarios passed.`);
  if (failed.length || consoleErrors.length) {
    process.exit(1);
  }
}

run().catch((e) => {
  console.error('SMOKE TEST CRASHED:', e);
  process.exit(1);
});

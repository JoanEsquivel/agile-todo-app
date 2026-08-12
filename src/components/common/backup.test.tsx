import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../App';
import { seedApp } from '../../test/seed';
import { useAppStore } from '../../store/store';
import { serializeState } from '../../store/exportImport';
import { SCHEMA_VERSION } from '../../store/migrations';

vi.mock('../../store/clock', () => ({
  todayLocal: () => '2026-08-18',
  nowIso: () => '2026-08-18T12:00:00.000Z',
}));

/** A valid backup of the seeded board with an emptied todo/note set, so an
 *  import is observable as "everything went away". */
function emptyBackupJson() {
  const s = useAppStore.getState();
  return serializeState({
    schemaVersion: SCHEMA_VERSION,
    fortnights: s.fortnights,
    activeFortnightId: s.activeFortnightId,
    todos: {},
    notes: {},
    lastRolloverDay: '2026-08-18',
    pomodoroSettings: { workMinutes: 25, breakMinutes: 5, longBreakMinutes: 15 },
  });
}

function backupFile(json: string, name = 'agile-todo-app-backup-2026-08-10.json') {
  return new File([json], name, { type: 'application/json' });
}

/** jsdom implements neither createObjectURL nor revokeObjectURL. Returns the
 *  spies plus the anchors the export path clicked (the anchor is synthetic,
 *  so patching the prototype is the only way to observe it). */
function stubDownload() {
  const createObjectURL = vi.fn(() => 'blob:mock');
  const revokeObjectURL = vi.fn();
  Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });
  const clicked: HTMLAnchorElement[] = [];
  const realClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) { clicked.push(this); };
  return { createObjectURL, revokeObjectURL, clicked, restore: () => { HTMLAnchorElement.prototype.click = realClick; } };
}

async function openBackupDialog(user: ReturnType<typeof userEvent.setup>) {
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Backup' }));
  return screen.getByRole('dialog', { name: 'Backup' });
}

describe('backup modal', () => {
  beforeEach(() => seedApp());

  it('replaces the header controls with a single Backup button', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'Backup' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Export backup' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Import backup')).not.toBeInTheDocument();
  });

  it('opens a dialog holding both actions', async () => {
    const user = userEvent.setup();
    const dialog = await openBackupDialog(user);
    expect(within(dialog).getByRole('button', { name: 'Download backup' })).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Choose file…')).toBeInTheDocument();
  });

  it('exports a download named for today', async () => {
    const user = userEvent.setup();
    const dl = stubDownload();
    try {
      await openBackupDialog(user);
      await user.click(screen.getByRole('button', { name: 'Download backup' }));
      expect(dl.clicked).toHaveLength(1);
      expect(dl.clicked[0].download).toBe('agile-todo-app-backup-2026-08-18.json');
      expect(dl.createObjectURL).toHaveBeenCalledTimes(1);
      expect(dl.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
    } finally {
      dl.restore();
    }
  });

  it('imports a valid backup file and replaces state', async () => {
    const user = userEvent.setup();
    const json = emptyBackupJson();
    useAppStore.getState().addTodo({ title: 'to be replaced', priority: 'low', scheduledDay: '2026-08-18' });
    await openBackupDialog(user);
    await user.upload(screen.getByLabelText('Choose file…'), backupFile(json));
    expect(useAppStore.getState().todos).toEqual({});
  });

  it('shows a parse error inside the dialog, not in the header', async () => {
    const user = userEvent.setup();
    const dialog = await openBackupDialog(user);
    await user.upload(screen.getByLabelText('Choose file…'), backupFile('not json', 'bad.json'));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/not valid JSON/i);
  });
});

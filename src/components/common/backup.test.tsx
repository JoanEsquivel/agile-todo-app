import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../App';
import { seedApp } from '../../test/seed';
import { useAppStore } from '../../store/store';
import { serializeState } from '../../store/exportImport';

vi.mock('../../store/clock', () => ({
  todayLocal: () => '2026-08-18',
  nowIso: () => '2026-08-18T12:00:00.000Z',
}));

describe('backup controls', () => {
  beforeEach(() => seedApp());

  it('imports a valid backup file and replaces state', async () => {
    const user = userEvent.setup();
    const s = useAppStore.getState();
    const backup = serializeState({
      schemaVersion: 1, fortnights: s.fortnights, activeFortnightId: s.activeFortnightId,
      todos: {}, notes: {}, lastRolloverDay: '2026-08-18',
    });
    useAppStore.getState().addTodo({ title: 'to be replaced', priority: 'low', scheduledDay: '2026-08-18' });

    render(<App />);
    const file = new File([backup], 'backup.json', { type: 'application/json' });
    await user.upload(screen.getByLabelText('Import backup'), file);
    expect(useAppStore.getState().todos).toEqual({});
  });

  it('shows an error for an invalid file', async () => {
    const user = userEvent.setup();
    render(<App />);
    const file = new File(['not json'], 'bad.json', { type: 'application/json' });
    await user.upload(screen.getByLabelText('Import backup'), file);
    expect(await screen.findByRole('alert')).toHaveTextContent(/not valid JSON/i);
  });
});

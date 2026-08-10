import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../App';
import { seedApp } from '../../test/seed';
import { useAppStore } from '../../store/store';

vi.mock('../../store/clock', () => ({
  todayLocal: () => '2026-08-18',
  nowIso: () => '2026-08-18T12:00:00.000Z',
}));

describe('todos on the board', () => {
  beforeEach(() => seedApp());

  it('adds a todo through the form (title required)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Add todo' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByLabelText('Title')).toBeInvalid(); // required, empty

    await user.type(screen.getByLabelText('Title'), 'Write tests');
    await user.selectOptions(screen.getByLabelText('Priority'), 'high');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText('Write tests')).toBeInTheDocument();
    expect(screen.getByText('High')).toHaveAttribute('data-priority', 'high');
  });

  it('toggles done via the checkbox', async () => {
    const user = userEvent.setup();
    useAppStore.getState().addTodo({ title: 'Ship it', priority: 'medium', scheduledDay: '2026-08-18' });
    render(<App />);
    await user.click(screen.getByRole('checkbox', { name: 'Ship it' }));
    expect(Object.values(useAppStore.getState().todos)[0].done).toBe(true);
  });

  it('shows the rolled-over badge', () => {
    useAppStore.getState().addTodo({ title: 'Old task', priority: 'low', scheduledDay: '2026-08-18' });
    const id = Object.values(useAppStore.getState().todos)[0].id;
    useAppStore.setState((s) => ({
      todos: { ...s.todos, [id]: { ...s.todos[id], rolledOver: true } },
    }));
    render(<App />);
    expect(screen.getByText('Rolled over')).toBeInTheDocument();
  });

  it('hides mutation controls when viewing a read-only (past) fortnight', () => {
    // Seed a todo, then mark it done so carryOverTodos (which only migrates unfinished
    // todos to the new active fortnight) leaves it behind on the original fortnight —
    // that original fortnight becomes the read-only one once a new one is regenerated.
    useAppStore.getState().addTodo({ title: 'Archived task', priority: 'medium', scheduledDay: '2026-08-18' });
    const id = Object.values(useAppStore.getState().todos)[0].id;
    useAppStore.getState().toggleDone(id);

    const oldFortnightId = useAppStore.getState().activeFortnightId!;
    useAppStore.getState().regenerateFortnight();
    useAppStore.getState().viewFortnight(oldFortnightId);
    useAppStore.getState().selectDay('2026-08-18');

    render(<App />);

    expect(screen.getByRole('checkbox', { name: 'Archived task' })).toBeDisabled();
    // Exact accessible names, not a bare "Edit"/"Delete" — those would be
    // vacuously absent under the per-item naming below regardless of what
    // actually renders, silently gutting this INV-9 regression guard.
    expect(screen.queryByRole('button', { name: 'Edit todo: Archived task' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete todo: Archived task' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add todo' })).not.toBeInTheDocument();
  });

  it('gives each todo its own unambiguous Edit/Delete accessible name', async () => {
    const user = userEvent.setup();
    useAppStore.getState().addTodo({ title: 'Ship the deck', priority: 'high', scheduledDay: '2026-08-18' });
    useAppStore.getState().addTodo({ title: 'Review PR #204', priority: 'medium', scheduledDay: '2026-08-18' });
    render(<App />);

    // Ambiguous "Delete" would throw here if both rows shared one name —
    // this only compiles into a meaningful assertion because they don't.
    await user.click(screen.getByRole('button', { name: 'Delete todo: Review PR #204' }));

    expect(screen.getByText('Ship the deck')).toBeInTheDocument();
    expect(screen.queryByText('Review PR #204')).not.toBeInTheDocument();
  });
});

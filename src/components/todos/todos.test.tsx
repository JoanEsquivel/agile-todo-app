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

  it('exposes disclosure state on Add todo and manages focus in and back out', async () => {
    const user = userEvent.setup();
    render(<App />);
    const addButton = screen.getByRole('button', { name: 'Add todo' });
    expect(addButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(addButton);
    expect(addButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Title')).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(addButton).toHaveAttribute('aria-expanded', 'false');
    expect(addButton).toHaveFocus();
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
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

describe('todo checklists', () => {
  beforeEach(() => seedApp());

  function addTodoReturningId(title: string): string {
    useAppStore.getState().addTodo({ title, priority: 'medium', scheduledDay: '2026-08-18' });
    return Object.values(useAppStore.getState().todos).find((t) => t.title === title)!.id;
  }

  it('Add checklist opens the add form focused and creates the first item', async () => {
    const user = userEvent.setup();
    addTodoReturningId('Big task');
    render(<App />);

    const door = screen.getByRole('button', { name: 'Add checklist to todo: Big task' });
    expect(door).toHaveAttribute('aria-expanded', 'false');
    await user.click(door);
    const input = screen.getByLabelText('Add checklist item');
    expect(input).toHaveFocus();

    await user.type(input, 'part one');
    await user.click(screen.getByRole('button', { name: 'Add checklist item to todo: Big task' }));

    expect(screen.getByRole('checkbox', { name: 'part one' })).not.toBeChecked();
    expect(input).toHaveValue('');
    // Once the first item exists the counter takes over as the toggle...
    expect(screen.getByRole('button', { name: '0/1 checklist items done' }))
      .toHaveAttribute('aria-expanded', 'true');
    // ...and the actions-row door is gone.
    expect(screen.queryByRole('button', { name: 'Add checklist to todo: Big task' }))
      .not.toBeInTheDocument();
  });

  it('renders a collapsed counter that expands to the item list', async () => {
    const user = userEvent.setup();
    const id = addTodoReturningId('Big task');
    useAppStore.getState().addChecklistItem(id, 'one');
    useAppStore.getState().addChecklistItem(id, 'two');
    const firstItemId = useAppStore.getState().todos[id].checklist![0].id;
    useAppStore.getState().toggleChecklistItem(id, firstItemId);
    render(<App />);

    const counter = screen.getByRole('button', { name: '1/2 checklist items done' });
    expect(counter).toHaveTextContent('1/2'); // visible text is a literal substring of the name
    expect(counter).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('checkbox', { name: 'one' })).not.toBeInTheDocument();

    await user.click(counter);
    expect(counter).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('checkbox', { name: 'one' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'two' })).not.toBeChecked();
  });

  it('checking the last item completes the todo (data-done appears); unchecking reopens it', async () => {
    const user = userEvent.setup();
    const id = addTodoReturningId('Big task');
    useAppStore.getState().addChecklistItem(id, 'only part');
    render(<App />);

    await user.click(screen.getByRole('button', { name: '0/1 checklist items done' }));
    await user.click(screen.getByRole('checkbox', { name: 'only part' }));
    expect(useAppStore.getState().todos[id].done).toBe(true);
    expect(screen.getByRole('checkbox', { name: 'Big task' })).toBeChecked();
    expect(screen.getByText('Big task').closest('li')).toHaveAttribute('data-done');

    await user.click(screen.getByRole('checkbox', { name: 'only part' }));
    expect(useAppStore.getState().todos[id].done).toBe(false);
    expect(screen.getByText('Big task').closest('li')).not.toHaveAttribute('data-done');
  });

  it('removes an item inline; removing the final item brings the Add checklist door back', async () => {
    const user = userEvent.setup();
    const id = addTodoReturningId('Big task');
    useAppStore.getState().addChecklistItem(id, 'doomed');
    render(<App />);

    await user.click(screen.getByRole('button', { name: '0/1 checklist items done' }));
    await user.click(screen.getByRole('button', { name: 'Remove doomed' }));

    expect(useAppStore.getState().todos[id].checklist).toBeUndefined();
    expect(screen.queryByRole('checkbox', { name: 'doomed' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add checklist to todo: Big task' })).toBeInTheDocument();
  });

  it('read-only history: checkboxes disabled, no add/remove/Add-checklist UI', async () => {
    const user = userEvent.setup();
    // Done todos stay behind when a new month is generated (carryOverTodos
    // skips done) — completing via the checklist pins both to the old,
    // soon-to-be read-only fortnight.
    const withChecklist = addTodoReturningId('Archived task');
    useAppStore.getState().addChecklistItem(withChecklist, 'sub one');
    const itemId = useAppStore.getState().todos[withChecklist].checklist![0].id;
    useAppStore.getState().toggleChecklistItem(withChecklist, itemId); // auto-completes it
    const plain = addTodoReturningId('Archived plain');
    useAppStore.getState().toggleDone(plain);

    const oldFortnightId = useAppStore.getState().activeFortnightId!;
    useAppStore.getState().regenerateFortnight();
    useAppStore.getState().viewFortnight(oldFortnightId);
    useAppStore.getState().selectDay('2026-08-18');
    render(<App />);

    // The counter still renders and expands — disclosure is not a mutation.
    await user.click(screen.getByRole('button', { name: '1/1 checklist items done' }));
    expect(screen.getByRole('checkbox', { name: 'sub one' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Remove sub one' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Add checklist item')).not.toBeInTheDocument();
    // A checklist-less read-only todo shows nothing new at all.
    expect(screen.queryByRole('button', { name: 'Add checklist to todo: Archived plain' }))
      .not.toBeInTheDocument();
  });
});

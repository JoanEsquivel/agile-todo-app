import { render, screen } from '@testing-library/react';
import App from '../../App';
import { seedApp } from '../../test/seed';
import { useAppStore } from '../../store/store';

vi.mock('../../store/clock', () => ({
  todayLocal: () => '2026-08-18',
  nowIso: () => '2026-08-18T12:00:00.000Z',
}));

// Roving tabindex and arrow/Home/End keyboard mechanics live in
// a11y.test.tsx alongside the other keyboard-navigation coverage. This file
// covers what's specific to the tape as a board component: the pending-todo
// counts it renders per day and per folded week.
describe('fortnight tape pending counts', () => {
  beforeEach(() => seedApp());

  it('shows the count of pending (not-done) todos on a day chip', () => {
    const st = useAppStore.getState();
    st.addTodo({ title: 'open one', priority: 'high', scheduledDay: '2026-08-18' });
    st.addTodo({ title: 'done one', priority: 'low', scheduledDay: '2026-08-18' });
    const doneId = Object.values(useAppStore.getState().todos).find((t) => t.title === 'done one')!.id;
    useAppStore.getState().toggleDone(doneId);
    render(<App />);

    const day = screen.getByRole('button', { name: /^Tue 18 — / });
    expect(day.querySelectorAll('[data-priority]')).toHaveLength(0); // priority bars are gone
    expect(day).toHaveTextContent('1'); // 1 pending; the done todo doesn't count
    expect(day).toHaveAccessibleName(/, 1 pending/);
  });

  it('renders no pending indicator on a day with nothing pending', () => {
    render(<App />);
    const day = screen.getByRole('button', { name: /^Wed 19 — / });
    expect(day.querySelector('[class*="pending"]')).not.toBeInTheDocument();
    expect(day).not.toHaveAccessibleName(/pending/);
  });

  it('shows an aggregate pending count on a folded week, excluding done todos', () => {
    const st = useAppStore.getState();
    st.addTodo({ title: 'a', priority: 'high', scheduledDay: '2026-08-24' });
    st.addTodo({ title: 'b', priority: 'medium', scheduledDay: '2026-08-25' });
    st.addTodo({ title: 'c', priority: 'low', scheduledDay: '2026-08-26' });
    const doneId = Object.values(useAppStore.getState().todos).find((t) => t.title === 'c')!.id;
    useAppStore.getState().toggleDone(doneId);
    render(<App />);

    const folded = screen.getByRole('button', { name: /^24–28 — / });
    expect(folded).toHaveTextContent('2');
    expect(folded).toHaveAccessibleName(/, 2 pending/);
  });

  it('gives today a real accessible indication beyond the data-today attribute', () => {
    render(<App />);
    const today = screen.getByRole('button', { name: /Tue, Aug 18.*today/i });
    expect(today).toHaveAttribute('data-today');

    const otherDay = screen.getByRole('button', { name: /^Wed 19 — / });
    expect(otherDay).not.toHaveAttribute('data-today');
    expect(screen.queryByRole('button', { name: /Wed, Aug 19.*today/i })).not.toBeInTheDocument();
  });
});

// Regression test for the ~5.67px column-misalignment bug: DayColumn must
// render its <h2> heading and its .column (the Todos/Notes sections wrapper)
// as SIBLINGS -- both direct children of <main id="main">, alongside
// RemindersPanel's <aside>. If the heading is ever re-nested inside .column,
// all 297+ other tests stay green (nothing else asserts on this), but the
// grid-alignment bug this fixed comes back silently. See the comment above
// the `return` in DayColumn.tsx and DayColumn.module.css for why the split
// is required.
describe('board row-alignment DOM contract', () => {
  beforeEach(() => seedApp());

  it('keeps the day heading a sibling of the sections wrapper and the reminders aside — all direct children of <main> (row-alignment contract)', () => {
    render(<App />);
    const board = screen.getByRole('main');
    const heading = screen.getByRole('heading', { level: 2, name: /Tue, Aug 18/ });
    const todosRegion = screen.getByRole('region', { name: 'Todos' });
    const remindersAside = screen.getByRole('complementary', { name: 'Reminders' });

    // The heading is a direct child of <main> -- NOT nested inside .column.
    expect(heading.parentElement).toBe(board);
    // Todos lives inside .column, which is itself the direct child of <main>
    // -- so the region's grandparent (not parent) is the board.
    expect(todosRegion.parentElement?.parentElement).toBe(board);
    expect(todosRegion.parentElement).not.toBe(board);
    // Reminders is a direct child of <main>, same row as .column.
    expect(remindersAside.parentElement).toBe(board);
  });
});

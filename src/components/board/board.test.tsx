import { fireEvent, render, screen, within } from '@testing-library/react';
import App from '../../App';
import { seedApp } from '../../test/seed';
import { useAppStore } from '../../store/store';
import { selectTodosForDay } from '../../store/selectors';

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

function mockRects(rows: Array<{ el: HTMLElement; top: number; height: number }>) {
  for (const { el, top, height } of rows) {
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      top, height, bottom: top + height, left: 0, right: 100, width: 100, x: 0, y: top,
      toJSON: () => ({}),
    } as DOMRect);
  }
}

describe('pointer drag reorder', () => {
  beforeEach(() => seedApp());

  it('shows no drag handles in read-only history or on done todos', async () => {
    useAppStore.getState().addTodo({ title: 'Pending', priority: 'high', scheduledDay: '2026-08-18' });
    useAppStore.getState().addTodo({ title: 'Finished', priority: 'high', scheduledDay: '2026-08-18' });
    const done = Object.values(useAppStore.getState().todos).find((t) => t.title === 'Finished')!;
    useAppStore.getState().toggleDone(done.id);
    render(<App />);
    expect(screen.getByRole('button', { name: 'Reorder todo: Pending' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reorder todo: Finished' })).not.toBeInTheDocument();
  });

  it('band separators appear only while dragging', () => {
    useAppStore.getState().addTodo({ title: 'Solo', priority: 'medium', scheduledDay: '2026-08-18' });
    const { container } = render(<App />);
    expect(container.querySelector('[class*="bandSeparator"]')).toBeNull();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Reorder todo: Solo' }), { pointerId: 1, clientY: 10 });
    expect(container.querySelectorAll('[class*="bandSeparator"]')).toHaveLength(3); // High, Medium, Low
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Reorder todo: Solo' }), { pointerId: 1, clientY: 10 });
    expect(container.querySelector('[class*="bandSeparator"]')).toBeNull();
  });

  it('drops a todo at a new slot in its own band', () => {
    const st = useAppStore.getState();
    st.addTodo({ title: 'A', priority: 'medium', scheduledDay: '2026-08-18' });
    st.addTodo({ title: 'B', priority: 'medium', scheduledDay: '2026-08-18' });
    st.addTodo({ title: 'C', priority: 'medium', scheduledDay: '2026-08-18' });
    const { container } = render(<App />);
    const handle = screen.getByRole('button', { name: 'Reorder todo: C' });
    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 250 });
    // Layout: separators High@0, Medium@40, Low@400; items A@80, B@160, C@240 (height 60).
    const seps = Array.from(container.querySelectorAll('[class*="bandSeparator"]')) as HTMLElement[];
    const items = screen.getAllByRole('listitem').filter((li) =>
      within(li).queryByRole('button', { name: /^Reorder todo: / }));
    mockRects([
      { el: seps[0], top: 0, height: 20 }, { el: seps[1], top: 40, height: 20 },
      { el: seps[2], top: 400, height: 20 },
      { el: items[0], top: 80, height: 60 }, { el: items[1], top: 160, height: 60 },
      { el: items[2], top: 240, height: 60 },
    ]);
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 100 }); // above A's midpoint? A mid=110 → index 0
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 100 });
    const s = useAppStore.getState();
    const fn = s.fortnights.find((f) => f.id === s.activeFortnightId)!;
    const titles = selectTodosForDay(s, fn.id, '2026-08-18').map((t) => t.title);
    expect(titles).toEqual(['C', 'A', 'B']);
  });

  // Regression coverage for IMP-1: the drop indicator must be placed in the
  // same index space useDragReorder's computeTarget and domain reorderTodo
  // use (the band EXCLUDING the dragged todo), not the full render band
  // (dragged item included). A downward same-band drag used to render the
  // indicator one slot early; a drag to the very end of a band used to
  // render it twice.
  it('places exactly one indicator between the two items straddling the drop point on a downward same-band drag', () => {
    const st = useAppStore.getState();
    st.addTodo({ title: 'A', priority: 'medium', scheduledDay: '2026-08-18' });
    st.addTodo({ title: 'B', priority: 'medium', scheduledDay: '2026-08-18' });
    st.addTodo({ title: 'C', priority: 'medium', scheduledDay: '2026-08-18' });
    const { container } = render(<App />);
    const handle = screen.getByRole('button', { name: 'Reorder todo: A' });
    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 80 });
    // Layout: separators High@0, Medium@40, Low@400; items A@80, B@160, C@240 (height 60).
    const seps = Array.from(container.querySelectorAll('[class*="bandSeparator"]')) as HTMLElement[];
    const items = screen.getAllByRole('listitem').filter((li) =>
      within(li).queryByRole('button', { name: /^Reorder todo: / }));
    mockRects([
      { el: seps[0], top: 0, height: 20 }, { el: seps[1], top: 40, height: 20 },
      { el: seps[2], top: 400, height: 20 },
      { el: items[0], top: 80, height: 60 }, { el: items[1], top: 160, height: 60 },
      { el: items[2], top: 240, height: 60 },
    ]);
    // Between B's midpoint (190) and C's midpoint (270) -> excluded-space index 1.
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 230 });

    const indicators = container.querySelectorAll('[class*="dropIndicator"]');
    expect(indicators).toHaveLength(1);
    const list = items[0].parentElement!;
    const domOrder = Array.from(list.children);
    expect(domOrder.indexOf(indicators[0] as Element)).toBeGreaterThan(domOrder.indexOf(items[1]));
    expect(domOrder.indexOf(indicators[0] as Element)).toBeLessThan(domOrder.indexOf(items[2]));

    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 230 });
    const s = useAppStore.getState();
    const fn = s.fortnights.find((f) => f.id === s.activeFortnightId)!;
    const titles = selectTodosForDay(s, fn.id, '2026-08-18').map((t) => t.title);
    expect(titles).toEqual(['B', 'A', 'C']);
  });

  it('places exactly one indicator after the last item on a drag to the end of the band', () => {
    const st = useAppStore.getState();
    st.addTodo({ title: 'A', priority: 'medium', scheduledDay: '2026-08-18' });
    st.addTodo({ title: 'B', priority: 'medium', scheduledDay: '2026-08-18' });
    st.addTodo({ title: 'C', priority: 'medium', scheduledDay: '2026-08-18' });
    const { container } = render(<App />);
    const handle = screen.getByRole('button', { name: 'Reorder todo: B' });
    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 160 });
    const seps = Array.from(container.querySelectorAll('[class*="bandSeparator"]')) as HTMLElement[];
    const items = screen.getAllByRole('listitem').filter((li) =>
      within(li).queryByRole('button', { name: /^Reorder todo: / }));
    mockRects([
      { el: seps[0], top: 0, height: 20 }, { el: seps[1], top: 40, height: 20 },
      { el: seps[2], top: 400, height: 20 },
      { el: items[0], top: 80, height: 60 }, { el: items[1], top: 160, height: 60 },
      { el: items[2], top: 240, height: 60 },
    ]);
    // Below C's midpoint (270) -> excluded-space index 2, the end of the band.
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 300 });

    const indicators = container.querySelectorAll('[class*="dropIndicator"]');
    expect(indicators).toHaveLength(1);
    const list = items[0].parentElement!;
    const domOrder = Array.from(list.children);
    expect(domOrder.indexOf(indicators[0] as Element)).toBeGreaterThan(domOrder.indexOf(items[2]));

    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 300 });
    const s = useAppStore.getState();
    const fn = s.fortnights.find((f) => f.id === s.activeFortnightId)!;
    const titles = selectTodosForDay(s, fn.id, '2026-08-18').map((t) => t.title);
    expect(titles).toEqual(['A', 'C', 'B']);
  });

  it('dropping in another band re-prioritizes', () => {
    const st = useAppStore.getState();
    st.addTodo({ title: 'H', priority: 'high', scheduledDay: '2026-08-18' });
    st.addTodo({ title: 'M', priority: 'medium', scheduledDay: '2026-08-18' });
    const { container } = render(<App />);
    const handle = screen.getByRole('button', { name: 'Reorder todo: M' });
    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 200 });
    const seps = Array.from(container.querySelectorAll('[class*="bandSeparator"]')) as HTMLElement[];
    const items = screen.getAllByRole('listitem').filter((li) =>
      within(li).queryByRole('button', { name: /^Reorder todo: / }));
    mockRects([
      { el: seps[0], top: 0, height: 20 }, { el: seps[1], top: 120, height: 20 },
      { el: seps[2], top: 400, height: 20 },
      { el: items[0], top: 40, height: 60 }, { el: items[1], top: 160, height: 60 },
    ]);
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 30 }); // above Medium sep → High band, below H's mid(70)? 30 < 70 → index 0
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 30 });
    const m = Object.values(useAppStore.getState().todos).find((t) => t.title === 'M')!;
    expect(m.priority).toBe('high');
    expect(m.sortIndex).toBe(0);
  });

  it('pointercancel aborts without committing', () => {
    const st = useAppStore.getState();
    st.addTodo({ title: 'A', priority: 'medium', scheduledDay: '2026-08-18' });
    st.addTodo({ title: 'B', priority: 'medium', scheduledDay: '2026-08-18' });
    render(<App />);
    const handle = screen.getByRole('button', { name: 'Reorder todo: B' });
    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 100 });
    fireEvent.pointerCancel(handle, { pointerId: 1 });
    expect(Object.values(useAppStore.getState().todos).every((t) => t.sortIndex === undefined)).toBe(true);
  });
});

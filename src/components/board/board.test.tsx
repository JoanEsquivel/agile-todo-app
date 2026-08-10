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
// covers what's specific to the tape as a board component: the workload
// segments it renders per day.
describe('fortnight tape workload', () => {
  beforeEach(() => seedApp());

  it('renders one segment per todo, carrying its priority and done state', () => {
    const st = useAppStore.getState();
    st.addTodo({ title: 'high one', priority: 'high', scheduledDay: '2026-08-18' });
    st.addTodo({ title: 'low one', priority: 'low', scheduledDay: '2026-08-18' });
    const lowId = Object.values(useAppStore.getState().todos).find((t) => t.title === 'low one')!.id;
    useAppStore.getState().toggleDone(lowId);
    render(<App />);

    const day = screen.getByRole('button', { name: /Tue, Aug 18/ });
    const segments = day.querySelectorAll('[data-priority]');
    expect(segments).toHaveLength(2);
    const high = Array.from(segments).find((s) => s.getAttribute('data-priority') === 'high')!;
    const low = Array.from(segments).find((s) => s.getAttribute('data-priority') === 'low')!;
    expect(high).not.toHaveAttribute('data-done');
    expect(low).toHaveAttribute('data-done', '');
  });

  it('shows a single faint tick, not zero segments, on a day with no todos', () => {
    render(<App />);
    const day = screen.getByRole('button', { name: /Wed, Aug 19/ });
    expect(day.querySelectorAll('[data-priority]')).toHaveLength(0);
    expect(day.querySelector('[class*="emptyTick"]')).toBeInTheDocument();
  });

  it('caps rendered segments but keeps the visible count exact', () => {
    const st = useAppStore.getState();
    for (let i = 0; i < 6; i++) {
      st.addTodo({ title: `task ${i}`, priority: 'medium', scheduledDay: '2026-08-18' });
    }
    render(<App />);
    const day = screen.getByRole('button', { name: /Tue, Aug 18/ });
    // The bar count is a visual budget; the number next to it is always exact.
    expect(day.querySelectorAll('[data-priority]').length).toBeLessThan(6);
    expect(day).toHaveTextContent('6');
  });

  it('gives today a real accessible indication beyond the data-today attribute', () => {
    render(<App />);
    const today = screen.getByRole('button', { name: /Tue, Aug 18.*today/i });
    expect(today).toHaveAttribute('data-today');

    const otherDay = screen.getByRole('button', { name: /Wed, Aug 19/ });
    expect(otherDay).not.toHaveAttribute('data-today');
    expect(screen.queryByRole('button', { name: /Wed, Aug 19.*today/i })).not.toBeInTheDocument();
  });
});

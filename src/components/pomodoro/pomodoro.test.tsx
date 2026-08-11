import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../App';
import { seedApp } from '../../test/seed';
import { useAppStore, appStorage } from '../../store/store';
import { playBeep, notifyPhaseEnd, requestNotificationPermission } from './notify';

// Mutable clock (INV-10): store time and render time share one source.
const clock = { iso: '2026-08-18T12:00:00.000Z' };

vi.mock('../../store/clock', () => ({
  todayLocal: () => '2026-08-18',
  nowIso: () => clock.iso,
}));

// useNow is mocked to read the same mutable clock — no real intervals (and
// no vi.setSystemTime, which is banned). "Advancing time" is: mutate
// clock.iso, then act(() => useAppStore.setState({})) — the empty setState
// notifies subscribers, re-rendering the widget, whose effect then sees the
// new now and reacts (e.g. detects a passed deadline).
vi.mock('../../hooks/useNow', () => ({
  useNow: () => new Date(clock.iso),
}));

vi.mock('./notify', () => ({
  playBeep: vi.fn(),
  notifyPhaseEnd: vi.fn(),
  requestNotificationPermission: vi.fn(async () => 'granted' as NotificationPermission),
}));

function advanceTo(iso: string) {
  clock.iso = iso;
  act(() => useAppStore.setState({}));
}

describe('pomodoro', () => {
  beforeEach(() => {
    clock.iso = '2026-08-18T12:00:00.000Z';
    vi.clearAllMocks();
    seedApp();
  });

  it('idle: the header offers a Pomodoro button and no countdown', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'Pomodoro timer' })).toBeInTheDocument();
    expect(screen.queryByText(/\d{2}:\d{2}/)).not.toBeInTheDocument();
  });

  it('P opens the modal; Start begins a 25:00 focus phase shown in the widget', async () => {
    const user = userEvent.setup();
    render(<App />);
    (document.activeElement as HTMLElement | null)?.blur();
    await user.keyboard('p');
    const dialog = screen.getByRole('dialog', { name: 'Pomodoro' });
    expect(dialog).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(useAppStore.getState().pomodoro?.phase).toBe('work');
    // Widget (outside the modal) shows the countdown and phase.
    expect(screen.getAllByText('25:00').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/focus/i).length).toBeGreaterThan(0);
  });

  it('pause freezes the countdown; resume continues from the frozen remainder', async () => {
    const user = userEvent.setup();
    render(<App />);
    act(() => useAppStore.getState().startPomodoro());

    advanceTo('2026-08-18T12:05:00.000Z');
    expect(screen.getAllByText('20:00').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Pause timer' }));
    advanceTo('2026-08-18T12:30:00.000Z'); // way past the original deadline
    expect(screen.getAllByText('20:00').length).toBeGreaterThan(0); // frozen

    await user.click(screen.getByRole('button', { name: 'Resume timer' }));
    advanceTo('2026-08-18T12:40:00.000Z');
    expect(screen.getAllByText('10:00').length).toBeGreaterThan(0);
  });

  it('a passed deadline advances to the break, announces it, and notifies', () => {
    render(<App />);
    act(() => useAppStore.getState().startPomodoro());

    advanceTo('2026-08-18T12:25:01.000Z');
    const run = useAppStore.getState().pomodoro!;
    expect(run.phase).toBe('break');
    expect(run.completedWork).toBe(1);
    expect(useAppStore.getState().announcement).toMatch(/break/i);
    expect(playBeep).toHaveBeenCalled();
    expect(notifyPhaseEnd).toHaveBeenCalled();
  });

  it('Skip phase moves on without crediting a pomodoro', async () => {
    const user = userEvent.setup();
    render(<App />);
    act(() => useAppStore.getState().startPomodoro());
    await user.click(screen.getByRole('button', { name: 'Pomodoro settings' }));
    await user.click(screen.getByRole('button', { name: 'Skip phase' }));
    expect(useAppStore.getState().pomodoro).toMatchObject({ phase: 'break', completedWork: 0 });
  });

  it('Stop clears the run and returns the widget to idle', async () => {
    const user = userEvent.setup();
    render(<App />);
    act(() => useAppStore.getState().startPomodoro());
    await user.click(screen.getByRole('button', { name: 'Pomodoro settings' }));
    await user.click(screen.getByRole('button', { name: 'Stop' }));
    expect(useAppStore.getState().pomodoro).toBeNull();
    expect(screen.getByRole('button', { name: 'Pomodoro timer' })).toBeInTheDocument();
  });

  it('edited durations reach the persisted settings; junk is ignored', async () => {
    const user = userEvent.setup();
    render(<App />);
    (document.activeElement as HTMLElement | null)?.blur();
    await user.keyboard('p');

    const focusInput = screen.getByLabelText('Focus minutes');
    await user.clear(focusInput);
    await user.type(focusInput, '50');
    expect(useAppStore.getState().pomodoroSettings.workMinutes).toBe(50);

    const breakInput = screen.getByLabelText('Break minutes');
    await user.clear(breakInput);
    await user.type(breakInput, '0');
    expect(useAppStore.getState().pomodoroSettings.breakMinutes).toBe(5); // unchanged

    appStorage.flush();
    const persisted = JSON.parse(localStorage.getItem('agile-todo-app.v-state')!);
    expect(persisted.state.pomodoroSettings.workMinutes).toBe(50);
  });

  it('the notifications button asks for permission', async () => {
    const user = userEvent.setup();
    render(<App />);
    (document.activeElement as HTMLElement | null)?.blur();
    await user.keyboard('p');
    await user.click(screen.getByRole('button', { name: 'Enable browser notifications' }));
    expect(requestNotificationPermission).toHaveBeenCalled();
  });
});

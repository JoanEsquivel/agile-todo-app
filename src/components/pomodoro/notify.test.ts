import { playBeep, notifyPhaseEnd, requestNotificationPermission } from './notify';

/*
 * jsdom ships neither AudioContext nor Notification — which is exactly why
 * notify.ts feature-detects everything. These tests cover both halves: the
 * no-API environment must be a silent no-op (any component rendering the
 * header widget transitively reaches this module), and stubbed globals must
 * actually be driven.
 */

describe('notify (no platform APIs present)', () => {
  it('playBeep and notifyPhaseEnd are safe no-ops', () => {
    expect(() => playBeep()).not.toThrow();
    expect(() => notifyPhaseEnd('Done', 'Break time')).not.toThrow();
  });

  it('requestNotificationPermission resolves to denied', async () => {
    await expect(requestNotificationPermission()).resolves.toBe('denied');
  });
});

describe('notify (stubbed platform APIs)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('plays a beep through an oscillator when AudioContext exists', () => {
    const oscillator = {
      connect: vi.fn(), start: vi.fn(), stop: vi.fn(),
      frequency: { value: 0 }, type: 'sine',
    };
    const gain = { connect: vi.fn(), gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() } };
    const ctx = {
      createOscillator: vi.fn(() => oscillator),
      createGain: vi.fn(() => gain),
      destination: {},
      currentTime: 0,
      close: vi.fn(),
    };
    // Must be constructible: playBeep does `new AudioContext()`, and a
    // constructor returning an object substitutes it for `this`.
    vi.stubGlobal('AudioContext', vi.fn(function AudioContextStub() { return ctx; }));

    playBeep();
    expect(ctx.createOscillator).toHaveBeenCalled();
    expect(oscillator.start).toHaveBeenCalled();
  });

  it('shows a Notification only when permission is already granted', () => {
    const constructed: unknown[] = [];
    class FakeNotification {
      static permission: NotificationPermission = 'granted';
      static requestPermission = vi.fn(async () => 'granted' as NotificationPermission);
      constructor(public title: string, public options?: NotificationOptions) {
        constructed.push(this);
      }
    }
    vi.stubGlobal('Notification', FakeNotification);

    notifyPhaseEnd('Focus complete', 'Short break started');
    expect(constructed).toHaveLength(1);

    FakeNotification.permission = 'default';
    notifyPhaseEnd('Focus complete', 'Short break started');
    expect(constructed).toHaveLength(1); // not granted -> no notification
  });

  it('requestNotificationPermission delegates to the API', async () => {
    class FakeNotification {
      static permission: NotificationPermission = 'default';
      static requestPermission = vi.fn(async () => 'granted' as NotificationPermission);
    }
    vi.stubGlobal('Notification', FakeNotification);
    await expect(requestNotificationPermission()).resolves.toBe('granted');
    expect(FakeNotification.requestPermission).toHaveBeenCalled();
  });
});

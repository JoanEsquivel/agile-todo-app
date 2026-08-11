/*
 * The pomodoro's only net-new platform surface, quarantined here and fully
 * feature-detected: jsdom has neither AudioContext nor Notification, and any
 * test that renders App reaches this module through the header widget — so
 * absence of either API must be a silent no-op, never a crash.
 */

/** Two short pips from a WebAudio oscillator — no audio asset, no dependency. */
export function playBeep(): void {
  const Ctx = typeof AudioContext !== 'undefined' ? AudioContext : undefined;
  if (!Ctx) return;
  try {
    const ctx = new Ctx();
    for (const startAt of [0, 0.22]) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 880;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.15, ctx.currentTime + startAt);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startAt + 0.15);
      oscillator.start(ctx.currentTime + startAt);
      oscillator.stop(ctx.currentTime + startAt + 0.15);
    }
  } catch {
    // Audio is best-effort; a blocked or failed context should never break a
    // phase transition.
  }
}

export function notifyPhaseEnd(title: string, body: string): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body });
  } catch {
    // Same stance as audio: notification failure must not break the timer.
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

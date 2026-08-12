import { useEffect, useState } from 'react';
import styles from './VisitorBadge.module.css';

const COUNTER_URL = 'https://agile-todo-app.goatcounter.com/counter/TOTAL.json';
const DASHBOARD_URL = 'https://agile-todo-app.goatcounter.com';

let cachedCount: number | null = null;

/** Test-only seam: clears the module-level session cache between tests. */
export function _resetVisitorBadgeCacheForTests() {
  cachedCount = null;
}

function parseCount(raw: string): number {
  const digits = raw.replace(/\D/g, '');
  return digits === '' ? NaN : Number(digits);
}

export function VisitorBadge() {
  const [count, setCount] = useState<number | null>(cachedCount);

  useEffect(() => {
    if (cachedCount !== null) return;
    const controller = new AbortController();

    fetch(COUNTER_URL, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`unexpected status ${res.status}`);
        return res.json();
      })
      .then((body: { count?: unknown }) => {
        if (typeof body.count !== 'string') throw new Error('malformed body');
        const parsed = parseCount(body.count);
        if (Number.isNaN(parsed)) throw new Error('unparsable count');
        cachedCount = parsed;
        setCount(parsed);
      })
      .catch(() => {
        // Adblocker, offline, or a malformed response — the badge simply
        // doesn't render. A missing vanity metric must never surface as an
        // error in the Help modal.
      });

    return () => controller.abort();
  }, []);

  if (count === null) return null;

  const formatted = new Intl.NumberFormat('en-US').format(count);

  return (
    <a
      className={styles.badge}
      href={DASHBOARD_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${formatted} visits — view public analytics`}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M8 3C4 3 1.5 6 1 8c.5 2 3 5 7 5s6.5-3 7-5c-.5-2-3-5-7-5zm0 8a3 3 0 1 1 0-6 3 3 0 0 1 0 6z" />
        <circle cx="8" cy="8" r="1.5" />
      </svg>
      <span>{formatted} visits</span>
    </a>
  );
}

import styles from './DonateButton.module.css';

const DONATE_URL = 'https://www.paypal.com/paypalme/joanmedia';

export function DonateButton() {
  return (
    <a
      className={styles.donate}
      href={DONATE_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Buy me a coffee"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M2 5h9v5.5A2.5 2.5 0 0 1 8.5 13h-4A2.5 2.5 0 0 1 2 10.5V5z" />
        <path d="M12 6h.5a2.25 2.25 0 0 1 0 4.5H12V9h.5a.75.75 0 0 0 0-1.5H12V6z" />
        <path d="M4.5 1.5h1V4h-1zM7 1.5h1V4H7z" />
      </svg>
      <span className={styles.label}>Buy me a coffee</span>
    </a>
  );
}

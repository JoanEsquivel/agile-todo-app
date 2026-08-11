import styles from './HelpButton.module.css';

/** Header ⓘ button. Dumb on purpose: App owns the modal state, the same
 *  split as PomodoroWidget's onOpenModal. */
export function HelpButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className={styles.button}
      aria-label="Help"
      title="Help — guide & keyboard shortcuts"
      onClick={onClick}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <circle cx="8" cy="8" r="6.8" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="8" cy="4.9" r="0.9" fill="currentColor" />
        <path d="M8 7.2v4.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </button>
  );
}

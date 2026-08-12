import styles from './BackupButton.module.css';

/** Header archive button. Dumb on purpose: App owns the modal state, the
 *  same split as HelpButton and PomodoroWidget. */
export function BackupButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className={styles.button}
      aria-label="Backup"
      title="Backup — export or restore your board"
      onClick={onClick}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <rect x="1.6" y="2.2" width="12.8" height="3.2" rx="0.8" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M2.8 5.4v7.2a.8.8 0 0 0 .8.8h8.8a.8.8 0 0 0 .8-.8V5.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M6.4 8.4h3.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </button>
  );
}

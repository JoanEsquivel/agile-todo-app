import styles from './AuthorLinks.module.css';
import { DonateButton } from './DonateButton';

const LINKEDIN_URL = 'https://www.linkedin.com/in/joanesquivel/';

export function AuthorLinks() {
  return (
    <div className={styles.links}>
      <a
        className={styles.link}
        href={LINKEDIN_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Joan Esquivel on LinkedIn"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M3.3 1.7a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2zM1.9 6h2.8v8.3H1.9zM6.3 6H9v1.1c.4-.7 1.3-1.3 2.6-1.3 2 0 3 1.2 3 3.5v5h-2.8v-4.5c0-1.2-.5-1.8-1.4-1.8-1 0-1.6.7-1.6 1.8v4.5H6.3z" />
        </svg>
      </a>
      <DonateButton />
    </div>
  );
}

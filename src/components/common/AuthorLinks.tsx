import styles from './AuthorLinks.module.css';
import { DonateButton } from './DonateButton';

const LINKEDIN_URL = 'https://www.linkedin.com/in/joanesquivel/';
const SOURCE_URL = 'https://github.com/JoanEsquivel/agile-todo-app';

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
      <a
        className={styles.link}
        href={SOURCE_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Source code on GitHub"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M8 .7a7.3 7.3 0 0 0-2.3 14.2c.4.1.5-.2.5-.4v-1.3c-2 .4-2.5-.9-2.5-.9-.3-.9-.8-1.1-.8-1.1-.7-.5 0-.5 0-.5.8.1 1.2.8 1.2.8.7 1.2 1.8.9 2.2.7 0-.5.3-.9.5-1.1-1.6-.2-3.3-.8-3.3-3.6 0-.8.3-1.5.8-2-.1-.2-.4-1 0-2 0 0 .6-.2 2 .8a7 7 0 0 1 3.7 0c1.4-1 2-.8 2-.8.4 1 .1 1.8 0 2 .5.5.8 1.2.8 2 0 2.8-1.7 3.4-3.3 3.6.3.2.5.7.5 1.4v2c0 .2.1.5.5.4A7.3 7.3 0 0 0 8 .7z" />
        </svg>
      </a>
      <DonateButton />
    </div>
  );
}

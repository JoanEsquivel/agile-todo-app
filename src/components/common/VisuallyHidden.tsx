import type { ReactNode } from 'react';
import styles from './VisuallyHidden.module.css';

/**
 * Content for assistive tech only — clipped to a single pixel rather than
 * `display: none`, so it stays in the accessibility tree while contributing
 * nothing to layout. A component (with its own module, per INV-12's 1:1
 * rule) rather than a shared `.sr-only` class, which would need `:global`.
 */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className={styles.hidden}>{children}</span>;
}

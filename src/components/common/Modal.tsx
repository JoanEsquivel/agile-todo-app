import { useEffect, type ReactNode } from 'react';
import styles from './Modal.module.css';

export function Modal({ title, onClose, children }: {
  title: string; onClose: () => void; children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={styles.overlay}>
      <div className={styles.dialog} role="dialog" aria-label={title} aria-modal="true">
        <header className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button className={styles.closeButton} aria-label="Close" onClick={onClose}>×</button>
        </header>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}

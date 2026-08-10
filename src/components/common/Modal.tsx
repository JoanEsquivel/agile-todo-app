import { useEffect, type ReactNode } from 'react';

export function Modal({ title, onClose, children }: {
  title: string; onClose: () => void; children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div role="dialog" aria-label={title} aria-modal="true">
      <header>
        <h2>{title}</h2>
        <button aria-label="Close" onClick={onClose}>×</button>
      </header>
      {children}
    </div>
  );
}

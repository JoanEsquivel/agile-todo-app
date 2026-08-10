import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './Modal.module.css';

const FOCUSABLE_SELECTOR = ['button', '[href]', 'input', 'select', 'textarea', '[tabindex]:not([tabindex="-1"])']
  .map((s) => `${s}:not([disabled]):not([hidden])`)
  .join(', ');

// Module-level rather than per-instance so nested/sequential modals compose
// correctly: only the first open locks the app, only the last close unlocks
// it. There's no real nested-modal flow in this app today, but the counter
// makes the ordering safe (and cheap) if one is ever added.
let openModalCount = 0;
let inertedSiblings: HTMLElement[] = [];

function lockAppInteraction(overlayEl: HTMLElement) {
  openModalCount += 1;
  if (openModalCount > 1) return;
  // Whatever the modal is portaled next to (#root in production, RTL's own
  // container in tests) -- inert everything that isn't this modal, so
  // Tab/AT can't reach the app underneath. Snapshotting the sibling list
  // here means a second modal opening later doesn't re-inert the first
  // modal's own overlay.
  inertedSiblings = Array.from(document.body.children).filter((el) => el !== overlayEl) as HTMLElement[];
  for (const el of inertedSiblings) el.inert = true;
  document.body.style.overflow = 'hidden';
}

function unlockAppInteraction() {
  openModalCount -= 1;
  if (openModalCount > 0) return;
  for (const el of inertedSiblings) el.inert = false;
  inertedSiblings = [];
  document.body.style.overflow = '';
}

export function Modal({ title, onClose, children }: {
  title: string; onClose: () => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const overlayEl = ref.current?.parentElement;
    if (overlayEl) lockAppInteraction(overlayEl);
    ref.current?.focus();

    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !ref.current) return;
      const focusables = ref.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
    };
    window.addEventListener('keydown', trap);

    return () => {
      window.removeEventListener('keydown', trap);
      unlockAppInteraction();
      // Un-inert BEFORE restoring focus, not after: a real browser refuses
      // to focus an element inside an inert subtree, so restoring focus
      // first would silently drop it to <body>. jsdom doesn't enforce
      // `inert`, so this ordering isn't something a test can catch --
      // it matters anyway.
      prev?.focus();
    };
  }, []);

  return createPortal(
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.dialog} role="dialog" aria-labelledby={titleId} aria-modal="true" ref={ref} tabIndex={-1}>
        <header className={styles.header}>
          <h2 id={titleId} className={styles.title}>{title}</h2>
          <button className={styles.closeButton} aria-label="Close" onClick={onClose}>×</button>
        </header>
        <div className={styles.body}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}

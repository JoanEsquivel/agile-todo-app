import { createPortal } from 'react-dom';
import { useAppStore } from '../../store/store';
import styles from './Announcer.module.css';

/**
 * Polite live region for status announcements (day changes, add/delete,
 * copy). Portaled to document.body as a sibling of the app root, not a
 * descendant: `inert` cascades to an entire subtree with no way for a
 * nested element to opt back out, so if this lived inside the app tree it
 * would go silent every time Modal marks that tree inert. `data-live-region`
 * is how Modal's lock knows to skip it when inerting "everything else".
 *
 * role="status", never role="alert" — an unqualified `findByRole('alert')`
 * elsewhere in the suite would become ambiguous the moment this also used it.
 */
export function Announcer() {
  const message = useAppStore((s) => s.announcement);
  return createPortal(
    <span data-live-region="" role="status" aria-live="polite" aria-label="Announcements" className={styles.hidden}>
      {message}
    </span>,
    document.body,
  );
}

import { useRef } from 'react';
import { Modal } from './Modal';
import styles from './ConfirmDialog.module.css';

export function ConfirmDialog({
  title, message, confirmLabel, onConfirm, onCancel,
}: {
  title: string; message: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void;
}) {
  // Focus defaults to Cancel, not the (typically destructive) confirm
  // action -- confirming should always be a deliberate second step.
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Modal title={title} onClose={onCancel} initialFocusRef={cancelRef}>
      <p className={styles.message}>{message}</p>
      <div className={styles.actions}>
        <button ref={cancelRef} onClick={onCancel}>Cancel</button>
        <button className={styles.confirmButton} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </Modal>
  );
}

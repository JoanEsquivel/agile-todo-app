import styles from './EmptyState.module.css';

export function EmptyState({ message }: { message: string }) {
  return <p className={styles.empty} role="status">{message}</p>;
}

import type { Priority } from '../../domain/types';
import styles from './PriorityBadge.module.css';

const LABEL: Record<Priority, string> = { high: 'High', medium: 'Medium', low: 'Low' };

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={styles.badge} data-priority={priority}>{LABEL[priority]}</span>;
}

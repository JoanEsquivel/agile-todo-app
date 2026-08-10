import type { Priority } from '../../domain/types';

const LABEL: Record<Priority, string> = { high: 'High', medium: 'Medium', low: 'Low' };

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span data-priority={priority}>{LABEL[priority]}</span>;
}

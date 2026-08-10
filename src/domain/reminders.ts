import type { Todo } from './types';

export function partitionReminders(
  todos: Record<string, Todo>,
  now: Date,
): { overdue: Todo[]; upcoming: Todo[] } {
  const withReminder = Object.values(todos)
    .filter((t) => !t.done && t.reminderAt !== undefined)
    .sort((a, b) => a.reminderAt!.localeCompare(b.reminderAt!));
  return {
    overdue: withReminder.filter((t) => new Date(t.reminderAt!) <= now),
    upcoming: withReminder.filter((t) => new Date(t.reminderAt!) > now),
  };
}

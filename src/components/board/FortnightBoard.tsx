import { DayColumn } from './DayColumn';
import { RemindersPanel } from '../reminders/RemindersPanel';
import styles from './FortnightBoard.module.css';

export function FortnightBoard() {
  return (
    <main id="main" className={styles.board}>
      <DayColumn />
      <RemindersPanel />
    </main>
  );
}

import { DayStrip } from './DayStrip';
import { DayColumn } from './DayColumn';
import styles from './FortnightBoard.module.css';

export function FortnightBoard() {
  return (
    <main id="main" className={styles.board}>
      <DayStrip />
      <DayColumn />
    </main>
  );
}

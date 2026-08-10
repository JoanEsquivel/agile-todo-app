import { FortnightTape } from './FortnightTape';
import { DayColumn } from './DayColumn';
import styles from './FortnightBoard.module.css';

export function FortnightBoard() {
  return (
    <main id="main" className={styles.board}>
      <FortnightTape />
      <DayColumn />
    </main>
  );
}

import { useAppStore } from './store/store';
import { selectViewedFortnight } from './store/selectors';
import { formatDayLabel } from './domain/dates';
import { FortnightBoard } from './components/board/FortnightBoard';
import { RemindersPanel } from './components/reminders/RemindersPanel';
import styles from './App.module.css';

export default function App() {
  const state = useAppStore();
  const fn = selectViewedFortnight(state);
  return (
    <>
      <header className={styles.header}>
        <h1>Agile Todo</h1>
        {fn && <p>{formatDayLabel(fn.days[0])} – {formatDayLabel(fn.days[9])}</p>}
      </header>
      <FortnightBoard />
      <RemindersPanel />
    </>
  );
}

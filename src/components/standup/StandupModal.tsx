import { useState } from 'react';
import { useAppStore } from '../../store/store';
import { buildStandup, formatStandup } from '../../domain/standup';
import { todayLocal } from '../../store/clock';
import { Modal } from '../common/Modal';
import styles from './StandupModal.module.css';

export function StandupModal({ onClose }: { onClose: () => void }) {
  const { todos, notes, activeFortnightId } = useAppStore();
  const [copied, setCopied] = useState(false);
  const data = buildStandup(todos, notes, activeFortnightId!, todayLocal());

  const copy = async () => {
    await navigator.clipboard.writeText(formatStandup(data));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const section = (title: string, lines: string[]) => (
    <section className={styles.section}>
      <h3 className={styles.sectionLabel}>{title}</h3>
      <ul className={styles.list}>
        {lines.length ? lines.map((l, i) => <li key={i} className={styles.item}>{l}</li>) : <li className={styles.empty}>None</li>}
      </ul>
    </section>
  );

  return (
    <Modal title="Daily standup" onClose={onClose}>
      {section('Yesterday', data.yesterday.map((t) => t.title))}
      <section className={styles.section}>
        <h3 className={styles.sectionLabel}>Today</h3>
        <ul className={styles.list}>
          {data.today.length ? (
            data.today.map((t) => (
              <li key={t.id} className={styles.item}>{t.done ? <s>{t.title}</s> : t.title}</li>
            ))
          ) : (
            <li className={styles.empty}>None</li>
          )}
        </ul>
      </section>
      {section('Blockers', data.blockers.map((n) => n.text))}
      <button className={styles.copyButton} onClick={copy}>{copied ? 'Copied!' : 'Copy to clipboard'}</button>
    </Modal>
  );
}

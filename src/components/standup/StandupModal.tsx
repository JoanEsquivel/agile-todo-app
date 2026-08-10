import { useState } from 'react';
import { useAppStore } from '../../store/store';
import { buildStandup, formatStandup } from '../../domain/standup';
import { todayLocal } from '../../store/clock';
import { Modal } from '../common/Modal';

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
    <section>
      <h3>{title}</h3>
      <ul>{lines.length ? lines.map((l, i) => <li key={i}>{l}</li>) : <li>None</li>}</ul>
    </section>
  );

  return (
    <Modal title="Daily standup" onClose={onClose}>
      {section('Yesterday', data.yesterday.map((t) => t.title))}
      <section>
        <h3>Today</h3>
        <ul>
          {data.today.length ? (
            data.today.map((t) => (
              <li key={t.id}>{t.done ? <s>{t.title}</s> : t.title}</li>
            ))
          ) : (
            <li>None</li>
          )}
        </ul>
      </section>
      {section('Blockers', data.blockers.map((n) => n.text))}
      <button onClick={copy}>{copied ? 'Copied!' : 'Copy to clipboard'}</button>
    </Modal>
  );
}

import { Clock3, MessageSquare } from 'lucide-react';
import type { GameHistory } from '../types';

interface HistoryListProps {
  items: GameHistory[];
}

export function HistoryList({ items }: HistoryListProps): JSX.Element {
  return (
    <section className="panel history-panel" aria-labelledby="history-title">
      <div>
        <h2 id="history-title">Historial arcade</h2>
        <p>Partidas jugadas y mensajes guardados.</p>
      </div>

      {items.length === 0 ? (
        <div className="empty-state">Todavia no jugaste ninguna partida.</div>
      ) : (
        <ul className="history-list">
          {items.map((item) => (
            <li key={item.id}>
              <div>
                <strong>{item.code}</strong>
                <span>
                  <Clock3 size={14} aria-hidden="true" />
                  {new Intl.DateTimeFormat('es', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  }).format(new Date(item.startedAt))}
                </span>
              </div>
              <span>
                <MessageSquare size={14} aria-hidden="true" />
                {item.messages.length}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

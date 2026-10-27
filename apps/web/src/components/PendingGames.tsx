import { RefreshCw, Users } from 'lucide-react';
import type { GameState } from '../types';

interface PendingGamesProps {
  games: GameState[];
  loading: boolean;
  onRefresh: () => void;
  onSelectCode: (code: string) => void;
}

export function PendingGames({
  games,
  loading,
  onRefresh,
  onSelectCode,
}: PendingGamesProps): JSX.Element {
  return (
    <section className="panel pending-panel" aria-labelledby="pending-title">
      <div className="panel-heading">
        <div>
          <h2 id="pending-title">Salas abiertas</h2>
          <p>Lobbies esperando jugadores. Unite con un toque.</p>
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label="Actualizar pendientes"
          title="Actualizar pendientes"
          onClick={onRefresh}
          disabled={loading}
        >
          <RefreshCw size={18} aria-hidden="true" />
        </button>
      </div>

      {games.length === 0 ? (
        <div className="empty-state">No hay salas abiertas ahora mismo.</div>
      ) : (
        <ul className="pending-list">
          {games.map((game) => (
            <li className="pending-item" key={game.code}>
              <div>
                <strong>{game.code}</strong>
                <span>
                  <Users size={15} aria-hidden="true" />
                  {game.players.length}/2
                </span>
              </div>
              <button
                className="button compact"
                type="button"
                onClick={() => onSelectCode(game.code)}
              >
                Usar codigo
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

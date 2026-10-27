import { Check, Copy, Loader2, Play, UserPlus, X } from 'lucide-react';
import { useState } from 'react';
import type { GamePlayer, GameState } from '../types';

interface LobbyProps {
  game: GameState | null;
  player: GamePlayer | null;
  loading: boolean;
  connected: boolean;
  onStart: () => Promise<void>;
  onLeave: () => void;
}

const SLOT_COLORS = ['#38bdf8', '#f43f5e'];

function PlayerSlot({
  gamePlayer,
  index,
}: {
  gamePlayer: GamePlayer;
  index: number;
}): JSX.Element {
  return (
    <li className="player-slot">
      <span
        className="slot-avatar"
        style={{ background: SLOT_COLORS[index] ?? '#38bdf8' }}
        aria-hidden="true"
      >
        {gamePlayer.name.trim().charAt(0).toUpperCase() || '?'}
      </span>
      <div className="slot-info">
        <strong>{gamePlayer.name}</strong>
        <span>{gamePlayer.isHost ? 'Anfitrion' : 'Jugador'}</span>
      </div>
      <span className="slot-ready">
        <Check size={16} aria-hidden="true" />
        Listo
      </span>
    </li>
  );
}

export function Lobby({
  game,
  player,
  loading,
  connected,
  onStart,
  onLeave,
}: LobbyProps): JSX.Element | null {
  const [copied, setCopied] = useState(false);

  if (!game || !player) {
    return null;
  }

  const isHost = player.id === game.hostPlayerId;
  const playerCount = game.players.length;
  const canStart = isHost && playerCount === 2;
  const waitingForGuest = playerCount < 2;
  const gameCode = game.code;

  async function copyCode(): Promise<void> {
    await navigator.clipboard.writeText(gameCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  let statusNote: string;
  if (!connected) {
    statusNote = 'Conectando con la sala...';
  } else if (waitingForGuest) {
    statusNote = 'Esperando al segundo jugador...';
  } else if (!isHost) {
    statusNote = 'Listo. Esperando que el anfitrion inicie la partida.';
  } else {
    statusNote = 'Sala completa. Arranca cuando quieras.';
  }

  return (
    <div className="screen lobby-screen">
      <section className="waiting-room" aria-labelledby="waiting-title">
        <header className="waiting-header">
          <div>
            <p className="waiting-kicker">Sala de espera</p>
            <h1 id="waiting-title">Lobby {game.code}</h1>
          </div>
          <button
            className="icon-button dark"
            type="button"
            aria-label="Salir del lobby"
            title="Salir del lobby"
            onClick={onLeave}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="waiting-code-block">
          <p className="code-label">Comparti este codigo con tu rival</p>
          <div className="code-display">
            <span className="room-code">{game.code}</span>
            <button
              className={`copy-code-btn ${copied ? 'is-copied' : ''}`}
              type="button"
              onClick={copyCode}
            >
              {copied ? (
                <Check size={20} aria-hidden="true" />
              ) : (
                <Copy size={20} aria-hidden="true" />
              )}
              <span>{copied ? 'Copiado' : 'Copiar'}</span>
            </button>
          </div>
        </div>

        <ul className="player-slots">
          {game.players.map((gamePlayer, index) => (
            <PlayerSlot
              key={gamePlayer.id}
              gamePlayer={gamePlayer}
              index={index}
            />
          ))}

          {waitingForGuest ? (
            <li className="player-slot empty">
              <span className="slot-avatar waiting" aria-hidden="true">
                <Loader2 size={22} className="slot-spinner" />
              </span>
              <div className="slot-info">
                <strong>Esperando jugador</strong>
                <span>El segundo jugador entra con el codigo</span>
              </div>
              <UserPlus size={20} className="slot-ghost-icon" aria-hidden="true" />
            </li>
          ) : null}
        </ul>

        <footer className="waiting-footer">
          <div className="waiting-status">
            <span
              className={`status-dot ${connected ? 'online' : 'offline'}`}
              aria-hidden="true"
            />
            <span>{statusNote}</span>
          </div>

          {isHost ? (
            <button
              className="button primary big"
              type="button"
              disabled={!canStart || loading}
              onClick={onStart}
            >
              <Play size={18} aria-hidden="true" />
              {loading ? 'Iniciando...' : 'Iniciar partida'}
            </button>
          ) : (
            <span className="waiting-note">
              {waitingForGuest ? 'Todavia no podes jugar' : 'Espera al anfitrion'}
            </span>
          )}
        </footer>
      </section>
    </div>
  );
}

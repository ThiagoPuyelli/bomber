import { Bomb, LogIn, Plus, Swords } from 'lucide-react';
import { useState } from 'react';
import type { GameHistory, GameState } from '../types';
import { CreateGameForm } from './CreateGameForm';
import { HistoryList } from './HistoryList';
import { JoinGameForm } from './JoinGameForm';
import { PendingGames } from './PendingGames';

interface HomeScreenProps {
  username: string;
  loading: boolean;
  codeHint: string;
  pendingGames: GameState[];
  historyItems: GameHistory[];
  onCreate: () => Promise<void>;
  onJoin: (code: string) => Promise<void>;
  onLogout: () => void;
  onSelectCode: (code: string) => void;
  onRefresh: () => void;
}

type MenuMode = 'create' | 'join';

export function HomeScreen({
  loading,
  username,
  codeHint,
  pendingGames,
  historyItems,
  onCreate,
  onJoin,
  onLogout,
  onSelectCode,
  onRefresh,
}: HomeScreenProps): JSX.Element {
  const [mode, setMode] = useState<MenuMode | null>(null);

  function handleToggle(nextMode: MenuMode): void {
    setMode((current) => (current === nextMode ? null : nextMode));
  }

  function handleSelectPending(code: string): void {
    onSelectCode(code);
    setMode('join');
  }

  return (
    <div className="screen home-screen">
      <header className="home-hero">
        <button className="button ghost auth-logout" type="button" onClick={onLogout}>
          {username} · Cerrar sesión
        </button>
        <div className="hero-emblem" aria-hidden="true">
          <Bomb size={42} strokeWidth={2.4} />
        </div>
        <p className="hero-kicker">
          <Swords size={14} aria-hidden="true" />
          Arcade 1v1 · Partidas por codigo
        </p>
        <h1 className="hero-title">
          Crea tu lobby de <span className="title-accent">bomberman</span>
        </h1>
        <p className="hero-subtitle">
          Abrí una sala, pasale el codigo a tu rival y explota las cajas hasta
          quedarte con el mapa.
        </p>
      </header>

      <div className="menu-row">
        <button
          className={`menu-card menu-card-create ${mode === 'create' ? 'is-active' : ''}`}
          type="button"
          onClick={() => handleToggle('create')}
        >
          <span className="menu-card-icon" aria-hidden="true">
            <Plus size={30} strokeWidth={2.6} />
          </span>
          <span className="menu-card-title">Crear lobby</span>
          <span className="menu-card-desc">
            Genera un codigo y espera al segundo jugador.
          </span>
        </button>

        <button
          className={`menu-card menu-card-join ${mode === 'join' ? 'is-active' : ''}`}
          type="button"
          onClick={() => handleToggle('join')}
        >
          <span className="menu-card-icon" aria-hidden="true">
            <LogIn size={30} strokeWidth={2.6} />
          </span>
          <span className="menu-card-title">Unirse a una sala</span>
          <span className="menu-card-desc">
            Ingresa el codigo de la partida y juega con tu username.
          </span>
        </button>
      </div>

      <div className="home-forms">
        {mode === 'create' ? (
          <CreateGameForm loading={loading} onCreate={onCreate} />
        ) : null}
        {mode === 'join' ? (
          <JoinGameForm
            codeHint={codeHint}
            loading={loading}
            onJoin={onJoin}
          />
        ) : null}
        {mode === null ? (
          <p className="menu-hint">Elegi una opcion para arrancar.</p>
        ) : null}
      </div>

      <div className="home-panels">
        <PendingGames
          games={pendingGames}
          loading={loading}
          onRefresh={onRefresh}
          onSelectCode={handleSelectPending}
        />
        <HistoryList items={historyItems} />
      </div>
    </div>
  );
}

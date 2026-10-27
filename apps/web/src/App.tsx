import { Bomb, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  createGame,
  getGame,
  getHistory,
  getPendingGames,
  joinGame,
  getCurrentUser,
  login,
  logout,
  register,
  startGame,
} from './api';
import { ChatRoom } from './components/ChatRoom';
import { GameMap } from './components/GameMap';
import { HomeScreen } from './components/HomeScreen';
import { AuthScreen } from './components/AuthScreen';
import { Lobby } from './components/Lobby';
import { useGameSocket } from './hooks/useGameSocket';
import type { AuthUser, GameHistory, GamePlayer, GameState } from './types';

const SESSION_KEY = 'bomber-real-session';

interface StoredSession {
  game: GameState;
  player: GamePlayer;
}

function readStoredSession(): StoredSession | null {
  const rawSession = window.localStorage.getItem(SESSION_KEY);

  if (!rawSession) {
    return null;
  }

  try {
    return JSON.parse(rawSession) as StoredSession;
  } catch {
    window.localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

type ScreenName = 'home' | 'lobby' | 'game';

function BootScreen(): JSX.Element {
  return (
    <div className="screen boot-screen">
      <div className="boot-emblem">
        <Bomb size={56} aria-hidden="true" />
      </div>
      <h1 className="boot-title">BOMBER REAL</h1>
      <p>Validando tu ultima sala...</p>
      <div className="boot-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

export function App(): JSX.Element {
  const [booting, setBooting] = useState(true);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [currentGame, setCurrentGame] = useState<GameState | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<GamePlayer | null>(null);
  const [pendingGames, setPendingGames] = useState<GameState[]>([]);
  const [historyItems, setHistoryItems] = useState<GameHistory[]>([]);
  const [selectedCode, setSelectedCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const persistSession = useCallback(
    (game: GameState, player: GamePlayer): void => {
      window.localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ game, player }),
      );
      setCurrentGame(game);
      setCurrentPlayer(player);
    },
    [],
  );

  const handleSessionInvalid = useCallback(() => {
    window.localStorage.removeItem(SESSION_KEY);
    setCurrentGame(null);
    setCurrentPlayer(null);
    setError('Esa partida ya no existe. Crea o unite a una sala nueva.');
  }, []);

  const handleSocketGameUpdate = useCallback(
    (updatedGame: GameState) => {
      setCurrentGame(updatedGame);
      if (currentPlayer) {
        persistSession(updatedGame, currentPlayer);
      }
    },
    [currentPlayer, persistSession],
  );

  const socket = useGameSocket(
    currentGame,
    currentPlayer,
    handleSocketGameUpdate,
    handleSessionInvalid,
  );

  useEffect(() => {
    let cancelled = false;
    void getCurrentUser()
      .then((user) => {
        if (!cancelled) setCurrentUser(user);
      })
      .catch(() => {
        if (!cancelled) setCurrentUser(null);
      })
      .finally(() => {
        if (!cancelled) setBooting(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Restore a room only after the server confirms the account session.
  useEffect(() => {
    if (!currentUser) return;
    const storedSession = readStoredSession();

    if (!storedSession) {
      return;
    }

    let cancelled = false;

    void getGame(storedSession.game.code)
      .then((game) => {
        if (cancelled) {
          return;
        }

        const playerStillIn = game.players.some(
          (gamePlayer) => gamePlayer.id === storedSession.player.id,
        );

        if (playerStillIn) {
          setCurrentGame(game);
          setCurrentPlayer(storedSession.player);
        } else {
          window.localStorage.removeItem(SESSION_KEY);
        }
      })
      .catch(() => {
        if (!cancelled) {
          window.localStorage.removeItem(SESSION_KEY);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBooting(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  const loadPendingGames = useCallback(async (): Promise<void> => {
    const games = await getPendingGames();
    setPendingGames(games);
  }, []);

  const loadHistory = useCallback(async (): Promise<void> => {
    const history = await getHistory();
    setHistoryItems(history);
  }, []);

  const screen: ScreenName =
    currentGame && currentPlayer
      ? currentGame.status === 'started'
        ? 'game'
        : 'lobby'
      : 'home';

  useEffect(() => {
    if (screen !== 'home') {
      return;
    }

    void loadPendingGames().catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : 'Error');
    });
    void loadHistory().catch(() => undefined);

    const interval = window.setInterval(() => {
      void loadPendingGames().catch(() => undefined);
    }, 3000);

    return () => window.clearInterval(interval);
  }, [screen, loadHistory, loadPendingGames]);

  useEffect(() => {
    if (!currentGame || !currentPlayer || currentGame.status !== 'pending') {
      return;
    }

    const interval = window.setInterval(() => {
      void getGame(currentGame.code)
        .then((game) => {
          setCurrentGame(game);
          window.localStorage.setItem(
            SESSION_KEY,
            JSON.stringify({ game, player: currentPlayer }),
          );
        })
        .catch(() => undefined);
    }, 2000);

    return () => window.clearInterval(interval);
  }, [currentGame, currentPlayer]);

  async function runAction(action: () => Promise<void>): Promise<void> {
    setLoading(true);
    setError(null);

    try {
      await action();
    } catch (actionError) {
      setError(
        actionError instanceof Error ? actionError.message : 'Error inesperado',
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(): Promise<void> {
    await runAction(async () => {
      const result = await createGame();
      persistSession(result.game, result.player);
      setSelectedCode(result.game.code);
    });
  }

  async function handleJoin(code: string): Promise<void> {
    await runAction(async () => {
      const result = await joinGame(code);
      persistSession(result.game, result.player);
      setSelectedCode(result.game.code);
    });
  }

  async function handleStart(): Promise<void> {
    if (!currentGame || !currentPlayer) {
      return;
    }

    await runAction(async () => {
      const game = await startGame(currentGame.code);
      persistSession(game, currentPlayer);
    });
  }

  function handleLeave(): void {
    window.localStorage.removeItem(SESSION_KEY);
    setCurrentGame(null);
    setCurrentPlayer(null);
    setSelectedCode('');
    setError(null);
  }

  async function handleLogin(loginValue: string, password: string): Promise<void> {
    await runAction(async () => {
      const user = await login(loginValue, password);
      setCurrentUser(user);
      setError(null);
    });
  }

  async function handleRegister(username: string, email: string, password: string): Promise<void> {
    await runAction(async () => {
      const user = await register(username, email, password);
      setCurrentUser(user);
      setError(null);
    });
  }

  async function handleLogout(): Promise<void> {
    await logout().catch(() => undefined);
    window.localStorage.removeItem(SESSION_KEY);
    setCurrentGame(null);
    setCurrentPlayer(null);
    setCurrentUser(null);
    setError(null);
  }

  if (booting) {
    return <BootScreen />;
  }

  if (!currentUser) {
    return (
      <AuthScreen
        loading={loading}
        error={error}
        onLogin={handleLogin}
        onRegister={handleRegister}
      />
    );
  }

  return (
    <div className="app-root">
      {error ? (
        <div className="toast-stack" role="alert">
          <div className="error-banner">
            <span>{error}</span>
            <button
              type="button"
              className="banner-dismiss"
              aria-label="Cerrar aviso"
              onClick={() => setError(null)}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}

      {screen === 'home' ? (
        <HomeScreen
          username={currentUser.username}
          loading={loading}
          codeHint={selectedCode}
          pendingGames={pendingGames}
          historyItems={historyItems}
          onCreate={handleCreate}
          onJoin={handleJoin}
          onLogout={() => void handleLogout()}
          onSelectCode={setSelectedCode}
          onRefresh={() => {
            void loadPendingGames().catch((loadError: unknown) => {
              setError(
                loadError instanceof Error ? loadError.message : 'Error',
              );
            });
          }}
        />
      ) : null}

      {screen === 'lobby' && currentGame && currentPlayer ? (
        <Lobby
          game={currentGame}
          player={currentPlayer}
          loading={loading}
          connected={socket.connected}
          onStart={handleStart}
          onLeave={handleLeave}
        />
      ) : null}

      {screen === 'game' && currentGame && currentPlayer ? (
        <div className="screen game-screen">
          <div className="game-topbar">
            <span className="game-room-label">
              SALA <strong>{currentGame.code}</strong>
            </span>
            <span
              className={`status-pill ${socket.connected ? 'online' : 'offline'}`}
            >
              {socket.connected ? 'En vivo' : 'Reconectando...'}
            </span>
            <button
              className="button ghost"
              type="button"
              onClick={handleLeave}
            >
              Abandonar
            </button>
          </div>

          <div className="game-grid">
            <GameMap
              game={currentGame}
              player={currentPlayer}
              positions={socket.positions}
              arena={socket.arena}
              connected={socket.connected}
              lastPowerUp={socket.lastPowerUpEvent}
              onMove={socket.sendMove}
              onPlaceBomb={socket.placeBomb}
              onRematch={socket.requestRematch}
            />

            <ChatRoom
              game={currentGame}
              player={currentPlayer}
              connected={socket.connected}
              messages={socket.messages}
              socketError={socket.error}
              onSendMessage={socket.sendMessage}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

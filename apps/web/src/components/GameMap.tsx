import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bomb,
  Flame,
  Gamepad2,
  Radio,
  RotateCcw,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { soundManager } from '../utils/audio';
import { resolvePlayerDisplay } from '../utils/playerView';
import type {
  GameArenaState,
  GamePlayer,
  GameState,
  MoveDirection,
  PlayerPosition,
  PowerUpCollectedPayload,
  PowerUpType,
} from '../types';

interface GameMapProps {
  game: GameState;
  player: GamePlayer;
  positions: Record<string, PlayerPosition>;
  arena: GameArenaState | null;
  connected: boolean;
  lastPowerUp?: PowerUpCollectedPayload | null;
  onMove: (direction: MoveDirection) => void;
  onPlaceBomb: () => void;
  onRematch: () => void;
}

interface PickupToast {
  id: string;
  text: string;
  type: PowerUpType;
  x: number;
  y: number;
}

const COLS = 15;
const ROWS = 11;
const TILE_SIZE = 40;
const MOVE_INTERVAL_MS = 120; // Smooth tick rate when key is held down

export function GameMap({
  game,
  player,
  positions,
  arena,
  connected,
  lastPowerUp,
  onMove,
  onPlaceBomb,
  onRematch,
}: GameMapProps): JSX.Element {
  const [activeKeys, setActiveKeys] = useState<Record<string, boolean>>({});
  const [pickupToasts, setPickupToasts] = useState<PickupToast[]>([]);
  const [isMuted, setIsMuted] = useState(() => soundManager.isMuted());
  const pressedKeysRef = useRef<Set<string>>(new Set());
  const moveIntervalRef = useRef<number | null>(null);
  const lastProcessedPuRef = useRef<string | null>(null);

  const localPos = positions[player.id];
  const localDisplay = localPos
    ? resolvePlayerDisplay(localPos, arena?.tileSize ?? TILE_SIZE)
    : null;
  const isHost = player.id === game.hostPlayerId;
  const otherPlayer = game.players.find((p) => p.id !== player.id);
  const otherPos = otherPlayer ? positions[otherPlayer.id] : null;

  // Track pickup toasts when an item is collected
  useEffect(() => {
    if (!lastPowerUp) return;
    if (lastProcessedPuRef.current === lastPowerUp.powerUpId) return;
    lastProcessedPuRef.current = lastPowerUp.powerUpId;

    const collectorPos = positions[lastPowerUp.playerId];
    const collectorDisplay = collectorPos
      ? resolvePlayerDisplay(collectorPos, arena?.tileSize ?? TILE_SIZE)
      : null;
    const x = collectorDisplay?.x ?? (COLS * TILE_SIZE) / 2;
    const y = collectorDisplay?.y ?? (ROWS * TILE_SIZE) / 2;

    const newToast: PickupToast = {
      id: `${lastPowerUp.powerUpId}-${Date.now()}`,
      text: lastPowerUp.type === 'BOMB_UP' ? '+1 BOMBA!' : '+1 ALCANCE!',
      type: lastPowerUp.type,
      x,
      y,
    };

    setPickupToasts((prev) => [...prev.slice(-3), newToast]);

    const timer = window.setTimeout(() => {
      setPickupToasts((prev) => prev.filter((t) => t.id !== newToast.id));
    }, 1400);

    return () => window.clearTimeout(timer);
  }, [lastPowerUp]);

  const handleToggleSound = () => {
    const next = soundManager.toggleMute();
    setIsMuted(next);
  };

  const getDirectionFromKey = (key: string): MoveDirection | null => {
    switch (key.toLowerCase()) {
      case 'w':
      case 'arrowup':
        return 'UP';
      case 's':
      case 'arrowdown':
        return 'DOWN';
      case 'a':
      case 'arrowleft':
        return 'LEFT';
      case 'd':
      case 'arrowright':
        return 'RIGHT';
      default:
        return null;
    }
  };

  const getActiveDirection = useCallback((): MoveDirection | null => {
    const keys = Array.from(pressedKeysRef.current);
    for (let i = keys.length - 1; i >= 0; i -= 1) {
      const dir = getDirectionFromKey(keys[i]);
      if (dir) return dir;
    }
    return null;
  }, []);

  const startMovementLoop = useCallback(() => {
    if (moveIntervalRef.current !== null) return;

    moveIntervalRef.current = window.setInterval(() => {
      const dir = getActiveDirection();
      if (dir) {
        onMove(dir);
      } else {
        if (moveIntervalRef.current !== null) {
          window.clearInterval(moveIntervalRef.current);
          moveIntervalRef.current = null;
        }
      }
    }, MOVE_INTERVAL_MS);
  }, [getActiveDirection, onMove]);

  const stopMovementLoop = useCallback(() => {
    if (moveIntervalRef.current !== null) {
      window.clearInterval(moveIntervalRef.current);
      moveIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.code === 'Space') {
        event.preventDefault();
        onPlaceBomb();
        setActiveKeys((prev) => ({ ...prev, Space: true }));
        return;
      }

      const key = event.key.toLowerCase();
      const direction = getDirectionFromKey(key);

      if (direction) {
        event.preventDefault();

        // If key wasn't held yet, send immediate move on frame 0
        if (!pressedKeysRef.current.has(key)) {
          pressedKeysRef.current.add(key);
          onMove(direction);
          setActiveKeys((prev) => ({ ...prev, [direction]: true }));
        }

        startMovementLoop();
      }
    }

    function handleKeyUp(event: KeyboardEvent): void {
      if (event.code === 'Space') {
        setActiveKeys((prev) => ({ ...prev, Space: false }));
        return;
      }

      const key = event.key.toLowerCase();
      const direction = getDirectionFromKey(key);

      if (direction) {
        pressedKeysRef.current.delete(key);
        setActiveKeys((prev) => ({ ...prev, [direction]: false }));

        if (pressedKeysRef.current.size === 0) {
          stopMovementLoop();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      stopMovementLoop();
    };
  }, [onMove, onPlaceBomb, startMovementLoop, stopMovementLoop]);

  // Fallback defaults: si el servidor aún no mandó posiciones, el frontend
  // deriva casilla/píxel/color por slot (host o guest) de forma independiente.
  const hostPlayer = game.players.find((p) => p.id === game.hostPlayerId);
  const hostPosition = positions[game.hostPlayerId] || {
    playerId: game.hostPlayerId,
    isHost: true,
    col: 1,
    row: 1,
    alive: true,
    maxBombs: 1,
    bombRange: 1,
    playerName: hostPlayer?.name || 'Host',
  };
  const hostDisplay = resolvePlayerDisplay(
    hostPosition,
    arena?.tileSize ?? TILE_SIZE,
  );

  const guestPlayer = game.players.find((p) => p.id !== game.hostPlayerId);
  const guestPosition = guestPlayer
    ? positions[guestPlayer.id] || {
        playerId: guestPlayer.id,
        isHost: false,
        col: 13,
        row: 9,
        alive: true,
        maxBombs: 1,
        bombRange: 1,
        playerName: guestPlayer.name,
      }
    : null;
  const guestDisplay = guestPosition
    ? resolvePlayerDisplay(guestPosition, arena?.tileSize ?? TILE_SIZE)
    : null;

  // Virtual buttons continuous hold handlers
  const handleVirtualPressStart = (direction: MoveDirection) => {
    pressedKeysRef.current.add(direction);
    onMove(direction);
    setActiveKeys((prev) => ({ ...prev, [direction]: true }));
    startMovementLoop();
  };

  const handleVirtualPressEnd = (direction: MoveDirection) => {
    pressedKeysRef.current.delete(direction);
    setActiveKeys((prev) => ({ ...prev, [direction]: false }));
    if (pressedKeysRef.current.size === 0) {
      stopMovementLoop();
    }
  };

  const isGameOver = arena?.gameOver;
  const isWinner = isGameOver && arena?.winnerId === player.id;
  const isLoser = isGameOver && arena?.loserId === player.id;

  // Player live stats calculations
  const localActiveBombs = arena?.bombs
    ? Object.values(arena.bombs).filter((b) => b.playerId === player.id).length
    : 0;
  const localMaxBombs = localPos?.maxBombs ?? 1;
  const localBombRange = localPos?.bombRange ?? 1;
  const availableBombs = Math.max(0, localMaxBombs - localActiveBombs);

  return (
    <section className="panel arena-panel" aria-labelledby="arena-title">
      <div className="arena-header">
        <div className="arena-title-group">
          <div className="arena-badge">
            <Gamepad2 size={18} aria-hidden="true" />
            <h2 id="arena-title">Arena Bomber (Matriz 15x11)</h2>
          </div>
          <p className="arena-subtitle">
            Usa <strong>W, A, S, D</strong> para moverte | <strong>ESPACIO</strong> para bomba | Rompe cajas para conseguir <strong>mejoras</strong>.
          </p>
        </div>

        <div className="arena-stats">
          <div className="arena-stat-item">
            <span className={`status-pill ${connected ? 'online' : 'offline'}`}>
              <Radio size={14} className="pulse-icon" />
              {connected ? 'En vivo' : 'Reconectando...'}
            </span>
          </div>

          <button
            type="button"
            className="sound-toggle-btn"
            onClick={handleToggleSound}
            title={isMuted ? 'Activar sonido arcade' : 'Silenciar sonido'}
            aria-label={isMuted ? 'Activar sonido' : 'Silenciar sonido'}
          >
            {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            <span>{isMuted ? 'Mudo' : 'Sonido'}</span>
          </button>

          {localPos && localDisplay && (
            <div className="coords-pill">
              <span>Casilla:</span>
              <strong>
                Col {localDisplay.col}, Fila {localDisplay.row}
              </strong>
            </div>
          )}

          {/* Upgrades HUD pills */}
          <div className="upgrades-hud" aria-label="Tus estadísticas de combate">
            <div
              className={`upgrade-pill upgrade-pill-bomb ${availableBombs === 0 ? 'is-empty' : ''}`}
              title="Bombas disponibles y capacidad máxima simultánea"
            >
              <Bomb size={14} className="pill-icon" />
              <span className="pill-label">Bombas:</span>
              <strong>
                {availableBombs}/{localMaxBombs}
              </strong>
            </div>

            <div
              className="upgrade-pill upgrade-pill-fire"
              title="Alcance de casillas que cubre la explosión de tus bombas"
            >
              <Flame size={14} className="pill-icon" />
              <span className="pill-label">Alcance:</span>
              <strong>{localBombRange}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Main Matrix Arena Board */}
      <div className="arena-board-wrapper">
        <div className="arena-board" tabIndex={0} aria-label="Tablero de juego">
          {/* Render 15x11 Matrix grid tiles, walls, and boxes */}
          <div className="matrix-grid">
            {arena?.matrix?.map((rowCells, rIdx) => (
              <div key={`row-${rIdx}`} className="matrix-row">
                {rowCells.map((cellValue, cIdx) => (
                  <div
                    key={`cell-${rIdx}-${cIdx}`}
                    className={`matrix-tile ${
                      cellValue === 1
                        ? 'tile-wall'
                        : cellValue === 2
                        ? 'tile-box'
                        : 'tile-empty'
                    }`}
                  >
                    {cellValue === 1 && <div className="wall-pillar" />}
                    {cellValue === 2 && <div className="wooden-crate" />}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Render Active Collectibles / Power-ups */}
          {arena?.powerUps &&
            Object.values(arena.powerUps).map((pu) => {
              const isBombUp = pu.type === 'BOMB_UP';
              return (
                <div
                  key={pu.id}
                  className={`arena-powerup ${isBombUp ? 'powerup-bomb' : 'powerup-fire'}`}
                  style={{
                    left: `${((pu.col * TILE_SIZE + 20) / (COLS * TILE_SIZE)) * 100}%`,
                    top: `${((pu.row * TILE_SIZE + 20) / (ROWS * TILE_SIZE)) * 100}%`,
                  }}
                  title={
                    isBombUp
                      ? 'Recolectable: +1 Bomba simultánea'
                      : 'Recolectable: +1 Rango de explosión'
                  }
                >
                  <div className="powerup-glow-halo" />
                  <div className="powerup-badge-box">
                    {isBombUp ? (
                      <Bomb className="powerup-icon bomb-icon" size={17} />
                    ) : (
                      <Flame className="powerup-icon fire-icon" size={17} />
                    )}
                    <span className="powerup-badge-label">+1</span>
                  </div>
                </div>
              );
            })}

          {/* Render Floating Pickup Toasts */}
          {pickupToasts.map((toast) => (
            <div
              key={toast.id}
              className={`pickup-float-toast ${
                toast.type === 'BOMB_UP' ? 'toast-bomb' : 'toast-fire'
              }`}
              style={{
                left: `${(toast.x / (COLS * TILE_SIZE)) * 100}%`,
                top: `${(toast.y / (ROWS * TILE_SIZE)) * 100}%`,
              }}
            >
              {toast.type === 'BOMB_UP' ? (
                <Bomb size={13} />
              ) : (
                <Flame size={13} />
              )}
              <span>{toast.text}</span>
            </div>
          ))}

          {/* Render Active Bombs */}
          {arena?.bombs &&
            Object.values(arena.bombs).map((bomb) => (
              <div
                key={bomb.id}
                className="arena-bomb"
                style={{
                  left: `${((bomb.col * TILE_SIZE + 20) / (COLS * TILE_SIZE)) * 100}%`,
                  top: `${((bomb.row * TILE_SIZE + 20) / (ROWS * TILE_SIZE)) * 100}%`,
                }}
              >
                <div className="bomb-shadow" />
                <div className="bomb-sphere">
                  <div className="bomb-wick">
                    <span className="wick-spark" />
                  </div>
                </div>
              </div>
            ))}

          {/* Render Active Explosions */}
          {arena?.explosions &&
            arena.explosions.map((ex, idx) => (
              <div
                key={`explosion-${ex.col}-${ex.row}-${idx}`}
                className="arena-explosion"
                style={{
                  left: `${((ex.col * TILE_SIZE + 20) / (COLS * TILE_SIZE)) * 100}%`,
                  top: `${((ex.row * TILE_SIZE + 20) / (ROWS * TILE_SIZE)) * 100}%`,
                }}
              >
                <Flame className="explosion-flame-icon" size={32} />
              </div>
            ))}

          {/* Player 1 (Host) Token */}
          <div
            className={`player-dot host-dot ${isHost ? 'is-self' : ''} ${
              hostPosition.alive === false ? 'is-dead' : ''
            }`}
            style={{
              left: `${(hostDisplay.x / (COLS * TILE_SIZE)) * 100}%`,
              top: `${(hostDisplay.y / (ROWS * TILE_SIZE)) * 100}%`,
              backgroundColor: hostDisplay.color,
            }}
          >
            <div className="dot-ripple" />
            <div className="dot-core" />
            <div className="player-tag host-tag">
              <span className="player-tag-name">
                {hostPosition.playerName}
                {hostPosition.alive === false ? ' ☠️' : ''}
              </span>
              {isHost && <span className="self-badge">TÚ</span>}
            </div>
          </div>

          {/* Player 2 (Guest) Token or Waiting Beacon */}
          {guestPlayer && guestPosition && guestDisplay ? (
            <div
              className={`player-dot guest-dot ${!isHost ? 'is-self' : ''} ${
                guestPosition.alive === false ? 'is-dead' : ''
              }`}
              style={{
                left: `${(guestDisplay.x / (COLS * TILE_SIZE)) * 100}%`,
                top: `${(guestDisplay.y / (ROWS * TILE_SIZE)) * 100}%`,
                backgroundColor: guestDisplay.color,
              }}
            >
              <div className="dot-ripple" />
              <div className="dot-core" />
              <div className="player-tag guest-tag">
                <span className="player-tag-name">
                  {guestPosition.playerName}
                  {guestPosition.alive === false ? ' ☠️' : ''}
                </span>
                {!isHost && <span className="self-badge">TÚ</span>}
              </div>
            </div>
          ) : (
            <div
              className="waiting-guest-beacon"
              style={{
                left: `${(540 / (COLS * TILE_SIZE)) * 100}%`,
                top: `${(380 / (ROWS * TILE_SIZE)) * 100}%`,
              }}
            >
              <div className="radar-ping" />
              <div className="waiting-tag">
                <Sparkles size={12} />
                <span>Esperando jugador 2 con código...</span>
              </div>
            </div>
          )}

          {/* Game Over Banner Overlay */}
          {isGameOver && (
            <div className="game-over-overlay">
              <div className="game-over-card">
                {isWinner ? (
                  <div className="winner-content">
                    <Trophy size={48} className="trophy-icon" />
                    <h3>¡VICTORIA!</h3>
                    <p>Has eliminado a tu oponente con la bomba.</p>
                  </div>
                ) : isLoser ? (
                  <div className="loser-content">
                    <span className="skull-icon" role="img" aria-label="Derrota">
                      ☠️
                    </span>
                    <h3>¡FUISTE ELIMINADO!</h3>
                    <p>Fuiste alcanzado por la explosión de la bomba.</p>
                  </div>
                ) : (
                  <div className="game-over-content">
                    <h3>¡PARTIDA TERMINADA!</h3>
                    <p>Ganador: <strong>{arena?.winnerName || 'Partida concluida'}</strong></p>
                  </div>
                )}

                <div className="game-over-actions">
                  <button
                    type="button"
                    className="button primary compact-action"
                    onClick={onRematch}
                  >
                    <RotateCcw size={16} />
                    Jugar Revancha
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Arena Footer: Legend & Controls */}
      <div className="arena-footer">
        <div className="arena-players-legend">
          <div
            className={`legend-item ${isHost ? 'active' : ''} ${
              hostPosition.alive === false ? 'dead-item' : ''
            }`}
          >
            <span className="legend-dot host" />
            <div className="legend-info">
              <div className="legend-name-row">
                <strong>{hostPosition.playerName}</strong>
                <div className="legend-chips-row">
                  <span className="chip-bomb" title="Capacidad de bombas simultáneas">
                    <Bomb size={11} /> {hostPosition.maxBombs || 1}
                  </span>
                  <span className="chip-fire" title="Alcance de explosión">
                    <Flame size={11} /> {hostPosition.bombRange || 1}
                  </span>
                </div>
              </div>
              <small>
                {hostPosition.alive === false
                  ? 'Eliminado ☠️'
                  : `Jugador 1 ${isHost ? '(Tú)' : ''}`}
              </small>
            </div>
          </div>

          <div
            className={`legend-item ${!isHost && guestPlayer ? 'active' : ''} ${
              guestPosition?.alive === false ? 'dead-item' : ''
            }`}
          >
            <span className="legend-dot guest" />
            <div className="legend-info">
              <div className="legend-name-row">
                <strong>
                  {guestPlayer
                    ? guestPosition?.playerName
                    : 'Esperando conexión...'}
                </strong>
                {guestPlayer && (
                  <div className="legend-chips-row">
                    <span className="chip-bomb" title="Capacidad de bombas simultáneas">
                      <Bomb size={11} /> {guestPosition?.maxBombs || 1}
                    </span>
                    <span className="chip-fire" title="Alcance de explosión">
                      <Flame size={11} /> {guestPosition?.bombRange || 1}
                    </span>
                  </div>
                )}
              </div>
              <small>
                {guestPosition?.alive === false
                  ? 'Eliminado ☠️'
                  : guestPlayer
                  ? `Jugador 2 ${!isHost ? '(Tú)' : ''}`
                  : `Código: ${game.code}`}
              </small>
            </div>
          </div>
        </div>

        {/* Virtual On-screen Controls (WASD + Spacebar Bomb button) */}
        <div className="virtual-controls-panel">
          <div className="wasd-controls" aria-label="Controles virtuales de movimiento">
            <div className="wasd-row">
              <button
                type="button"
                className={`wasd-btn ${activeKeys.UP ? 'pressed' : ''}`}
                title="Mover arriba (W)"
                onPointerDown={() => handleVirtualPressStart('UP')}
                onPointerUp={() => handleVirtualPressEnd('UP')}
                onPointerLeave={() => handleVirtualPressEnd('UP')}
              >
                W
              </button>
            </div>
            <div className="wasd-row">
              <button
                type="button"
                className={`wasd-btn ${activeKeys.LEFT ? 'pressed' : ''}`}
                title="Mover izquierda (A)"
                onPointerDown={() => handleVirtualPressStart('LEFT')}
                onPointerUp={() => handleVirtualPressEnd('LEFT')}
                onPointerLeave={() => handleVirtualPressEnd('LEFT')}
              >
                A
              </button>
              <button
                type="button"
                className={`wasd-btn ${activeKeys.DOWN ? 'pressed' : ''}`}
                title="Mover abajo (S)"
                onPointerDown={() => handleVirtualPressStart('DOWN')}
                onPointerUp={() => handleVirtualPressEnd('DOWN')}
                onPointerLeave={() => handleVirtualPressEnd('DOWN')}
              >
                S
              </button>
              <button
                type="button"
                className={`wasd-btn ${activeKeys.RIGHT ? 'pressed' : ''}`}
                title="Mover derecha (D)"
                onPointerDown={() => handleVirtualPressStart('RIGHT')}
                onPointerUp={() => handleVirtualPressEnd('RIGHT')}
                onPointerLeave={() => handleVirtualPressEnd('RIGHT')}
              >
                D
              </button>
            </div>
          </div>

          {/* Plant Bomb Button with Live Capacity Counter */}
          <div className="bomb-button-wrapper">
            <button
              type="button"
              className={`bomb-action-btn ${activeKeys.Space ? 'pressed' : ''} ${
                availableBombs === 0 ? 'is-depleted' : ''
              }`}
              title={
                availableBombs === 0
                  ? 'Máximo de bombas colocadas alcanzado. Espera a que exploten.'
                  : 'Plantar Bomba (Barra Espaciadora)'
              }
              onClick={onPlaceBomb}
            >
              <Bomb size={18} />
              <span>
                BOMBA ({availableBombs}/{localMaxBombs})
              </span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

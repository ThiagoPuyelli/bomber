import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { soundManager } from '../utils/audio';
import {
  normalizePlayerPosition,
  normalizePlayerPositions,
} from '../utils/playerView';
import type {
  BombState,
  GameArenaState,
  GameChatMessage,
  GamePlayer,
  GameState,
  MoveDirection,
  PlayerPosition,
  PowerUpCollectedPayload,
} from '../types';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'http://localhost:3000';

const ARENA_CONFIG = {
  STEP: 20,
  MIN_X: 24,
  MAX_X: 576,
  MIN_Y: 24,
  MAX_Y: 376,
};

interface UseGameSocketResult {
  connected: boolean;
  messages: GameChatMessage[];
  positions: Record<string, PlayerPosition>;
  arena: GameArenaState | null;
  error: string | null;
  lastPowerUpEvent: PowerUpCollectedPayload | null;
  sendMessage: (content: string) => void;
  sendMove: (direction: MoveDirection) => void;
  placeBomb: () => void;
  requestRematch: () => void;
}

export function useGameSocket(
  game: GameState | null,
  player: GamePlayer | null,
  onGameUpdated?: (game: GameState) => void,
  onSessionInvalid?: () => void,
  onPowerUpCollected?: (payload: PowerUpCollectedPayload) => void,
): UseGameSocketResult {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<GameChatMessage[]>([]);
  const [positions, setPositions] = useState<Record<string, PlayerPosition>>({});
  const [arena, setArena] = useState<GameArenaState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastPowerUpEvent, setLastPowerUpEvent] = useState<PowerUpCollectedPayload | null>(null);

  // Sync messages from game object when available
  useEffect(() => {
    setMessages(game?.messages ?? []);
  }, [game?.code, game?.messages]);

  useEffect(() => {
    if (!game || !player) {
      return;
    }

    const socket = io(WS_URL, {
      transports: ['websocket'],
      withCredentials: true,
    });

    socketRef.current = socket;
    setError(null);
    setArena(null);
    setPositions({});
    setMessages([]);

    let hasJoined = false;

    // El servidor solo envía col/row (y stats). El frontend deriva x/y/color
    // de forma independiente para no depender de campos retirados del payload.
    const applyArenaState = (next: GameArenaState | null | undefined) => {
      if (!next) return;
      setArena(next);
      setPositions(normalizePlayerPositions(next.players, next.tileSize));
    };

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('game:join', {
        gameCode: game.code,
        playerId: player.id,
      });
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on(
      'game:joined',
      (payload: {
        game: GameState;
        player: GamePlayer;
        arena?: GameArenaState;
      }) => {
        hasJoined = true;
        setMessages(payload.game.messages ?? []);
        applyArenaState(payload.arena);
        onGameUpdated?.(payload.game);
      },
    );

    socket.on('game:player_joined', (payload: { game: GameState }) => {
      onGameUpdated?.(payload.game);
    });

    socket.on('game:started', (startedGame: GameState) => {
      onGameUpdated?.(startedGame);
      setMessages(startedGame.messages ?? []);
    });

    socket.on('game:positions', (arenaState: GameArenaState) => {
      applyArenaState(arenaState);
    });

    socket.on('bomb:placed', (bomb?: BombState) => {
      soundManager.playBombPlace();
      if (bomb) {
        setArena((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            bombs: {
              ...(prev.bombs || {}),
              [bomb.id]: bomb,
            },
          };
        });
      }
    });

    socket.on('bomb:exploded', (payload: { arena?: GameArenaState }) => {
      soundManager.playExplosion();
      applyArenaState(payload.arena);
    });

    socket.on(
      'powerup:collected',
      (payload: PowerUpCollectedPayload) => {
        soundManager.playPowerUp(payload.type);

        setArena((prev) => {
          if (!prev || !prev.powerUps) return prev;
          const nextPowerUps = { ...prev.powerUps };
          delete nextPowerUps[payload.powerUpId];
          return {
            ...prev,
            powerUps: nextPowerUps,
          };
        });

        setPositions((prev) => {
          const current = prev[payload.playerId];
          if (!current) return prev;
          return {
            ...prev,
            [payload.playerId]: {
              ...current,
              maxBombs: payload.maxBombs,
              bombRange: payload.bombRange,
            },
          };
        });

        setLastPowerUpEvent(payload);
        onPowerUpCollected?.(payload);
      },
    );

    socket.on(
      'game:over',
      (payload: { arena?: GameArenaState; winnerId?: string }) => {
        applyArenaState(payload.arena);
        soundManager.playGameOver(payload.winnerId === player.id);
      },
    );

    socket.on('game:rematch_started', (arenaState: GameArenaState) => {
      applyArenaState(arenaState);
    });

    socket.on(
      'player:moved',
      (payload: {
        playerId: string;
        col?: number;
        row?: number;
        x?: number;
        y?: number;
        positions?: Record<string, PlayerPosition>;
      }) => {
        if (payload.positions) {
          setPositions(normalizePlayerPositions(payload.positions));
        } else {
          setPositions((prev) => {
            const current = prev[payload.playerId];
            if (!current) return prev;
            return {
              ...prev,
              [payload.playerId]: normalizePlayerPosition({
                ...current,
                col: payload.col ?? current.col,
                row: payload.row ?? current.row,
                x: payload.x,
                y: payload.y,
              }),
            };
          });
        }
      },
    );

    socket.on('chat:message', (message: GameChatMessage) => {
      setMessages((currentMessages) => {
        if (currentMessages.some((current) => current.id === message.id)) {
          return currentMessages;
        }

        return [...currentMessages, message];
      });
    });

    socket.on('exception', (payload: { message?: string }) => {
      setError(payload.message ?? 'Error en el socket');

      if (!hasJoined) {
        onSessionInvalid?.();
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [
    game?.code,
    player?.id,
    onGameUpdated,
    onSessionInvalid,
    onPowerUpCollected,
  ]);

  const sendMessage = useCallback(
    (content: string) => {
      if (!game || !player || !socketRef.current) {
        return;
      }

      socketRef.current.emit('chat:send', {
        gameCode: game.code,
        playerId: player.id,
        content,
      });
    },
    [game?.code, player?.id],
  );

  const sendMove = useCallback(
    (direction: MoveDirection) => {
      if (!game || !player || !socketRef.current) {
        return;
      }

      if (arena?.gameOver) {
        return;
      }

      // Optimistic local tile calculation if arena matrix is loaded
      if (arena?.matrix) {
        const cur = positions[player.id];
        if (cur && cur.col !== undefined && cur.row !== undefined && cur.alive !== false) {
          let dCol = 0;
          let dRow = 0;
          if (direction === 'UP') dRow = -1;
          else if (direction === 'DOWN') dRow = 1;
          else if (direction === 'LEFT') dCol = -1;
          else if (direction === 'RIGHT') dCol = 1;

          const nCol = cur.col + dCol;
          const nRow = cur.row + dRow;

          if (
            nCol >= 0 &&
            nCol < arena.cols &&
            nRow >= 0 &&
            nRow < arena.rows &&
            arena.matrix[nRow][nCol] === 0
          ) {
            const hasBomb = Object.values(arena.bombs).some(
              (b) => b.col === nCol && b.row === nRow,
            );
            if (!hasBomb) {
              setPositions((prev) => ({
                ...prev,
                [player.id]: {
                  ...cur,
                  col: nCol,
                  row: nRow,
                  x: nCol * arena.tileSize + arena.tileSize / 2,
                  y: nRow * arena.tileSize + arena.tileSize / 2,
                },
              }));
            }
          }
        }
      }

      socketRef.current.emit('player:move', {
        gameCode: game.code,
        playerId: player.id,
        direction,
      });
    },
    [game?.code, player?.id, arena, positions],
  );

  const placeBomb = useCallback(() => {
    if (!game || !player || !socketRef.current) {
      return;
    }

    if (arena?.gameOver) {
      return;
    }

    socketRef.current.emit('player:bomb', {
      gameCode: game.code,
      playerId: player.id,
    });
  }, [game?.code, player?.id, arena?.gameOver]);

  const requestRematch = useCallback(() => {
    if (!game || !socketRef.current) {
      return;
    }

    socketRef.current.emit('game:rematch', {
      gameCode: game.code,
    });
  }, [game?.code]);

  return {
    connected,
    messages,
    positions,
    arena,
    error,
    lastPowerUpEvent,
    sendMessage,
    sendMove,
    placeBomb,
    requestRematch,
  };
}

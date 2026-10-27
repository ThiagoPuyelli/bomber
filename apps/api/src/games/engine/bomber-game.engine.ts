import { randomUUID } from 'node:crypto';
import {
  BombState,
  ExplosionCell,
  GameArenaState,
  GameState,
  INITIAL_MAP_MATRIX,
  PlayerPosition,
  PowerUpType,
} from '../domain/game.types';
import {
  ActionResult,
  ExplodeResult,
  GameEvent,
  IGameEngine,
  MoveResult,
} from './game-engine.interface';

const BOMBER_ARENA = {
  COLS: 15,
  ROWS: 11,
  TILE_SIZE: 40,
  WIDTH: 600,
  HEIGHT: 440,
  HOST_DEFAULT: { col: 1, row: 1, x: 60, y: 60, color: '#38bdf8' },
  GUEST_DEFAULT: { col: 13, row: 9, x: 540, y: 380, color: '#f43f5e' },
  BOMB_FUSE_MS: 2400,
  EXPLOSION_DURATION_MS: 800,
  INITIAL_BOMB_RANGE: 1,
  INITIAL_MAX_BOMBS: 1,
};

export class BomberGameEngine implements IGameEngine {
  readonly gameType = 'BOMBER';

  private pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

  initArena(game: GameState): GameArenaState {
    const arena: GameArenaState = {
      gameCode: game.code,
      cols: BOMBER_ARENA.COLS,
      rows: BOMBER_ARENA.ROWS,
      tileSize: BOMBER_ARENA.TILE_SIZE,
      width: BOMBER_ARENA.WIDTH,
      height: BOMBER_ARENA.HEIGHT,
      matrix: INITIAL_MAP_MATRIX.map((row) => [...row]),
      bombs: {},
      explosions: [],
      powerUps: {},
      players: {},
      gameOver: false,
      winnerId: null,
      winnerName: null,
      loserId: null,
    };

    game.players.forEach((p, idx) => {
      const isHost = p.isHost || idx === 0;
      const config = isHost
        ? BOMBER_ARENA.HOST_DEFAULT
        : BOMBER_ARENA.GUEST_DEFAULT;

      arena.players[p.id] = {
        playerId: p.id,
        playerName: p.name,
        isHost: p.isHost,
        col: config.col,
        row: config.row,
        alive: true,
        maxBombs: BOMBER_ARENA.INITIAL_MAX_BOMBS,
        bombRange: BOMBER_ARENA.INITIAL_BOMB_RANGE,
        lastUpdated: new Date().toISOString(),
      };
    });

    return arena;
  }

  resetArena(arena: GameArenaState): void {
    arena.matrix = INITIAL_MAP_MATRIX.map((row) => [...row]);
    arena.bombs = {};
    arena.explosions = [];
    arena.powerUps = {};
    arena.gameOver = false;
    arena.winnerId = null;
    arena.winnerName = null;
    arena.loserId = null;

    Object.values(arena.players).forEach((p, idx) => {
      const isHost = p.isHost || idx === 0;
      const config = isHost
        ? BOMBER_ARENA.HOST_DEFAULT
        : BOMBER_ARENA.GUEST_DEFAULT;

      p.col = config.col;
      p.row = config.row;
      p.alive = true;
      p.maxBombs = BOMBER_ARENA.INITIAL_MAX_BOMBS;
      p.bombRange = BOMBER_ARENA.INITIAL_BOMB_RANGE;
      p.lastUpdated = new Date().toISOString();
    });
  }

  handleRematch(arena: GameArenaState): GameEvent[] {
    this.resetArena(arena);
    return [];
  }

  handleMove(
    arena: GameArenaState,
    playerId: string,
    direction: string,
  ): MoveResult {
    if (arena.gameOver) {
      return { moved: false, events: [] };
    }

    const current = arena.players[playerId];
    if (!current || !current.alive) {
      return { moved: false, events: [] };
    }

    let dCol = 0;
    let dRow = 0;

    const rawDir = direction.toUpperCase();
    switch (rawDir) {
      case 'UP':
      case 'W':
      case 'ARROWUP':
        dRow = -1;
        break;
      case 'DOWN':
      case 'S':
      case 'ARROWDOWN':
        dRow = 1;
        break;
      case 'LEFT':
      case 'A':
      case 'ARROWLEFT':
        dCol = -1;
        break;
      case 'RIGHT':
      case 'D':
      case 'ARROWRIGHT':
        dCol = 1;
        break;
      default:
        return { moved: false, events: [] };
    }

    const nextCol = current.col + dCol;
    const nextRow = current.row + dRow;

    if (
      nextCol < 0 ||
      nextCol >= arena.cols ||
      nextRow < 0 ||
      nextRow >= arena.rows
    ) {
      return { moved: false, events: [] };
    }

    const cellValue = arena.matrix[nextRow][nextCol];
    if (cellValue === 1 || cellValue === 2) {
      return { moved: false, events: [] };
    }

    const bombOnCell = Object.values(arena.bombs).some(
      (b) => b.col === nextCol && b.row === nextRow,
    );
    if (bombOnCell) {
      return { moved: false, events: [] };
    }

    current.col = nextCol;
    current.row = nextRow;
    current.lastUpdated = new Date().toISOString();

    const events: GameEvent[] = [];

    const powerUpEntry = Object.entries(arena.powerUps).find(
      ([, pu]) => pu.col === nextCol && pu.row === nextRow,
    );
    if (powerUpEntry) {
      const [puId, pu] = powerUpEntry;
      delete arena.powerUps[puId];

      if (pu.type === 'BOMB_UP') {
        current.maxBombs = Math.min((current.maxBombs || 1) + 1, 6);
      } else if (pu.type === 'FIRE_UP') {
        current.bombRange = Math.min((current.bombRange || 1) + 1, 8);
      }

      events.push({
        type: 'powerup:collected',
        payload: {
          playerId: current.playerId,
          type: pu.type,
          maxBombs: current.maxBombs,
          bombRange: current.bombRange,
          powerUpId: puId,
        },
      });
    }

    const hitFlame = arena.explosions.some(
      (ex) => ex.col === current.col && ex.row === current.row,
    );
    if (hitFlame) {
      const deathEvents = this.handlePlayerDeath(arena, current.playerId);
      events.push(...deathEvents);
    }

    return { moved: true, events };
  }

  handleAction(
    arena: GameArenaState,
    playerId: string,
    action: string,
  ): ActionResult {
    if (action !== 'bomb') {
      return { accepted: false, events: [] };
    }

    if (arena.gameOver) {
      return { accepted: false, events: [] };
    }

    const playerPos = arena.players[playerId];
    if (!playerPos || !playerPos.alive) {
      return { accepted: false, events: [] };
    }

    const hasBombOnTile = Object.values(arena.bombs).some(
      (b) => b.col === playerPos.col && b.row === playerPos.row,
    );
    if (hasBombOnTile) {
      return { accepted: false, events: [] };
    }

    const activePlayerBombs = Object.values(arena.bombs).filter(
      (b) => b.playerId === playerId,
    );
    if (activePlayerBombs.length >= (playerPos.maxBombs || 1)) {
      return { accepted: false, events: [] };
    }

    const bombId = randomUUID();
    const now = Date.now();
    const bomb: BombState = {
      id: bombId,
      gameCode: arena.gameCode,
      playerId,
      col: playerPos.col,
      row: playerPos.row,
      placedAt: now,
      detonatesAt: now + BOMBER_ARENA.BOMB_FUSE_MS,
      range: playerPos.bombRange || BOMBER_ARENA.INITIAL_BOMB_RANGE,
    };

    arena.bombs[bombId] = bomb;

    this.scheduleDetonation(arena.gameCode, bombId, BOMBER_ARENA.BOMB_FUSE_MS);

    return {
      accepted: true,
      events: [
        {
          type: 'bomb:placed',
          payload: { bomb },
        },
      ],
    };
  }

  explodeBomb(gameCode: string, arena: GameArenaState, bombId: string): ExplodeResult {
    const bomb = arena.bombs[bombId];
    if (!bomb) return { events: [] };

    delete arena.bombs[bombId];

    const newExplosionCells: ExplosionCell[] = [
      { col: bomb.col, row: bomb.row },
    ];
    const directions = [
      { dCol: 0, dRow: -1 },
      { dCol: 0, dRow: 1 },
      { dCol: -1, dRow: 0 },
      { dCol: 1, dRow: 0 },
    ];

    for (const dir of directions) {
      for (let step = 1; step <= bomb.range; step += 1) {
        const c = bomb.col + dir.dCol * step;
        const r = bomb.row + dir.dRow * step;

        if (c < 0 || c >= arena.cols || r < 0 || r >= arena.rows) {
          break;
        }

        const cellValue = arena.matrix[r][c];

        if (cellValue === 1) break;

        if (cellValue === 2) {
          arena.matrix[r][c] = 0;
          newExplosionCells.push({ col: c, row: r });

          if (!arena.powerUps) arena.powerUps = {};

          const rand = Math.random();
          if (rand < 0.6) {
            const puType: PowerUpType = rand < 0.3 ? 'BOMB_UP' : 'FIRE_UP';
            const puId = randomUUID();
            arena.powerUps[puId] = {
              id: puId,
              col: c,
              row: r,
              type: puType,
            };
          }

          break;
        }

        newExplosionCells.push({ col: c, row: r });

        if (arena.powerUps) {
          const burntPuEntry = Object.entries(arena.powerUps).find(
            ([, pu]) => pu.col === c && pu.row === r,
          );
          if (burntPuEntry) {
            delete arena.powerUps[burntPuEntry[0]];
          }
        }

        const otherBomb = Object.values(arena.bombs).find(
          (b) => b.col === c && b.row === r,
        );
        if (otherBomb) {
          this.scheduleDetonation(gameCode, otherBomb.id, 50);
        }
      }
    }

    arena.explosions.push(...newExplosionCells);

    const events: GameEvent[] = [];

    for (const p of Object.values(arena.players)) {
      if (p.alive) {
        const isHit = newExplosionCells.some(
          (cell) => cell.col === p.col && cell.row === p.row,
        );
        if (isHit) {
          const deathEvents = this.handlePlayerDeath(arena, p.playerId);
          events.push(...deathEvents);
        }
      }
    }

    events.push({
      type: 'bomb:exploded',
      payload: {
        bombId,
        explosions: newExplosionCells,
        arena,
      },
    });

    return { events };
  }

  scheduleDetonation(gameCode: string, bombId: string, delayMs: number): void {
    const key = `${gameCode}:${bombId}`;
    const timer = setTimeout(() => {
      this.pendingTimers.delete(key);
    }, delayMs + 100);
    this.pendingTimers.set(key, timer);
  }

  getExplosionDuration(): number {
    return BOMBER_ARENA.EXPLOSION_DURATION_MS;
  }

  clearExplosions(arena: GameArenaState, cells: ExplosionCell[]): void {
    arena.explosions = arena.explosions.filter(
      (ex) => !cells.some((nex) => nex.col === ex.col && nex.row === ex.row),
    );
  }

  private handlePlayerDeath(
    arena: GameArenaState,
    deadPlayerId: string,
  ): GameEvent[] {
    const deadPlayer = arena.players[deadPlayerId];
    if (!deadPlayer || !deadPlayer.alive) return [];

    deadPlayer.alive = false;
    arena.gameOver = true;
    arena.loserId = deadPlayerId;

    const survivor = Object.values(arena.players).find(
      (p) => p.playerId !== deadPlayerId,
    );
    arena.winnerId = survivor ? survivor.playerId : null;
    arena.winnerName = survivor ? survivor.playerName : 'Sobreviviente';

    return [
      {
        type: 'game:over',
        payload: {
          winnerId: arena.winnerId,
          winnerName: arena.winnerName,
          loserId: arena.loserId,
          loserName: deadPlayer.playerName,
          arena,
        },
      },
    ];
  }
}

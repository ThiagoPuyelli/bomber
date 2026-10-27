export type GameStatus = 'pending' | 'started';

export type GameType = 'BOMBER';

export interface GamePlayer {
  id: string;
  name: string;
  isHost: boolean;
  joinedAt: string;
}

export interface GameChatMessage {
  id: string;
  gameCode: string;
  playerId: string;
  playerName: string;
  content: string;
  createdAt: string;
}

export interface GameState {
  code: string;
  status: GameStatus;
  gameType: GameType;
  hostPlayerId: string;
  players: GamePlayer[];
  messages: GameChatMessage[];
  createdAt: string;
  startedAt?: string;
}

export interface PlayerJoinResult {
  game: GameState;
  player: GamePlayer;
}

export const ARENA_GRID = {
  COLS: 15,
  ROWS: 11,
  TILE_SIZE: 40,
  WIDTH: 600,
  HEIGHT: 440,
};

// 0: EMPTY, 1: INDESTRUCTIBLE WALL, 2: DESTRUCTIBLE BOX/CRATE
export const INITIAL_MAP_MATRIX: number[][] = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0, 0, 1],
  [1, 0, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 0, 1],
  [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
  [1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1],
  [1, 2, 2, 2, 2, 0, 0, 0, 2, 2, 2, 2, 2, 2, 1],
  [1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1],
  [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1],
  [1, 0, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 0, 1],
  [1, 0, 0, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

export interface BombState {
  id: string;
  gameCode: string;
  playerId: string;
  col: number;
  row: number;
  placedAt: number;
  detonatesAt: number;
  range: number;
}

export interface ExplosionCell {
  col: number;
  row: number;
}

export type PowerUpType = 'BOMB_UP' | 'FIRE_UP';

export interface PowerUp {
  id: string;
  col: number;
  row: number;
  type: PowerUpType;
}

export interface PlayerPosition {
  playerId: string;
  playerName: string;
  isHost: boolean;
  col: number;
  row: number;
  alive: boolean;
  maxBombs: number;
  bombRange: number;
  lastUpdated: string;
}

export interface GameArenaState {
  gameCode: string;
  cols: number;
  rows: number;
  tileSize: number;
  width: number;
  height: number;
  matrix: number[][]; // 0=empty, 1=wall, 2=box
  bombs: Record<string, BombState>;
  explosions: ExplosionCell[];
  powerUps: Record<string, PowerUp>;
  players: Record<string, PlayerPosition>;
  gameOver: boolean;
  winnerId: string | null;
  winnerName: string | null;
  loserId: string | null;
}

export interface PlayerMoveSocketPayload {
  gameCode?: string;
  playerId?: string;
  direction?:
    | 'UP'
    | 'DOWN'
    | 'LEFT'
    | 'RIGHT'
    | 'w'
    | 'a'
    | 's'
    | 'd'
    | 'W'
    | 'A'
    | 'S'
    | 'D';
  key?: string;
  dx?: number;
  dy?: number;
}

export interface PlayerBombSocketPayload {
  gameCode?: string;
  playerId?: string;
}

export interface AppendGameMessageInput {
  gameCode: string;
  playerId: string;
  content: string;
}

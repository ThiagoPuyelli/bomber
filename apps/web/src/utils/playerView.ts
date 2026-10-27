import type { GameArenaState, PlayerPosition } from '../types';

export const DEFAULT_TILE_SIZE = 40;

export const PLAYER_SLOT_COLORS = {
  host: '#38bdf8',
  guest: '#f43f5e',
} as const;

export const PLAYER_SLOT_SPAWNS = {
  host: { col: 1, row: 1 },
  guest: { col: 13, row: 9 },
} as const;

export function tileCenter(col: number, row: number, tileSize: number = DEFAULT_TILE_SIZE) {
  return {
    x: col * tileSize + tileSize / 2,
    y: row * tileSize + tileSize / 2,
  };
}

export function resolvePlayerSlot(pos: { isHost?: boolean }): 'host' | 'guest' {
  return pos.isHost ? 'host' : 'guest';
}

export function resolvePlayerColor(
  pos: { isHost?: boolean; color?: string | null },
): string {
  if (pos.color) {
    return pos.color;
  }
  return PLAYER_SLOT_COLORS[resolvePlayerSlot(pos)];
}

export function resolvePlayerTile(pos: { col?: number | null; row?: number | null; isHost?: boolean }) {
  const spawn = PLAYER_SLOT_SPAWNS[resolvePlayerSlot(pos)];
  return {
    col: pos.col ?? spawn.col,
    row: pos.row ?? spawn.row,
  };
}

export interface PlayerDisplay {
  col: number;
  row: number;
  x: number;
  y: number;
  color: string;
}

/**
 * Deriva la representación de render (casilla, píxeles y color) de un jugador
 * a partir de lo mínimo que envía el servidor (col/row/isHost). Usa x/y/color
 * del servidor solo si vinieran presentes (compatibilidad).
 */
export function resolvePlayerDisplay(
  pos: { col?: number | null; row?: number | null; x?: number | null; y?: number | null; isHost?: boolean; color?: string | null },
  tileSize: number = DEFAULT_TILE_SIZE,
): PlayerDisplay {
  const { col, row } = resolvePlayerTile(pos);
  const center = tileCenter(col, row, tileSize);
  return {
    col,
    row,
    x: pos.x ?? center.x,
    y: pos.y ?? center.y,
    color: resolvePlayerColor(pos),
  };
}

export function normalizePlayerPosition(
  pos: PlayerPosition,
  tileSize: number = DEFAULT_TILE_SIZE,
): PlayerPosition {
  const display = resolvePlayerDisplay(pos, tileSize);
  return {
    ...pos,
    col: display.col,
    row: display.row,
    x: display.x,
    y: display.y,
    color: display.color,
  };
}

export function normalizePlayerPositions(
  players: Record<string, PlayerPosition> | undefined | null,
  tileSize: number = DEFAULT_TILE_SIZE,
): Record<string, PlayerPosition> {
  if (!players) {
    return {};
  }
  const normalized: Record<string, PlayerPosition> = {};
  for (const [id, pos] of Object.entries(players)) {
    normalized[id] = normalizePlayerPosition(pos, tileSize);
  }
  return normalized;
}

export function normalizeArena(arena: GameArenaState): GameArenaState {
  return {
    ...arena,
    players: normalizePlayerPositions(arena.players, arena.tileSize ?? DEFAULT_TILE_SIZE),
  };
}

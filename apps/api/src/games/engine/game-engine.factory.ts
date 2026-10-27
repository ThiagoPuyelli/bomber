import { IGameEngine } from './game-engine.interface';
import { BomberGameEngine } from './bomber-game.engine';

const engines = new Map<string, () => IGameEngine>([
  ['BOMBER', () => new BomberGameEngine()],
]);

export function createGameEngine(gameType: string): IGameEngine {
  const factory = engines.get(gameType);
  if (!factory) {
    throw new Error(`Unsupported game type: ${gameType}`);
  }
  return factory();
}

export function registerGameEngine(
  gameType: string,
  factory: () => IGameEngine,
): void {
  engines.set(gameType, factory);
}

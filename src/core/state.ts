import { events } from './events';

export type Phase = 'build' | 'combat' | 'won' | 'lost';

export const TOTAL_WAVES = 5;

class GameState {
  gold = 120;
  lives = 10;
  wave = 0; // last completed/current wave number, 1-based once combat starts
  phase: Phase = 'build';

  canAfford(cost: number): boolean {
    return this.gold >= cost;
  }

  spend(cost: number): boolean {
    if (!this.canAfford(cost)) return false;
    this.gold -= cost;
    events.emit('GOLD_CHANGED', { gold: this.gold });
    return true;
  }

  earn(amount: number): void {
    this.gold += amount;
    events.emit('GOLD_CHANGED', { gold: this.gold });
  }

  loseLife(): void {
    this.lives = Math.max(0, this.lives - 1);
    events.emit('BASE_HIT', { livesLeft: this.lives });
    if (this.lives === 0 && this.phase === 'combat') {
      this.phase = 'lost';
      events.emit('GAME_OVER', { won: false, wave: this.wave });
    }
  }
}

export const state = new GameState();

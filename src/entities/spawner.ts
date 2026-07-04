import * as THREE from 'three';
import { Enemy, type EnemyType } from './enemy';
import { events } from '../core/events';
import { state, TOTAL_WAVES } from '../core/state';

interface WaveDef {
  entries: { type: EnemyType; count: number }[];
  interval: number; // seconds between spawns
}

const WAVES: WaveDef[] = [
  { entries: [{ type: 'grunt', count: 6 }], interval: 1.4 },
  { entries: [{ type: 'grunt', count: 10 }], interval: 1.1 },
  { entries: [{ type: 'grunt', count: 8 }, { type: 'brute', count: 2 }], interval: 1.0 },
  { entries: [{ type: 'grunt', count: 12 }, { type: 'brute', count: 4 }], interval: 0.8 },
  { entries: [{ type: 'grunt', count: 14 }, { type: 'brute', count: 7 }], interval: 0.6 },
];

export class Spawner {
  readonly enemies: Enemy[] = [];
  private queue: EnemyType[] = [];
  private timer = 0;
  private interval = 1;

  constructor(private scene: THREE.Scene) {}

  startWave(): void {
    if (state.phase !== 'build') return;
    state.wave++;
    state.phase = 'combat';
    const def = WAVES[Math.min(state.wave - 1, WAVES.length - 1)];
    this.queue = def.entries.flatMap((e) => Array(e.count).fill(e.type) as EnemyType[]);
    // shuffle brutes among grunts
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
    this.interval = def.interval;
    this.timer = 0;
    events.emit('WAVE_START', { wave: state.wave, enemyCount: this.queue.length });
  }

  update(dt: number, now: number): void {
    if (state.phase === 'combat' && this.queue.length > 0) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = this.interval;
        const type = this.queue.shift()!;
        this.enemies.push(new Enemy(type, this.scene));
      }
    }

    for (const e of this.enemies) e.update(dt, now);

    // reap dead
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (!this.enemies[i].alive) {
        this.enemies[i].dispose(this.scene);
        this.enemies.splice(i, 1);
      }
    }

    if (
      state.phase === 'combat' &&
      this.queue.length === 0 &&
      this.enemies.length === 0 &&
      state.lives > 0
    ) {
      if (state.wave >= TOTAL_WAVES) {
        state.phase = 'won';
        events.emit('GAME_OVER', { won: true, wave: state.wave });
      } else {
        state.phase = 'build';
        events.emit('WAVE_SURVIVED', { wave: state.wave, livesLeft: state.lives, gold: state.gold });
      }
    }
  }
}

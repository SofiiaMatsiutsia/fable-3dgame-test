// Typed event bus. Future ElevenLabs "teacher" agent subscribes here to
// comment on strategy — keep payloads serializable.

export type GameEvents = {
  TOWER_PLACED: { towerType: string; cost: number; wave: number };
  WAVE_START: { wave: number; enemyCount: number };
  WAVE_SURVIVED: { wave: number; livesLeft: number; gold: number };
  ENEMY_KILLED: { enemyType: string; byPlayer: boolean; gold: number };
  BASE_HIT: { livesLeft: number };
  PLAYER_ATTACK: { hits: number };
  GAME_OVER: { won: boolean; wave: number };
  GOLD_CHANGED: { gold: number };
};

type Handler<T> = (payload: T) => void;

class EventBus {
  private handlers = new Map<string, Set<Handler<unknown>>>();

  on<K extends keyof GameEvents>(event: K, fn: Handler<GameEvents[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(fn as Handler<unknown>);
    return () => set!.delete(fn as Handler<unknown>);
  }

  emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void {
    this.handlers.get(event)?.forEach((fn) => fn(payload));
  }
}

export const events = new EventBus();

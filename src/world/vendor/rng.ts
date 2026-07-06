// Deterministic seeded RNG (SeedThree src/core/rng.js): xmur3 string hash →
// splitmix32 generator. Thread ONE instance through a whole tree generation so
// a given (species, seed) always reproduces the same tree.

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

export class Rng {
  private state: number;

  constructor(seed: string | number) {
    const seedStr = typeof seed === 'number' ? `n:${seed}` : String(seed);
    this.state = xmur3(seedStr)() >>> 0;
  }

  next(): number {
    let z = (this.state = (this.state + 0x9e3779b9) | 0);
    z ^= z >>> 16;
    z = Math.imul(z, 0x21f0aaad);
    z ^= z >>> 15;
    z = Math.imul(z, 0x735a2d97);
    z ^= z >>> 15;
    return (z >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  vary(base: number, spread: number): number {
    return base + (this.next() * 2 - 1) * spread;
  }

  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

import * as THREE from 'three';
import { PATH } from '../world/arena';
import { events } from '../core/events';
import { state } from '../core/state';

export type EnemyType = 'grunt' | 'brute';

const ENEMY_DEFS: Record<EnemyType, { hp: number; speed: number; gold: number; color: number; scale: number }> = {
  grunt: { hp: 30, speed: 4.5, gold: 10, color: 0xcc4444, scale: 1 },
  brute: { hp: 110, speed: 2.6, gold: 25, color: 0x882299, scale: 1.6 },
};

function makeHealthBar(): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 8;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false })
  );
  sprite.scale.set(1.6, 0.2, 1);
  return sprite;
}

function drawHealthBar(sprite: THREE.Sprite, ratio: number): void {
  const tex = sprite.material.map as THREE.CanvasTexture;
  const canvas = tex.image as HTMLCanvasElement;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#222';
  ctx.fillRect(0, 0, 64, 8);
  ctx.fillStyle = ratio > 0.5 ? '#4c4' : ratio > 0.25 ? '#cc4' : '#c44';
  ctx.fillRect(1, 1, 62 * Math.max(0, ratio), 6);
  tex.needsUpdate = true;
}

export class Enemy {
  readonly type: EnemyType;
  readonly object = new THREE.Group();
  hp: number;
  readonly maxHp: number;
  speed: number;
  slowUntil = 0;
  alive = true;
  private waypoint = 1;
  private readonly bar: THREE.Sprite;
  private readonly body: THREE.Mesh;
  private readonly baseSpeed: number;
  private walkPhase = Math.random() * Math.PI * 2;

  constructor(type: EnemyType, scene: THREE.Scene) {
    this.type = type;
    const def = ENEMY_DEFS[type];
    this.hp = this.maxHp = def.hp;
    this.speed = this.baseSpeed = def.speed;

    const s = def.scale;
    this.body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.45 * s, 0.8 * s, 4, 8),
      new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.7 })
    );
    this.body.position.y = 0.85 * s;
    this.body.castShadow = true;
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffee44, emissive: 0xffee44, emissiveIntensity: 1 });
    for (const dx of [-0.18, 0.18]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08 * s), eyeMat);
      eye.position.set(dx * s, 1.2 * s, 0.4 * s);
      this.object.add(eye);
    }
    this.bar = makeHealthBar();
    this.bar.position.y = 1.9 * s;
    drawHealthBar(this.bar, 1);
    this.object.add(this.body, this.bar);
    this.object.position.copy(PATH[0]);
    scene.add(this.object);
  }

  update(dt: number, now: number): void {
    if (!this.alive) return;
    const target = PATH[this.waypoint];
    const pos = this.object.position;
    const dir = target.clone().sub(pos).setY(0);
    const dist = dir.length();
    const speed = now < this.slowUntil ? this.baseSpeed * 0.45 : this.baseSpeed;
    if (dist < 0.3) {
      this.waypoint++;
      if (this.waypoint >= PATH.length) {
        this.reachBase();
        return;
      }
    } else {
      dir.normalize();
      pos.addScaledVector(dir, speed * dt);
      this.object.rotation.y = Math.atan2(dir.x, dir.z);
    }
    this.walkPhase += dt * speed * 2.2;
    this.body.position.y = 0.85 * ENEMY_DEFS[this.type].scale + Math.abs(Math.sin(this.walkPhase)) * 0.12;
    // tint blue while slowed
    (this.body.material as THREE.MeshStandardMaterial).color.setHex(
      now < this.slowUntil ? 0x4488cc : ENEMY_DEFS[this.type].color
    );
  }

  damage(amount: number, byPlayer: boolean): void {
    if (!this.alive) return;
    this.hp -= amount;
    drawHealthBar(this.bar, this.hp / this.maxHp);
    if (this.hp <= 0) {
      this.alive = false;
      const gold = ENEMY_DEFS[this.type].gold;
      state.earn(gold);
      events.emit('ENEMY_KILLED', { enemyType: this.type, byPlayer, gold });
    }
  }

  slow(durationMs: number, now: number): void {
    this.slowUntil = now + durationMs;
  }

  private reachBase(): void {
    this.alive = false;
    state.loseLife();
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.object);
    this.object.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
      if (o instanceof THREE.Sprite) {
        o.material.map?.dispose();
        o.material.dispose();
      }
    });
  }
}

import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { PATH } from '../world/arena';
import { events } from '../core/events';
import { state } from '../core/state';
import { ASSETS, loadGlb } from '../core/assets';
import { sharpenTextures } from '../player/character';
import { settings } from '../core/settings';

export type EnemyType = 'grunt' | 'brute';

const ENEMY_DEFS: Record<EnemyType, { hp: number; speed: number; gold: number; color: number; scale: number }> = {
  grunt: { hp: 30, speed: 4.5, gold: 10, color: 0xcc4444, scale: 1 },
  brute: { hp: 110, speed: 2.6, gold: 25, color: 0x882299, scale: 1.6 },
};

// Viking model is normalized to this height (units) at scale 1, then
// multiplied by the per-type scale (brutes tower over grunts).
const VIKING_HEIGHT = 1.7;

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
  private body: THREE.Mesh | null;
  private mixer: THREE.AnimationMixer | null = null;
  private walkAction: THREE.AnimationAction | null = null;
  private readonly tintable: THREE.MeshStandardMaterial[] = [];
  private readonly baseSpeed: number;
  private walkPhase = Math.random() * Math.PI * 2;

  constructor(type: EnemyType, scene: THREE.Scene) {
    this.type = type;
    const def = ENEMY_DEFS[type];
    this.hp = this.maxHp = def.hp;
    this.speed = this.baseSpeed = def.speed;

    const s = def.scale;
    // capsule placeholder until the viking GLB arrives (usually instant after first load)
    this.body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.45 * s, 0.8 * s, 4, 8),
      new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.7 })
    );
    this.body.position.y = 0.85 * s;
    this.body.castShadow = true;
    this.bar = makeHealthBar();
    this.bar.position.y = VIKING_HEIGHT * s + 0.4;
    drawHealthBar(this.bar, 1);
    this.object.add(this.body, this.bar);
    this.object.position.copy(PATH[0]);
    scene.add(this.object);
    this.loadModel(s);
  }

  private loadModel(s: number): void {
    loadGlb(ASSETS.enemy).then(
      (gltf) => {
        if (!this.alive || !this.body) return;
        this.object.remove(this.body);
        this.body.geometry.dispose();
        (this.body.material as THREE.Material).dispose();
        this.body = null;

        const model = SkeletonUtils.clone(gltf.scene);
        // precise=true: skinned vertices render through bone transforms, so
        // plain geometry bounds are wildly wrong for Meshy rigs
        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model, true);
        const h = box.max.y - box.min.y;
        if (h > 0.01) model.scale.setScalar((VIKING_HEIGHT * s) / h);
        model.traverse((o) => {
          if (o instanceof THREE.Mesh || o instanceof THREE.SkinnedMesh) {
            o.castShadow = true;
            // skinned bounds track the bind pose, not the walking Viking, so
            // three culls it against a stale box and it pops in/out at the edges
            o.frustumCulled = false;
            // clone materials so the slow-tint doesn't leak across instances
            const mat = (o.material as THREE.Material).clone();
            o.material = mat;
            sharpenTextures(mat);
            if (mat instanceof THREE.MeshStandardMaterial) this.tintable.push(mat);
          }
        });
        this.object.add(model);

        if (gltf.animations.length) {
          this.mixer = new THREE.AnimationMixer(model);
          const clip =
            gltf.animations.find((c) => /walk|run|jog|move/.test(c.name.toLowerCase())) ??
            gltf.animations[0];
          this.walkAction = this.mixer.clipAction(clip);
          this.walkAction.startAt(-Math.random()).play();
        }
      },
      (err: unknown) => console.warn('[enemy] viking GLB failed to load, keeping capsule', err)
    );
  }

  update(dt: number, now: number): void {
    if (!this.alive) return;
    if (this.object.scale.x !== settings.enemyScale) this.object.scale.setScalar(settings.enemyScale);
    const target = PATH[this.waypoint];
    const pos = this.object.position;
    const dir = target.clone().sub(pos).setY(0);
    const dist = dir.length();
    const slowed = now < this.slowUntil;
    const speed = (slowed ? this.baseSpeed * 0.45 : this.baseSpeed) * settings.enemySpeed;
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
    if (this.mixer) {
      if (this.walkAction) this.walkAction.timeScale = slowed ? 0.5 : 1;
      this.mixer.update(dt);
      // tint blue while slowed
      for (const m of this.tintable) {
        m.emissive.setHex(slowed ? 0x2244aa : 0x000000);
        m.emissiveIntensity = slowed ? 0.6 : 0;
      }
    } else if (this.body) {
      this.walkPhase += dt * speed * 2.2;
      this.body.position.y = 0.85 * ENEMY_DEFS[this.type].scale + Math.abs(Math.sin(this.walkPhase)) * 0.12;
      (this.body.material as THREE.MeshStandardMaterial).color.setHex(
        slowed ? 0x4488cc : ENEMY_DEFS[this.type].color
      );
    }
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
    this.mixer?.stopAllAction();
    // GLB geometry is shared across clones (and the loader cache) — only
    // dispose per-instance resources: placeholder body, cloned materials, bar.
    if (this.body) {
      this.body.geometry.dispose();
      (this.body.material as THREE.Material).dispose();
    }
    for (const m of this.tintable) m.dispose();
    this.bar.material.map?.dispose();
    this.bar.material.dispose();
  }
}

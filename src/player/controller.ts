import * as THREE from 'three';
import { Character } from './character';
import type { Enemy } from '../entities/enemy';
import { events } from '../core/events';
import { ARENA_SIZE } from '../world/arena';

const MOVE_SPEED = 9;
const ATTACK_RANGE = 3.2;
const ATTACK_ARC_COS = Math.cos((110 * Math.PI) / 180 / 2); // ~110° frontal arc
const ATTACK_DAMAGE = 18;
const ATTACK_COOLDOWN = 0.45;

// Fixed-angle chase camera: overview-friendly for tower defense.
const CAM_OFFSET = new THREE.Vector3(0, 22, 17);

export class PlayerController {
  readonly character: Character;
  private keys = new Set<string>();
  private cooldown = 0;
  private facing = new THREE.Vector3(0, 0, -1);

  constructor(scene: THREE.Scene, private camera: THREE.PerspectiveCamera, private getEnemies: () => Enemy[]) {
    this.character = new Character(scene);
    this.character.object.position.set(0, 0, 0);

    // Listen on window so keys work even inside iframes/previews.
    window.addEventListener('keydown', (e) => {
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
      this.keys.add(e.code);
      if (e.code === 'Space') this.attack();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private attack(): void {
    if (this.cooldown > 0) return;
    this.cooldown = ATTACK_COOLDOWN;
    this.character.playAttack();
    let hits = 0;
    const pos = this.character.object.position;
    for (const e of this.getEnemies()) {
      if (!e.alive) continue;
      const to = e.object.position.clone().sub(pos).setY(0);
      const dist = to.length();
      if (dist > ATTACK_RANGE) continue;
      to.normalize();
      if (to.dot(this.facing) >= ATTACK_ARC_COS || dist < 1.2) {
        e.damage(ATTACK_DAMAGE, true);
        hits++;
      }
    }
    events.emit('PLAYER_ATTACK', { hits });
  }

  update(dt: number): void {
    this.cooldown -= dt;
    const dir = new THREE.Vector3(
      (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) -
        (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0),
      0,
      (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0) -
        (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0)
    );
    const moving = dir.lengthSq() > 0;
    this.character.moving = moving;
    if (moving) {
      dir.normalize();
      const pos = this.character.object.position;
      pos.addScaledVector(dir, MOVE_SPEED * dt);
      const bound = ARENA_SIZE - 2;
      pos.x = THREE.MathUtils.clamp(pos.x, -bound, bound);
      pos.z = THREE.MathUtils.clamp(pos.z, -bound, bound);
      this.facing.copy(dir);
      this.character.object.rotation.y = Math.atan2(dir.x, dir.z);
    }
    this.character.update(dt);

    // camera follow (smoothed)
    const targetCam = this.character.object.position.clone().add(CAM_OFFSET);
    this.camera.position.lerp(targetCam, 1 - Math.exp(-6 * dt));
    this.camera.lookAt(this.character.object.position.clone().setY(1));
  }
}

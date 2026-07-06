import * as THREE from 'three';
import { Character } from './character';
import type { Enemy } from '../entities/enemy';
import { events } from '../core/events';
import { state } from '../core/state';
import { ARENA_SIZE } from '../world/arena';
import { settings } from '../core/settings';

const ATTACK_RANGE = 3.2;
const ATTACK_ARC_COS = Math.cos((110 * Math.PI) / 180 / 2); // ~110° frontal arc
const ATTACK_DAMAGE = 18;
const ATTACK_COOLDOWN = 0.45;

// Left-drag orbit: yaw is unbounded, pitch is clamped so the camera can't
// flip over the top or dip below the ground plane.
const MOUSE_SENSITIVITY = 0.006;
const MIN_PITCH = THREE.MathUtils.degToRad(8);
const MAX_PITCH = THREE.MathUtils.degToRad(88);

// Scroll-wheel zoom: multiplies the height/distance sliders' baseline radius.
const ZOOM_SPEED = 0.0012;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.5;

export class PlayerController {
  readonly character: Character;
  private keys = new Set<string>();
  private cooldown = 0;
  private facing = new THREE.Vector3(0, 0, -1);
  private camYawOffset = 0;
  private camPitchOffset = 0;
  private camZoom = 1;
  private dragging = false;

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
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.dragging = false;
    });

    // Left-mouse-button drag orbits the camera. Hud distinguishes a plain
    // click (build a tower) from a drag (orbit) by movement distance.
    window.addEventListener('pointerdown', (e) => {
      if (e.button === 0) this.dragging = true;
    });
    window.addEventListener('pointerup', (e) => {
      if (e.button === 0) this.dragging = false;
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.camYawOffset -= e.movementX * MOUSE_SENSITIVITY;
      this.camPitchOffset -= e.movementY * MOUSE_SENSITIVITY;
    });

    // Mouse wheel zooms the camera in/out; ignored over the settings panel
    // so its scrollable lists still work normally.
    window.addEventListener(
      'wheel',
      (e) => {
        if (!(e.target instanceof HTMLCanvasElement)) return;
        e.preventDefault();
        this.camZoom = THREE.MathUtils.clamp(this.camZoom * Math.pow(1 + ZOOM_SPEED, e.deltaY), MIN_ZOOM, MAX_ZOOM);
      },
      { passive: false }
    );
  }

  private attack(): void {
    if (this.cooldown > 0 || state.phase === 'won' || state.phase === 'lost') return;
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
      pos.addScaledVector(dir, settings.moveSpeed * dt);
      const bound = ARENA_SIZE - 2;
      pos.x = THREE.MathUtils.clamp(pos.x, -bound, bound);
      pos.z = THREE.MathUtils.clamp(pos.z, -bound, bound);
      this.facing.copy(dir);
      this.character.object.rotation.y = Math.atan2(dir.x, dir.z);
    }
    this.character.object.scale.setScalar(settings.heroScale);
    this.character.update(dt);

    // camera follow (smoothed); height/distance sliders set the baseline
    // angle+zoom, left-mouse-drag orbits yaw/pitch on top of that baseline.
    if (this.camera.fov !== settings.camFov) {
      this.camera.fov = settings.camFov;
      this.camera.updateProjectionMatrix();
    }
    const radius = Math.hypot(settings.camDistance, settings.camHeight) * this.camZoom;
    const basePitch = Math.atan2(settings.camHeight, settings.camDistance);
    const pitch = THREE.MathUtils.clamp(basePitch + this.camPitchOffset, MIN_PITCH, MAX_PITCH);
    const yaw = this.camYawOffset;
    const horizontal = radius * Math.cos(pitch);
    const targetCam = this.character.object.position.clone();
    targetCam.x += horizontal * Math.sin(yaw);
    targetCam.y += radius * Math.sin(pitch);
    targetCam.z += horizontal * Math.cos(yaw);
    this.camera.position.lerp(targetCam, 1 - Math.exp(-6 * dt));
    this.camera.lookAt(this.character.object.position.clone().setY(1));
  }
}

import * as THREE from 'three';
import type { Enemy } from './enemy';

export interface ProjectileSpec {
  from: THREE.Vector3;
  target: Enemy;
  speed: number;
  damage: number;
  color: number;
  aoeRadius?: number; // cannon splash
  slowMs?: number; // frost
}

export class Projectile {
  readonly mesh: THREE.Mesh;
  done = false;

  constructor(private spec: ProjectileSpec, scene: THREE.Scene) {
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(spec.aoeRadius ? 0.35 : 0.18, 8, 8),
      new THREE.MeshStandardMaterial({ color: spec.color, emissive: spec.color, emissiveIntensity: 0.9 })
    );
    this.mesh.position.copy(spec.from);
    scene.add(this.mesh);
  }

  update(dt: number, now: number, allEnemies: Enemy[], onImpact: (pos: THREE.Vector3, color: number) => void): void {
    if (this.done) return;
    const { target, speed, damage, aoeRadius, slowMs, color } = this.spec;
    const aim = target.alive
      ? target.object.position.clone().setY(1)
      : this.mesh.position.clone(); // target died mid-flight: fizzle at current spot
    const dir = aim.sub(this.mesh.position);
    const dist = dir.length();
    const step = speed * dt;
    if (!target.alive && dist < 0.01) {
      this.done = true;
      return;
    }
    if (dist <= step + 0.4) {
      // impact
      this.done = true;
      onImpact(this.mesh.position.clone(), color);
      if (aoeRadius) {
        for (const e of allEnemies) {
          if (e.alive && e.object.position.distanceTo(this.mesh.position) <= aoeRadius) {
            e.damage(damage, false);
          }
        }
      } else if (target.alive) {
        target.damage(damage, false);
        if (slowMs) target.slow(slowMs, now);
      }
      return;
    }
    this.mesh.position.addScaledVector(dir.normalize(), step);
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

import * as THREE from 'three';
import type { Enemy } from './enemy';
import { Projectile } from './projectile';
import { ASSETS, loadGlb } from '../core/assets';
import { settings } from '../core/settings';

export type TowerType = 'arrow' | 'cannon' | 'frost';

export const TOWER_DEFS: Record<
  TowerType,
  {
    name: string;
    cost: number;
    range: number;
    cooldown: number; // seconds
    damage: number;
    color: number;
    projectileSpeed: number;
    aoeRadius?: number;
    slowMs?: number;
  }
> = {
  arrow: { name: 'Arrow', cost: 50, range: 11, cooldown: 0.7, damage: 10, color: 0xddbb55, projectileSpeed: 26 },
  cannon: { name: 'Cannon', cost: 80, range: 9, cooldown: 1.8, damage: 22, color: 0xdd6633, projectileSpeed: 16, aoeRadius: 3 },
  frost: { name: 'Frost', cost: 60, range: 9, cooldown: 1.1, damage: 5, color: 0x66ccee, projectileSpeed: 20, slowMs: 2000 },
};

export class Tower {
  readonly object = new THREE.Group();
  private cooldownLeft = 0;
  private readonly head: THREE.Mesh;
  private readonly muzzle = new THREE.Vector3();

  constructor(readonly type: TowerType, position: THREE.Vector3, scene: THREE.Scene) {
    const def = TOWER_DEFS[type];
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 1.1, 2.4, 8),
      new THREE.MeshStandardMaterial({ color: 0x666a77, roughness: 0.8 })
    );
    body.position.y = 1.2;
    body.castShadow = true;
    // the orb stays even with the GLB — it marks the tower type and aims at targets
    this.head = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 10, 10),
      new THREE.MeshStandardMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 0.35 })
    );
    this.head.position.y = 2.8;
    this.head.castShadow = true;
    this.object.add(body, this.head);
    this.object.position.copy(position);
    scene.add(this.object);

    loadGlb(ASSETS.tower).then(
      (gltf) => {
        this.object.remove(body);
        body.geometry.dispose();
        (body.material as THREE.Material).dispose();
        const model = gltf.scene.clone();
        const box = new THREE.Box3().setFromObject(model);
        const h = box.max.y - box.min.y;
        if (h > 0.01) model.scale.setScalar(3.4 / h);
        model.position.y = -box.min.y * (h > 0.01 ? 3.4 / h : 1);
        model.traverse((o) => {
          if (o instanceof THREE.Mesh) o.castShadow = true;
        });
        this.object.add(model);
        this.head.position.y = 3.9;
      },
      () => {} // keep cylinder fallback
    );
  }

  update(dt: number, _now: number, enemies: Enemy[], projectiles: Projectile[], scene: THREE.Scene): void {
    const def = TOWER_DEFS[this.type];
    if (this.object.scale.x !== settings.towerScale) this.object.scale.setScalar(settings.towerScale);
    this.cooldownLeft -= dt;
    if (this.cooldownLeft > 0) return;

    // target: enemy furthest along (closest waypoint index is private; use distance to base as proxy — nearest in range)
    let best: Enemy | null = null;
    let bestDist = Infinity;
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = e.object.position.distanceTo(this.object.position);
      if (d <= def.range && d < bestDist) {
        best = e;
        bestDist = d;
      }
    }
    if (!best) return;

    this.cooldownLeft = def.cooldown;
    this.muzzle.copy(this.object.position).setY(this.head.position.y * this.object.scale.y);
    projectiles.push(
      new Projectile(
        {
          from: this.muzzle,
          target: best,
          speed: def.projectileSpeed,
          damage: def.damage,
          color: def.color,
          aoeRadius: def.aoeRadius,
          slowMs: def.slowMs,
        },
        scene
      )
    );
    // face target
    const d = best.object.position.clone().sub(this.object.position);
    this.head.rotation.y = Math.atan2(d.x, d.z);
  }
}

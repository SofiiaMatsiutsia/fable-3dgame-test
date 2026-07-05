import * as THREE from 'three';
import './style.css';
import { buildArena, type Plot } from './world/arena';
import { Spawner } from './entities/spawner';
import { Tower, TOWER_DEFS, type TowerType } from './entities/tower';
import { Projectile } from './entities/projectile';
import { PlayerController } from './player/controller';
import { Hud } from './ui/hud';
import { buildTweaks } from './ui/tweaks';
import { events } from './core/events';
import { state } from './core/state';
import { settings } from './core/settings';
import { sfx } from './audio/sfx';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 300);
camera.position.set(0, 30, 40);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const { plots } = buildArena(scene);
const spawner = new Spawner(scene);
const towers: Tower[] = [];
const projectiles: Projectile[] = [];
const player = new PlayerController(scene, camera, () => spawner.enemies);

function buildTower(type: TowerType, plot: Plot): Tower | null {
  const def = TOWER_DEFS[type];
  if (plot.occupied || !state.spend(def.cost)) return null;
  plot.occupied = true;
  (plot.mesh.material as THREE.MeshStandardMaterial).color.setHex(0x444444);
  const tower = new Tower(type, plot.position, scene);
  towers.push(tower);
  events.emit('TOWER_PLACED', { towerType: type, cost: def.cost, wave: state.wave });
  return tower;
}

new Hud(camera, plots, buildTower, () => spawner.startWave());
buildTweaks();

// impact FX: brief expanding ring
const impacts: { mesh: THREE.Mesh; life: number }[] = [];
function spawnImpact(pos: THREE.Vector3, color: number): void {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(0.2, 0.4, 16),
    new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.copy(pos).setY(0.15);
  scene.add(mesh);
  impacts.push({ mesh, life: 0.35 });
  sfx.shoot();
}

// debug/testing handle (also handy for the future teacher agent)
Object.assign(window as unknown as Record<string, unknown>, {
  __game: { state, spawner, towers, projectiles, plots, player, events, buildTower, settings },
});

const timer = new THREE.Timer();
let accumulator = 0;
const STEP = 1 / 60;

function tick(): void {
  requestAnimationFrame(tick);
  timer.update();
  accumulator += Math.min(timer.getDelta(), 0.1);
  const now = performance.now();

  while (accumulator >= STEP) {
    accumulator -= STEP;
    if (state.phase === 'won' || state.phase === 'lost') break;
    player.update(STEP);
    spawner.update(STEP, now);
    for (const t of towers) t.update(STEP, now, spawner.enemies, projectiles, scene);
    for (const p of projectiles) p.update(STEP, now, spawner.enemies, spawnImpact);
    for (let i = projectiles.length - 1; i >= 0; i--) {
      if (projectiles[i].done) {
        projectiles[i].dispose(scene);
        projectiles.splice(i, 1);
      }
    }
    for (let i = impacts.length - 1; i >= 0; i--) {
      const fx = impacts[i];
      fx.life -= STEP;
      fx.mesh.scale.addScalar(STEP * 14);
      (fx.mesh.material as THREE.MeshBasicMaterial).opacity = fx.life / 0.35;
      if (fx.life <= 0) {
        scene.remove(fx.mesh);
        fx.mesh.geometry.dispose();
        (fx.mesh.material as THREE.Material).dispose();
        impacts.splice(i, 1);
      }
    }
  }

  renderer.render(scene, camera);
}
tick();

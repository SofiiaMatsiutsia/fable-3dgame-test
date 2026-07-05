import * as THREE from 'three';
import { ASSETS, loadGlb } from '../core/assets';
import { buildTerrain, heightAt, rocknessAt, TERRAIN_R } from './terrain';

export const ARENA_SIZE = 70;

// Enemy path waypoints (x, z) — S-curve from west edge to the base in the east.
export const PATH: THREE.Vector3[] = [
  new THREE.Vector3(-34, 0, -20),
  new THREE.Vector3(-12, 0, -20),
  new THREE.Vector3(-12, 0, 12),
  new THREE.Vector3(10, 0, 12),
  new THREE.Vector3(10, 0, -12),
  new THREE.Vector3(28, 0, -12),
].map((v) => v.clone());

export const BASE_POS = PATH[PATH.length - 1];

// Tower plot pads flanking the path.
export const PLOT_POSITIONS: THREE.Vector3[] = [
  new THREE.Vector3(-22, 0, -14),
  new THREE.Vector3(-18, 0, -26),
  new THREE.Vector3(-6, 0, -6),
  new THREE.Vector3(-18, 0, 6),
  new THREE.Vector3(-6, 0, 18),
  new THREE.Vector3(4, 0, 6),
  new THREE.Vector3(16, 0, 0),
  new THREE.Vector3(16, 0, -18),
  new THREE.Vector3(4, 0, -16),
  new THREE.Vector3(24, 0, -4),
];

export interface Plot {
  position: THREE.Vector3;
  mesh: THREE.Mesh;
  occupied: boolean;
}

export function buildArena(scene: THREE.Scene): { plots: Plot[] } {
  // SeedThree temperate biome: pale warm horizon, soft blue zenith, matching fog.
  scene.background = new THREE.Color(0xc6dcec);
  scene.fog = new THREE.Fog(0xc6dcec, 90, 220);
  scene.add(buildSkyDome());

  // SeedThree lighting: sky-blue/earth hemisphere fill + warm late-afternoon sun.
  const hemi = new THREE.HemisphereLight(0x9fc0ff, 0x3a4a2a, 1.2);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2e0, 2.8);
  sun.position.set(30, 50, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -50;
  sun.shadow.camera.right = 50;
  sun.shadow.camera.top = 50;
  sun.shadow.camera.bottom = -50;
  scene.add(sun);

  // SeedThree-style terrain ring: flat playfield, rocky hills around the rim.
  buildTerrain(scene);

  // Road ribbon along path segments
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x5c5148, roughness: 1 });
  for (let i = 0; i < PATH.length - 1; i++) {
    const a = PATH[i];
    const b = PATH[i + 1];
    const len = a.distanceTo(b);
    const seg = new THREE.Mesh(new THREE.BoxGeometry(len + 4, 0.1, 4), roadMat);
    seg.position.copy(a).add(b).multiplyScalar(0.5);
    seg.position.y = 0.05;
    seg.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
    seg.receiveShadow = true;
    scene.add(seg);
  }

  // Base: thatched cottage GLB (placeholder keep until it loads)
  const base = new THREE.Group();
  const keep = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.6, 4, 8),
    new THREE.MeshStandardMaterial({ color: 0x8a8fa8, roughness: 0.8 })
  );
  keep.position.y = 2;
  keep.castShadow = true;
  base.add(keep);
  base.position.copy(BASE_POS);
  scene.add(base);
  loadGlb(ASSETS.cottage).then(
    (gltf) => {
      base.remove(keep);
      keep.geometry.dispose();
      (keep.material as THREE.Material).dispose();
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const h = box.max.y - box.min.y;
      const k = h > 0.01 ? 7 / h : 1;
      model.scale.setScalar(k);
      model.position.y = -box.min.y * k;
      // face the incoming path
      model.rotation.y = Math.PI / 2;
      model.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      base.add(model);
    },
    () => {} // keep placeholder
  );

  // Spawn portal marker at path start
  const portal = new THREE.Mesh(
    new THREE.TorusGeometry(2, 0.3, 8, 24),
    new THREE.MeshStandardMaterial({ color: 0x7733cc, emissive: 0x5522aa, emissiveIntensity: 0.8 })
  );
  portal.position.copy(PATH[0]).setY(2);
  portal.rotation.y = Math.PI / 2;
  scene.add(portal);

  // Tower plots
  const plots: Plot[] = PLOT_POSITIONS.map((position) => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.6, 0.2, 16),
      new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.9 })
    );
    mesh.position.copy(position).setY(0.1);
    mesh.receiveShadow = true;
    scene.add(mesh);
    return { position, mesh, occupied: false };
  });

  // Scatter decorative rocks/trees away from path and plots
  const decoMat = new THREE.MeshStandardMaterial({ color: 0x3d5c3d, roughness: 1 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5b4432, roughness: 1 });
  const decoMat2 = new THREE.MeshStandardMaterial({ color: 0x5a7a3a, roughness: 1 });
  const rng = mulberry32(7);
  // Trees: a few inside the arena, many more rolling over the hills — they seek
  // the meadow pockets (low rockness), like SeedThree's forest scatter.
  for (let i = 0; i < 160; i++) {
    const x = (rng() - 0.5) * 2 * TERRAIN_R * 0.85;
    const z = (rng() - 0.5) * 2 * TERRAIN_R * 0.85;
    const p = new THREE.Vector3(x, 0, z);
    if (distToPath(p) < 6 || PLOT_POSITIONS.some((q) => q.distanceTo(p) < 4)) continue;
    const inArena = Math.max(Math.abs(x), Math.abs(z)) < 46;
    if (inArena && rng() > 0.25) continue; // keep the playfield sparse
    if (rocknessAt(x, z) > 0.55) continue; // trees avoid bare rock
    const s = 0.8 + rng() * (inArena ? 0.6 : 1.4);
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 1.5), trunkMat);
    trunk.position.y = 0.75;
    trunk.castShadow = true;
    const crown = new THREE.Mesh(
      new THREE.ConeGeometry(1.2 + rng(), 2.5 + rng() * 2, 7),
      rng() < 0.5 ? decoMat : decoMat2
    );
    crown.position.y = 2.8;
    crown.castShadow = true;
    tree.add(trunk, crown);
    tree.scale.setScalar(s);
    tree.position.set(x, heightAt(x, z) - 0.1, z);
    scene.add(tree);
  }

  return { plots };
}

// Gradient sky dome, vertex-coloured horizon→zenith (SeedThree environment.js).
function buildSkyDome(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(280, 32, 16);
  const zenith = new THREE.Color(0x3f6ea8);
  const horizon = new THREE.Color(0xc6dcec);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, Math.min(1, pos.getY(i) / 280 + 0.15));
    tmp.copy(horizon).lerp(zenith, t * t * (3 - 2 * t));
    col[i * 3] = tmp.r;
    col[i * 3 + 1] = tmp.g;
    col[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })
  );
  mesh.renderOrder = -1;
  return mesh;
}

export function distToPath(p: THREE.Vector3): number {
  let min = Infinity;
  const tmp = new THREE.Vector3();
  for (let i = 0; i < PATH.length - 1; i++) {
    const a = PATH[i];
    const b = PATH[i + 1];
    const ab = tmp.copy(b).sub(a);
    const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq()));
    const closest = a.clone().addScaledVector(ab, t);
    min = Math.min(min, closest.distanceTo(p));
  }
  return min;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

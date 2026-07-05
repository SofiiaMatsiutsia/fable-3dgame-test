import * as THREE from 'three';
import { ASSETS, loadGlb } from '../core/assets';

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
  scene.background = new THREE.Color(0x1a1f2e);
  scene.fog = new THREE.Fog(0x1a1f2e, 80, 160);

  const hemi = new THREE.HemisphereLight(0x8899cc, 0x334422, 1.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffeedd, 2.6);
  sun.position.set(30, 50, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -50;
  sun.shadow.camera.right = 50;
  sun.shadow.camera.top = 50;
  sun.shadow.camera.bottom = -50;
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA_SIZE * 2, ARENA_SIZE * 2),
    new THREE.MeshStandardMaterial({ color: 0x2e4a2e, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

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
  const rng = mulberry32(7);
  for (let i = 0; i < 40; i++) {
    const x = (rng() - 0.5) * ARENA_SIZE * 1.8;
    const z = (rng() - 0.5) * ARENA_SIZE * 1.8;
    const p = new THREE.Vector3(x, 0, z);
    if (distToPath(p) < 6 || PLOT_POSITIONS.some((q) => q.distanceTo(p) < 4)) continue;
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 1.5), trunkMat);
    trunk.position.y = 0.75;
    trunk.castShadow = true;
    const crown = new THREE.Mesh(new THREE.ConeGeometry(1.2 + rng(), 2.5 + rng() * 2, 7), decoMat);
    crown.position.y = 2.8;
    crown.castShadow = true;
    tree.add(trunk, crown);
    tree.position.copy(p);
    scene.add(tree);
  }

  return { plots };
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

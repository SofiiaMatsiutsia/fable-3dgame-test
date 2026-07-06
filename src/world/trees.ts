// Randomized low-poly décor trees scattered around the arena and hills.
// Three archetypes (conifer, broadleaf, birch) with per-tree variation in
// height, lean, crown shape and tint. Placement follows the terrain and keeps
// the enemy path and tower pads clear, like the grass scatter does.

import * as THREE from 'three';
import { distToPath, PLOT_POSITIONS } from './arena';
import { heightAt, rocknessAt, TERRAIN_R } from './terrain';

const TREE_COUNT = 180;
const PATH_CLEARANCE = 6;
const PLOT_CLEARANCE = 4.5;
const ARENA_EDGE = 46; // matches terrain FLAT_R — inside this the playfield stays sparse

// Small shared material palette (keeps draw-call state changes cheap).
const TRUNK = new THREE.MeshStandardMaterial({ color: 0x5b4432, roughness: 1 });
const TRUNK_PALE = new THREE.MeshStandardMaterial({ color: 0xb8b2a4, roughness: 1 });
const GREENS = [0x3d5c3d, 0x4a7040, 0x5a7a3a, 0x6d8a4a, 0x38684c].map(
  (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1 })
);
// index-matched darker variants for conifer tops (shared, no per-tree clones)
const GREENS_DARK = GREENS.map((m) => {
  const d = m.clone();
  d.color.multiplyScalar(0.72);
  return d;
});
const AUTUMN = [0x9a7a30, 0xa8642e].map(
  (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1 })
);

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function leafMat(rng: () => number): THREE.MeshStandardMaterial {
  // mostly greens, the odd autumn tree for warmth
  return rng() < 0.12 ? pick(AUTUMN, rng) : pick(GREENS, rng);
}

// -- archetypes ---------------------------------------------------------------

function conifer(rng: () => number): THREE.Group {
  const g = new THREE.Group();
  const h = 3.2 + rng() * 3;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.26, h * 0.4, 6), TRUNK);
  trunk.position.y = h * 0.2;
  g.add(trunk);
  // dense tier stack, darker toward the top — reads as a real fir silhouette
  const gi = Math.floor(rng() * GREENS.length);
  const base = GREENS[gi];
  const dark = GREENS_DARK[gi];
  const tiers = 4 + Math.floor(rng() * 3);
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const r = (1.5 - t * 1.05) * (0.85 + rng() * 0.3);
    const th = (h * 0.62) / tiers + h * 0.12;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, th, 8), t > 0.55 ? dark : base);
    cone.position.y = h * 0.28 + t * h * 0.62;
    cone.rotation.y = rng() * Math.PI;
    cone.rotation.z = (rng() - 0.5) * 0.05;
    g.add(cone);
  }
  return g;
}

function birch(rng: () => number): THREE.Group {
  const g = new THREE.Group();
  const h = 3.2 + rng() * 2;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, h, 5), TRUNK_PALE);
  trunk.position.y = h / 2;
  g.add(trunk);
  // fuller two-blob crown with a smoother silhouette (subdiv 1, not 0)
  const mat = leafMat(rng);
  const lower = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0 + rng() * 0.5, 1), mat);
  lower.scale.y = 1.2 + rng() * 0.3;
  lower.position.y = h * 0.9;
  lower.rotation.y = rng() * Math.PI;
  const upper = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7 + rng() * 0.35, 1), mat);
  upper.scale.y = 1.25;
  upper.position.set((rng() - 0.5) * 0.5, h * 0.9 + 1.1, (rng() - 0.5) * 0.5);
  g.add(lower, upper);
  return g;
}

// Oaks (world/oak.ts) own the arena and near ring; these cheaper archetypes
// fill the distant hills — fir-dominated with birch accents. (The old
// icosahedron "broadleaf" blobs are gone — they read as rocks on sticks.)
const ARCHETYPES = [conifer, conifer, conifer, birch];

// -- scatter ------------------------------------------------------------------

export function scatterTrees(scene: THREE.Scene, rng: () => number): void {
  const p = new THREE.Vector3();
  let placed = 0;
  let guard = TREE_COUNT * 8;
  while (placed < TREE_COUNT && guard-- > 0) {
    const x = (rng() - 0.5) * 2 * TERRAIN_R * 0.85;
    const z = (rng() - 0.5) * 2 * TERRAIN_R * 0.85;
    p.set(x, 0, z);
    if (distToPath(p) < PATH_CLEARANCE) continue;
    if (PLOT_POSITIONS.some((q) => q.distanceTo(p) < PLOT_CLEARANCE)) continue;
    const inArena = Math.max(Math.abs(x), Math.abs(z)) < ARENA_EDGE;
    if (inArena) continue; // the playfield belongs to the instanced oaks
    if (rocknessAt(x, z) > 0.55) continue; // no trees on bare rock

    const tree = pick(ARCHETYPES, rng)(rng);
    tree.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    const s = (0.8 + rng() * 0.7) * (inArena ? 1 : 1 + rng() * 0.8);
    tree.scale.setScalar(s);
    tree.rotation.y = rng() * Math.PI * 2;
    tree.rotation.z = (rng() - 0.5) * 0.08; // slight lean
    tree.position.set(x, heightAt(x, z) - 0.1, z);
    scene.add(tree);
    placed++;
  }
}

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
  const h = 2.6 + rng() * 2.4;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.28, h * 0.35, 6), TRUNK);
  trunk.position.y = h * 0.175;
  g.add(trunk);
  const mat = leafMat(rng);
  const tiers = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const r = (1.3 - t * 0.75) * (0.8 + rng() * 0.4);
    const th = h * (0.55 - t * 0.12);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, th, 7), mat);
    cone.position.y = h * 0.3 + t * h * 0.55 + th * 0.3;
    cone.rotation.y = rng() * Math.PI;
    g.add(cone);
  }
  return g;
}

function broadleaf(rng: () => number): THREE.Group {
  const g = new THREE.Group();
  const h = 1.6 + rng() * 1.4;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, h, 6), TRUNK);
  trunk.position.y = h / 2;
  g.add(trunk);
  const mat = leafMat(rng);
  const blobs = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < blobs; i++) {
    const r = 0.8 + rng() * 0.7;
    const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), mat);
    blob.position.set(
      (rng() - 0.5) * 1.3,
      h + r * 0.5 + rng() * 0.8,
      (rng() - 0.5) * 1.3
    );
    blob.rotation.set(rng() * Math.PI, rng() * Math.PI, 0);
    g.add(blob);
  }
  return g;
}

function birch(rng: () => number): THREE.Group {
  const g = new THREE.Group();
  const h = 3 + rng() * 1.8;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, h, 5), TRUNK_PALE);
  trunk.position.y = h / 2;
  g.add(trunk);
  const mat = leafMat(rng);
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9 + rng() * 0.5, 0), mat);
  crown.scale.y = 1.3 + rng() * 0.5;
  crown.position.y = h + 0.4;
  crown.rotation.y = rng() * Math.PI;
  g.add(crown);
  return g;
}

const ARCHETYPES = [conifer, conifer, broadleaf, broadleaf, birch]; // birches rarer

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
    if (inArena && rng() > 0.22) continue; // keep the playfield readable
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

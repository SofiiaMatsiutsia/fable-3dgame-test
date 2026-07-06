// SeedThree-style terrain ring, ported to WebGL (from SeedThree environment.js):
// flat centre where the game plays, rising into noisy hills around the rim,
// with vertex-painted grass↔rock blending driven by a shared "rockness" field.
// The same sampler feeds the terrain mesh, the grass scatter, and tree
// placement — one noise, all systems agreeing (SeedThree's core idea).

import * as THREE from 'three';

// ---- deterministic value noise (SeedThree environment.js) ------------------
function hash2(ix: number, iz: number, seed: number): number {
  let h = (ix * 374761393 + iz * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const smooth = (t: number): number => t * t * (3 - 2 * t);
function valueNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  const u = smooth(fx), v = smooth(fz);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
function fbm(x: number, z: number, seed: number): number {
  let sum = 0, amp = 0.5, freq = 1;
  for (let o = 0; o < 4; o++) {
    sum += amp * valueNoise(x * freq, z * freq, seed + o * 17);
    amp *= 0.5;
    freq *= 2;
  }
  return sum;
}

const SEED = 11;
export const TERRAIN_R = 150;   // half-size of the terrain plane
export const FLAT_R = 46;       // gameplay stays flat inside this square radius
const HILL_H = 14;
const RAMP = 60;                // foothill band width

// Square-ish flat centre (the arena is rectangular), hills beyond.
const rimDist = (x: number, z: number): number => Math.max(Math.abs(x), Math.abs(z));

export function heightAt(x: number, z: number): number {
  const d = rimDist(x, z);
  if (d <= FLAT_R) return 0;
  const rp = smooth(Math.min(1, (d - FLAT_R) / RAMP));
  const n = fbm(x * 0.045, z * 0.045, SEED);
  return rp * HILL_H * (0.3 + 0.95 * n) + rp * 0.6 * (fbm(x * 0.22, z * 0.22, SEED + 5) - 0.5);
}

// Soft meadow pockets in the hills cut the rockness down (SeedThree: one noise
// painting grass, seeding tufts, and attracting trees simultaneously).
function meadowAt(x: number, z: number): number {
  const n = fbm(x * 0.03 + 31, z * 0.03 - 17, SEED + 23);
  return smooth(Math.max(0, Math.min(1, (n - 0.42) / 0.25)));
}

export function rocknessAt(x: number, z: number): number {
  const d = rimDist(x, z);
  const rp = smooth(Math.max(0, Math.min(1, (d - FLAT_R) / RAMP)));
  return Math.min(1, rp * 1.25 + 0.2 * (fbm(x * 0.3, z * 0.3, SEED + 9) - 0.5))
    * (1 - 0.85 * meadowAt(x, z));
}

export function buildTerrain(scene: THREE.Scene): THREE.Mesh {
  const segs = 220;
  const geo = new THREE.PlaneGeometry(TERRAIN_R * 2, TERRAIN_R * 2, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  const col = new Float32Array(p.count * 3);

  // Vertex-painted grass↔rock: meadow greens with fbm mottling, blending into
  // SeedThree's dark slate rock on the hills, lighter scree flecks on top.
  // near-neutral multipliers now that a grass texture carries the base color
  // (full-strength greens × green texture would double-darken)
  const meadow = new THREE.Color(0xa8c48c);
  const meadowLight = new THREE.Color(0xdcecc4);
  const rock = new THREE.Color(0x4a5470);
  const rockLight = new THREE.Color(0x707c9a);
  const tmp = new THREE.Color();
  const tmp2 = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, heightAt(x, z));
    const w = rocknessAt(x, z);
    const gN = fbm(x * 0.11, z * 0.11, SEED + 41);       // meadow mottling
    const rN = fbm(x * 0.18 + 7, z * 0.18, SEED + 55);   // rock mottling
    tmp.copy(meadow).lerp(meadowLight, gN);
    tmp2.copy(rock).lerp(rockLight, smooth(rN));
    // sharpen the border so grass "fingers" into rock instead of airbrushing
    const t = smooth(Math.max(0, Math.min(1, (w - 0.35) / 0.3)));
    tmp.lerp(tmp2, t);
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();

  // SeedThree ground: tiled grass albedo modulated by the vertex-painted
  // grass↔rock blend — the texture supplies blade detail, the vertex colors
  // keep the biome painting.
  const grassTex = new THREE.TextureLoader().load('/assets/seedthree/grass_albedo.jpg');
  grassTex.colorSpace = THREE.SRGBColorSpace;
  grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
  grassTex.repeat.setScalar((TERRAIN_R * 2) / 7); // ~7 m per tile
  grassTex.anisotropy = 8;
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ map: grassTex, vertexColors: true, roughness: 1, metalness: 0 })
  );
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

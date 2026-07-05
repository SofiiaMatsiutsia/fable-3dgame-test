// SeedThree-style grass, ported to WebGL.
// Technique borrowed from SeedThree (github.com/SkyeShark/SeedThree) src/core/grass.js:
//  - instanced tufts scattered over the ground
//  - vertex normals point straight UP so tufts inherit the terrain's lighting
//    instead of flickering by blade angle
//  - per-instance green/straw tint variance kills the "stamped carpet" look
//  - tips bend in a shared wind field (base pinned, bend ~ height²)
// SeedThree's original uses three/webgpu TSL node materials; here the same idea
// is injected into MeshLambertMaterial via onBeforeCompile.

import * as THREE from 'three';
import { PLOT_POSITIONS, distToPath } from './arena';
import { heightAt, rocknessAt, TERRAIN_R } from './terrain';

const TUFT_COUNT = 48000;
const PATH_CLEARANCE = 4.5; // road half-width 2 + margin
const PLOT_CLEARANCE = 2.6; // pad radius 1.6 + margin

// Wind uniforms shared by all tufts — live-tunable, no rebuild (SeedThree wind.js).
export const windUniforms = {
  uTime: { value: 0 },
  uWindStrength: { value: 0.55 }, // light breeze (SeedThree default 0.5)
  uWindSpeed: { value: 1.0 },
  uWindDir: { value: new THREE.Vector2(0.85, 0.53).normalize() },
};

// A tuft = several triangular blades fanned around the origin, base at y=0.
// (SeedThree uses textured crossed quads; untextured tapered blades read better
// in this low-poly game and need no alpha testing.)
function tuftGeometry(rng: () => number): THREE.BufferGeometry {
  const blades = 8;
  const positions: number[] = [];
  const normals: number[] = [];
  const heights: number[] = []; // 0 at base → 1 at tip, drives wind bend
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + rng() * 0.8;
    const lean = 0.25 + rng() * 0.3;
    const h = 0.7 + rng() * 0.5;
    const w = 0.09 + rng() * 0.05;
    const dx = Math.cos(a), dz = Math.sin(a);
    // base left, base right, tip
    const px = -dz * w, pz = dx * w;
    positions.push(
      px, 0, pz,
      -px, 0, -pz,
      dx * lean, h, dz * lean
    );
    for (let i = 0; i < 3; i++) normals.push(0, 1, 0); // SeedThree trick: light like the ground
    heights.push(0, 0, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
  g.setAttribute('aHeight', new THREE.BufferAttribute(new Float32Array(heights), 1));
  return g;
}

export function buildGrass(scene: THREE.Scene): THREE.InstancedMesh {
  const rng = mulberry32(1234);
  const geo = tuftGeometry(rng);

  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
  });

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, windUniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aHeight;
        attribute vec3 aTint;
        varying vec3 vTint;
        uniform float uTime;
        uniform float uWindStrength;
        uniform float uWindSpeed;
        uniform vec2 uWindDir;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vTint = aTint;
        {
          // SeedThree grassWindPosition: base pinned, tips bend, bend ~ height².
          vec4 wp = instanceMatrix * vec4(transformed, 1.0);
          float t = uTime * uWindSpeed;
          float phase = wp.x * 0.35 + wp.z * 0.27;
          float gust = sin(t * 1.15 + phase * 2.2) * 0.72
                     + sin(t * 2.63 + phase * 4.18) * 0.28;
          float jitter = sin(t * 3.1 + wp.z * 1.7 + wp.x * 1.3) * 0.25;
          float k = aHeight * aHeight;
          vec2 bend = uWindDir * (gust + jitter) * uWindStrength * 0.22 * k;
          transformed.x += bend.x;
          transformed.z += bend.y;
        }`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vTint;`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb *= vTint;`
      )
      // SeedThree fix: DoubleSide flips the normal on back-facing blades →
      // half the tufts shade as if lit from below. Keep the world-up normal
      // on both faces so every blade lights like the ground.
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        normal = normalize( vNormal );`
      );
  };

  const mesh = new THREE.InstancedMesh(geo, mat, TUFT_COUNT);
  const tint = new Float32Array(TUFT_COUNT * 3);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const Y = new THREE.Vector3(0, 1, 0);
  const tintColor = new THREE.Color();
  const half = TERRAIN_R * 0.9;

  let placed = 0;
  let guard = TUFT_COUNT * 6;
  while (placed < TUFT_COUNT && guard-- > 0) {
    const x = (rng() - 0.5) * 2 * half;
    const z = (rng() - 0.5) * 2 * half;
    pos.set(x, 0, z);
    // keep the enemy road and tower pads clear and readable
    if (distToPath(pos) < PATH_CLEARANCE) continue;
    if (PLOT_POSITIONS.some((p) => p.distanceTo(pos) < PLOT_CLEARANCE)) continue;
    // hills: tufts only where the ground still reads as meadow (SeedThree:
    // only the harshest scree stays bare)
    const rocky = rocknessAt(x, z);
    if (rocky > 0.6 + rng() * 0.35) continue;
    pos.y = heightAt(x, z) - 0.02;
    q.setFromAxisAngle(Y, rng() * Math.PI * 2);
    const far = Math.max(Math.abs(x), Math.abs(z)) > 46;
    // carpet feel: smaller tufts, tightly packed, wide silhouettes
    const s = (0.35 + rng() * 0.4) * (far ? 1.7 : 1);
    scl.set(s * (1.1 + rng() * 0.6), s, s * (1.1 + rng() * 0.6));
    m.compose(pos, q, scl);
    mesh.setMatrixAt(placed, m);
    // SeedThree tint variance: lush yellow-green meadow, wide green-channel
    // spread, drying toward straw where the ground turns rocky.
    const dry = Math.min(0.3, Math.max(0, (rocky - 0.2) * 1.1)) + (rng() < 0.05 ? 0.15 : 0);
    // sRGB→linear so blade colors land in the same space as the terrain's
    // vertex colors (raw multipliers render far paler than intended)
    tintColor.setRGB(
      (0.36 + rng() * 0.18) + dry * 0.4,
      (0.58 + rng() * 0.26) * (1 - dry * 0.15),
      (0.2 + rng() * 0.08) * (1 - dry * 0.35),
      THREE.SRGBColorSpace
    );
    tint[placed * 3] = tintColor.r;
    tint[placed * 3 + 1] = tintColor.g;
    tint[placed * 3 + 2] = tintColor.b;
    placed++;
  }
  mesh.count = placed;
  geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 3));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false; // one draw call; matrix spans whole arena anyway
  scene.add(mesh);
  return mesh;
}

export function updateGrass(dt: number): void {
  windUniforms.uTime.value += dt;
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

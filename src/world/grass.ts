// SeedThree grass, ported to WebGL — now with SeedThree's actual tuft texture.
// Technique from SeedThree (github.com/SkyeShark/SeedThree) src/core/grass.js:
//  - instanced crossed-quad tufts with an alpha-tested grass texture
//  - vertex normals point straight UP so tufts inherit the terrain's lighting
//    (and the fragment normal is forced to vNormal so DoubleSide back faces
//    don't shade as if lit from below)
//  - wide per-instance green-channel tint variance kills the "stamped carpet"
//  - tips bend in a shared wind field (base pinned, bend ~ height²)
//  - substantial tuft sizes — "clumps read as GRASS only when they're
//    substantial; tiny tufts read as carpet fuzz" (SeedThree, via ez-tree)
// SeedThree's original uses three/webgpu TSL node materials; here the same idea
// is injected into MeshStandardMaterial via onBeforeCompile.

import * as THREE from 'three';
import { PLOT_POSITIONS, distToPath } from './arena';
import { heightAt, rocknessAt, TERRAIN_R } from './terrain';
import { asset } from '../core/assets';

const TUFT_COUNT = 16000;
const PATH_CLEARANCE = 4.5; // road half-width 2 + margin
const PLOT_CLEARANCE = 2.6; // pad radius 1.6 + margin

// Wind uniforms shared by all tufts (and the oak leaves) — live-tunable.
export const windUniforms = {
  uTime: { value: 0 },
  uWindStrength: { value: 0.55 }, // light breeze (SeedThree default 0.5)
  uWindSpeed: { value: 1.0 },
  uWindDir: { value: new THREE.Vector2(0.85, 0.53).normalize() },
};

// Crossed base-anchored quads (y 0..1), up-facing normals (SeedThree tuftGeometry).
// `planes`/`width` give distinct silhouettes so the meadow isn't one shape.
function tuftGeometry(planes: number, width: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let base = 0;
  for (let q = 0; q < planes; q++) {
    const a = (q * Math.PI) / planes;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    for (const [lx, ly] of [[-0.5 * width, 0], [0.5 * width, 0], [0.5 * width, 1], [-0.5 * width, 1]] as const) {
      positions.push(lx * ca, ly, lx * sa);
      normals.push(0, 1, 0); // grass trick: light like the ground plane
      uvs.push(lx / width + 0.5, ly);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    base += 4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  g.setIndex(indices);
  return g;
}

export function grassWindMaterial(map: THREE.Texture): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    map,
    alphaTest: 0.42,
    side: THREE.DoubleSide,
    roughness: 0.95,
    metalness: 0,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, windUniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
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
          float k = uv.y * uv.y;
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
      // SeedThree fix: DoubleSide flips the normal on back-facing quads →
      // half the tufts shade as if lit from below. Keep the world-up normal.
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        normal = normalize( vNormal );`
      );
  };
  return mat;
}

export function buildGrass(scene: THREE.Scene): THREE.InstancedMesh[] {
  const rng = mulberry32(1234);
  const tex = new THREE.TextureLoader().load(asset('assets/seedthree/grass_tuft.png'));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = grassWindMaterial(tex);

  // Two tuft silhouettes (SeedThree): wide meadow fans + narrow tall clumps.
  const variants = [
    { geo: tuftGeometry(2, 1.0), share: 0.62, tall: 1.0 },
    { geo: tuftGeometry(3, 0.6), share: 0.38, tall: 1.4 },
  ].map((v) => {
    const cap = Math.ceil(TUFT_COUNT * v.share);
    const mesh = new THREE.InstancedMesh(v.geo, mat, cap);
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    return { ...v, cap, mesh, tint: new Float32Array(cap * 3), placed: 0 };
  });

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const Y = new THREE.Vector3(0, 1, 0);
  const half = TERRAIN_R * 0.9;

  let placed = 0;
  let guard = TUFT_COUNT * 6;
  while (placed < TUFT_COUNT && guard-- > 0) {
    const variant = variants[rng() < variants[0].share ? 0 : 1];
    if (variant.placed >= variant.cap) continue;
    const x = (rng() - 0.5) * 2 * half;
    const z = (rng() - 0.5) * 2 * half;
    pos.set(x, 0, z);
    // keep the enemy road and tower pads clear and readable
    if (distToPath(pos) < PATH_CLEARANCE) continue;
    if (PLOT_POSITIONS.some((p) => p.distanceTo(pos) < PLOT_CLEARANCE)) continue;
    // only the harshest scree stays bare (SeedThree)
    const rocky = rocknessAt(x, z);
    if (rocky > 0.6 + rng() * 0.35) continue;
    pos.y = heightAt(x, z) - 0.02;
    q.setFromAxisAngle(Y, rng() * Math.PI * 2);
    const far = Math.max(Math.abs(x), Math.abs(z)) > 46;
    // ez-tree scale lesson: substantial clumps, wider than tall
    const h = (0.55 + rng() * 0.6) * (far ? 1.5 : 1) * variant.tall;
    scl.set((h * (1.4 + rng() * 0.7)) / variant.tall, h, (h * (1.4 + rng() * 0.7)) / variant.tall);
    m.compose(pos, q, scl);
    variant.mesh.setMatrixAt(variant.placed, m);
    // SeedThree tint ranges: wide green-channel variance, drying toward straw
    // where the ground turns rocky, occasional dry clump even in the meadow.
    // raw linear multipliers exactly like SeedThree's aTint (no sRGB conversion
    // — the texture already carries the sRGB green; tints just modulate it)
    const dry = Math.min(1, Math.max(0, (rocky - 0.15) * 1.6)) + (rng() < 0.1 ? 0.3 : 0);
    variant.tint[variant.placed * 3] = (0.55 + rng() * 0.45) + dry * 0.45;
    variant.tint[variant.placed * 3 + 1] = (0.55 + rng() * 0.7) * (1 - dry * 0.35);
    variant.tint[variant.placed * 3 + 2] = (0.45 + rng() * 0.35) * (1 - dry * 0.55);
    variant.placed++;
    placed++;
  }
  for (const v of variants) {
    v.mesh.count = v.placed;
    v.geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(v.tint, 3));
    v.mesh.instanceMatrix.needsUpdate = true;
    scene.add(v.mesh);
  }
  return variants.map((v) => v.mesh);
}

export function updateGrass(dt: number, windStrength = 0.55, windSpeed = 1): void {
  windUniforms.uTime.value += dt;
  windUniforms.uWindStrength.value = windStrength;
  windUniforms.uWindSpeed.value = windSpeed;
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

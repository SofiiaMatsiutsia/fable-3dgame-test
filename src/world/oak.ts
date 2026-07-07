// Real branching oaks, ported from SeedThree (github.com/SkyeShark/SeedThree):
// Weber-Penn skeletons (vendor/weber-penn.js) + tapered branch meshes
// (vendor/branch-mesh.js) with white-oak bark textures, and a canopy of
// base-anchored single-leaf cards (the leaf-cards.js placement grammar:
// phyllotactic spin + down-angle off the twig frame, size tapering toward the
// tip) baked into one merged geometry per template tree.
//
// A handful of template trees are generated once, then instanced across the
// map — 2 draw calls per template regardless of tree count.

import * as THREE from 'three';
import { generateSkeleton, type Stem } from './vendor/weber-penn.js';
import { buildBranchGeometry } from './vendor/branch-mesh.js';
import { Rng } from './vendor/rng';
import { windUniforms } from './grass';
import { distToPath, PLOT_POSITIONS } from './arena';
import { heightAt, rocknessAt, TERRAIN_R } from './terrain';
import { asset } from '../core/assets';

const TEMPLATE_COUNT = 4;
const OAK_COUNT = 52;
const PATH_CLEARANCE = 7;
const PLOT_CLEARANCE = 5;
const ARENA_EDGE = 46;

// White oak Weber-Penn params (SeedThree src/species/white-oak.js), scaled to
// game units (hero ~2 units tall → oaks 7–10).
function oakParams(rng: Rng): Record<string, unknown> {
  return {
    scale: rng.range(7, 10), scaleV: 0.8,
    levels: 3,
    ratio: 0.035,
    ratioPower: 1.3,
    baseSize: 0.18,
    shape: 1,            // spherical → broad rounded crown
    flare: 0.8,
    attractionUp: 0.7,
    baseSplits: rng.chance(0.5) ? 1 : 0,
    baseSplitAngle: 18,
    length:    [1.0, 0.5, 0.42, 0.35],
    lengthV:   [0.0, 0.12, 0.12, 0.1],
    taper:     [1.0, 1.0, 1.0, 1.0],
    curveRes:  [10, 6, 4, 3],
    curve:     [6, 30, 35, 0],
    curveBack: [0, -20, 0, 0],
    curveV:    [16, 80, 80, 70],
    downAngle: [0, 68, 55, 50],
    downAngleV:[0, 18, 20, 20],
    rotate:    [0, 140, 140, 140],
    rotateV:   [0, 30, 30, 30],
    branches:  [0, 18, 10, 0],           // trimmed from 26/14 — game LOD
    radialSegments: [10, 7, 5, 4],
  };
}

const GOLDEN = (137.5 * Math.PI) / 180;
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);

// Base-anchored leaf quad pair (leaf-cards.js makeLeafGeometry): base edge at
// y=0 on the twig, tip at y=1, second quad rotated 90° for volume.
const LEAF_QUAD_LOCAL: THREE.Vector3[][] = (() => {
  const quads: THREE.Vector3[][] = [];
  for (let q = 0; q < 2; q++) {
    const rot = new THREE.Quaternion().setFromAxisAngle(Y, (q * Math.PI) / 2);
    quads.push(
      [
        new THREE.Vector3(-0.5, 0, 0),
        new THREE.Vector3(0.5, 0, 0),
        new THREE.Vector3(0.5, 1, 0),
        new THREE.Vector3(-0.5, 1, 0),
      ].map((v) => v.applyQuaternion(rot))
    );
  }
  return quads;
})();

interface FoliageCfg {
  leavesPerBranch: number;
  size: number;
  sizeVar: number;
  downAngle: number;
  downAngleV: number;
  startFrac: number;
  taper: number;
  trunkClearRadius: number;
}

const OAK_FOLIAGE: FoliageCfg = {
  leavesPerBranch: 10,
  size: 0.85,          // slightly larger cards than SeedThree's 0.6 — fewer leaves, game LOD
  sizeVar: 0.25,
  downAngle: 52,
  downAngleV: 15,
  startFrac: 0.25,
  taper: 0.3,
  trunkClearRadius: 0.8,
};

// Bake all leaf cards of a tree into one BufferGeometry. Normals are "dome"
// normals — pointing outward from the canopy centre (origin dropped to the
// canopy bottom, SeedThree's black-underside fix) so foliage shades as a soft
// volume instead of flat cards.
function bakeFoliage(terminalStems: Stem[], cfg: FoliageCfg, rng: Rng): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const flutter: number[] = []; // wind weight per vertex (twig flexibility)
  const indices: number[] = [];

  const center = new THREE.Vector3();
  let minY = Infinity;
  for (const s of terminalStems) {
    center.add(s.points[s.points.length - 1]);
    for (const p of s.points) minY = Math.min(minY, p.y);
  }
  center.divideScalar(Math.max(1, terminalStems.length));
  const domeOrigin = new THREE.Vector3(center.x, Math.min(minY - 0.5, center.y - 1), center.z);

  const pos = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const qFrame = new THREE.Quaternion();
  const q1 = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  let vertBase = 0;

  for (const stem of terminalStems) {
    const pts = stem.points;
    const oris = stem.orients;
    const segN = pts.length - 1;
    let phyllo = rng.range(0, Math.PI * 2);

    for (let i = 0; i < cfg.leavesPerBranch; i++) {
      const frac = cfg.startFrac + (1 - cfg.startFrac) * ((i + rng.next()) / cfg.leavesPerBranch);
      const fseg = Math.min(segN - 1, Math.floor(frac * segN));
      const ft = frac * segN - fseg;
      pos.copy(pts[fseg]).lerp(pts[fseg + 1], ft);
      if (cfg.trunkClearRadius > 0 && Math.hypot(pos.x, pos.z) < cfg.trunkClearRadius && pos.y < center.y) continue;
      qFrame.copy(oris[fseg]).slerp(oris[fseg + 1], ft);
      phyllo += GOLDEN + rng.vary(0, 0.3);
      const down = ((cfg.downAngle + rng.vary(0, cfg.downAngleV)) * Math.PI) / 180;
      q1.setFromAxisAngle(X, down);
      q2.setFromAxisAngle(Y, phyllo);
      q.copy(qFrame).multiply(q2).multiply(q1);
      const s = cfg.size * (1 - cfg.taper * frac) * (1 + rng.vary(0, cfg.sizeVar));
      const wind = stem.winds ? stem.winds[fseg] * (1 - ft) + stem.winds[fseg + 1] * ft : 0.8;

      for (const quad of LEAF_QUAD_LOCAL) {
        for (let k = 0; k < 4; k++) {
          v.copy(quad[k]).multiplyScalar(s).applyQuaternion(q).add(pos);
          positions.push(v.x, v.y, v.z);
          n.copy(v).sub(domeOrigin).normalize();
          normals.push(n.x, n.y, n.z);
          flutter.push(wind * (k >= 2 ? 1 : 0.5)); // tips flutter more than the base edge
        }
        uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
        indices.push(vertBase, vertBase + 1, vertBase + 2, vertBase, vertBase + 2, vertBase + 3);
        vertBase += 4;
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geo.setAttribute('aFlutter', new THREE.BufferAttribute(new Float32Array(flutter), 1));
  geo.setIndex(indices);
  return geo;
}

function leafMaterial(): THREE.MeshStandardMaterial {
  const loader = new THREE.TextureLoader();
  const albedo = loader.load(asset('assets/seedthree/white_oak_single_albedo.png'));
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.anisotropy = 4;
  const mat = new THREE.MeshStandardMaterial({
    map: albedo,
    alphaTest: 0.42,
    side: THREE.DoubleSide,
    roughness: 0.9,
    metalness: 0,
    color: 0xdfe8c8, // SeedThree white-oak tint: near-neutral, texture's green shows
    // poor man's leaf translucency: lift the shadow side the way SeedThree's
    // SSS transmit does — without it the crown's dark side goes near-black
    emissive: 0x243312,
    emissiveIntensity: 0.35,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, windUniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aFlutter;
        uniform float uTime;
        uniform float uWindStrength;
        uniform float uWindSpeed;
        uniform vec2 uWindDir;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          // gentle canopy flutter: phase by tree position (instance) + leaf spot
          vec3 treePos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float t = uTime * uWindSpeed;
          float phase = treePos.x * 0.35 + treePos.z * 0.27 + transformed.y * 0.8;
          float sway = sin(t * 1.15 + phase) * 0.7 + sin(t * 2.9 + phase * 2.3) * 0.3;
          transformed.xz += uWindDir * sway * uWindStrength * 0.1 * aFlutter;
        }`
      );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      `#include <normal_fragment_begin>
      normal = normalize( vNormal );` // dome normals on both faces of DoubleSide cards
    );
  };
  return mat;
}

function barkMaterial(): THREE.MeshStandardMaterial {
  const loader = new THREE.TextureLoader();
  const albedo = loader.load(asset('assets/seedthree/white_oak_albedo.jpg'));
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.wrapS = albedo.wrapT = THREE.RepeatWrapping;
  const normal = loader.load(asset('assets/seedthree/white_oak_normal.jpg'));
  normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshStandardMaterial({
    map: albedo,
    normalMap: normal,
    roughness: 0.95,
    metalness: 0,
  });
}

export function scatterOaks(scene: THREE.Scene, rng: () => number): void {
  const bark = barkMaterial();
  const leaves = leafMaterial();

  // template trees (unique silhouettes), instanced many times each
  const templates = Array.from({ length: TEMPLATE_COUNT }, (_, i) => {
    const treeRng = new Rng(`oak:${i}`);
    const { stems } = generateSkeleton(oakParams(treeRng), treeRng);
    const branchGeo = buildBranchGeometry(stems, {
      tileWorldSize: 1.55,
      radialScale: 0.8,
      terminalSides: 3,
      terminalRingStride: 2,
    });
    const terminal = stems.filter((s) => s.level === s.maxLevel);
    const leafGeo = bakeFoliage(terminal, OAK_FOLIAGE, treeRng);
    return { branchGeo, leafGeo, matrices: [] as THREE.Matrix4[] };
  });

  // placement: same rules as grass/trees — clear of road, pads, bare rock
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  let placed = 0;
  let guard = OAK_COUNT * 10;
  while (placed < OAK_COUNT && guard-- > 0) {
    const x = (rng() - 0.5) * 2 * TERRAIN_R * 0.8;
    const z = (rng() - 0.5) * 2 * TERRAIN_R * 0.8;
    p.set(x, 0, z);
    if (distToPath(p) < PATH_CLEARANCE) continue;
    if (PLOT_POSITIONS.some((c) => c.distanceTo(p) < PLOT_CLEARANCE)) continue;
    const inArena = Math.max(Math.abs(x), Math.abs(z)) < ARENA_EDGE;
    if (inArena && rng() > 0.25) continue; // a few hero oaks inside, most beyond
    if (rocknessAt(x, z) > 0.5) continue;
    const t = templates[Math.floor(rng() * TEMPLATE_COUNT)];
    q.setFromAxisAngle(Y, rng() * Math.PI * 2);
    const s = 0.8 + rng() * 0.5;
    scl.setScalar(s);
    p.y = heightAt(x, z) - 0.05;
    t.matrices.push(new THREE.Matrix4().compose(p.clone(), q.clone(), scl.clone()));
    placed++;
  }

  for (const t of templates) {
    if (!t.matrices.length) continue;
    const branches = new THREE.InstancedMesh(t.branchGeo, bark, t.matrices.length);
    const foliage = new THREE.InstancedMesh(t.leafGeo, leaves, t.matrices.length);
    t.matrices.forEach((m, i) => {
      branches.setMatrixAt(i, m);
      foliage.setMatrixAt(i, m);
    });
    branches.castShadow = true;
    branches.receiveShadow = true;
    foliage.castShadow = true;
    scene.add(branches, foliage);
  }
}

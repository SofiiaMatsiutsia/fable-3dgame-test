import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Resolves a public/ asset URL against Vite's configured base path so the
// same code works both at the dev root ("/") and under a GitHub Pages
// subpath ("/fable-3dgame-test/"). BASE_URL always ends in a slash.
export function asset(path: string): string {
  return import.meta.env.BASE_URL + path.replace(/^\/+/, '');
}

export const ASSETS = {
  hero: asset('assets/hero/Meshy_AI_Emerald_Sprite_Fox_biped_Meshy_AI_Meshy_Merged_Animations.glb'),
  enemy: asset('assets/enemy/Meshy_AI_Mossy_Viking_Madness_biped_Meshy_AI_Meshy_Merged_Animations.glb'),
  tower: asset('assets/tower.glb'),
  cottage: asset('assets/cottage.glb'),
} as const;

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

const cache = new Map<string, Promise<GLTF>>();

// Normalizes a character material from a GLB export so it renders correctly.
// Meshy AI exports materials with alphaMode BLEND even for fully opaque
// textures; GLTFLoader maps that to transparent=true + depthWrite=false, so
// the character can't occlude itself and far parts (tail, ears) blend over
// near ones. Force opaque depth-tested rendering; alphaTest keeps genuine
// cut-out textures (fur cards, leaves) working without blend sorting.
export function prepareCharacterMaterial(material: THREE.Material | THREE.Material[]): void {
  const mats = Array.isArray(material) ? material : [material];
  for (const m of mats) {
    m.transparent = false;
    m.depthWrite = true;
    m.alphaTest = 0.5;
    // Textures shimmer at the shallow angles the game camera views characters
    // from while they move; anisotropic filtering keeps them crisp. three
    // clamps to the GPU max, so 8 is a safe request.
    for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'] as const) {
      const tex = (m as unknown as Record<string, THREE.Texture | null>)[key];
      if (tex) {
        tex.anisotropy = 8;
        tex.needsUpdate = true;
      }
    }
    m.needsUpdate = true;
  }
}

// Cached GLB load — every caller shares one fetch/parse per URL.
// Callers must clone (SkeletonUtils.clone for skinned meshes) before adding to a scene.
export function loadGlb(url: string): Promise<GLTF> {
  let p = cache.get(url);
  if (!p) {
    p = loader.loadAsync(url);
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return p;
}

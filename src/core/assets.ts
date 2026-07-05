import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export const ASSETS = {
  hero: '/assets/hero/Meshy_AI_Emerald_Sprite_Fox_biped_Meshy_AI_Meshy_Merged_Animations.glb',
  enemy: '/assets/enemy/Meshy_AI_Mossy_Viking_Madness_biped_Meshy_AI_Meshy_Merged_Animations.glb',
  tower: '/assets/tower.glb',
  cottage: '/assets/cottage.glb',
} as const;

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

const cache = new Map<string, Promise<GLTF>>();

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

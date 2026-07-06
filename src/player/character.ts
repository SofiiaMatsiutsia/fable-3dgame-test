import * as THREE from 'three';
import { ASSETS, loadGlb, prepareCharacterMaterial } from '../core/assets';

// Player visual: loads the Emerald Sprite Fox (Meshy AI export with merged
// animation clips). Falls back to a placeholder robot if the GLB fails.
// Clips fuzzy-matching idle/run|walk/attack|punch|swing drive the
// AnimationMixer; otherwise procedural bob + arm swing.

export type ClipName = 'idle' | 'run' | 'attack';

export class Character {
  readonly object = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private actions: Partial<Record<ClipName, THREE.AnimationAction>> = {};
  private current: ClipName = 'idle';
  private attackTimer = 0;
  // placeholder parts for procedural animation
  private placeholder: THREE.Group | null = null;
  private armR: THREE.Mesh | null = null;
  private bobPhase = 0;
  moving = false;

  constructor(scene: THREE.Scene) {
    this.buildPlaceholder();
    scene.add(this.object);
    this.tryLoadGlb();
  }

  private buildPlaceholder(): void {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x44aacc, roughness: 0.5, metalness: 0.3 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.7 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.6, 4, 8), mat);
    torso.position.y = 1.1;
    torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12), mat);
    head.position.y = 1.85;
    head.castShadow = true;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.1), dark);
    visor.position.set(0, 1.88, 0.24);
    this.armR = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.5, 4, 8), mat);
    this.armR.position.set(0.55, 1.3, 0);
    this.armR.castShadow = true;
    const armL = this.armR.clone();
    armL.position.x = -0.55;
    // sword on right arm
    const sword = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 1.1, 0.16),
      new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9, roughness: 0.2 })
    );
    sword.position.set(0, -0.7, 0.2);
    this.armR.add(sword);
    g.add(torso, head, visor, this.armR, armL);
    this.placeholder = g;
    this.object.add(g);
  }

  private tryLoadGlb(): void {
    loadGlb(ASSETS.hero).then(
      (gltf) => {
        if (this.placeholder) {
          this.object.remove(this.placeholder);
          this.placeholder = null;
          this.armR = null;
        }
        const model = gltf.scene;
        model.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.castShadow = true;
            // Skinned bounds track the bind pose, not the animated/moving mesh, so
            // three culls the fox against a stale box and it flickers or vanishes
            // at screen edges while running. Keep it always drawn.
            o.frustumCulled = false;
            prepareCharacterMaterial(o.material);
          }
        });
        // normalize height to ~2 units (precise=true → bounds through bone transforms)
        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model, true);
        const h = box.max.y - box.min.y;
        if (h > 0.01) model.scale.setScalar(2 / h);
        this.object.add(model);
        if (gltf.animations.length) {
          this.mixer = new THREE.AnimationMixer(model);
          const find = (patterns: RegExp) =>
            gltf.animations.find((c) => patterns.test(c.name.toLowerCase()));
          const idle = find(/idle|stand/) ?? gltf.animations[0];
          const run = find(/run|walk|jog/) ?? idle;
          const attack = find(/attack|punch|swing|slash|hit/) ?? idle;
          this.actions.idle = this.mixer.clipAction(idle);
          this.actions.run = this.mixer.clipAction(run);
          this.actions.attack = this.mixer.clipAction(attack);
          this.actions.attack.setLoop(THREE.LoopOnce, 1);
          this.actions.idle.play();
        }
        console.info('[character] loaded hero fox', gltf.animations.map((a) => a.name));
      },
      (err: unknown) => console.warn('[character] hero GLB failed to load, using placeholder', err)
    );
  }

  playAttack(): void {
    this.attackTimer = 0.35;
    if (this.actions.attack && this.actions.idle) {
      this.actions.attack.reset().play();
    }
  }

  update(dt: number): void {
    if (this.mixer) {
      const want: ClipName = this.attackTimer > 0 ? 'attack' : this.moving ? 'run' : 'idle';
      if (want !== this.current && want !== 'attack') {
        const from = this.actions[this.current];
        const to = this.actions[want];
        if (to && from !== to) {
          from?.fadeOut(0.15);
          to.reset().fadeIn(0.15).play();
        }
        this.current = want;
      }
      this.mixer.update(dt);
    } else if (this.placeholder) {
      // procedural: bob while moving, swing arm on attack
      this.bobPhase += dt * (this.moving ? 12 : 2);
      this.placeholder.position.y = Math.abs(Math.sin(this.bobPhase)) * (this.moving ? 0.12 : 0.03);
      if (this.armR) {
        this.armR.rotation.x = this.attackTimer > 0 ? -2.2 * (this.attackTimer / 0.35) : this.moving ? Math.sin(this.bobPhase) * 0.6 : 0;
      }
    }
    if (this.attackTimer > 0) this.attackTimer -= dt;
  }
}

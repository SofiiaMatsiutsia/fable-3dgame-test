import * as THREE from 'three';
import { events } from '../core/events';
import { state, TOTAL_WAVES } from '../core/state';
import { TOWER_DEFS, Tower, type TowerType } from '../entities/tower';
import type { Plot } from '../world/arena';
import { sfx } from '../audio/sfx';

export class Hud {
  private goldEl: HTMLElement;
  private livesEl: HTMLElement;
  private waveEl: HTMLElement;
  private msgEl: HTMLElement;
  private waveBtn: HTMLButtonElement;
  private shopEl: HTMLElement;
  private overlayEl: HTMLElement;
  private selectedPlot: Plot | null = null;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();

  constructor(
    private camera: THREE.PerspectiveCamera,
    private plots: Plot[],
    private onBuild: (type: TowerType, plot: Plot) => Tower | null,
    onStartWave: () => void
  ) {
    document.body.insertAdjacentHTML(
      'beforeend',
      `<div id="hud">
        <div id="stats">
          <span>💰 <b id="gold">${state.gold}</b></span>
          <span>❤️ <b id="lives">${state.lives}</b></span>
          <span>🌊 <b id="wave">0</b>/${TOTAL_WAVES}</span>
        </div>
        <button id="wave-btn">▶ Start Wave 1</button>
        <div id="msg"></div>
        <div id="shop" hidden></div>
        <div id="help">WASD move · Space attack · click a grey pad to build</div>
        <div id="overlay" hidden></div>
      </div>`
    );
    this.goldEl = document.getElementById('gold')!;
    this.livesEl = document.getElementById('lives')!;
    this.waveEl = document.getElementById('wave')!;
    this.msgEl = document.getElementById('msg')!;
    this.shopEl = document.getElementById('shop')!;
    this.overlayEl = document.getElementById('overlay')!;
    this.waveBtn = document.getElementById('wave-btn') as HTMLButtonElement;
    this.waveBtn.addEventListener('click', () => {
      onStartWave();
      this.waveBtn.hidden = true;
      this.closeShop();
    });

    this.buildShop();
    window.addEventListener('pointerdown', (e) => this.onPointerDown(e));

    events.on('GOLD_CHANGED', ({ gold }) => {
      this.goldEl.textContent = String(gold);
      this.refreshShopAfford();
    });
    events.on('BASE_HIT', ({ livesLeft }) => {
      this.livesEl.textContent = String(livesLeft);
      sfx.baseHit();
      this.flash('The base was hit!');
    });
    events.on('WAVE_START', ({ wave, enemyCount }) => {
      this.waveEl.textContent = String(wave);
      sfx.horn();
      this.flash(`Wave ${wave}: ${enemyCount} enemies incoming!`);
    });
    events.on('WAVE_SURVIVED', ({ wave }) => {
      this.flash(`Wave ${wave} survived! Build up before the next one.`);
      this.waveBtn.textContent = `▶ Start Wave ${wave + 1}`;
      this.waveBtn.hidden = false;
    });
    events.on('ENEMY_KILLED', () => sfx.coin());
    events.on('PLAYER_ATTACK', ({ hits }) => (hits > 0 ? sfx.hit() : sfx.swing()));
    events.on('TOWER_PLACED', () => sfx.place());
    events.on('GAME_OVER', ({ won, wave }) => {
      (won ? sfx.win : sfx.lose)();
      this.overlayEl.hidden = false;
      this.overlayEl.innerHTML = won
        ? `<h1>🏆 Victory!</h1><p>You survived all ${wave} waves.</p><button onclick="location.reload()">Play again</button>`
        : `<h1>💀 Defeat</h1><p>The base fell on wave ${wave}.</p><button onclick="location.reload()">Try again</button>`;
    });
  }

  private buildShop(): void {
    this.shopEl.innerHTML =
      '<div id="shop-title">Build tower</div>' +
      (Object.keys(TOWER_DEFS) as TowerType[])
        .map((t) => {
          const d = TOWER_DEFS[t];
          return `<button class="shop-btn" data-type="${t}">
            <span class="dot" style="background:#${d.color.toString(16).padStart(6, '0')}"></span>
            ${d.name} — ${d.cost}💰</button>`;
        })
        .join('') +
      '<button class="shop-btn" data-type="cancel">Cancel</button>';
    this.shopEl.querySelectorAll<HTMLButtonElement>('.shop-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const t = btn.dataset.type!;
        if (t !== 'cancel' && this.selectedPlot) {
          const tower = this.onBuild(t as TowerType, this.selectedPlot);
          if (!tower) {
            this.flash('Not enough gold!');
            return;
          }
        }
        this.closeShop();
      });
    });
  }

  private refreshShopAfford(): void {
    this.shopEl.querySelectorAll<HTMLButtonElement>('.shop-btn').forEach((btn) => {
      const t = btn.dataset.type as TowerType | 'cancel';
      if (t !== 'cancel') btn.disabled = !state.canAfford(TOWER_DEFS[t].cost);
    });
  }

  private onPointerDown(e: PointerEvent): void {
    if ((e.target as HTMLElement).closest('#hud button, #shop')) return;
    if (state.phase === 'won' || state.phase === 'lost') return;
    this.pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const free = this.plots.filter((p) => !p.occupied);
    const hit = this.raycaster.intersectObjects(free.map((p) => p.mesh))[0];
    if (hit) {
      this.selectedPlot = free.find((p) => p.mesh === hit.object)!;
      this.shopEl.hidden = false;
      this.shopEl.style.left = `${Math.min(e.clientX, innerWidth - 190)}px`;
      this.shopEl.style.top = `${Math.min(e.clientY, innerHeight - 220)}px`;
      this.refreshShopAfford();
      (this.selectedPlot.mesh.material as THREE.MeshStandardMaterial).color.setHex(0xffffff);
    } else {
      this.closeShop();
    }
  }

  private closeShop(): void {
    if (this.selectedPlot && !this.selectedPlot.occupied) {
      (this.selectedPlot.mesh.material as THREE.MeshStandardMaterial).color.setHex(0x777777);
    }
    this.selectedPlot = null;
    this.shopEl.hidden = true;
  }

  private flash(text: string): void {
    this.msgEl.textContent = text;
    this.msgEl.classList.remove('show');
    void this.msgEl.offsetWidth; // restart animation
    this.msgEl.classList.add('show');
  }
}

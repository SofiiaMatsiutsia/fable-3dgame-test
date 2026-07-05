import { GUI } from 'three/examples/jsm/libs/lil-gui.module.min.js';
import { resetSettings, saveSettings, settings } from '../core/settings';

// Slider panel for live-tuning camera, character, and tower settings.
export function buildTweaks(): GUI {
  const gui = new GUI({ title: '⚙️ Settings' });

  const cam = gui.addFolder('Camera');
  cam.add(settings, 'camHeight', 6, 45, 0.5).name('Height');
  cam.add(settings, 'camDistance', 2, 40, 0.5).name('Distance');
  cam.add(settings, 'camFov', 30, 95, 1).name('Zoom (FOV)');

  const hero = gui.addFolder('Character');
  hero.add(settings, 'heroScale', 0.4, 3, 0.05).name('Size');
  hero.add(settings, 'moveSpeed', 3, 20, 0.5).name('Speed');

  const towers = gui.addFolder('Towers');
  towers.add(settings, 'towerScale', 0.4, 3, 0.05).name('Size');

  const enemies = gui.addFolder('Enemies');
  enemies.add(settings, 'enemyScale', 0.4, 3, 0.05).name('Size');
  enemies.add(settings, 'enemySpeed', 0.3, 2.5, 0.05).name('Speed ×');

  gui.add(
    {
      reset: () => {
        resetSettings();
        gui.controllersRecursive().forEach((c) => c.updateDisplay());
      },
    },
    'reset'
  ).name('↺ Reset defaults');

  gui.onChange(() => saveSettings());
  return gui;
}

// Live-tunable game settings, persisted to localStorage. Systems read these
// every frame, so slider changes in the tweak panel apply instantly.

export const DEFAULTS = {
  camHeight: 22,
  camDistance: 17,
  camFov: 55,
  heroScale: 1,
  moveSpeed: 9,
  towerScale: 1,
  enemyScale: 1,
  enemySpeed: 1, // multiplier on each enemy type's base speed
};

export type Settings = typeof DEFAULTS;

const STORAGE_KEY = 'td-settings';

function load(): Partial<Settings> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, unknown>;
    const out: Partial<Settings> = {};
    for (const key of Object.keys(DEFAULTS) as (keyof Settings)[]) {
      if (typeof raw[key] === 'number' && Number.isFinite(raw[key])) out[key] = raw[key] as number;
    }
    return out;
  } catch {
    return {};
  }
}

export const settings: Settings = { ...DEFAULTS, ...load() };

export function saveSettings(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function resetSettings(): void {
  Object.assign(settings, DEFAULTS);
  saveSettings();
}

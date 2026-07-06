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
  // sun & light
  sunElevation: 48, // degrees above horizon
  sunAzimuth: 55, // degrees around the compass
  sunIntensity: 3.0,
  ambientIntensity: 1.2, // hemisphere sky/ground fill
  exposure: 1.3,
  shadows: true,
  grassShadows: false, // tufts casting shadows looks great, costs fill rate
  // wind
  windStrength: 0.55,
  windSpeed: 1.0,
};

export type Settings = typeof DEFAULTS;

const STORAGE_KEY = 'td-settings';

function load(): Partial<Settings> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, unknown>;
    const out: Partial<Settings> = {};
    for (const key of Object.keys(DEFAULTS) as (keyof Settings)[]) {
      const want = typeof DEFAULTS[key];
      const got = raw[key];
      if (typeof got !== want) continue;
      if (typeof got === 'number' && !Number.isFinite(got)) continue;
      (out as Record<string, unknown>)[key] = got;
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

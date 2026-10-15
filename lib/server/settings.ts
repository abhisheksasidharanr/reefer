import { AllSettings, DEFAULTS, MASK, SECRET_FIELDS, SettingsKey } from '../settings-schema';
import { bus } from './bus';
import { db } from './db';

const g = globalThis as unknown as { __settings?: Partial<AllSettings> };
const cache = (g.__settings ??= {});

/** Settings group merged over defaults (new fields added later get their default automatically). */
export async function getSettings<K extends SettingsKey>(key: K): Promise<AllSettings[K]> {
  if (cache[key]) return cache[key] as AllSettings[K];
  const row = await db.setting.findUnique({ where: { key } });
  let stored: Partial<AllSettings[K]> = {};
  try {
    stored = row ? JSON.parse(row.value) : {};
  } catch {
    /* corrupted row → defaults */
  }
  const value = { ...DEFAULTS[key], ...stored } as AllSettings[K];
  cache[key] = value;
  return value;
}

export async function getAllSettings(): Promise<AllSettings> {
  return {
    general: await getSettings('general'),
    mqtt: await getSettings('mqtt'),
    mapping: await getSettings('mapping'),
    notify: await getSettings('notify'),
  };
}

/** Save a group; masked secrets ("••••") keep their stored value. Emits `settings` on the bus. */
export async function saveSettings<K extends SettingsKey>(key: K, patch: Partial<AllSettings[K]>): Promise<AllSettings[K]> {
  const current = await getSettings(key);
  const next = { ...current, ...patch } as Record<string, unknown>;
  for (const f of SECRET_FIELDS[key] ?? []) if (next[f] === MASK) next[f] = (current as unknown as Record<string, unknown>)[f];
  await db.setting.upsert({ where: { key }, update: { value: JSON.stringify(next) }, create: { key, value: JSON.stringify(next) } });
  cache[key] = next as unknown as AllSettings[K];
  bus.emit('settings', key);
  return next as unknown as AllSettings[K];
}

/** Copy safe for the browser: secrets replaced by a mask (empty stays empty). */
export function maskSecrets<K extends SettingsKey>(key: K, value: AllSettings[K]): AllSettings[K] {
  const out = { ...value } as unknown as Record<string, unknown>;
  for (const f of SECRET_FIELDS[key] ?? []) if (out[f]) out[f] = MASK;
  return out as unknown as AllSettings[K];
}

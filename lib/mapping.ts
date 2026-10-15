// Pure payload → telemetry mapping (unit-tested in mapping.test.ts).
import type { MappingSettings } from './settings-schema';

export interface Telemetry {
  deviceId: string | null;
  at: Date;
  setTemp: number | null;
  supplyTemp: number | null;
  returnTemp: number | null;
  humidity: number | null;
  voltage: number | null;
  current: number | null;
  powerOn: boolean | null;
  faultCode: number | null;
  mode: string | null;
  runHours: number | null;
  /** Payload fields not used by the mapping, flattened to dot paths */
  extra: Record<string, unknown>;
}

/** Read a dot path ("a.b.0.c") from an object. */
export function getPath(obj: unknown, path: string): unknown {
  if (!path) return undefined;
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/** Flatten nested objects into dot paths: {a:{b:1}} → {"a.b":1}. Arrays are kept as values. */
export function flatten(obj: unknown, prefix = '', out: Record<string, unknown> = {}): Record<string, unknown> {
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) {
    if (prefix) out[prefix] = obj;
    return out;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v != null && typeof v === 'object' && !Array.isArray(v)) flatten(v, p, out);
    else out[p] = v;
  }
  return out;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
};

const bool = (v: unknown): boolean | null => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = String(v).trim().toLowerCase();
  if (['1', 'true', 'on', 'yes', 'running', 'run'].includes(s)) return true;
  if (['0', 'false', 'off', 'no', 'stopped', 'stop'].includes(s)) return false;
  return null;
};

const fToC = (f: number | null) => (f == null ? null : Math.round(((f - 32) * 5 * 100) / 9) / 100);

function parseTime(v: unknown, fallback: Date): Date {
  if (v === null || v === undefined || v === '') return fallback;
  if (typeof v === 'number') return new Date(v < 1e12 ? v * 1000 : v); // epoch seconds or ms
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? fallback : d;
}

/** Resolve the device id from "payload:<path>" or "topic:<index>". */
export function resolveDeviceId(spec: string, payload: unknown, topic: string): string | null {
  const [kind, ref] = spec.includes(':') ? [spec.slice(0, spec.indexOf(':')), spec.slice(spec.indexOf(':') + 1)] : ['payload', spec];
  let v: unknown;
  if (kind === 'topic') v = topic.split('/')[Number(ref)];
  else v = getPath(payload, ref);
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.toUpperCase() : null;
}

export function mapPayload(payload: unknown, topic: string, m: MappingSettings, receivedAt = new Date()): Telemetry {
  const read = (path: string) => getPath(payload, path);
  const temp = (path: string) => (m.payloadFahrenheit ? fToC(num(read(path))) : num(read(path)));

  const used = new Set(
    [m.timestamp, m.setTemp, m.supplyTemp, m.returnTemp, m.humidity, m.voltage, m.current, m.power, m.faultCode, m.mode, m.runHours].filter(Boolean),
  );
  if (m.deviceId.startsWith('payload:')) used.add(m.deviceId.slice(8));
  else if (!m.deviceId.includes(':')) used.add(m.deviceId);
  const extra = Object.fromEntries(Object.entries(flatten(payload)).filter(([k]) => !used.has(k)));

  const mode = read(m.mode);
  return {
    deviceId: resolveDeviceId(m.deviceId, payload, topic),
    at: parseTime(read(m.timestamp), receivedAt),
    setTemp: temp(m.setTemp),
    supplyTemp: temp(m.supplyTemp),
    returnTemp: temp(m.returnTemp),
    humidity: num(read(m.humidity)),
    voltage: num(read(m.voltage)),
    current: num(read(m.current)),
    powerOn: bool(read(m.power)),
    faultCode: num(read(m.faultCode)),
    mode: mode === null || mode === undefined ? null : String(mode),
    runHours: num(read(m.runHours)),
    extra,
  };
}

// Pure alert-rule evaluation + plain-language descriptions (unit-tested in rules.test.ts).

export const METRICS = {
  supply_temp: { label: 'Supply air temperature', unit: 'temp', kind: 'number' },
  return_temp: { label: 'Return air temperature', unit: 'temp', kind: 'number' },
  set_temp: { label: 'Reported set point', unit: 'temp', kind: 'number' },
  deviation: { label: 'Deviation from set point', unit: 'tempDelta', kind: 'number' },
  target_mismatch: { label: 'Set point differs from target', unit: 'tempDelta', kind: 'number' },
  humidity: { label: 'Humidity', unit: '%', kind: 'number' },
  voltage: { label: 'Voltage', unit: 'V', kind: 'number' },
  current: { label: 'Current', unit: 'A', kind: 'number' },
  power_off: { label: 'Unit is powered off', unit: '', kind: 'bool' },
  fault: { label: 'Unit reports a fault code', unit: '', kind: 'bool' },
  offline: { label: 'Time since last data', unit: 'min', kind: 'number' },
} as const;
export type Metric = keyof typeof METRICS;

export const OPERATORS = {
  gt: 'is above',
  gte: 'is at or above',
  lt: 'is below',
  lte: 'is at or below',
  eq: 'equals',
  neq: 'is not',
  outside: 'is outside',
  between: 'is between',
} as const;
export type Operator = keyof typeof OPERATORS;

export interface RuleLike {
  metric: string;
  operator: string;
  threshold: number;
  threshold2: number | null;
  useTolerance?: boolean;
  durationSec: number;
  severity: string;
}

export interface Snapshot {
  lastSeenAt: Date | null;
  /** When the reefer was registered — silence is counted from here until the first message */
  createdAt?: Date | null;
  setTemp: number | null;
  supplyTemp: number | null;
  returnTemp: number | null;
  humidity: number | null;
  voltage: number | null;
  current: number | null;
  powerOn: boolean | null;
  faultCode: number | null;
  targetTemp: number | null;
  /** Allowed deviation for this reefer (its own tolerance or the site default), °C */
  tolerance: number;
}

export interface Evaluation {
  active: boolean;
  value: number | null;
}

/** Compare with the rule's operator. `null` value never triggers. */
export function compare(value: number | null, op: string, a: number, b: number | null): boolean {
  if (value === null || !Number.isFinite(value)) return false;
  const lo = Math.min(a, b ?? a);
  const hi = Math.max(a, b ?? a);
  switch (op) {
    case 'gt': return value > a;
    case 'gte': return value >= a;
    case 'lt': return value < a;
    case 'lte': return value <= a;
    case 'eq': return value === a;
    case 'neq': return value !== a;
    case 'outside': return value < lo || value > hi;
    case 'between': return value >= lo && value <= hi;
    default: return false;
  }
}

/** Metric value for a snapshot (°C / %, V, A, minutes). */
export function metricValue(metric: string, s: Snapshot, now: Date): number | null {
  switch (metric) {
    case 'supply_temp': return s.supplyTemp;
    case 'return_temp': return s.returnTemp;
    case 'set_temp': return s.setTemp;
    case 'deviation': {
      const sp = s.setTemp ?? s.targetTemp;
      return sp == null || s.supplyTemp == null ? null : Math.round(Math.abs(s.supplyTemp - sp) * 100) / 100;
    }
    case 'target_mismatch':
      return s.targetTemp == null || s.setTemp == null ? null : Math.round(Math.abs(s.setTemp - s.targetTemp) * 100) / 100;
    case 'humidity': return s.humidity;
    case 'voltage': return s.voltage;
    case 'current': return s.current;
    case 'power_off': return s.powerOn === false ? 1 : 0;
    case 'fault': return s.faultCode ?? 0;
    case 'offline': {
      const ref = s.lastSeenAt ?? s.createdAt ?? null;
      return ref ? Math.round(((now.getTime() - ref.getTime()) / 60_000) * 10) / 10 : Infinity;
    }
    default: return null;
  }
}

export function evaluate(rule: RuleLike, s: Snapshot, now: Date): Evaluation {
  const value = metricValue(rule.metric, s, now);
  const kind = METRICS[rule.metric as Metric]?.kind;
  if (kind === 'bool') return { active: (value ?? 0) !== 0, value };
  // Telemetry-based rules never fire for a unit that has gone silent (that is the offline rule's job)
  // — except offline itself.
  if (rule.metric === 'offline') return { active: value === Infinity || compare(value, 'gt', rule.threshold, null), value: value === Infinity ? null : value };
  const threshold = rule.useTolerance && (rule.metric === 'deviation' || rule.metric === 'target_mismatch') ? s.tolerance + rule.threshold : rule.threshold;
  return { active: compare(value, rule.operator, threshold, rule.threshold2), value };
}

const fmtDuration = (sec: number) =>
  sec <= 0 ? 'immediately' : sec % 3600 === 0 ? `for ${sec / 3600} h` : sec % 60 === 0 ? `for ${sec / 60} min` : `for ${sec} s`;

/** "Critical when Deviation from set point is above 2 °C for 10 min" */
export function describe(rule: RuleLike, fmtTemp: (c: number, delta?: boolean) => string = (c) => `${c} °C`): string {
  const m = METRICS[rule.metric as Metric];
  if (!m) return rule.metric;
  const sev = rule.severity.charAt(0).toUpperCase() + rule.severity.slice(1);
  if (m.kind === 'bool') return `${sev} when ${m.label.toLowerCase()} ${fmtDuration(rule.durationSec)}`;
  if (rule.metric === 'offline') return `${sev} when no data is received for ${rule.threshold} min`;
  const fmt = (v: number) => (m.unit === 'temp' ? fmtTemp(v) : m.unit === 'tempDelta' ? fmtTemp(v, true) : `${v}${m.unit ? ` ${m.unit}` : ''}`);
  if (rule.useTolerance && (rule.metric === 'deviation' || rule.metric === 'target_mismatch')) {
    const margin = rule.threshold ? ` + ${fmt(rule.threshold)}` : '';
    return `${sev} when ${m.label.toLowerCase()} ${OPERATORS[rule.operator as Operator] ?? rule.operator} the reefer's tolerance${margin} ${fmtDuration(rule.durationSec)}`;
  }
  const range = rule.operator === 'outside' || rule.operator === 'between';
  const target = range ? `${fmt(Math.min(rule.threshold, rule.threshold2 ?? rule.threshold))} – ${fmt(Math.max(rule.threshold, rule.threshold2 ?? rule.threshold))}` : fmt(rule.threshold);
  return `${sev} when ${m.label.toLowerCase()} ${OPERATORS[rule.operator as Operator] ?? rule.operator} ${target} ${fmtDuration(rule.durationSec)}`;
}

/** Does the rule apply to this reefer? */
export function inScope(scope: string, scopeValue: string, reefer: { id: number; tags: string }): boolean {
  if (scope === 'all') return true;
  let list: (string | number)[] = [];
  try {
    list = JSON.parse(scopeValue || '[]');
  } catch {
    return false;
  }
  if (scope === 'reefers') return list.map(Number).includes(reefer.id);
  if (scope === 'tags') {
    const tags = reefer.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
    return list.some((t) => tags.includes(String(t).toLowerCase()));
  }
  return false;
}

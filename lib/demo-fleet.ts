/**
 * Simulated reefer fleet, shared by the command-line simulator (scripts/simulate.ts) and the in-app
 * demo feed (lib/server/demo.ts). Produces the default ("yard gateway") JSON payload.
 *
 * Every unit runs into random incidents, at most one at a time (the in-app feed also starts short incidents on a
 * steady schedule — see startIncident):
 *  - fault codes (1–6 min; the unit slowly warms up while faulted)
 *  - door open / defrost trouble (4–16 min warm excursion — some only reach a warning, some go critical)
 *  - power cut (2–10 min)
 *  - gateway drop-out (16–25 min without data → "No data" alert)
 */

export interface DemoUnit {
  id: string;
  set: number;
  supply: number;
  power: number;
  fault: number;
  brand: string;
  hours: number;
  /** Running incident, if any (epoch ms end times). */
  ev: {
    faultUntil?: number;
    heat?: number;
    heatUntil?: number;
    offUntil?: number;
    silentUntil?: number;
    /** Temporary set point change; the original is restored at `setUntil`. */
    setUntil?: number;
    restoreSet?: number;
    /** Temporary sensor readings (voltage sag, humidity spike, overcurrent). */
    sensor?: { voltage?: number; humidity?: number; current?: number };
    sensorUntil?: number;
  };
}

/** Reefers the demo registers up front (the unregistered TCNU unit shows up under "Discovered"). */
export const DEMO_REEFERS = [
  { containerNo: 'MSKU8812340', name: 'Bananas — Ecuador', brand: 'Carrier', model: 'PrimeLINE', targetTemp: 13.3, tags: 'fruit' },
  { containerNo: 'CMAU5523419', name: 'Frozen beef', brand: 'Thermo King', model: 'Magnum Plus', targetTemp: -18, tags: 'frozen' },
  { containerNo: 'HLBU9087213', name: 'Vaccines batch 22', brand: 'Daikin', model: 'LXE10E', targetTemp: 5, tolerance: 1, tags: 'pharma,priority' },
  { containerNo: 'MSCU4410027', name: 'Seafood', brand: 'Star Cool', model: 'SCI-40', targetTemp: -25, tags: 'frozen' },
  { containerNo: 'OOLU7765120', name: 'Grapes — Chile', brand: 'Carrier', model: 'ThinLINE', targetTemp: 0, tags: 'fruit' },
  { containerNo: 'TGHU3329018', name: 'Dairy', brand: 'Thermo King', model: 'Magnum', targetTemp: 2, tags: 'dairy' },
];

const BRANDS = ['Carrier', 'Thermo King', 'Daikin', 'Star Cool', 'MCI'];
/** Typical cargo set points (°C): deep frozen, frozen, chilled meat, citrus, grapes, dairy, vegetables, pharma, potatoes, bananas. */
const SET_POINTS = [-25, -20, -18, -1, 0, 2, 4, 5, 7, 13.3];
const OWNERS = ['MSKU', 'MAEU', 'CMAU', 'HLBU', 'MSCU', 'OOLU', 'TGHU', 'TCNU', 'CGMU', 'SEGU', 'TRIU', 'CAIU', 'BMOU', 'GESU', 'CXRU', 'SZLU'];
export const FAULT_CODES = [12, 17, 22, 27, 31, 46, 51, 56];

const MIN = 60_000;
const pick = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
const between = (a: number, b: number) => a + Math.random() * (b - a);
/** Chance that an event with the given mean interval happens within `dtMs`. */
const chance = (meanMs: number, dtMs: number) => Math.random() < 1 - Math.exp(-dtMs / meanMs);

/** ISO 6346 check digit for the first 10 characters of a container number. */
export function checkDigit(first10: string): number {
  const value = (ch: string) => {
    if (/\d/.test(ch)) return Number(ch);
    let n = 10 + (ch.charCodeAt(0) - 65);
    n += Math.floor((n - 1) / 10); // skip multiples of 11
    return n;
  };
  const sum = [...first10].reduce((s, ch, i) => s + value(ch) * 2 ** i, 0);
  return (sum % 11) % 10;
}

/** A random, valid container number not in `taken`. */
export function randomContainerNo(taken: Set<string>): string {
  for (;;) {
    const first10 = pick(OWNERS) + String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
    const no = first10 + checkDigit(first10);
    if (!taken.has(no)) return no;
  }
}

export function makeUnit(id: string, set = pick(SET_POINTS), brand = pick(BRANDS)): DemoUnit {
  return { id, set, supply: set + between(-0.3, 0.6), power: 1, fault: 0, brand, hours: 1000 + Math.round(Math.random() * 4000), ev: {} };
}

export function createDemoFleet(): DemoUnit[] {
  return (
    [
      ['MSKU8812340', 13.3, 'Carrier'],
      ['CMAU5523419', -18, 'Thermo King'],
      ['HLBU9087213', 5, 'Daikin'],
      ['MSCU4410027', -25, 'Star Cool'],
      ['OOLU7765120', 0, 'Carrier'],
      ['TGHU3329018', 2, 'Thermo King'],
      ['TCNU1122334', -20, 'MCI'], // not registered → shows under "Discovered"
    ] as const
  ).map(([id, set, brand]) => makeUnit(id, set, brand));
}

/** Apply a command payload ({ setpoint } / { power: 'on' | 'off' }) to a unit. Returns true if it changed something. */
export function applyDemoCommand(u: DemoUnit, cmd: Record<string, unknown>): boolean {
  let changed = false;
  if (typeof cmd.setpoint === 'number') {
    u.set = cmd.setpoint;
    delete u.ev.setUntil; // an operator command overrides a simulated set point change
    delete u.ev.restoreSet;
    changed = true;
  }
  if (cmd.power === 'on' || cmd.power === 'off') {
    u.power = cmd.power === 'on' ? 1 : 0;
    delete u.ev.offUntil; // an operator command overrides a simulated power cut
    changed = true;
  }
  return changed;
}

const busy = (u: DemoUnit) => !!(u.ev.faultUntil || u.ev.heatUntil || u.ev.offUntil || u.ev.silentUntil || u.ev.setUntil || u.ev.sensorUntil);
export const isBusy = busy;

export type IncidentKind = 'fault' | 'setpoint' | 'voltage' | 'humidity' | 'current' | 'excursion';
/** Relative frequency of each kind for the steady incident stream. */
export const INCIDENT_WEIGHTS: [IncidentKind, number][] = [
  ['fault', 25],
  ['setpoint', 20],
  ['voltage', 20],
  ['humidity', 15],
  ['current', 15],
  ['excursion', 5],
];

export function pickIncidentKind(): IncidentKind {
  const total = INCIDENT_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [k, w] of INCIDENT_WEIGHTS) if ((r -= w) < 0) return k;
  return 'fault';
}

/**
 * Start a short incident that the alert rules pick up right away (fault, set point vs target, voltage,
 * humidity, current) or a longer warm excursion. Returns false if it does not apply to this unit.
 */
export function startIncident(u: DemoUnit, kind: IncidentKind, now: number, target: number | null): boolean {
  if (busy(u) || !u.power) return false;
  const until = now + between(25, 90) * 1000;
  const ev = u.ev;
  switch (kind) {
    case 'fault':
      u.fault = pick(FAULT_CODES);
      ev.faultUntil = until;
      return true;
    case 'setpoint':
      if (target == null) return false;
      ev.restoreSet = u.set;
      u.set = Math.round((target + (Math.random() < 0.5 ? -1 : 1) * between(1, 3)) * 10) / 10;
      ev.setUntil = until;
      return true;
    case 'voltage':
      ev.sensor = { voltage: Math.round(between(330, 355)) };
      ev.sensorUntil = until;
      return true;
    case 'humidity':
      ev.sensor = { humidity: Math.round(between(96, 99)) };
      ev.sensorUntil = until;
      return true;
    case 'current':
      ev.sensor = { current: Math.round(between(19, 24) * 10) / 10 };
      ev.sensorUntil = until;
      return true;
    case 'excursion':
      ev.heat = between(1.2, 1.8);
      ev.heatUntil = now + between(6, 12) * MIN;
      return true;
  }
}

/** Start a visible incident right away (used shortly after the feed starts so a demo shows something early). */
export function forceIncident(u: DemoUnit, now: number) {
  if (busy(u)) return;
  if (Math.random() < 0.5) {
    u.fault = pick(FAULT_CODES);
    u.ev.faultUntil = now + between(3, 6) * MIN;
  } else {
    u.ev.heat = between(0.9, 1.6);
    u.ev.heatUntil = now + between(8, 14) * MIN;
  }
}

/**
 * Advance one unit by `stepMs` at time `now`. Returns its telemetry payload, or null while its
 * gateway is "offline" (nothing is sent).
 */
export function stepDemoUnit(u: DemoUnit, now: number, stepMs: number) {
  const ev = u.ev;
  // End incidents that are over.
  if (ev.faultUntil && now >= ev.faultUntil) {
    u.fault = 0;
    delete ev.faultUntil;
  }
  if (ev.heatUntil && now >= ev.heatUntil) {
    delete ev.heat;
    delete ev.heatUntil;
  }
  if (ev.offUntil && now >= ev.offUntil) {
    u.power = 1;
    delete ev.offUntil;
  }
  if (ev.silentUntil && now >= ev.silentUntil) delete ev.silentUntil;
  if (ev.setUntil && now >= ev.setUntil) {
    if (ev.restoreSet != null) u.set = ev.restoreSet;
    delete ev.setUntil;
    delete ev.restoreSet;
  }
  if (ev.sensorUntil && now >= ev.sensorUntil) {
    delete ev.sensor;
    delete ev.sensorUntil;
  }

  // Maybe start a new one (mean time between incidents per unit ≈ 25 min).
  if (!busy(u)) {
    if (chance(70 * MIN, stepMs)) {
      u.fault = pick(FAULT_CODES);
      ev.faultUntil = now + between(1, 6) * MIN;
    } else if (chance(70 * MIN, stepMs)) {
      ev.heat = between(0.4, 1.6); // equilibrium ≈ 4 × heat above the set point
      ev.heatUntil = now + between(4, 16) * MIN;
    } else if (u.power && chance(150 * MIN, stepMs)) {
      u.power = 0;
      ev.offUntil = now + between(2, 10) * MIN;
    } else if (chance(300 * MIN, stepMs)) {
      ev.silentUntil = now + between(16, 25) * MIN;
    }
  }

  const sec = stepMs / 1000;
  if (u.power) {
    // Pull towards the set point with noise; a faulty unit drifts warm (~0.7 °C/min).
    u.supply += u.fault ? 0.012 * sec : (u.set - u.supply) * 0.25 + (Math.random() - 0.5) * 0.4;
    u.supply += ev.heat ?? 0;
    u.hours += sec / 3600;
  } else {
    u.supply += 0.01 * sec; // warming up when off (~0.6 °C/min)
  }
  if (ev.silentUntil) return null;

  return {
    containerNo: u.id,
    at: new Date(now).toISOString(),
    settemp: u.set,
    sstemp: Math.round(u.supply * 100) / 100,
    rstemp: Math.round((u.supply + 0.7 + Math.random() * 0.3) * 100) / 100,
    humidity: ev.sensor?.humidity ?? Math.round(70 + Math.random() * 20),
    voltage: ev.sensor?.voltage != null ? ev.sensor.voltage + Math.round(Math.random() * 4) : Math.round(395 + Math.random() * 15),
    current: u.power ? (ev.sensor?.current ?? Math.round((10 + Math.random() * 3) * 10) / 10) : 0.2,
    coolerstate: u.power,
    faultcode: u.fault,
    workmode: u.power ? (u.set < -5 ? 'frozen' : 'chill') : 'off',
    worktime: Math.round(u.hours),
    brand: u.brand,
    firmware: '4.2.1',
    signal: -60 - Math.round(Math.random() * 25),
  };
}

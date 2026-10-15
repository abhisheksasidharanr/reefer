/**
 * Simulated reefer fleet, shared by the command-line simulator (scripts/simulate.ts) and the in-app
 * demo feed (lib/server/demo.ts). Produces the default ("yard gateway") JSON payload.
 * Scenarios: the pharma unit's door is open from minute 2 to 18 of every 30 (warm excursion → warning, then critical),
 * the frozen beef unit raises a fault for 3 minutes in every 20, and the dairy unit is switched off now and then.
 */

export interface DemoUnit {
  id: string;
  set: number;
  supply: number;
  power: number;
  fault: number;
  brand: string;
  hours: number;
}

/** Reefers the demo registers (the unregistered TCNU unit shows up under "Discovered"). */
export const DEMO_REEFERS = [
  { containerNo: 'MSKU8812340', name: 'Bananas — Ecuador', brand: 'Carrier', model: 'PrimeLINE', targetTemp: 13.3, tags: 'fruit' },
  { containerNo: 'CMAU5523419', name: 'Frozen beef', brand: 'Thermo King', model: 'Magnum Plus', targetTemp: -18, tags: 'frozen' },
  { containerNo: 'HLBU9087213', name: 'Vaccines batch 22', brand: 'Daikin', model: 'LXE10E', targetTemp: 5, tolerance: 1, tags: 'pharma,priority' },
  { containerNo: 'MSCU4410027', name: 'Seafood', brand: 'Star Cool', model: 'SCI-40', targetTemp: -25, tags: 'frozen' },
  { containerNo: 'OOLU7765120', name: 'Grapes — Chile', brand: 'Carrier', model: 'ThinLINE', targetTemp: 0, tags: 'fruit' },
  { containerNo: 'TGHU3329018', name: 'Dairy', brand: 'Thermo King', model: 'Magnum', targetTemp: 2, tags: 'dairy' },
];

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
  ).map(([id, set, brand]) => ({ id, set, supply: set + 0.4, power: 1, fault: 0, brand, hours: 1000 + Math.round(Math.random() * 4000) }));
}

/** Apply a command payload ({ setpoint } / { power: 'on' | 'off' }) to a unit. Returns true if it changed something. */
export function applyDemoCommand(u: DemoUnit, cmd: Record<string, unknown>): boolean {
  let changed = false;
  if (typeof cmd.setpoint === 'number') {
    u.set = cmd.setpoint;
    changed = true;
  }
  if (cmd.power === 'on' || cmd.power === 'off') {
    u.power = cmd.power === 'on' ? 1 : 0;
    changed = true;
  }
  return changed;
}

/** Advance one unit by one step, `elapsedMs` after the feed started (`tick` counts steps), and return its payload. */
export function stepDemoUnit(u: DemoUnit, tick: number, elapsedMs: number) {
  const minute = Math.floor(elapsedMs / 60_000);
  if (u.id === 'HLBU9087213') u.supply += minute % 30 >= 2 && minute % 30 < 18 ? 1.2 : 0; // door open (repeats every 30 min) → warm excursion
  if (u.id === 'CMAU5523419') u.fault = minute % 20 >= 12 && minute % 20 < 15 ? 31 : 0;
  if (u.id === 'TGHU3329018' && tick % 60 === 40) u.power = u.power ? 0 : 1;

  if (u.power) {
    // Pull towards the set point with noise; a faulty unit drifts warm.
    u.supply += u.fault ? 0.3 : (u.set - u.supply) * 0.25 + (Math.random() - 0.5) * 0.4;
    u.hours += 1 / 360;
  } else {
    u.supply += 0.25; // warming up when off
  }
  return {
    containerNo: u.id,
    at: new Date().toISOString(),
    settemp: u.set,
    sstemp: Math.round(u.supply * 100) / 100,
    rstemp: Math.round((u.supply + 0.7 + Math.random() * 0.3) * 100) / 100,
    humidity: Math.round(70 + Math.random() * 20),
    voltage: Math.round(395 + Math.random() * 15),
    current: u.power ? Math.round((10 + Math.random() * 3) * 10) / 10 : 0.2,
    coolerstate: u.power,
    faultcode: u.fault,
    workmode: u.power ? (u.set < -5 ? 'frozen' : 'chill') : 'off',
    worktime: Math.round(u.hours),
    brand: u.brand,
    firmware: '4.2.1',
    signal: -60 - Math.round(Math.random() * 25),
  };
}

import { applyDemoCommand, createDemoFleet, DEMO_REEFERS, DemoUnit, forceIncident, makeUnit, randomContainerNo, stepDemoUnit } from '../demo-fleet';
import { db } from './db';
import { holdLease } from './lease';
import { getSettings } from './settings';

/**
 * In-app demo feed (Settings → MQTT → Demo data): simulated gateway JSON for the demo fleet, fed through the
 * same path as MQTT messages. Works on hosts without open MQTT ports. Only the copy holding the "demo" lease
 * generates data; commands are picked up from the commands table, so they work whichever copy received them.
 *
 * New devices: whenever no simulated device is waiting under "Discovered", a new one appears after a short random
 * delay (one at a time). Registered ones keep reporting; ignored ones stop. The fleet list is kept in the
 * settings table ("demo:fleet") so it survives restarts and every copy knows which devices are simulated.
 */
interface DemoState {
  units: DemoUnit[];
  tick: number;
  lastCommandAt: Date;
  registered: boolean;
  running: boolean;
  kickAt?: number;
  nextNewAt?: number;
}

const FLEET_KEY = 'demo:fleet';
const MAX_UNITS = 40;
const g = globalThis as unknown as { __demo?: DemoState; __demoLoop?: boolean; __demoIds?: { ids: Set<string>; at: number } };
const st: DemoState = (g.__demo ??= { units: [], tick: 0, lastCommandAt: new Date(), registered: false, running: false });

export const demoRunning = () => st.running;

/** Whether a device is simulated (read from the database, so it works in every copy of the app). */
export async function isDemoDevice(deviceId: string): Promise<boolean> {
  const c = g.__demoIds;
  if (!c || Date.now() - c.at > 10_000) {
    const row = await db.setting.findUnique({ where: { key: FLEET_KEY } });
    let ids: string[] = [];
    try {
      ids = row ? (JSON.parse(row.value) as { id: string }[]).map((u) => u.id) : [];
    } catch {
      /* corrupt → none */
    }
    g.__demoIds = { ids: new Set(ids.length ? ids : createDemoFleet().map((u) => u.id)), at: Date.now() };
  }
  return g.__demoIds!.ids.has(deviceId);
}

async function loadFleet() {
  const row = await db.setting.findUnique({ where: { key: FLEET_KEY } });
  try {
    const saved = row ? (JSON.parse(row.value) as { id: string; set: number; brand: string }[]) : [];
    if (saved.length) {
      st.units = saved.map((u) => makeUnit(u.id, u.set, u.brand));
      return;
    }
  } catch {
    /* fall through to a fresh fleet */
  }
  st.units = createDemoFleet();
  await saveFleet();
}

async function saveFleet() {
  const value = JSON.stringify(st.units.map((u) => ({ id: u.id, set: u.set, brand: u.brand })));
  await db.setting.upsert({ where: { key: FLEET_KEY }, update: { value }, create: { key: FLEET_KEY, value } });
  g.__demoIds = { ids: new Set(st.units.map((u) => u.id)), at: Date.now() };
}

async function registerDemoReefers() {
  for (const r of DEMO_REEFERS) {
    await db.reefer.upsert({ where: { containerNo: r.containerNo }, update: {}, create: { ...r, deviceId: r.containerNo } });
  }
  st.registered = true;
}

async function applyNewCommands() {
  const cmds = await db.command.findMany({
    where: { status: 'sent', createdAt: { gt: st.lastCommandAt }, reefer: { deviceId: { in: st.units.map((u) => u.id) } } },
    include: { reefer: { select: { deviceId: true } } },
    orderBy: { createdAt: 'asc' },
  });
  let changed = false;
  for (const c of cmds) {
    const u = st.units.find((x) => x.id === c.reefer.deviceId);
    if (u) changed = applyDemoCommand(u, c.type === 'setpoint' ? { setpoint: Number(c.value) } : { power: c.value }) || changed;
    st.lastCommandAt = c.createdAt;
  }
  if (changed) await saveFleet(); // keep new set points across restarts
}

/** Keep exactly one simulated device waiting under "Discovered"; ignored devices stop transmitting. */
async function manageNewDevices(now: number) {
  const ids = st.units.map((u) => u.id);
  const [registered, ignored] = await Promise.all([
    db.reefer.findMany({ where: { deviceId: { in: ids } }, select: { deviceId: true } }),
    db.discoveredDevice.findMany({ where: { deviceId: { in: ids }, ignored: true }, select: { deviceId: true } }),
  ]);
  const reg = new Set(registered.map((r) => r.deviceId));
  const ign = new Set(ignored.map((d) => d.deviceId));
  let changed = false;
  if (ign.size) {
    st.units = st.units.filter((u) => !ign.has(u.id));
    changed = true;
  }
  const waiting = st.units.filter((u) => !reg.has(u.id));
  if (waiting.length) st.nextNewAt = undefined;
  else if (!st.nextNewAt) st.nextNewAt = now + (20 + Math.random() * 70) * 1000;
  else if (now >= st.nextNewAt && st.units.length < MAX_UNITS) {
    const [reefers, discovered] = await Promise.all([
      db.reefer.findMany({ select: { containerNo: true, deviceId: true } }),
      db.discoveredDevice.findMany({ select: { deviceId: true } }),
    ]);
    const taken = new Set([...ids, ...reefers.flatMap((r) => [r.containerNo, r.deviceId]), ...discovered.map((d) => d.deviceId)]);
    st.units.push(makeUnit(randomContainerNo(taken)));
    st.nextNewAt = undefined;
    changed = true;
  }
  if (changed) await saveFleet();
}

/** Runs forever; cheap when the feed is switched off. `inject` hands a message to the MQTT ingest path. */
export function startDemoLoop(inject: (topic: string, payload: Buffer) => void) {
  if (g.__demoLoop) return;
  g.__demoLoop = true;
  const loop = async () => {
    let waitMs = 5_000;
    try {
      const s = await getSettings('mqtt');
      waitMs = Math.max(2, s.demoIntervalSec) * 1000;
      const now = Date.now();
      const leader = s.demoFeed && (await holdLease('demo', Math.max(30_000, waitMs * 3)));
      if (leader && !st.running) {
        // (Re)starting: load the fleet, ignore commands sent before now, show an incident soon.
        await loadFleet();
        st.tick = 0;
        st.lastCommandAt = new Date();
        st.kickAt = now + 45_000;
      }
      st.running = !!leader;
      if (leader) {
        if (!st.registered) await registerDemoReefers();
        await applyNewCommands();
        if (st.tick % Math.max(1, Math.round(15_000 / waitMs)) === 0) await manageNewDevices(now);
        if (st.kickAt && now >= st.kickAt) {
          const base = st.units.filter((u) => DEMO_REEFERS.some((r) => r.containerNo === u.id));
          if (base.length) forceIncident(base[Math.floor(Math.random() * base.length)], now);
          st.kickAt = undefined;
        }
        st.tick++;
        for (const u of st.units) {
          const payload = stepDemoUnit(u, now, waitMs);
          if (payload) inject(`reefer/${u.id}/telemetry`, Buffer.from(JSON.stringify(payload)));
        }
      }
    } catch (e) {
      console.error('[demo] feed failed', e);
    }
    setTimeout(loop, waitMs);
  };
  setTimeout(loop, 2_000);
}

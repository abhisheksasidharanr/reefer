import { applyDemoCommand, createDemoFleet, DEMO_REEFERS, DemoUnit, stepDemoUnit } from '../demo-fleet';
import { db } from './db';
import { holdLease } from './lease';
import { getSettings } from './settings';

/**
 * In-app demo feed (Settings → MQTT → Demo data): simulated gateway JSON for the demo fleet, fed through the
 * same path as MQTT messages. Works on hosts without open MQTT ports. Only the copy holding the "demo" lease
 * generates data; commands are picked up from the commands table, so they work whichever copy received them.
 */
interface DemoState {
  units: DemoUnit[];
  started: number;
  tick: number;
  lastCommandAt: Date;
  registered: boolean;
  running: boolean;
}

const g = globalThis as unknown as { __demo?: DemoState; __demoLoop?: boolean };
const st: DemoState = (g.__demo ??= { units: createDemoFleet(), started: Date.now(), tick: 0, lastCommandAt: new Date(), registered: false, running: false });

export const demoRunning = () => st.running;
export const isDemoDevice = (deviceId: string) => st.units.some((u) => u.id === deviceId);

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
  for (const c of cmds) {
    const u = st.units.find((x) => x.id === c.reefer.deviceId);
    if (u) applyDemoCommand(u, c.type === 'setpoint' ? { setpoint: Number(c.value) } : { power: c.value });
    st.lastCommandAt = c.createdAt;
  }
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
      const leader = s.demoFeed && (await holdLease('demo', Math.max(30_000, waitMs * 3)));
      if (leader && !st.running) {
        // (Re)starting: fresh scenario clock, ignore commands sent before now.
        st.started = Date.now();
        st.tick = 0;
        st.lastCommandAt = new Date();
      }
      st.running = !!leader;
      if (leader) {
        if (!st.registered) await registerDemoReefers();
        await applyNewCommands();
        st.tick++;
        for (const u of st.units) {
          inject(`reefer/${u.id}/telemetry`, Buffer.from(JSON.stringify(stepDemoUnit(u, st.tick, Date.now() - st.started))));
        }
      }
    } catch (e) {
      console.error('[demo] feed failed', e);
    }
    setTimeout(loop, waitMs);
  };
  setTimeout(loop, 2_000);
}

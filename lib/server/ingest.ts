import { mapPayload, Telemetry } from '../mapping';
import { evaluateReefer } from './alerts';
import { bus } from './bus';
import { db } from './db';
import { getSettings } from './settings';

export interface LoggedMessage {
  at: string;
  topic: string;
  payload: string;
  deviceId: string | null;
  /** ok | discovered | registered | error | ignored */
  result: string;
  detail?: string;
}

const g = globalThis as unknown as { __msgLog?: LoggedMessage[]; __lastStored?: Map<number, number> };
const log = (g.__msgLog ??= []);
const lastStored = (g.__lastStored ??= new Map());
const LOG_SIZE = 200;

export function recentMessages(): LoggedMessage[] {
  return [...log].reverse();
}

function record(m: LoggedMessage) {
  log.push(m);
  if (log.length > LOG_SIZE) log.splice(0, log.length - LOG_SIZE);
  bus.emit('message', m);
}

/** Entry point for every MQTT message (one JSON object or an array of them). */
export async function handleMessage(topic: string, buf: Buffer) {
  const text = buf.toString('utf8');
  const short = text.length > 4000 ? `${text.slice(0, 4000)}…` : text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    record({ at: new Date().toISOString(), topic, payload: short, deviceId: null, result: 'error', detail: 'Payload is not valid JSON' });
    return;
  }
  const items = Array.isArray(parsed) ? parsed : [parsed];
  for (const item of items.slice(0, 500)) {
    try {
      const r = await ingestOne(topic, item);
      record({ at: new Date().toISOString(), topic, payload: short, ...r });
    } catch (e) {
      record({ at: new Date().toISOString(), topic, payload: short, deviceId: null, result: 'error', detail: (e as Error).message });
    }
  }
}

async function ingestOne(topic: string, payload: unknown): Promise<Omit<LoggedMessage, 'at' | 'topic' | 'payload'>> {
  const [mapping, general] = await Promise.all([getSettings('mapping'), getSettings('general')]);
  const now = new Date();
  const t = mapPayload(payload, topic, mapping, now);
  if (!t.deviceId) return { deviceId: null, result: 'error', detail: `No device id at "${mapping.deviceId}"` };
  // Never trust device clocks that run ahead.
  if (t.at.getTime() > now.getTime() + 60_000) t.at = now;

  let reefer = await db.reefer.findUnique({ where: { deviceId: t.deviceId } });
  let result = 'ok';
  if (!reefer) {
    const known = await db.discoveredDevice.findUnique({ where: { deviceId: t.deviceId } });
    if (!general.autoRegister) {
      await db.discoveredDevice.upsert({
        where: { deviceId: t.deviceId },
        update: { lastSeenAt: now, messages: { increment: 1 }, lastPayload: JSON.stringify(payload), topic },
        create: { deviceId: t.deviceId, topic, lastSeenAt: now, lastPayload: JSON.stringify(payload) },
      });
      return { deviceId: t.deviceId, result: known?.ignored ? 'ignored' : 'discovered' };
    }
    reefer = await db.reefer.create({ data: { deviceId: t.deviceId, containerNo: t.deviceId.slice(0, 20), name: null } });
    await db.discoveredDevice.deleteMany({ where: { deviceId: t.deviceId } });
    result = 'registered';
  }
  if (!reefer.active) return { deviceId: t.deviceId, result: 'ignored', detail: 'Reefer is deactivated' };

  await applyTelemetry(reefer.id, t, reefer.lastSeenAt, general.sampleEverySec);
  await evaluateReefer(reefer.id);
  bus.emit('reading', { reeferId: reefer.id });
  return { deviceId: t.deviceId, result };
}

/** Update the snapshot (fields present in the message only) and store a reading (sampled). */
export async function applyTelemetry(reeferId: number, t: Telemetry, prevSeen: Date | null, sampleEverySec: number) {
  const pick = <T>(v: T | null) => (v === null ? undefined : v);
  const isLatest = !prevSeen || t.at >= prevSeen;
  if (isLatest) {
    const current = await db.reefer.findUnique({ where: { id: reeferId }, select: { extra: true } });
    let extra: Record<string, unknown> = {};
    try {
      extra = current?.extra ? JSON.parse(current.extra) : {};
    } catch {
      /* ignore */
    }
    await db.reefer.update({
      where: { id: reeferId },
      data: {
        lastSeenAt: t.at,
        setTemp: pick(t.setTemp),
        supplyTemp: pick(t.supplyTemp),
        returnTemp: pick(t.returnTemp),
        humidity: pick(t.humidity),
        voltage: pick(t.voltage),
        current: pick(t.current),
        powerOn: pick(t.powerOn),
        faultCode: pick(t.faultCode),
        mode: pick(t.mode),
        runHours: pick(t.runHours),
        extra: JSON.stringify({ ...extra, ...t.extra }),
      },
    });
  }
  const last = lastStored.get(reeferId) ?? 0;
  if (sampleEverySec > 0 && t.at.getTime() - last < sampleEverySec * 1000) return;
  lastStored.set(reeferId, t.at.getTime());
  await db.reading.create({
    data: {
      reeferId,
      at: t.at,
      setTemp: t.setTemp,
      supplyTemp: t.supplyTemp,
      returnTemp: t.returnTemp,
      humidity: t.humidity,
      voltage: t.voltage,
      current: t.current,
      powerOn: t.powerOn,
      faultCode: t.faultCode,
    },
  });
}

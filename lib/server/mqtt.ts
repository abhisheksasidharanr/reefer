import { createBroker } from 'aedes';
import type Aedes from 'aedes';
import mqtt, { MqttClient } from 'mqtt';
import net from 'node:net';
import type { MqttSettings } from '../settings-schema';
import { bus } from './bus';
import { handleMessage } from './ingest';
import { getSettings } from './settings';

export interface MqttStatus {
  mode: 'builtin' | 'external';
  /** builtin: listening / stopped / error — external: connected / connecting / disconnected / error */
  state: string;
  detail: string | null;
  port: number | null;
  url: string | null;
  topic: string;
  clients: number;
  messages: number;
  lastMessageAt: string | null;
  since: string;
}

interface Runtime {
  broker?: Aedes;
  server?: net.Server;
  client?: MqttClient;
  status: MqttStatus;
}

const g = globalThis as unknown as { __mqtt?: Runtime };
const rt: Runtime = (g.__mqtt ??= {
  status: { mode: 'builtin', state: 'stopped', detail: null, port: null, url: null, topic: '', clients: 0, messages: 0, lastMessageAt: null, since: new Date().toISOString() },
});

export const mqttStatus = () => rt.status;

function setStatus(patch: Partial<MqttStatus>) {
  rt.status = { ...rt.status, ...patch };
  bus.emit('mqtt', rt.status);
}

/** MQTT topic filter match with + and # wildcards. */
export function topicMatches(filter: string, topic: string): boolean {
  const f = filter.split('/');
  const t = topic.split('/');
  for (let i = 0; i < f.length; i++) {
    if (f[i] === '#') return true;
    if (i >= t.length) return false;
    if (f[i] !== '+' && f[i] !== t[i]) return false;
  }
  return f.length === t.length;
}

function onMessage(topic: string, payload: Buffer) {
  // Counters only — no bus event per message (state changes are announced by setStatus).
  rt.status = { ...rt.status, messages: rt.status.messages + 1, lastMessageAt: new Date().toISOString() };
  handleMessage(topic, payload).catch((e) => console.error('[mqtt] ingest failed', e));
}

async function stop() {
  const { client, broker, server } = rt;
  rt.client = rt.broker = rt.server = undefined;
  if (client) await new Promise<void>((r) => client.end(true, {}, () => r()));
  if (server) await new Promise<void>((r) => server.close(() => r()));
  if (broker) await new Promise<void>((r) => broker.close(() => r()));
}

async function startBuiltin(s: MqttSettings) {
  const broker = createBroker();
  if (s.builtinUsername) {
    broker.authenticate = (_client, username, password, done) => {
      const ok = username === s.builtinUsername && (password?.toString() ?? '') === s.builtinPassword;
      done(null, ok);
    };
  }
  broker.on('publish', (packet, client) => {
    if (!client) return; // our own command publishes / $SYS
    if (topicMatches(s.topic, packet.topic)) onMessage(packet.topic, packet.payload as Buffer);
  });
  const recount = () => setStatus({ clients: broker.connectedClients });
  broker.on('client', recount);
  broker.on('clientDisconnect', recount);

  const server = net.createServer(broker.handle);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(s.builtinPort, () => resolve());
  });
  server.on('error', (e) => setStatus({ state: 'error', detail: e.message }));
  rt.broker = broker;
  rt.server = server;
  setStatus({ mode: 'builtin', state: 'listening', detail: null, port: s.builtinPort, url: null, topic: s.topic, clients: 0, since: new Date().toISOString() });
}

function startExternal(s: MqttSettings) {
  setStatus({ mode: 'external', state: 'connecting', detail: null, port: null, url: s.url, topic: s.topic, clients: 0, since: new Date().toISOString() });
  const client = mqtt.connect(s.url, {
    clientId: `${s.clientId}-${Math.random().toString(16).slice(2, 8)}`,
    username: s.username || undefined,
    password: s.password || undefined,
    reconnectPeriod: 5000,
    connectTimeout: 10_000,
  });
  client.on('connect', () => {
    setStatus({ state: 'connected', detail: null });
    client.subscribe(s.topic, { qos: s.qos }, (err) => err && setStatus({ state: 'error', detail: `Subscribe failed: ${err.message}` }));
  });
  client.on('reconnect', () => setStatus({ state: 'connecting' }));
  client.on('close', () => rt.client === client && setStatus({ state: 'disconnected' }));
  client.on('error', (e) => setStatus({ state: 'error', detail: e.message }));
  client.on('message', (topic, payload) => onMessage(topic, payload));
  rt.client = client;
}

/** (Re)start according to the current settings. */
export async function startMqtt() {
  await stop();
  const s = await getSettings('mqtt');
  try {
    if (s.mode === 'builtin') await startBuiltin(s);
    else startExternal(s);
  } catch (e) {
    setStatus({ mode: s.mode, state: 'error', detail: (e as Error).message, port: s.mode === 'builtin' ? s.builtinPort : null, topic: s.topic });
    console.error('[mqtt] start failed:', (e as Error).message);
  }
}

/** Publish a JSON command to a device on the command topic. */
export async function publishCommand(deviceId: string, body: Record<string, unknown>) {
  const s = await getSettings('mqtt');
  if (!s.commandsEnabled) throw new Error('Remote commands are disabled in Settings');
  const topic = s.commandTopic.replaceAll('{deviceId}', deviceId);
  const payload = Buffer.from(JSON.stringify({ ...body, ts: new Date().toISOString() }));
  if (rt.broker) {
    await new Promise<void>((resolve, reject) =>
      rt.broker!.publish({ cmd: 'publish', topic, payload, qos: s.qos, retain: false, dup: false }, (err) => (err ? reject(err) : resolve())),
    );
    return topic;
  }
  if (rt.client?.connected) {
    await rt.client.publishAsync(topic, payload, { qos: s.qos });
    return topic;
  }
  throw new Error('MQTT is not connected');
}

/** Try an external broker connection without touching the running one. */
export async function testConnection(s: MqttSettings): Promise<{ ok: boolean; detail: string }> {
  if (s.mode === 'builtin') return { ok: rt.status.state === 'listening', detail: rt.status.detail ?? `Built-in broker on port ${rt.status.port}` };
  return new Promise((resolve) => {
    const c = mqtt.connect(s.url, { username: s.username || undefined, password: s.password || undefined, reconnectPeriod: 0, connectTimeout: 8000 });
    const done = (ok: boolean, detail: string) => {
      c.end(true);
      resolve({ ok, detail });
    };
    c.on('connect', () => done(true, 'Connected'));
    c.on('error', (e) => done(false, e.message));
    setTimeout(() => done(false, 'Timed out'), 9000);
  });
}

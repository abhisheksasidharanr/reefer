/**
 * Reefer gateway simulator.
 *   npm run simulate                      → mqtt://localhost:1883, every 10 s
 *   MQTT_URL=mqtt://host:1883 INTERVAL=5 npm run simulate
 *
 * Publishes the default ("yard gateway") JSON format to reefer/<CONTAINER>/telemetry for the demo
 * reefers plus one unregistered device, and obeys set point / power commands on reefer/+/command.
 * The fleet and its random incidents live in lib/demo-fleet.ts (shared with the in-app demo feed, which
 * also adds new devices over time).
 */
import mqtt from 'mqtt';
import { applyDemoCommand, createDemoFleet, stepDemoUnit } from '../lib/demo-fleet';

const URL = process.env.MQTT_URL ?? 'mqtt://localhost:1883';
const INTERVAL = Number(process.env.INTERVAL ?? 10) * 1000;

const units = createDemoFleet();

const client = mqtt.connect(URL, { clientId: `simulator-${Math.random().toString(16).slice(2, 8)}`, reconnectPeriod: 3000 });

client.on('connect', () => {
  console.log(`connected to ${URL}; publishing ${units.length} units every ${INTERVAL / 1000}s`);
  client.subscribe('reefer/+/command');
});
client.on('error', (e) => console.error('mqtt error:', e.message));

client.on('message', (topic, buf) => {
  const id = topic.split('/')[1];
  const u = units.find((x) => x.id === id);
  if (!u) return;
  try {
    const cmd = JSON.parse(buf.toString());
    applyDemoCommand(u, cmd);
    console.log(`command for ${id}:`, cmd);
  } catch {
    /* ignore */
  }
});

setInterval(() => {
  if (!client.connected) return;
  for (const u of units) {
    const payload = stepDemoUnit(u, Date.now(), INTERVAL);
    if (payload) client.publish(`reefer/${u.id}/telemetry`, JSON.stringify(payload), { qos: 1 });
  }
  console.log(new Date().toLocaleTimeString(), `published ${units.length} readings`);
}, INTERVAL);

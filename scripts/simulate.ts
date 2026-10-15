/**
 * Reefer gateway simulator.
 *   npm run simulate                      → mqtt://localhost:1883, every 10 s
 *   MQTT_URL=mqtt://host:1883 INTERVAL=5 npm run simulate
 *
 * Publishes the default ("yard gateway") JSON format to reefer/<CONTAINER>/telemetry for the demo
 * reefers plus one unregistered device, and obeys set point / power commands on reefer/+/command.
 * Scenarios: the pharma unit's door is open from minute 2 to 18 (warm excursion → warning, then critical), the frozen beef
 * unit raises a fault for a while, and the dairy unit is switched off now and then.
 */
import mqtt from 'mqtt';

const URL = process.env.MQTT_URL ?? 'mqtt://localhost:1883';
const INTERVAL = Number(process.env.INTERVAL ?? 10) * 1000;

interface Unit {
  id: string;
  set: number;
  supply: number;
  power: number;
  fault: number;
  brand: string;
  hours: number;
}

const units: Unit[] = [
  ['MSKU8812340', 13.3, 'Carrier'],
  ['CMAU5523419', -18, 'Thermo King'],
  ['HLBU9087213', 5, 'Daikin'],
  ['MSCU4410027', -25, 'Star Cool'],
  ['OOLU7765120', 0, 'Carrier'],
  ['TGHU3329018', 2, 'Thermo King'],
  ['TCNU1122334', -20, 'MCI'], // not registered → shows under "Discovered"
].map(([id, set, brand]) => ({ id: id as string, set: set as number, supply: (set as number) + 0.4, power: 1, fault: 0, brand: brand as string, hours: 1000 + Math.round(Math.random() * 4000) }));

const client = mqtt.connect(URL, { clientId: `simulator-${Math.random().toString(16).slice(2, 8)}`, reconnectPeriod: 3000 });
let tick = 0;

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
    if (typeof cmd.setpoint === 'number') u.set = cmd.setpoint;
    if (cmd.power) u.power = cmd.power === 'on' ? 1 : 0;
    console.log(`command for ${id}:`, cmd);
  } catch {
    /* ignore */
  }
});

function step(u: Unit) {
  const minute = Math.floor((tick * INTERVAL) / 60_000);
  // Scenarios
  if (u.id === 'HLBU9087213') u.supply += minute >= 2 && minute < 18 ? 1.2 : 0; // door open for 16 min → warm excursion
  if (u.id === 'CMAU5523419') u.fault = minute % 20 >= 12 && minute % 20 < 15 ? 31 : 0;
  if (u.id === 'TGHU3329018' && tick % 60 === 40) u.power = u.power ? 0 : 1;

  if (u.power) {
    // Pull towards the set point with noise; a faulty unit drifts warm.
    u.supply += u.fault ? 0.3 : (u.set - u.supply) * 0.25 + (Math.random() - 0.5) * 0.4;
    u.hours += INTERVAL / 3600_000;
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

setInterval(() => {
  if (!client.connected) return;
  tick++;
  for (const u of units) client.publish(`reefer/${u.id}/telemetry`, JSON.stringify(step(u)), { qos: 1 });
  console.log(new Date().toLocaleTimeString(), `published ${units.length} readings`);
}, INTERVAL);

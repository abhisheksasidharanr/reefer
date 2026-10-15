# Reefer Monitor

Live monitoring for refrigerated containers: reefers publish JSON over MQTT, the app stores the
readings, shows them live, and raises configurable alerts (in-app, email, webhook).
Reefers are registered with identity and temperature settings only (container no., device ID, name, brand/model,
target temperature, allowed deviation, tags) — no yard position, no customer/owner/commodity.

**Stack:** Next.js 15 (App Router) · React 19 · Prisma · MySQL / MariaDB · Tailwind · Recharts · MQTT (built-in Aedes broker or any external broker).

## Quick start

```bash
cp .env.example .env          # set DATABASE_URL, AUTH_SECRET, SEED_ADMIN_*
npm install
npx prisma db push            # create tables
npm run db:seed               # admin user, default alert rules, 6 demo reefers
npm run dev                   # http://localhost:4000  (also starts the MQTT broker on :1883)
npm run simulate              # in another terminal: streams demo telemetry
```

Sign in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from `.env`.

## How data comes in

Gateways publish to `reefer/<DEVICE_ID>/telemetry` (configurable). Default payload:

```json
{ "containerNo": "MSKU8812340", "at": "2026-10-15T10:00:00Z", "settemp": -18, "sstemp": -17.6,
  "rstemp": -16.9, "humidity": 78, "voltage": 402, "current": 11.4, "coolerstate": 1,
  "faultcode": 0, "workmode": "chill", "worktime": 1260 }
```

Any other format works: **Settings → Payload mapping** maps each field to a dot path (or the device ID
to a topic segment) with a live preview against real messages. Unmapped fields are kept and shown on
the reefer page. Arrays of readings in one message are accepted.

Unknown device IDs appear under **Discovered** for one-click registration (or enable auto-registration).

Commands (set point, power on/off) are published to `reefer/<DEVICE_ID>/command` as
`{"setpoint": -18}` / `{"power": "on"}`; every attempt is logged.

## Warning system

Rules (**Alert rules**) combine:

- a metric — supply / return / set point temperature, deviation from set point, set point vs target,
  humidity, voltage, current, power off, fault code, no data;
- a condition (above, below, outside a range…) — deviation rules can use **each reefer's own tolerance**;
- a duration it must hold (ignores door-opening spikes);
- severity (info / warning / critical) and scope (all, tags, specific reefers);
- channels (in-app always; email; webhook signed with `X-Signature: sha256=…`), reminders and auto-resolve.

**Per reefer:** each reefer page has *Alert rules for this reefer* — switch any rule off for that unit, or
override its limit, range, duration and severity (empty = rule default; *Reset* goes back). Other reefers keep
the rule's normal settings. *Rule only for this reefer* creates a rule scoped to that single unit.

Alerts are acknowledged (stops reminders) and resolved by operators, individually or in bulk, with notes.
The engine re-evaluates on every message and every 30 s (for "no data" and durations).

## 3D view

`/fleet` shows the fleet as 40 ft reefers in an automatic 3D layout (there are no yard positions): lanes grouped
by status or tag, coloured by status or by temperature deviation, beacons on warning/critical units, hover for
live values, click to open. Camera presets, auto-rotate and search highlighting are in the toolbar.

## Roles

| Role | Can |
|---|---|
| Admin | everything incl. settings, rules and users |
| Operator | register/edit reefers, handle alerts, send commands |
| Viewer | read only |

## Production

```bash
npm run build && npm start
```

Run **one** instance: the MQTT broker/subscriber and alert engine live inside the server process.
Set a long random `AUTH_SECRET`, put the app behind HTTPS, and set device credentials for the built-in
broker (Settings → MQTT) or use an external broker with TLS.

## Tests

```bash
npm test          # payload mapping, rule evaluation, 3D layout
npm run typecheck
```

## Deployment

See [deploy/HOSTINGER.md](deploy/HOSTINGER.md) for hosting on a Hostinger Node.js web app. `npm start` listens on `$PORT` (default 3000); on first start against an empty database the app creates the admin from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` and the default alert rules.

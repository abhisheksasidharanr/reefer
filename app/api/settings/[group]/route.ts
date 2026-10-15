import { z } from 'zod';
import { HttpError, route } from '@/lib/server/api';
import { getSettings, maskSecrets, saveSettings } from '@/lib/server/settings';
import { SettingsKey } from '@/lib/settings-schema';

const GROUPS = ['general', 'mqtt', 'mapping', 'notify'] as const;

const schemas = {
  general: z.object({
    siteName: z.string().trim().min(1).max(60),
    tempUnit: z.enum(['C', 'F']),
    offlineAfterSec: z.coerce.number().int().min(30).max(86400),
    retentionDays: z.coerce.number().int().min(1).max(3650),
    sampleEverySec: z.coerce.number().int().min(0).max(3600),
    autoRegister: z.boolean(),
    defaultTolerance: z.coerce.number().min(0).max(30),
    timezone: z.string().refine((tz) => {
      try {
        Intl.DateTimeFormat('en', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, 'unknown time zone'),
  }),
  mqtt: z.object({
    mode: z.enum(['builtin', 'external']),
    builtinPort: z.coerce.number().int().min(1).max(65535),
    builtinUsername: z.string().max(100),
    builtinPassword: z.string().max(200),
    url: z.string().trim().regex(/^(mqtts?|wss?|tcp|ssl):\/\//, 'must start with mqtt://, mqtts://, ws:// or wss://'),
    username: z.string().max(100),
    password: z.string().max(200),
    clientId: z.string().trim().min(1).max(60),
    topic: z.string().trim().min(1).max(255),
    qos: z.coerce.number().int().min(0).max(2),
    commandTopic: z.string().trim().min(1).max(255),
    commandsEnabled: z.boolean(),
    demoFeed: z.boolean(),
    demoIntervalSec: z.coerce.number().int().min(2).max(300),
  }),
  mapping: z.object({
    deviceId: z.string().trim().min(1, 'is required').max(200),
    timestamp: z.string().max(200),
    setTemp: z.string().max(200),
    supplyTemp: z.string().max(200),
    returnTemp: z.string().max(200),
    humidity: z.string().max(200),
    voltage: z.string().max(200),
    current: z.string().max(200),
    power: z.string().max(200),
    faultCode: z.string().max(200),
    mode: z.string().max(200),
    runHours: z.string().max(200),
    payloadFahrenheit: z.boolean(),
  }),
  notify: z.object({
    emailEnabled: z.boolean(),
    smtpHost: z.string().trim().max(200),
    smtpPort: z.coerce.number().int().min(1).max(65535),
    smtpSecure: z.boolean(),
    smtpUser: z.string().max(200),
    smtpPass: z.string().max(200),
    emailFrom: z.string().trim().max(200),
    emailTo: z.string().trim().max(1000),
    webhookEnabled: z.boolean(),
    webhookUrl: z.string().trim().max(500).refine((u) => !u || /^https?:\/\//.test(u), 'must be an http(s) URL'),
    webhookSecret: z.string().max(200),
    inAppSeverities: z.array(z.enum(['info', 'warning', 'critical'])),
    sound: z.boolean(),
  }),
};

function group(ctx: { params: Record<string, string> }): SettingsKey {
  const g = ctx.params.group as SettingsKey;
  if (!GROUPS.includes(g as (typeof GROUPS)[number])) throw new HttpError(404, 'Unknown settings group');
  return g;
}

export const GET = route(async (_req, ctx) => {
  const g = group(ctx);
  return maskSecrets(g, await getSettings(g));
}, 'admin');

export const PUT = route(async (req, ctx) => {
  const g = group(ctx);
  const value = schemas[g].parse(await req.json());
  return maskSecrets(g, await saveSettings(g, value as never));
}, 'admin');

export const dynamic = 'force-dynamic';

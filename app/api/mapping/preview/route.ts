import { z } from 'zod';
import { HttpError, route } from '@/lib/server/api';
import { flatten, mapPayload } from '@/lib/mapping';
import { DEFAULTS, MappingSettings } from '@/lib/settings-schema';

/** Apply an (unsaved) mapping to a sample payload so the user sees the result before saving. */
export const POST = route(async (req) => {
  const body = z.object({ mapping: z.record(z.unknown()), payload: z.string(), topic: z.string().default('') }).parse(await req.json());
  let payload: unknown;
  try {
    payload = JSON.parse(body.payload);
  } catch {
    throw new HttpError(400, 'Sample payload is not valid JSON');
  }
  const mapping = { ...DEFAULTS.mapping, ...body.mapping } as MappingSettings;
  const item = Array.isArray(payload) ? payload[0] : payload;
  return { telemetry: mapPayload(item, body.topic, mapping), paths: Object.keys(flatten(item)) };
}, 'admin');

export const dynamic = 'force-dynamic';

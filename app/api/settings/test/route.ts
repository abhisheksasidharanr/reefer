import { z } from 'zod';
import { route } from '@/lib/server/api';
import { testConnection } from '@/lib/server/mqtt';
import { sendEmail, sendWebhook } from '@/lib/server/notify';
import { getSettings } from '@/lib/server/settings';

/** Test the saved MQTT / email / webhook configuration. */
export const POST = route(async (req, { session }) => {
  const { type } = z.object({ type: z.enum(['mqtt', 'email', 'webhook']) }).parse(await req.json());
  try {
    if (type === 'mqtt') return await testConnection(await getSettings('mqtt'));
    const n = await getSettings('notify');
    if (type === 'email') {
      await sendEmail(n, 'Reefer Monitor test email', `This is a test message sent by ${session.name}. Email notifications are working.`);
      return { ok: true, detail: `Sent to ${n.emailTo}` };
    }
    await sendWebhook(n, { event: 'test', sentBy: session.name, at: new Date().toISOString() });
    return { ok: true, detail: 'Webhook accepted the test event' };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}, 'admin');

export const dynamic = 'force-dynamic';

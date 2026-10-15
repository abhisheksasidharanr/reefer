import { NextRequest } from 'next/server';
import { getSession } from '@/lib/server/auth';
import { bus } from '@/lib/server/bus';

export const dynamic = 'force-dynamic';

/** Server-Sent Events: live readings, alerts and MQTT status for the browser. */
export async function GET(req: NextRequest) {
  if (!(await getSession())) return new Response('Unauthorized', { status: 401 });
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      };
      const onReading = (d: unknown) => send('reading', d);
      const onAlert = (d: unknown) => send('alert', d);
      const onMqtt = (d: unknown) => send('mqtt', d);
      const onMessage = (d: unknown) => send('message', d);
      bus.on('reading', onReading);
      bus.on('alert', onAlert);
      bus.on('mqtt', onMqtt);
      bus.on('message', onMessage);
      const ping = setInterval(() => send('ping', Date.now()), 25_000);
      send('hello', { at: Date.now() });
      cleanup = () => {
        clearInterval(ping);
        bus.off('reading', onReading);
        bus.off('alert', onAlert);
        bus.off('mqtt', onMqtt);
        bus.off('message', onMessage);
      };
      req.signal.addEventListener('abort', () => {
        cleanup();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' },
  });
}

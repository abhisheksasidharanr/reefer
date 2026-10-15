import { EventEmitter } from 'node:events';

/**
 * In-process event bus: MQTT ingest and the alert engine publish here,
 * the SSE endpoint (/api/stream) forwards events to browsers.
 *
 * Events: 'reading' {reeferId}, 'alert' {alert}, 'mqtt' {status}, 'message' {topic}, 'settings' key
 */
const g = globalThis as unknown as { __bus?: EventEmitter };
export const bus = g.__bus ?? (g.__bus = new EventEmitter());
bus.setMaxListeners(500);

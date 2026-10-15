import { createHmac } from 'node:crypto';
import nodemailer from 'nodemailer';
import type { NotifySettings } from '../settings-schema';
import { getSettings } from './settings';

export interface AlertNotice {
  id: number;
  severity: string;
  status: string;
  title: string;
  message: string;
  value: number | null;
  reefer: { id: number; containerNo: string; name: string | null };
  triggeredAt: Date;
  kind: 'triggered' | 'reminder' | 'resolved';
}

export async function sendEmail(n: NotifySettings, subject: string, text: string) {
  if (!n.smtpHost || !n.emailTo) throw new Error('SMTP host and recipients are required');
  const transport = nodemailer.createTransport({
    host: n.smtpHost,
    port: n.smtpPort,
    secure: n.smtpSecure,
    auth: n.smtpUser ? { user: n.smtpUser, pass: n.smtpPass } : undefined,
    connectionTimeout: 10_000,
  });
  await transport.sendMail({ from: n.emailFrom, to: n.emailTo.split(/[;,]/).map((s) => s.trim()).filter(Boolean), subject, text });
}

/** POST JSON; when a secret is set the body is signed: X-Signature: sha256=<hmac>. */
export async function sendWebhook(n: NotifySettings, body: unknown) {
  if (!n.webhookUrl) throw new Error('Webhook URL is required');
  const json = JSON.stringify(body);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (n.webhookSecret) headers['x-signature'] = `sha256=${createHmac('sha256', n.webhookSecret).update(json).digest('hex')}`;
  const res = await fetch(n.webhookUrl, { method: 'POST', headers, body: json, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Webhook responded ${res.status}`);
}

/** Fan out an alert to the channels its rule enables. Failures are logged, never thrown. */
export async function notifyAlert(a: AlertNotice, channels: { email: boolean; hook: boolean }) {
  const n = await getSettings('notify');
  const label = a.kind === 'resolved' ? 'RESOLVED' : a.severity.toUpperCase();
  const subject = `[${label}] ${a.reefer.containerNo} — ${a.title}`;
  const text = [
    `${a.title}`,
    `Reefer: ${a.reefer.containerNo}${a.reefer.name ? ` (${a.reefer.name})` : ''}`,
    `Severity: ${a.severity}`,
    `Status: ${a.kind}`,
    a.message,
    `Triggered: ${a.triggeredAt.toISOString()}`,
  ].join('\n');
  const jobs: Promise<unknown>[] = [];
  if (channels.email && n.emailEnabled) jobs.push(sendEmail(n, subject, text));
  if (channels.hook && n.webhookEnabled) jobs.push(sendWebhook(n, { event: `alert.${a.kind}`, alert: a }));
  for (const r of await Promise.allSettled(jobs)) if (r.status === 'rejected') console.warn('[notify]', (r.reason as Error).message);
}

/** Fleet status of a reefer, worst first. Shared by server and UI. */
export type ReeferStatus = 'critical' | 'warning' | 'offline' | 'off' | 'ok' | 'inactive' | 'never';

export const STATUS_META: Record<ReeferStatus, { label: string; tone: string; dot: string; order: number }> = {
  critical: { label: 'Critical', tone: 'text-red-600 bg-red-50 ring-red-200 dark:text-red-300 dark:bg-red-500/10 dark:ring-red-500/30', dot: 'bg-red-500', order: 0 },
  warning: { label: 'Warning', tone: 'text-amber-700 bg-amber-50 ring-amber-200 dark:text-amber-300 dark:bg-amber-500/10 dark:ring-amber-500/30', dot: 'bg-amber-500', order: 1 },
  offline: { label: 'Offline', tone: 'text-slate-600 bg-slate-100 ring-slate-200 dark:text-slate-300 dark:bg-slate-500/10 dark:ring-slate-500/30', dot: 'bg-slate-400', order: 2 },
  off: { label: 'Powered off', tone: 'text-violet-700 bg-violet-50 ring-violet-200 dark:text-violet-300 dark:bg-violet-500/10 dark:ring-violet-500/30', dot: 'bg-violet-500', order: 3 },
  ok: { label: 'Normal', tone: 'text-emerald-700 bg-emerald-50 ring-emerald-200 dark:text-emerald-300 dark:bg-emerald-500/10 dark:ring-emerald-500/30', dot: 'bg-emerald-500', order: 4 },
  never: { label: 'No data yet', tone: 'text-sky-700 bg-sky-50 ring-sky-200 dark:text-sky-300 dark:bg-sky-500/10 dark:ring-sky-500/30', dot: 'bg-sky-400', order: 5 },
  inactive: { label: 'Inactive', tone: 'text-slate-500 bg-slate-50 ring-slate-200 dark:text-slate-400 dark:bg-slate-500/5 dark:ring-slate-600/30', dot: 'bg-slate-300', order: 6 },
};

export function reeferStatus(
  r: { active: boolean; lastSeenAt: Date | string | null; powerOn: boolean | null },
  openAlerts: { severity: string }[],
  offlineAfterSec: number,
  now = Date.now(),
): ReeferStatus {
  if (!r.active) return 'inactive';
  if (openAlerts.some((a) => a.severity === 'critical')) return 'critical';
  if (openAlerts.some((a) => a.severity === 'warning')) return 'warning';
  if (!r.lastSeenAt) return 'never';
  if (now - new Date(r.lastSeenAt).getTime() > offlineAfterSec * 1000) return 'offline';
  if (r.powerOn === false) return 'off';
  return 'ok';
}

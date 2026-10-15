import { route } from '@/lib/server/api';
import { getSettings } from '@/lib/server/settings';

export const GET = route(async (_req, { session }) => {
  const general = await getSettings('general');
  const notify = await getSettings('notify');
  return {
    ...session,
    prefs: { siteName: general.siteName, tempUnit: general.tempUnit, offlineAfterSec: general.offlineAfterSec, inAppSeverities: notify.inAppSeverities, sound: notify.sound },
  };
});

export const dynamic = 'force-dynamic';

import { useEffect, useRef, useState } from 'react';
import { useOnline } from './useOnline';
import { useT } from '../i18n';
import styles from './ui.module.css';

const RECONNECTED_SHOW_MS = 2500;

/**
 * System banner (SCREENS §4): "You're offline" while offline, then "Back
 * online" briefly. The app retries by itself; the banner never blocks input.
 * `offlineKey` lets the host show its own "Reconnecting…" wording.
 */
export function OfflineBanner({ offlineKey = 'sys.offline', forceOffline = false }: { offlineKey?: string; forceOffline?: boolean }) {
  const t = useT();
  const online = useOnline() && !forceOffline;
  const wasOffline = useRef(false);
  const [showBack, setShowBack] = useState(false);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      setShowBack(false);
      return;
    }
    if (wasOffline.current) {
      wasOffline.current = false;
      setShowBack(true);
      const timer = window.setTimeout(() => setShowBack(false), RECONNECTED_SHOW_MS);
      return () => window.clearTimeout(timer);
    }
  }, [online]);

  if (!online) {
    return (
      <div className={styles.banner} role="status" data-testid="offline-banner">
        {t(offlineKey)}
      </div>
    );
  }
  if (showBack) {
    return (
      <div className={`${styles.banner} ${styles.bannerOk}`} role="status">
        {t('sys.reconnected')}
      </div>
    );
  }
  return null;
}

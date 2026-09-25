/**
 * The big screen (`SCREENS.md` §2): H0 sign-in → H1 lobby → H2 round live →
 * H3 intermission (×N) → H4 results → H5 day boards → New session. Only an admin JWT (`app_metadata.role`) gets
 * past H0 (ADR-101); the screen shown is reconstructed from the database.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { LangProvider, useT } from '../i18n';
import { supabase } from '../lib/supabase';
import logo from '../assets/logo.png';
import { SHATTER_LOGO_CLASS, useReducedMotion } from '../effects/shatter';
import { ScreenTransition } from '../components/ScreenTransition';
import { Spinner } from '../components/Spinner';
import { useOnline } from '../components/useOnline';
import ui from '../components/ui.module.css';
import styles from './host.module.css';
import { useHost } from './useHost';
import { hostScreenKey, showsLogo } from './screenKey';
import { HostLobby, HostRound } from './screens';
import { HostIntermission } from './Intermission';
import { HostSessionEnd } from './Results';
import { HostMotionProvider } from './motion';
import { HOST_THEME_KEY, HostShell } from './common';

/** Applies the host's remembered "Dark screen" setting (Settings, plan §4.7) before the first paint. */
function useStoredHostTheme(): void {
  useLayoutEffect(() => {
    let dark = false;
    try {
      dark = localStorage.getItem(HOST_THEME_KEY) === 'dark';
    } catch {
      // blocked storage: stay on the default light theme (ADR-122)
    }
    const root = document.documentElement;
    if (dark) root.dataset.theme = 'dark';
    return () => {
      delete root.dataset.theme;
    };
  }, []);
}

export function HostApp() {
  useStoredHostTheme();
  return (
    <LangProvider>
      <HostMotionProvider>
        <HostRoot />
      </HostMotionProvider>
    </LangProvider>
  );
}

function isAdmin(session: Session | null): boolean {
  return (session?.user.app_metadata as { role?: string } | undefined)?.role === 'admin';
}

type AuthState = 'loading' | 'signed_out' | 'admin';

function HostRoot() {
  const [auth, setAuth] = useState<AuthState>('loading');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      if (isAdmin(data.session)) setAuth('admin');
      else {
        if (data.session) await supabase.auth.signOut();
        setAuth('signed_out');
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      if (isAdmin(session)) setAuth('admin');
      else if (!session) setAuth('signed_out');
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (auth === 'loading') return <Spinner />;
  if (auth === 'signed_out') {
    return (
      <SignIn
        notice={notice}
        onNotAdmin={() => setNotice('host.signin.not_admin')}
        onSignedIn={() => {
          setNotice(null);
          setAuth('admin');
        }}
      />
    );
  }
  return <HostMain />;
}

export function SignIn({
  notice,
  onNotAdmin,
  onSignedIn,
}: {
  notice: string | null;
  onNotAdmin(): void;
  onSignedIn(): void;
}) {
  const t = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (err || !data.session) {
      setError(
        err && /fetch|network/i.test(err.message) ? 'sys.generic_error' : 'host.signin.error',
      );
      return;
    }
    if (!isAdmin(data.session)) {
      await supabase.auth.signOut();
      onNotAdmin();
      return;
    }
    onSignedIn();
  };

  const shown = error ?? notice;
  // H0 (plan §4.1): one quiet column on the page, no card; laptop scale, not projected.
  return (
    <div className={styles.signinPage}>
      <form className={styles.signin} onSubmit={submit} data-testid="host-signin">
        <img
          src={logo}
          alt={t('app.name')}
          className={`${ui.logo} ${SHATTER_LOGO_CLASS} ${styles.signinLogo}`}
          data-testid="logo"
        />
        <h1 className={styles.signinTitle}>{t('host.signin.title')}</h1>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>{t('host.signin.email')}</span>
          <input
            className={ui.input}
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            data-testid="signin-email"
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>{t('host.signin.password')}</span>
          <input
            className={ui.input}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            data-testid="signin-password"
          />
        </label>
        {shown ? (
          <p className={ui.error} role="alert" data-testid="signin-error">
            {t(shown)}
          </p>
        ) : null}
        <button type="submit" className={styles.signinSubmit} disabled={busy} data-testid="signin-submit">
          {t('host.signin.submit')}
        </button>
        <p className={styles.signinHint}>{t('host.signin.hint')}</p>
      </form>
    </div>
  );
}

function HostMain() {
  const t = useT();
  const host = useHost();
  const { data } = host;
  const reduced = useReducedMotion();
  const screenKey = hostScreenKey(host);
  // `data-screen` names the screen actually shown: during a transition's fly-in that is still the
  // previous one, so nothing (people or tests) acts on a screen that isn't there yet.
  const screenOfKey = useRef(new Map<string, string>());
  screenOfKey.current.set(screenKey, host.screen);
  const [shownKey, setShownKey] = useState(screenKey);
  const shownScreen =
    shownKey === screenKey ? host.screen : (screenOfKey.current.get(shownKey) ?? host.screen);

  const online = useOnline();
  const banner = host.dbDown
    ? t('host.banner.db_down')
    : !online || (data && !host.live)
      ? t('host.banner.reconnecting')
      : null;

  return (
    <HostShell screen={shownScreen} banner={banner}>
      <ScreenTransition
        screenKey={screenKey}
        className={styles.screens}
        onShown={setShownKey}
        instantWhen={(from, to) => reduced && (showsLogo(from) || showsLogo(to))}
      >
        {!data || host.screen === 'loading' ? (
          <Spinner />
        ) : host.screen === 'lobby' ? (
          <HostLobby key={data.session.id} host={host} data={data} />
        ) : host.screen === 'round' ? (
          <HostRound host={host} data={data} />
        ) : host.screen === 'intermission' ? (
          <HostIntermission host={host} data={data} />
        ) : (
          <HostSessionEnd host={host} data={data} />
        )}
      </ScreenTransition>
    </HostShell>
  );
}

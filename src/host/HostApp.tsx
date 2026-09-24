/**
 * The big screen (`SCREENS.md` §2): H0 sign-in → H1 lobby → H2 round live →
 * H3 intermission (×N) → H4 results → H5 day boards → New session. Only an admin JWT (`app_metadata.role`) gets
 * past H0 (ADR-101); the screen shown is reconstructed from the database.
 */
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { LangProvider, useT } from '../i18n';
import { supabase } from '../lib/supabase';
import logo from '../assets/logo.png';
import { Spinner } from '../components/Spinner';
import { useOnline } from '../components/useOnline';
import ui from '../components/ui.module.css';
import styles from './host.module.css';
import { useHost } from './useHost';
import { HostLobby, HostRound } from './screens';
import { HostIntermission } from './Intermission';
import { HostDayBoards, HostResults } from './Results';

export function HostApp() {
  return (
    <LangProvider>
      <HostRoot />
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

function SignIn({
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
    const { data, error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (err || !data.session) {
      setError(err && /fetch|network/i.test(err.message) ? 'sys.generic_error' : 'host.signin.error');
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
  return (
    <form className={styles.signin} onSubmit={submit} data-testid="host-signin">
      <img src={logo} alt={t('app.name')} className={ui.logo} />
      <h1 className={ui.title}>{t('host.signin.title')}</h1>
      <label className={styles.field}>
        <span>{t('host.signin.email')}</span>
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
        <span>{t('host.signin.password')}</span>
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
      <button type="submit" className={`${ui.button} ${ui.buttonBlock}`} disabled={busy} data-testid="signin-submit">
        {t('host.signin.submit')}
      </button>
    </form>
  );
}

function HostMain() {
  const t = useT();
  const host = useHost();
  const { data } = host;

  const online = useOnline();
  const banner = host.dbDown
    ? t('host.banner.db_down')
    : !online || (data && !host.live)
      ? t('host.banner.reconnecting')
      : null;

  return (
    <div className={styles.host} data-testid="host-root" data-screen={host.screen}>
      {banner ? (
        <div className={styles.banner} role="status" data-testid="host-banner">
          {banner}
        </div>
      ) : null}
      {!data || host.screen === 'loading' ? (
        <Spinner />
      ) : host.screen === 'lobby' ? (
        <HostLobby key={data.session.id} host={host} data={data} />
      ) : host.screen === 'round' ? (
        <HostRound host={host} data={data} />
      ) : host.screen === 'intermission' ? (
        <HostIntermission host={host} data={data} />
      ) : host.screen === 'results' ? (
        <HostResults host={host} data={data} />
      ) : (
        <HostDayBoards host={host} data={data} />
      )}
    </div>
  );
}

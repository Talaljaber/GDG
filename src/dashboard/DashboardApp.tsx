/**
 * The admin dashboard (`SCREENS.md` §3): D0 sign-in (shared with `/host`,
 * same admin session storage key, `src/lib/supabase.ts`) -> D1 Today, with
 * tabs for D2 Sessions (-> D3 detail), D4 Results, D5 Names, D6 Days.
 * Phone-first layout; never projected.
 */
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { LangProvider, useLang, useT } from '../i18n';
import { supabase } from '../lib/supabase';
import logo from '../assets/logo.png';
import { Spinner } from '../components/Spinner';
import ui from '../components/ui.module.css';
import styles from './dashboard.module.css';
import { TodayPanel } from './Today';
import { SessionDetailPanel, SessionsPanel } from './Sessions';
import { ResultsPanel } from './Results';
import { NamesPanel } from './Names';
import { DaysPanel } from './Days';

export function DashboardApp() {
  return (
    <LangProvider>
      <DashboardRoot />
    </LangProvider>
  );
}

function isAdmin(session: Session | null): boolean {
  return (session?.user.app_metadata as { role?: string } | undefined)?.role === 'admin';
}

type AuthState = 'loading' | 'signed_out' | 'admin';

function DashboardRoot() {
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
  return <DashboardMain />;
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
    <form className={styles.main} onSubmit={submit} data-testid="dash-signin">
      <img src={logo} alt={t('app.name')} width={160} />
      <h1 className={styles.sectionTitle}>{t('host.signin.title')}</h1>
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

type Tab = 'today' | 'sessions' | 'results' | 'names' | 'days';

function DashboardMain() {
  const t = useT();
  const { lang, setLang } = useLang();
  const [tab, setTab] = useState<Tab>('today');
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'today', label: t('dash.nav.today') },
    { id: 'sessions', label: t('dash.nav.sessions') },
    { id: 'results', label: t('dash.nav.results') },
    { id: 'names', label: t('dash.nav.names') },
    { id: 'days', label: t('dash.nav.days') },
  ];

  const goTo = (next: Tab) => {
    setOpenSessionId(null);
    setTab(next);
  };

  return (
    <div className={styles.root} data-testid="dashboard-root">
      <header className={styles.header}>
        <div className={styles.row}>
          <img src={logo} alt={t('app.name')} width={32} height={32} />
          <span className={styles.sectionTitle}>{t('dash.title')}</span>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={`${ui.button} ${ui.buttonSecondary}`}
            lang={lang === 'en' ? 'ar' : 'en'}
            onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
            data-testid="lang-toggle"
          >
            {t('common.lang_toggle')}
          </button>
          <button
            type="button"
            className={`${ui.button} ${ui.buttonSecondary}`}
            onClick={() => void supabase.auth.signOut()}
            data-testid="signout"
          >
            {t('host.signout')}
          </button>
        </div>
      </header>
      <nav className={styles.nav} data-testid="dash-nav">
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            className={`${styles.navButton} ${tab === x.id && !openSessionId ? styles.navButtonOn : ''}`}
            onClick={() => goTo(x.id)}
            data-testid={`nav-${x.id}`}
          >
            {x.label}
          </button>
        ))}
      </nav>
      {tab === 'today' ? <TodayPanel /> : null}
      {tab === 'sessions' && !openSessionId ? <SessionsPanel onOpenSession={setOpenSessionId} /> : null}
      {tab === 'sessions' && openSessionId ? (
        <SessionDetailPanel sessionId={openSessionId} onBack={() => setOpenSessionId(null)} />
      ) : null}
      {tab === 'results' ? <ResultsPanel /> : null}
      {tab === 'names' ? <NamesPanel /> : null}
      {tab === 'days' ? <DaysPanel /> : null}
    </div>
  );
}

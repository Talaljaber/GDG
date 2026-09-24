/**
 * The admin dashboard (`SCREENS.md` §3): D0 sign-in (shared with `/host`,
 * same admin session storage key, `src/lib/supabase.ts`) -> D1 Today, with
 * D2 Sessions (-> D3 detail), D4 Results, D5 Names, D6 Days.
 * v2 layout (DESIGN_SYSTEM §0.4): a left nav on desktop (inline-start, so it
 * moves to the right in Arabic), top tabs under 768 px. Never projected.
 */
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { LangProvider, useLang, useT } from '../i18n';
import { supabase } from '../lib/supabase';
import logo from '../assets/logo.png';
import { SHATTER_LOGO_CLASS } from '../effects/shatter';
import { Spinner } from '../components/Spinner';
import ui from '../components/ui.module.css';
import styles from './dashboard.module.css';
import { Alert, Icon } from './parts';
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
  const [email, setEmail] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      if (isAdmin(data.session)) {
        setEmail(data.session?.user.email ?? null);
        setAuth('admin');
      } else {
        if (data.session) await supabase.auth.signOut();
        setAuth('signed_out');
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      if (isAdmin(session)) {
        setEmail(session?.user.email ?? null);
        setAuth('admin');
      } else if (!session) setAuth('signed_out');
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
  return <DashboardMain adminEmail={email} />;
}

function LangToggle({ className }: { className: string }) {
  const t = useT();
  const { lang, setLang } = useLang();
  return (
    <button
      type="button"
      className={className}
      lang={lang === 'en' ? 'ar' : 'en'}
      onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
      data-testid="lang-toggle"
    >
      <Icon name="language" />
      <span>{t('common.lang_toggle')}</span>
    </button>
  );
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
    <div className={styles.signinPage}>
      <form className={styles.signinPanel} onSubmit={submit} data-testid="dash-signin">
        <div className={styles.signinTop}>
          <img src={logo} alt={t('app.name')} className={`${styles.logo} ${SHATTER_LOGO_CLASS}`} data-testid="logo" />
          <LangToggle className={`${ui.button} ${ui.buttonText} ${ui.buttonSmall} ${styles.ctl} ${styles.quiet}`} />
        </div>
        <div className={styles.signinHeading}>
          <span className={ui.eyebrow}>{t('dash.title')}</span>
          <h1 className={styles.pageTitle}>{t('host.signin.title')}</h1>
        </div>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>{t('host.signin.email')}</span>
          <input
            className={styles.input}
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
            className={styles.input}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            data-testid="signin-password"
          />
        </label>
        {shown ? <Alert testId="signin-error">{t(shown)}</Alert> : null}
        <button
          type="submit"
          className={`${ui.button} ${ui.buttonSmall} ${ui.buttonBlock} ${styles.ctl} ${styles.signinSubmit}`}
          disabled={busy}
          data-testid="signin-submit"
        >
          {t('host.signin.submit')}
        </button>
      </form>
    </div>
  );
}

export type DashTab = 'today' | 'sessions' | 'results' | 'names' | 'days';

export function DashboardMain({
  adminEmail = null,
  initialTab = 'today',
  initialSessionId = null,
}: {
  adminEmail?: string | null;
  /** Dev preview only: open on this page. */
  initialTab?: DashTab;
  /** Dev preview only: open this session's detail (with `initialTab: 'sessions'`). */
  initialSessionId?: string | null;
}) {
  const t = useT();
  const [tab, setTab] = useState<DashTab>(initialTab);
  const [openSessionId, setOpenSessionId] = useState<string | null>(initialSessionId);

  const tabs: { id: DashTab; label: string }[] = [
    { id: 'today', label: t('dash.nav.today') },
    { id: 'sessions', label: t('dash.nav.sessions') },
    { id: 'results', label: t('dash.nav.results') },
    { id: 'names', label: t('dash.nav.names') },
    { id: 'days', label: t('dash.nav.days') },
  ];

  const goTo = (next: DashTab) => {
    setOpenSessionId(null);
    setTab(next);
  };

  return (
    <div className={styles.root} data-testid="dashboard-root">
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <img src={logo} alt={t('app.name')} className={`${styles.logo} ${SHATTER_LOGO_CLASS}`} data-testid="logo" />
          <span className={styles.brandLabel}>{t('dash.title')}</span>
        </div>
        <nav className={styles.nav} aria-label={t('dash.title')} data-testid="dash-nav">
          {tabs.map((x) => (
            <button
              key={x.id}
              type="button"
              className={`${styles.navButton} ${tab === x.id ? styles.navButtonOn : ''}`}
              aria-current={tab === x.id ? 'page' : undefined}
              onClick={() => goTo(x.id)}
              data-testid={`nav-${x.id}`}
            >
              {x.label}
            </button>
          ))}
        </nav>
        <div className={styles.account}>
          {adminEmail ? (
            <div className={styles.accountWho}>
              <span className={ui.eyebrow}>{t('dash.account.signed_in')}</span>
              <span className={styles.accountEmail} title={adminEmail}>
                <bdi>{adminEmail}</bdi>
              </span>
            </div>
          ) : null}
          <div className={styles.accountActions}>
            <LangToggle className={`${ui.button} ${ui.buttonText} ${ui.buttonSmall} ${styles.ctl} ${styles.quiet} ${styles.accountButton}`} />
            <button
              type="button"
              className={`${ui.button} ${ui.buttonText} ${ui.buttonSmall} ${styles.ctl} ${styles.quiet} ${styles.accountButton}`}
              onClick={() => void supabase.auth.signOut()}
              data-testid="signout"
            >
              <Icon name="logout" mirror />
              <span className={styles.signoutLabel}>{t('host.signout')}</span>
            </button>
          </div>
        </div>
      </aside>
      <main className={styles.content}>
        {tab === 'today' ? <TodayPanel /> : null}
        {tab === 'sessions' && !openSessionId ? <SessionsPanel onOpenSession={setOpenSessionId} /> : null}
        {tab === 'sessions' && openSessionId ? (
          <SessionDetailPanel sessionId={openSessionId} onBack={() => setOpenSessionId(null)} />
        ) : null}
        {tab === 'results' ? <ResultsPanel /> : null}
        {tab === 'names' ? <NamesPanel /> : null}
        {tab === 'days' ? <DaysPanel /> : null}
      </main>
    </div>
  );
}

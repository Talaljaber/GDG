/**
 * P1 Enter code → P2 Enter name (→ P4 Removed on GD004). Nothing is sent to
 * the server until a 4-digit code and a valid name are submitted; the
 * anonymous sign-in happens then (ADR-007, ADR-102). After too many wrong
 * codes (GD013, ADR-130) P2 counts down the server's wait with Join disabled;
 * the deadline lives here so going back to P1 and returning keeps it.
 */
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useT } from '../i18n';
import { ApiError, joinSession, type JoinPayload } from '../lib/api';
import { cleanName, normalizeCode, normalizeDigits, validateName } from '../lib/names';
import { getLastName, setLastName } from '../lib/storage';
import ui from '../components/ui.module.css';
import styles from './player.module.css';
import { RemovedScreen, ctaClass as cta } from './screens';

const CODE_LENGTH = 4;
const NAME_MAX = 12;
/** E29: auto-retry once after 5 s when anonymous sign-in is rate-limited. */
const RATE_RETRY_MS = 5000;
/** Countdown refresh while waiting out the wrong-code lock (ADR-130). */
const WAIT_TICK_MS = 250;
/** Used only if a GD013 result ever arrived without retry_after_s: the server's lock length. */
const WAIT_FALLBACK_S = 30;

type Step = 'code' | 'name' | 'removed';

export function JoinFlow({ onJoined }: { onJoined(payload: JoinPayload): void }) {
  const [step, setStep] = useState<Step>('code');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [name, setName] = useState(() => getLastName() ?? '');
  /** Date.now() at which the wrong-code lock ends (GD013), or null. */
  const [waitUntil, setWaitUntil] = useState<number | null>(null);

  if (step === 'removed') {
    return (
      <RemovedScreen
        onCta={() => {
          setCode('');
          setCodeError(null);
          setStep('code');
        }}
      />
    );
  }

  if (step === 'code') {
    return (
      <CodeScreen
        initialError={codeError}
        onSubmit={(c) => {
          setCode(c);
          setCodeError(null);
          setStep('name');
        }}
      />
    );
  }

  return (
    <NameScreen
      code={code}
      name={name}
      onNameChange={setName}
      onBack={() => {
        setCodeError(null);
        setStep('code');
      }}
      onCodeInvalid={() => {
        setCodeError('join.code.error_invalid');
        setStep('code');
      }}
      onRemoved={() => setStep('removed')}
      waitUntil={waitUntil}
      onWait={(seconds) => setWaitUntil(Date.now() + seconds * 1000)}
      onJoined={(payload) => {
        setLastName(name.trim());
        onJoined(payload);
      }}
    />
  );
}

export function CodeScreen({ initialError, onSubmit }: { initialError: string | null; onSubmit(code: string): void }) {
  const t = useT();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(initialError);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const tryAdvance = (digits: string, fromButton: boolean) => {
    if (digits.length < CODE_LENGTH) {
      if (fromButton) setError('join.code.error_format');
      return;
    }
    const normalized = normalizeCode(digits);
    if (!normalized) {
      setError('join.code.error_invalid');
      return;
    }
    onSubmit(normalized);
  };

  const onChange = (raw: string) => {
    // Accept Arabic-Indic digits; keep digits only (SCREENS P1).
    const digits = normalizeDigits(raw).replace(/\D/g, '').slice(0, CODE_LENGTH);
    setValue(digits);
    if (error && digits.length > 0) setError(null);
    if (digits.length === CODE_LENGTH) tryAdvance(digits, false);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    tryAdvance(value, true);
  };

  // Four digit cells over one real input (DESIGN_SYSTEM §0.3): the input keeps the numeric
  // keypad, paste, autofill and Arabic-Indic normalisation; the cells only draw it.
  const active = focused ? Math.min(value.length, CODE_LENGTH - 1) : -1;
  return (
    <form className={styles.screen} onSubmit={submit} data-testid="screen-code" noValidate>
      <header className={styles.header}>
        <p className={styles.eyebrow}>{t('join.code.eyebrow')}</p>
        <h1 className={styles.title}>
          <label htmlFor="join-code">{t('join.code.title')}</label>
        </h1>
      </header>
      <div className={styles.codeField}>
        <div className={styles.cells} aria-hidden="true" data-invalid={error ? 'true' : undefined}>
          {Array.from({ length: CODE_LENGTH }, (_, i) => (
            <span
              key={i}
              className={`${styles.cell} ${i === active ? styles.cellActive : ''} ${value[i] ? styles.cellFilled : ''}`}
            >
              {value[i] ?? (i === active ? <span className={styles.caret} /> : null)}
            </span>
          ))}
        </div>
        <input
          id="join-code"
          ref={inputRef}
          className={styles.codeInput}
          inputMode="numeric"
          autoComplete="one-time-code"
          dir="ltr"
          placeholder={t('join.code.placeholder')}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? 'join-code-error' : 'join-code-hint'}
          data-testid="code-input"
        />
      </div>
      {error ? (
        <p id="join-code-error" className={ui.error} role="alert" data-testid="code-error">
          {t(error)}
        </p>
      ) : (
        <p id="join-code-hint" className={styles.helper}>
          {t('join.code.placeholder')}
        </p>
      )}
      <div className={styles.spacer} />
      <div className={styles.bottom}>
        <button type="submit" className={cta} data-testid="code-next">
          {t('join.code.next')}
        </button>
      </div>
    </form>
  );
}

export function NameScreen({
  code,
  name,
  onNameChange,
  onBack,
  onCodeInvalid,
  onRemoved,
  waitUntil,
  onWait,
  onJoined,
  initialError = null,
}: {
  code: string;
  name: string;
  onNameChange(name: string): void;
  onBack(): void;
  onCodeInvalid(): void;
  onRemoved(): void;
  waitUntil: number | null;
  onWait(seconds: number): void;
  onJoined(payload: JoinPayload): void;
  /** An error key to start with (dev preview only; the flow always starts clean). */
  initialError?: string | null;
}) {
  const t = useT();
  const [error, setError] = useState<string | null>(initialError);
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const retriedRate = useRef(false);
  const alive = useRef(true);
  const retryTimer = useRef<number | null>(null);

  // Wrong-code lock (GD013): tick until the deadline, then stop.
  useEffect(() => {
    if (waitUntil === null) return;
    let id = 0;
    const tick = () => {
      const ms = Date.now();
      setNow(ms);
      if (ms >= waitUntil) window.clearInterval(id);
    };
    id = window.setInterval(tick, WAIT_TICK_MS);
    tick();
    return () => window.clearInterval(id);
  }, [waitUntil]);
  const waitLeft = waitUntil === null ? 0 : Math.max(0, Math.ceil((waitUntil - now) / 1000));
  const waiting = waitLeft > 0;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (retryTimer.current) window.clearTimeout(retryTimer.current);
    };
  }, []);

  const length = Array.from(cleanName(name)).length;

  const onChange = (raw: string) => {
    // maxlength is enforced on cleaned characters (SCREENS P2).
    if (Array.from(cleanName(raw)).length > NAME_MAX) return;
    onNameChange(raw);
    if (error) setError(null);
  };

  const doJoin = async () => {
    setSubmitting(true);
    try {
      const payload = await joinSession(code, name.trim());
      if (!alive.current) return;
      onJoined(payload);
    } catch (err) {
      if (!alive.current) return;
      const mapped = err instanceof ApiError ? err.mapped : null;
      const kind = mapped?.kind ?? 'unknown';
      setSubmitting(false);
      switch (kind) {
        case 'code_invalid':
          onCodeInvalid();
          return;
        case 'removed':
          onRemoved();
          return;
        case 'name_invalid':
          setError('join.name.error_invalid');
          return;
        case 'name_blocked':
          setError('join.name.error_blocked');
          return;
        case 'too_many_tries':
          setError(null);
          setNow(Date.now());
          onWait(err instanceof ApiError && err.retryAfterS ? err.retryAfterS : WAIT_FALLBACK_S);
          return;
        case 'rate_limited':
          setError('join.error_rate');
          if (!retriedRate.current) {
            retriedRate.current = true;
            setSubmitting(true);
            retryTimer.current = window.setTimeout(() => void doJoin(), RATE_RETRY_MS);
          }
          return;
        case 'network':
          setError(mapped?.copyKey === 'join.error_warming' ? 'join.error_warming' : 'join.error_network');
          return;
        default:
          setError('sys.generic_error');
      }
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (submitting || waiting) return;
    const v = validateName(name);
    if (!v.ok) {
      setError(v.reason === 'empty' ? 'join.name.error_empty' : 'join.name.error_invalid');
      return;
    }
    retriedRate.current = false;
    void doJoin();
  };

  return (
    <form className={styles.screen} onSubmit={submit} data-testid="screen-name" noValidate>
      <div className={styles.backRow}>
        <button type="button" className={`${ui.linkButton} ${styles.back}`} onClick={onBack} data-testid="name-back">
          <svg className={styles.backIcon} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <polyline points="10,3 5,8 10,13" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t('join.back')}
        </button>
        <span className={styles.codeTag}>
          <span className={styles.eyebrow}>{t('join.name.code_label')}</span>
          <span className={styles.codeTagValue} dir="ltr">
            {code}
          </span>
        </span>
      </div>
      <header className={styles.header}>
        <p className={styles.eyebrow}>{t('join.name.eyebrow')}</p>
        <h1 className={styles.title}>{t('join.name.title')}</h1>
      </header>
      <div className={styles.field}>
        <label htmlFor="join-name" className={styles.fieldLabel}>
          {t('join.name.label')}
        </label>
        <input
          id="join-name"
          className={`${ui.input} ${styles.nameInput}`}
          autoComplete="nickname"
          autoCapitalize="words"
          enterKeyHint="go"
          placeholder={t('join.name.placeholder')}
          value={name}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? 'join-name-hint join-name-error' : 'join-name-hint'}
          data-testid="name-input"
        />
        <div className={styles.hintRow} id="join-name-hint">
          <span>{t('join.name.hint')}</span>
          <span className={styles.counter} dir="ltr">
            {t('join.name.counter', { n: length, max: NAME_MAX })}
          </span>
        </div>
      </div>
      {waiting ? (
        <p className={ui.error} role="status" data-testid="name-wait">
          {t('join.error_wait', { s: waitLeft })}
        </p>
      ) : error ? (
        <p id="join-name-error" className={ui.error} role="alert" data-testid="name-error">
          {t(error)}
        </p>
      ) : null}
      <div className={styles.spacer} />
      <div className={styles.bottom}>
        <button
          type="submit"
          className={cta}
          disabled={submitting || waiting}
          aria-busy={submitting}
          data-testid="name-submit"
        >
          {t('join.name.submit')}
        </button>
      </div>
    </form>
  );
}

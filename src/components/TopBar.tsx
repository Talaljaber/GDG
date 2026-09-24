import logo from '../assets/logo.png';
import { useLang, useT } from '../i18n';
import styles from './ui.module.css';

/**
 * P0 shell top bar: the static GDG logo (never animated, DESIGN_SYSTEM §5)
 * and the language toggle, hidden during rounds (E17).
 */
export function TopBar({ showLangToggle }: { showLangToggle: boolean }) {
  const t = useT();
  const { lang, setLang } = useLang();
  return (
    <header className={styles.topBar}>
      <img src={logo} alt={t('app.name')} className={styles.logo} />
      {showLangToggle ? (
        <button
          type="button"
          className={styles.langToggle}
          lang={lang === 'en' ? 'ar' : 'en'}
          onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
          data-testid="lang-toggle"
        >
          {t('common.lang_toggle')}
        </button>
      ) : null}
    </header>
  );
}

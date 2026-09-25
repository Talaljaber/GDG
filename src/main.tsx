// Dev-only render counter (empty in builds); first, so it hooks React before react-dom loads.
import './dev/renderCount';
import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/base.css';
import { PlayerApp } from './player/PlayerApp';
import { Spinner } from './components/Spinner';

// Host and dashboard are only opened on the booth's laptop, never on a guest's phone: lazy-load
// them so the phone route's initial chunk excludes host/dashboard/qrcode/CSV code (PRD §6).
const HostApp = lazy(() => import('./host/HostApp').then((m) => ({ default: m.HostApp })));
const DashboardApp = lazy(() =>
  import('./dashboard/DashboardApp').then((m) => ({ default: m.DashboardApp })),
);

// Dev-only design preview (src/dev/Preview.tsx); import.meta.env.DEV is false in builds,
// so the import and every fixture are dropped from the production bundle.
const Preview = import.meta.env.DEV
  ? lazy(() => import('./dev/Preview').then((m) => ({ default: m.Preview })))
  : null;

// No router library (ADR-107): three paths switched by location.pathname.
function App() {
  // Normalise a trailing slash so '/host/' opens the host, matching the admin-session check in lib/supabase.ts.
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (Preview && path === '/__preview') {
    return (
      <Suspense fallback={<Spinner />}>
        <Preview />
      </Suspense>
    );
  }
  switch (path) {
    case '/host':
      return (
        <Suspense fallback={<Spinner />}>
          <HostApp />
        </Suspense>
      );
    case '/dashboard':
      return (
        <Suspense fallback={<Spinner />}>
          <DashboardApp />
        </Suspense>
      );
    case '/':
    default:
      return <PlayerApp />;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('#root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

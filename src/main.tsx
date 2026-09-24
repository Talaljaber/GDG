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

// No router library (ADR-107): three paths switched by location.pathname.
function App() {
  // Normalise a trailing slash so '/host/' opens the host, matching the admin-session check in lib/supabase.ts.
  switch (window.location.pathname.replace(/\/+$/, '') || '/') {
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

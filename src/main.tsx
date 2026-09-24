import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/base.css';
import { PlayerApp } from './player/PlayerApp';
import { HostApp } from './host/HostApp';
import { DashboardApp } from './dashboard/DashboardApp';

// No router library (ADR-107): three paths switched by location.pathname.
function App() {
  switch (window.location.pathname) {
    case '/host':
      return <HostApp />;
    case '/dashboard':
      return <DashboardApp />;
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

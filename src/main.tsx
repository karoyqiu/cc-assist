import React from 'react';
import ReactDOM from 'react-dom/client';

import './lib/i18n';
import { ChatApp, TerminalWindowApp } from './App';

type AppMode = 'terminal' | 'chat';

// Default to chat for the gui branch; switch via window.switchAppMode() in dev tools
const DEFAULT_MODE: AppMode = (localStorage.getItem('appMode') as AppMode) ?? 'chat';

function Root() {
  const [mode, setMode] = React.useState<AppMode>(DEFAULT_MODE);

  // Expose switch function for dev tools
  React.useEffect(() => {
    (window as unknown as { switchAppMode?: (m: AppMode) => void }).switchAppMode = (
      m: AppMode,
    ) => {
      localStorage.setItem('appMode', m);
      setMode(m);
    };
  }, []);

  return mode === 'chat' ? <ChatApp /> : <TerminalWindowApp />;
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);

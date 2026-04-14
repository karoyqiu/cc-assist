import React from 'react';
import ReactDOM from 'react-dom/client';

import './lib/i18n';
import { TerminalWindowApp } from './App';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <TerminalWindowApp />
  </React.StrictMode>,
);

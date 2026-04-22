import React from 'react';
import ReactDOM from 'react-dom/client';

import { TerminalWindowApp } from './TerminalWindowApp';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <TerminalWindowApp />
  </React.StrictMode>,
);

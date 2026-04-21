import React from 'react';
import ReactDOM from 'react-dom/client';

import './lib/i18n';
import { ChatWindowApp } from './windows';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ChatWindowApp />
  </React.StrictMode>,
);

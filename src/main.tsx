import React from 'react';
import ReactDOM from 'react-dom/client';

// Placeholder — replaced in Task 14
function ChatApp() {
  return (
    <div className="bg-background text-foreground flex h-screen w-screen items-center justify-center text-sm">
      Chat coming soon
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ChatApp />
  </React.StrictMode>,
);

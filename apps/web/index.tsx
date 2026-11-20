import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ScreenErrorBoundary } from './components/ui/ScreenErrorBoundary';
import { loadLanguage } from './utils/translations';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {/* Last line of defence: a crash outside any screen (login, menus) still shows a way out */}
    <ScreenErrorBoundary lang={loadLanguage()} name="app" onHome={() => window.location.reload()}>
      <App />
    </ScreenErrorBoundary>
  </React.StrictMode>
);
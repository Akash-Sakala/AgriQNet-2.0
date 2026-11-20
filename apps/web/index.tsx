import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/index.css';
import App from './App';
import { ScreenErrorBoundary } from './components/ui/ScreenErrorBoundary';
import { loadLanguage } from './utils/translations';
import { applyPrefs, readPrefs } from './utils/displayPrefs';

// Apply Sunlight / Reduce motion before the first paint (no flash of the other theme)
applyPrefs(readPrefs());

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
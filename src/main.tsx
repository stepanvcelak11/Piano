import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { isEmbeddedPreview } from './lib/save';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline support for the hosted app (not in dev, and not inside embedded previews).
if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext && !isEmbeddedPreview()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* unsupported in this context */
    });
  });
}

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { appStorage, useAppStore } from './store/store';
import './styles/tokens.css';
import './styles/global.css';

try {
  useAppStore.getState().initApp();
} catch (err) {
  // Defense-in-depth: initApp should never throw post-hardening, but an
  // uncaught error here previously escaped at module scope and prevented
  // createRoot(...).render(...) from ever running, leaving a permanently
  // blank page with no way to reach the Import button. Degrade to an empty
  // board instead.
  console.error('initApp failed; continuing with an empty board', err);
}
navigator.storage?.persist?.();
window.addEventListener('pagehide', () => appStorage.flush());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

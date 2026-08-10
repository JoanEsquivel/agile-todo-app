import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { appStorage, useAppStore } from './store/store';
import './styles/tokens.css';
import './styles/global.css';

useAppStore.getState().initApp();
navigator.storage?.persist?.();
window.addEventListener('pagehide', () => appStorage.flush());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

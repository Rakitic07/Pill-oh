import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Root } from './Root';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);

// In dev the worker only handles push (`?dev` turns caching off so Vite's hot reload isn't served stale).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(import.meta.env.PROD ? '/sw.js' : '/sw.js?dev').catch(() => {});
  });
}

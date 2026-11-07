import React from 'react';
import * as ReactDOM from 'react-dom';
import './i18n';
import { applyCachedTranslationOverrides } from './i18n/overrides';
import App from './App';
import { ThemeProvider, CssBaseline } from '@mui/material';
import theme from './styles/m3-theme';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';
import { initPwaInstall } from './utils/pwaInstall';
import { reloadForNewVersion } from './utils/lazyPage';

// A file of an older release is gone from the server: reload to get the new release.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadForNewVersion()) event.preventDefault();
});

// Catch Chrome's install event before React mounts.
initPwaInstall();

applyCachedTranslationOverrides();

const rootElement = document.getElementById('root');
ReactDOM.render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>,
  rootElement
);

serviceWorkerRegistration.register();

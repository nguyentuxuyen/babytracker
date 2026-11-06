import React from 'react';
import * as ReactDOM from 'react-dom';
import './i18n';
import { applyCachedTranslationOverrides } from './i18n/overrides';
import App from './App';
import { ThemeProvider, CssBaseline } from '@mui/material';
import theme from './styles/m3-theme';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';
import { initPwaInstall } from './utils/pwaInstall';

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
